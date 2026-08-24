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
    participants: Array<{ id: string; name: string; email: string; image: string | null }>;
  };
}

interface ThreadSummary {
  short: string;
  bullets: string[];
  decisions: Array<{ text: string; status: string; sourceMessageId?: string }>;
  actions?: Array<{ title: string; owner?: string; dueDate?: string; priority: string; confidence: number }>;
  openIssues?: string[];
  followUpSuggestion?: string;
  quotes?: Array<{ author: string; text: string; at: string }>;
  confidence?: number;
  version?: number;
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

type TreeNode = ThreadMessage & { depth: number; children: TreeNode[]; branchPath: string[] };
function buildTree(rootId: string, messages: ThreadMessage[]): TreeNode[] {
  const byParent = new Map<string, ThreadMessage[]>();
  for (const m of messages) {
    if (!m.parentId) continue;
    const arr = byParent.get(m.parentId) ?? [];
    arr.push(m);
    byParent.set(m.parentId, arr);
  }
  const build = (parentId: string, depth: number, path: string[]): TreeNode[] => {
    const kids = byParent.get(parentId) ?? [];
    // Preserve chronological order
    kids.sort((a,b)=> new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
    return kids.map((k) => ({
      ...k,
      depth,
      branchPath: [...path, k.id],
      children: depth < 10 ? build(k.id, depth + 1, [...path, k.id]) : [],
    }));
  };
  return build(rootId, 1, [rootId]);
}
function badgeFor(m: ThreadMessage, decisions: Array<{ sourceMessageId?: string }>): Array<{ label: string; color: string }> {
  const b: Array<{ label: string; color: string }> = [];
  const body = m.body.toLowerCase();
  if (decisions.some(d=> d.sourceMessageId===m.id)) b.push({ label: "decision", color: "var(--nv-color-success)" });
  if (/\b(I'll|i will|please|can you|could you|by (mon|tue|wed|thu|fri)|due|todo)\b/i.test(m.body)) b.push({ label: "action", color: "var(--nv-color-primary)" });
  if (m.body.includes("?")) b.push({ label: "question", color: "var(--nv-color-warning)" });
  if (body.includes("resolved") || body.includes("done") || body.includes("fixed")) b.push({ label: "resolved", color: "var(--nv-color-success)" });
  return b.slice(0,2);
}
function isDecisionText(t: string): boolean {
  return /we decided|agreed|approved|decision|proceed with|confirmed/i.test(t);
}
function collectIds(n: TreeNode): string[] {
  return [n.id, ...n.children.flatMap(collectIds)];
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
  onEditHistory,
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
  onEditHistory?: (messageId: string) => Promise<Array<{ id: string; body: string; editedAt: string }>>;
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
  const [exportMode, setExportMode] = useState<"FULL" | "BRANCH" | "SUMMARY_ONLY" | "SUMMARY_TRANSCRIPT">("FULL");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<Array<{ id: string; text: string; assignee: string | null; status: string }> | null>(null);
  const [pinType, setPinType] = useState<"ROOM" | "PERSONAL" | "PRIORITY">("ROOM");
  const [pinReason, setPinReason] = useState("");
  const [actionItemsLoading, setActionItemsLoading] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [highlightReplyId, setHighlightReplyId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, ThreadMessage>>({});
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(() => new Set());
  const [editHistory, setEditHistory] = useState<Array<{ id: string; body: string; editedAt: string }> | null>(null);
  const [editHistoryFor, setEditHistoryFor] = useState<string | null>(null);
  const [editHistoryBusy, setEditHistoryBusy] = useState(false);
  const [editHistoryError, setEditHistoryError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(()=> new Set());
  const [focusBranch, setFocusBranch] = useState<string | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; title: string }>>([]);
  const repliesRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/threads/${parentId}?tree=1`);
      if (res.ok) setData(await res.json());
      // Breadcrumbs for deep nesting
      try {
        const br = await fetch(`/api/chat/threads/${parentId}/breadcrumbs`);
        if (br.ok) setBreadcrumbs(await br.json());
      } catch {}
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

  const tree = useMemo(() => buildTree(parentId, replies), [parentId, replies]);
  const flatCount = useMemo(() => {
    let n = replies.length;
    return n;
  }, [replies]);

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
      await onPin(parentId, pinType);
      setPinNotice(`Thread pinned (${pinType})${pinReason? ` — ${pinReason}`:""}`);
    } catch (e) {
      setPinNotice(e instanceof Error ? e.message : "Pin failed");
    } finally { setPinBusy(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      // onExport now supports (threadId, format, mode) via expanded signature; fallback keeps compat
      const maybe = onExport as unknown as (id: string, fmt: typeof exportFormat, mode?: typeof exportMode) => Promise<unknown>;
      const res = (await maybe(parentId, exportFormat, exportMode)) as { content?: string; format?: string };
      const content = res?.content ?? "";
      const blob = new Blob([content], { type: exportFormat === "JSON" ? "application/json" : "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thread-${parentId.slice(0, 8)}-${exportMode.toLowerCase()}.${exportFormat === "JSON" ? "json" : exportFormat==="PDF"?"pdf": exportFormat==="DOCX"?"docx":"md"}`;
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
    } catch {
      setLocalDeleted((prev) => {
        const n = new Set(prev);
        n.delete(reply.id);
        return n;
      });
    }
  };

  const handleEditHistory = async (reply: ThreadMessage) => {
    if (!onEditHistory || editHistoryBusy) return;
    setEditHistoryBusy(true);
    setEditHistoryError(null);
    try {
      const res = await onEditHistory(reply.id);
      setEditHistory(res ?? []);
      setEditHistoryFor(reply.id);
    } catch (e) {
      setEditHistoryError(e instanceof Error ? e.message : "History failed");
    } finally { setEditHistoryBusy(false); }
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
      {/* Pin config: room/personal/priority, reason “pinned because decision”, sorting */}
      <div style={{ padding: "4px var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" as const }}>
        <select value={pinType} onChange={(e)=> setPinType(e.target.value as typeof pinType)} style={{ padding: "2px 4px", fontSize: 11, borderRadius: "var(--nv-radius-sm)", border: "1px solid var(--nv-color-border)" }} title="Pin level: ROOM shared, PERSONAL bookmark, PRIORITY leadership">
          <option value="ROOM">📌 Room</option>
          <option value="PERSONAL">🔖 Personal</option>
          <option value="PRIORITY">⭐ Priority</option>
        </select>
        <input className="nv-input" placeholder="Why pinned? (decision made here)" value={pinReason} onChange={(e)=> setPinReason(e.target.value)} style={{ flex: 1, padding: "2px 6px", fontSize: 11 }} />
        <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Separate bookmarks vs shared pins • sort by recency/importance/unresolved in channel header</span>
      </div>
      {pinNotice && (
        <div style={{ padding: "6px var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", fontSize: 11, color: "var(--nv-color-primary)" }}>
          {pinNotice}
        </div>
      )}

      {/* Thread ops row (spec §8.3) — export modes */}
      <div style={{ padding: "var(--nv-space-2) var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
        <select className="nv-input" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)} style={{ padding: "2px 6px", fontSize: 11, width: "auto" }}>
          <option value="MARKDOWN">MD</option>
          <option value="JSON">JSON</option>
          <option value="PDF">PDF</option>
          <option value="DOCX">DOCX</option>
        </select>
        <select value={exportMode} onChange={(e)=> setExportMode(e.target.value as typeof exportMode)} style={{ padding: "2px 4px", fontSize: 11, borderRadius: "var(--nv-radius-sm)", border: "1px solid var(--nv-color-border)" }} title="Export mode: FULL/BRANCH/SUMMARY_ONLY/SUMMARY_TRANSCRIPT">
          <option value="FULL">Full</option>
          <option value="BRANCH">Branch</option>
          <option value="SUMMARY_ONLY">Summary only</option>
          <option value="SUMMARY_TRANSCRIPT">Summary+transcript</option>
        </select>
        <Button variant="secondary" size="sm" onClick={() => void handleExport()} disabled={exporting} title="Export thread transcript + provenance + tree">
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

      {/* AI summary card — 1-line, 3-bullet, decisions, actions, open issues, follow-up, confidence, source quotes */}
      {summary && (
        <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", background: "var(--nv-color-primary-alpha)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--nv-color-primary)" }}>✨ AI Summary</span>
            {summary.confidence !== undefined && <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 999, background: summary.confidence>0.75?"var(--nv-color-success)": summary.confidence>0.5?"var(--nv-color-warning)":"var(--nv-color-border)", color: summary.confidence>0.5?"#fff":"var(--nv-color-text)" }}>{Math.round(summary.confidence*100)}%</span>}
            {summary.version && <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>v{summary.version}</span>}
          </div>
          {summary.short && <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: 600, marginBottom: 4, borderLeft: "3px solid var(--nv-color-primary)", paddingLeft: 6 }}>1-line: {summary.short}</div>}
          {summary.bullets.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase" as const }}>3-bullet</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 16, fontSize: "var(--nv-font-sm)", display: "flex", flexDirection: "column", gap: 2 }}>
                {summary.bullets.slice(0,3).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
          {summary.decisions.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)" }}>📌 Decisions {summary.decisions.length>0 && <span style={{ fontWeight: 400 }}>• source anchored</span>}</div>
              {summary.decisions.map((d, i) => (
                <div key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: d.status === "CONFIRMED" ? "var(--nv-color-success)" : "var(--nv-color-warning)" }}>{d.status === "CONFIRMED" ? "✓" : "◌"} {d.status}</span>
                  <span style={{ flex: 1 }}>{d.text.slice(0, 100)}{d.text.length > 100 ? "…" : ""}</span>
                  {d.sourceMessageId && <a href={`#${d.sourceMessageId}`} onClick={(e)=>{e.preventDefault(); const el=repliesRef.current?.querySelector(`[data-reply-id="${d.sourceMessageId}"]`); if(el) (el as HTMLElement).scrollIntoView({block:"center"});}} style={{ fontSize: 10, color: "var(--nv-color-primary)" }}>↗ source</a>}
                </div>
              ))}
            </div>
          )}
          {summary.actions && summary.actions.length>0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)" }}>✅ Actions • owner + due • confidence</div>
              {summary.actions.slice(0,5).map((a, i)=> (
                <div key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ minWidth: 6, height: 6, borderRadius: "50%", background: a.priority==="HIGH"||a.priority==="CRITICAL"?"var(--nv-color-danger)": a.priority==="MEDIUM"?"var(--nv-color-warning)":"var(--nv-color-border)" }} />
                  <span style={{ flex: 1 }}>{a.title.slice(0,80)} {a.owner? `— ${a.owner}`:""} {a.dueDate? `· ${new Date(a.dueDate).toLocaleDateString()}`:""}</span>
                  <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{Math.round(a.confidence*100)}%</span>
                </div>
              ))}
            </div>
          )}
          {summary.openIssues && summary.openIssues.length>0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-warning)" }}>❓ Open issues</div>
              <ul style={{ margin: "2px 0 0", paddingLeft: 16, fontSize: 11 }}>{summary.openIssues.map((o,i)=> <li key={i}>{o}</li>)}</ul>
            </div>
          )}
          {summary.followUpSuggestion && <div style={{ marginTop: 8, fontSize: 11, fontStyle: "italic" as const, color: "var(--nv-color-primary)" }}>↗ Follow-up: {summary.followUpSuggestion}</div>}
          {summary.quotes && summary.quotes.length>0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase" as const }}>Notable quotes</div>
              {summary.quotes.map((q,i)=> (
                <div key={i} style={{ fontSize: 11, borderLeft: "2px solid var(--nv-color-border)", paddingLeft: 6, color: "var(--nv-color-text-faint)" }}>
                  “{q.text}” — <span style={{ fontWeight: 600 }}>{q.author}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--nv-color-text-faint)" }}>Auto-refreshed on new replies • anchored to branch, not room • manual override available</div>
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

      {/* Thread path breadcrumbs + jump actions (design rule: branch_path) */}
      {breadcrumbs.length > 0 && (
        <div style={{ padding: "4px var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 4, fontSize: 11, overflowX: "auto" }}>
          <span style={{ color: "var(--nv-color-text-faint)" }}>Path:</span>
          {breadcrumbs.map((b,i)=> (
            <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {i>0 && <span style={{ color: "var(--nv-color-text-faint)" }}>›</span>}
              <button onClick={()=>{
                const el = repliesRef.current?.querySelector(`[data-reply-id="${b.id}"]`) ?? repliesRef.current?.querySelector(`[data-root-id]`);
                if (el) (el as HTMLElement).scrollIntoView({ block: "center" });
              }} title={b.title} style={{ border: "none", background: i===breadcrumbs.length-1?"var(--nv-color-primary-alpha)":"transparent", borderRadius: 999, padding: "1px 6px", cursor: "pointer", fontSize: 11, fontWeight: i===breadcrumbs.length-1?700:400, whiteSpace: "nowrap" }}>{b.title.slice(0,18)}</button>
            </span>
          ))}
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <Button variant="ghost" size="sm" onClick={()=>{
              const el = repliesRef.current?.querySelector(`[data-root-id]`);
              if (el) (el as HTMLElement).scrollIntoView({ block: "center" });
            }} title="Jump to root">⤒ Root</Button>
            <Button variant="ghost" size="sm" onClick={()=>{
              const els = repliesRef.current?.querySelectorAll(`[data-reply-id]`);
              const last = els?.[els.length-1];
              if (last) (last as HTMLElement).scrollIntoView({ block: "center" });
            }} title="Jump to leaf">⤓ Leaf</Button>
          </span>
        </div>
      )}

      {/* Tree controls: focus mode + mini-map */}
      <div style={{ padding: "4px var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={!!focusBranch} onChange={(e)=> setFocusBranch(e.target.checked ? (replies[0]?.id ?? null) : null)} />
          Focus branch
        </label>
        <Button variant="ghost" size="sm" onClick={()=> setCollapsed(new Set())} title="Expand all">Expand</Button>
        <Button variant="ghost" size="sm" onClick={()=> setCollapsed(new Set(tree.flatMap((n: TreeNode)=> collectIds(n))))} title="Collapse branches">Collapse</Button>
        <Button variant="ghost" size="sm" onClick={()=> setShowMiniMap(v=>!v)} title="Mini-map for long threads">{showMiniMap?"Hide map":"Mini map"}</Button>
        <span style={{ marginLeft: "auto", color: "var(--nv-color-text-faint)" }}>{flatCount} nodes • {tree.length} branches • max depth {Math.max(0,...replies.map(()=>1), ...tree.map((n: TreeNode)=> n.depth))}</span>
      </div>

      {/* Replies — tree viewer: indented lines, branch connectors, badges, hover previews, focus mode */}
      <div ref={repliesRef} style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-2) var(--nv-space-3)", display: "flex", flexDirection: "column", gap: 2, position: "relative" }}>
        {replies.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", textAlign: "center", padding: "var(--nv-space-4)" }}>
            No replies yet. Start the conversation!
          </div>
        )}
        {/* Mini-map for very long threads */}
        {showMiniMap && flatCount>12 && (
          <div style={{ position: "sticky", top: 0, alignSelf: "flex-end", width: 36, height: 80, border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-sm)", background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 1, padding: 2, zIndex: 1 }}>
            {replies.slice(0,20).map((r,i)=> (
              <div key={r.id} style={{ flex: 1, background: i%2===0?"var(--nv-color-primary)":"var(--nv-color-border)", opacity: r.id===focusBranch?1:0.6, borderRadius: 1 }} title={`${r.authorName}: ${r.body.slice(0,30)}`} />
            ))}
          </div>
        )}
        {(() => {
          const isFocus = (node: TreeNode) => !focusBranch || node.branchPath.includes(focusBranch) || node.id===focusBranch;
          const renderNode = (node: TreeNode, isLast: boolean, prefix: string) => {
            const collapsedThis = collapsed.has(node.id);
            const badges = badgeFor(node, (summary?.decisions ?? []) as Array<{ sourceMessageId?: string }>);
            const isAuthor = node.createdById === userId;
            const dim = focusBranch && !isFocus(node);
            return (
              <div key={node.id} data-reply-id={node.id} style={{ display: "flex", gap: 0, alignItems: "stretch", opacity: dim?0.35:1, borderRadius: "var(--nv-radius-md)", background: node.id === highlightReplyId ? "var(--nv-color-primary-alpha)" : focusBranch===node.id?"var(--nv-color-primary-alpha)":"transparent", borderLeft: node.depth>1? "1px solid var(--nv-color-border)":"none", marginLeft: Math.min(node.depth,10)*12, position: "relative" }}>
                {/* Branch connector */}
                <div style={{ width: 12, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 1, flex: 1, background: isLast?"transparent":"var(--nv-color-border)" }} />
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: badges.some(b=>b.label==="decision")?"var(--nv-color-success)": badges.some(b=>b.label==="action")?"var(--nv-color-primary)":"var(--nv-color-border)", border: "2px solid var(--nv-color-surface)", marginTop: 8 }} />
                  <div style={{ width: 1, flex: 1, background: "var(--nv-color-border)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, padding: "6px 6px 6px 2px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" as const }}>
                    <Avatar name={node.authorName} size="sm" />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{node.authorName}</span>
                    <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{formatTime(node.createdAt)}</span>
                    {badges.map(b=> <span key={b.label} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: b.color, color: "#fff", textTransform: "uppercase" as const }}>{b.label}</span>)}
                    {node.children.length>0 && <span title={`${node.children.length} branches`} style={{ fontSize: 10, color: "var(--nv-color-text-faint)", border: "1px solid var(--nv-color-border)", borderRadius: 999, padding: "0 5px", cursor: "pointer" }} onClick={()=> setCollapsed(s=>{
                      const n=new Set(s); if(n.has(node.id)) n.delete(node.id); else n.add(node.id); return n;
                    })}>{collapsedThis?`▶ ${node.children.length} branches`:`▼ ${node.children.length}`}</span>}
                    <button onClick={()=> setFocusBranch(node.id)} title="Focus this branch" style={{ marginLeft: "auto", border: "none", background: focusBranch===node.id?"var(--nv-color-primary-alpha)":"transparent", borderRadius: 999, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>◉ focus</button>
                    {isAuthor && onEditReply && onDeleteReply && (
                      <Dropdown trigger={<Button variant="ghost" size="sm" style={{ minWidth: 0, padding: "0 4px", opacity: 0.4, fontSize: 12 }}>⋯</Button>}>
                        <MenuItem onSelect={() => { setEditingReplyId(node.id); setEditText(node.body); }}>Edit</MenuItem>
                        <MenuItem danger onSelect={() => void handleDeleteReply(node)}>Delete</MenuItem>
                        {node.editedAt && onEditHistory && (<MenuItem onSelect={() => void handleEditHistory(node)}>{editHistoryBusy && editHistoryFor === node.id ? "Loading..." : "View history"}</MenuItem>)}
                      </Dropdown>
                    )}
                  </div>
                  {editingReplyId === node.id ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input className="nv-input" value={editText} onChange={(e) => setEditText(e.target.value)} style={{ flex: 1 }} autoFocus />
                      <Button size="sm" disabled={!editText.trim() || editBusy} onClick={() => void handleEditReply(node)}>{editBusy ? "..." : "Save"}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingReplyId(null); setEditText(""); }}>Cancel</Button>
                    </div>
                  ) : (
                    <div style={{ fontSize: "var(--nv-font-sm)" }}>{renderBody(node.body)}</div>
                  )}
                  {editHistoryFor === node.id && editHistory && (
                    <div data-history-block style={{ marginTop: 6, padding: "6px 8px", borderRadius: "var(--nv-radius-sm)", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontWeight: 700, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 10 }}>Edit history</div>
                      {editHistory.length === 0 && <div>No prior versions.</div>}
                      {editHistory.map((h) => (<div key={h.id}><span style={{ color: "var(--nv-color-text-faint)" }}>{formatTime(h.editedAt)}</span> — {h.body}</div>))}
                    </div>
                  )}
                  {editHistoryError && editHistoryFor === node.id && (<div style={{ fontSize: 11, color: "var(--nv-color-danger)", marginTop: 4 }}>{editHistoryError}</div>)}
                  <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" as const }}>
                    <button onClick={() => void handleDecision(node)} title="Mark as decision" style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: 999, padding: "1px 8px", fontSize: 10, cursor: "pointer", color: "var(--nv-color-text-faint)" }}>📌 decision</button>
                    <button onClick={()=>{
                      const q = prompt("Convert to task — title?");
                      if(q) void handleDecision(node);
                    }} title="Convert to task" style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: 999, padding: "1px 8px", fontSize: 10, cursor: "pointer", color: "var(--nv-color-text-faint)" }}>↗ task</button>
                    <button onClick={()=> navigator.clipboard.writeText(`${node.authorName}: ${node.body}`)} title="Copy quote" style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: 999, padding: "1px 8px", fontSize: 10, cursor: "pointer", color: "var(--nv-color-text-faint)" }}>⎘ quote</button>
                  </div>
                  {node.attachments && node.attachments.length > 0 && (
                    <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {node.attachments.map(a => (<a key={a.id} href={`/api/chat/attachments/${a.id}/download`} style={{ fontSize: 11, padding: "2px 6px", borderRadius: "var(--nv-radius-sm)", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-primary)" }}>📎 {a.filename}</a>))}
                    </div>
                  )}
                  {/* Collapsible subtrees — only show current branch by default */}
                  {!collapsedThis && node.children.length>0 && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2, borderLeft: "1px dashed var(--nv-color-border)", paddingLeft: 4 }}>
                      {node.children.map((child: TreeNode, idx: number)=> renderNode(child, idx===node.children.length-1, prefix+" "+idx))}
                    </div>
                  )}
                  {collapsedThis && node.children.length>0 && (
                    <div title={`${node.children.length} replies collapsed — hover to preview`} style={{ marginTop: 4, fontSize: 11, color: "var(--nv-color-text-faint)", cursor: "pointer", padding: "2px 6px", background: "var(--nv-color-surface-2)", borderRadius: "var(--nv-radius-sm)", border: "1px dashed var(--nv-color-border)" }} onClick={()=> setCollapsed(s=>{const n=new Set(s); n.delete(node.id); return n;})}>
                      ▶ {node.children.length} hidden replies — {node.children[0] ? `${node.children[0].authorName}: ${node.children[0].body.slice(0,40)}…` : ""} (click to expand)
                    </div>
                  )}
                </div>
              </div>
            );
          };
          const flatTree = tree;
          function collectIds(n: TreeNode): string[] {
            return [n.id, ...n.children.flatMap(collectIds)];
          }
          if (flatTree.length===0) return <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", fontStyle: "italic" }}>Single-branch thread — every reply preserved in canonical tree</div>;
          return <>{flatTree.map((n, i)=> renderNode(n, i===flatTree.length-1, ""))}</>;
        })()}
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
