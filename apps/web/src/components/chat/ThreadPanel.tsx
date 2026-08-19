"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button, Avatar, cn, Dropdown, MenuItem } from "@n0va/ui";
import type { ChatMessage } from "@n0va/db";

interface ThreadMessage extends ChatMessage {
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    thumbnailKey?: string | null;
  }>;
}

interface ThreadData {
  parent: ThreadMessage;
  replies: ThreadMessage[];
  info: {
    replyCount: number;
    participantCount: number;
    lastReplyAt: string | null;
    participants: string[];
  };
}

interface ThreadSummary {
  short: string;
  bullets: string[];
  decisions: Array<{ text: string; status: string; sourceMessageId?: string }>;
}

function formatTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderBody(body: string) {
  if (!body) return null;
  const html = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_m: string, lang: string, code: string) =>
      `<pre class="nv-code-block">${lang ? `<div class="nv-code-lang">${lang}</div>` : ""}<code>${code.trim()}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code class="nv-code-inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
  return <div className="nv-message-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ThreadPanel({
  parentId,
  workspaceId,
  userId,
  onClose,
  onSendReply,
  onSummary,
  onDecision,
  onPin,
  onExport,
  onActionItems,
  onEditReply,
  onDeleteReply,
  liveReplies,
  deletedIds,
  messageOverrides,
  targetReplyId,
}: {
  parentId: string;
  workspaceId: string;
  userId: string;
  onClose: () => void;
  onSendReply: (parentId: string, body: string) => Promise<void>;
  onSummary: (threadId: string) => Promise<unknown>;
  onDecision: (threadId: string, decisionText: string, sourceMessageId?: string) => Promise<unknown>;
  onPin: (threadId: string, pinType: "ROOM" | "PERSONAL" | "PRIORITY") => Promise<unknown>;
  onExport: (threadId: string, format: "MARKDOWN" | "PDF" | "DOCX" | "JSON") => Promise<unknown>;
  onActionItems: (threadId: string) => Promise<unknown>;
  onEditReply?: (messageId: string, body: string) => Promise<unknown>;
  onDeleteReply?: (messageId: string) => Promise<unknown>;
  liveReplies?: ThreadMessage[];
  deletedIds?: Set<string>;
  messageOverrides?: Record<string, ChatMessage>;
  targetReplyId?: string | null;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<ThreadSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<"MARKDOWN" | "PDF" | "DOCX" | "JSON">("MARKDOWN");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<Array<{ id: string; text: string; assignee: string | null; status: string }> | null>(null);
  const [actionItemsLoading, setActionItemsLoading] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [highlightReplyId, setHighlightReplyId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, ThreadMessage>>({});
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(() => new Set());
  const repliesRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/threads/${parentId}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [parentId]);

  useEffect(() => { fetchThread(); }, [fetchThread]);

  const replies = useMemo(() => {
    const byId = new Map<string, ThreadMessage>();
    for (const r of data?.replies ?? []) byId.set(r.id, r);
    for (const r of liveReplies ?? []) byId.set(r.id, r);
    const removed = new Set([...(deletedIds ?? new Set<string>()), ...localDeleted]);
    for (const [id, m] of Object.entries(messageOverrides ?? {})) {
      if (byId.has(id)) byId.set(id, m as ThreadMessage);
    }
    for (const [id, m] of Object.entries(localOverrides)) {
      if (byId.has(id)) byId.set(id, m);
    }
    return [...byId.values()]
      .filter((r) => !removed.has(r.id))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [data?.replies, liveReplies, deletedIds, messageOverrides, localOverrides, localDeleted]);

  // Scroll to the reply referenced by ?m=&p= (notification links into threads)
  useEffect(() => {
    if (!targetReplyId || highlightReplyId) return;
    const el = repliesRef.current?.querySelector(`[data-reply-id="${targetReplyId}"]`);
    if (!el) return;
    (el as HTMLElement).scrollIntoView({ block: "center" });
    setHighlightReplyId(targetReplyId);
  }, [targetReplyId, replies, highlightReplyId]);

  useEffect(() => {
    if (!highlightReplyId) return;
    const t = setTimeout(() => setHighlightReplyId(null), 3000);
    return () => clearTimeout(t);
  }, [highlightReplyId]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await onSendReply(parentId, replyText.trim());
      setReplyText("");
      await fetchThread();
    } finally { setSending(false); }
  };

  const handleSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = (await onSummary(parentId)) as ThreadSummary;
      setSummary(res);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : "Summary failed");
    } finally { setSummaryLoading(false); }
  };

  const handleDecision = async (reply: ThreadMessage) => {
    try {
      await onDecision(parentId, reply.body.slice(0, 200), reply.id);
      setSummary(null);
      setSummaryError(null);
    } catch { /* silent */ }
  };

  const handlePin = async () => {
    setPinBusy(true);
    setPinNotice(null);
    try {
      await onPin(parentId, "ROOM");
      setPinNotice("Thread pinned (ROOM)");
    } catch (e) {
      setPinNotice(e instanceof Error ? e.message : "Pin failed");
    } finally { setPinBusy(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = (await onExport(parentId, exportFormat)) as { content?: string; format?: string };
      const content = res?.content ?? "";
      const blob = new Blob([content], { type: exportFormat === "JSON" ? "application/json" : "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thread-${parentId.slice(0, 8)}.${exportFormat === "JSON" ? "json" : "md"}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally { setExporting(false); }
  };

  const handleActionItems = async () => {
    setActionItemsLoading(true);
    try {
      const res = (await onActionItems(parentId)) as Array<{ id: string; text: string; assignee: string | null; status: string }>;
      setActionItems(res);
    } catch { setActionItems([]); }
    finally { setActionItemsLoading(false); }
  };

  const handleEditReply = async (reply: ThreadMessage) => {
    if (!onEditReply || editBusy) return;
    const nextBody = editText.trim();
    setEditBusy(true);
    setLocalOverrides((prev) => ({ ...prev, [reply.id]: { ...reply, body: nextBody, editedAt: new Date() } }));
    setEditingReplyId(null);
    setEditText("");
    try {
      await onEditReply(reply.id, nextBody);
      await fetchThread();
    } catch { /* keep the optimistic state; next refetch reconciles */ }
    finally { setEditBusy(false); }
  };

  const handleDeleteReply = async (reply: ThreadMessage) => {
    if (!onDeleteReply) return;
    setLocalDeleted((prev) => new Set(prev).add(reply.id));
    try {
      await onDeleteReply(reply.id);
      await fetchThread();
    } catch { /* keep the optimistic state; next refetch reconciles */ }
  };

  if (loading) return <div className="nv-empty">Loading thread...</div>;
  if (!data) return <div className="nv-empty">Thread not found</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid var(--nv-color-border)", width: 360, flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, flex: 1 }}>Thread</span>
        <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{replies.length} replies</span>
        <Button variant="ghost" size="sm" onClick={() => void handleSummary()} disabled={summaryLoading} title="AI thread summary (spec §8.3)">
          {summaryLoading ? "…" : "✨ Summary"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void handlePin()} disabled={pinBusy} title="Pin thread (ROOM)">
          {pinBusy ? "…" : "📌"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
      </div>
      {pinNotice && (
        <div style={{ padding: "6px var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", fontSize: 11, color: "var(--nv-color-primary)" }}>
          {pinNotice}
        </div>
      )}

      {/* Thread ops row (spec §8.3) */}
      <div style={{ padding: "var(--nv-space-2) var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 6 }}>
        <select className="nv-input" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)} style={{ padding: "2px 6px", fontSize: 11, width: "auto" }}>
          <option value="MARKDOWN">MD</option>
          <option value="JSON">JSON</option>
          <option value="PDF">PDF</option>
          <option value="DOCX">DOCX</option>
        </select>
        <Button variant="secondary" size="sm" onClick={() => void handleExport()} disabled={exporting} title="Export thread transcript">
          {exporting ? "…" : "⬇ Export"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => void handleActionItems()} disabled={actionItemsLoading} title="Extract action items (spec §8.3)">
          {actionItemsLoading ? "…" : "✅ Action items"}
        </Button>
        {exportError && <span style={{ fontSize: 11, color: "var(--nv-color-danger)" }}>{exportError}</span>}
      </div>
      {actionItems && actionItems.length > 0 && (
        <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", background: "var(--nv-color-primary-alpha)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--nv-color-primary)", marginBottom: 6 }}>✅ Action Items</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: "var(--nv-font-sm)", display: "flex", flexDirection: "column", gap: 3 }}>
            {actionItems.map((a) => (
              <li key={a.id}>
                {a.text}
                {a.assignee && <span style={{ color: "var(--nv-color-text-faint)" }}> — {a.assignee}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI summary card */}
      {summary && (
        <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", background: "var(--nv-color-primary-alpha)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--nv-color-primary)", marginBottom: 6 }}>✨ AI Summary</div>
          {summary.short && <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: 600, marginBottom: 4 }}>{summary.short}</div>}
          {summary.bullets.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: "var(--nv-font-sm)", display: "flex", flexDirection: "column", gap: 2 }}>
              {summary.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
          {summary.decisions.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)" }}>📌 Decisions</div>
              {summary.decisions.map((d, i) => (
                <div key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: d.status === "CONFIRMED" ? "var(--nv-color-success)" : "var(--nv-color-warning)" }}>{d.status === "CONFIRMED" ? "✓" : "◌"} {d.status}</span>
                  <span style={{ flex: 1 }}>{d.text.slice(0, 90)}{d.text.length > 90 ? "…" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {summaryError && (
        <div style={{ padding: "6px var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", fontSize: 11, color: "var(--nv-color-danger)" }}>
          {summaryError}
        </div>
      )}

      {/* Parent message */}
      <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", background: "var(--nv-color-surface-2)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Avatar name={data.parent.authorName} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{data.parent.authorName}</div>
            <div style={{ fontSize: "var(--nv-font-sm)" }}>{renderBody(data.parent.body)}</div>
            {data.parent.attachments && data.parent.attachments.length > 0 && (
              <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {data.parent.attachments.map(a => (
                  <a key={a.id} href={`/api/chat/attachments/${a.id}/download`} style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--nv-radius-sm)", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-primary)" }}>
                    📎 {a.filename}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      <div ref={repliesRef} style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-3)", display: "flex", flexDirection: "column", gap: 8 }}>
        {replies.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", textAlign: "center", padding: "var(--nv-space-4)" }}>
            No replies yet. Start the conversation!
          </div>
        )}
        {replies.map((reply) => {
          const isAuthor = reply.createdById === userId;
          return (
          <div key={reply.id} data-reply-id={reply.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", borderRadius: "var(--nv-radius-md)", padding: 6, background: reply.id === highlightReplyId ? "var(--nv-color-primary-alpha)" : "transparent" }}>
            <Avatar name={reply.authorName} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{reply.authorName}</span>
                <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{formatTime(reply.createdAt)}</span>
                {reply.editedAt && <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>(ed.)</span>}
                {isAuthor && onEditReply && onDeleteReply && (
                  <Dropdown
                    trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "0 4px", opacity: 0.4, fontSize: 12 }}>⋯</Button>}
                  >
                    <MenuItem onSelect={() => { setEditingReplyId(reply.id); setEditText(reply.body); }}>Edit</MenuItem>
                    <MenuItem danger onSelect={() => void handleDeleteReply(reply)}>Delete</MenuItem>
                  </Dropdown>
                )}
              </div>
              {editingReplyId === reply.id ? (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input
                    className="nv-input"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <Button size="sm" disabled={!editText.trim() || editBusy} onClick={() => void handleEditReply(reply)}>
                    {editBusy ? "..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingReplyId(null); setEditText(""); }}>Cancel</Button>
                </div>
              ) : (
                <div style={{ fontSize: "var(--nv-font-sm)" }}>{renderBody(reply.body)}</div>
              )}
              <button
                onClick={() => void handleDecision(reply)}
                title="Mark as decision (spec §8.3)"
                style={{ marginTop: 2, border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: 999, padding: "1px 8px", fontSize: 10, cursor: "pointer", color: "var(--nv-color-text-faint)" }}
              >
                📌 decision
              </button>
              {reply.attachments && reply.attachments.length > 0 && (
                <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {reply.attachments.map(a => (
                    <a key={a.id} href={`/api/chat/attachments/${a.id}/download`} style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--nv-radius-sm)", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-primary)" }}>
                      📎 {a.filename}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {/* Reply input */}
      <form onSubmit={handleSendReply} style={{ padding: "var(--nv-space-3)", borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 6 }}>
        <input
          className="nv-input"
          placeholder="Reply..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          style={{ flex: 1 }}
        />
        <Button type="submit" size="sm" disabled={!replyText.trim() || sending}>
          {sending ? "..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
