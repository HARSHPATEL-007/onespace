"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Avatar, cn } from "@n0va/ui";
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

function formatTime(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  onClose,
  onSendReply,
}: {
  parentId: string;
  workspaceId: string;
  onClose: () => void;
  onSendReply: (parentId: string, body: string) => Promise<void>;
}) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [replyText, setReplyText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/threads/${parentId}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [parentId]);

  useEffect(() => { fetchThread(); }, [fetchThread]);

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

  if (loading) return <div className="nv-empty">Loading thread...</div>;
  if (!data) return <div className="nv-empty">Thread not found</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid var(--nv-color-border)", width: 360, flexShrink: 0 }}>
      {/* Header */}
      <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, flex: 1 }}>Thread</span>
        <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{data.info.replyCount} replies</span>
        <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
      </div>

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
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-3)", display: "flex", flexDirection: "column", gap: 8 }}>
        {data.replies.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", textAlign: "center", padding: "var(--nv-space-4)" }}>
            No replies yet. Start the conversation!
          </div>
        )}
        {data.replies.map((reply) => (
          <div key={reply.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <Avatar name={reply.authorName} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{reply.authorName}</span>
                <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{formatTime(reply.createdAt)}</span>
                {reply.editedAt && <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>(ed.)</span>}
              </div>
              <div style={{ fontSize: "var(--nv-font-sm)" }}>{renderBody(reply.body)}</div>
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
        ))}
      </div>

      {/* Reply input */}
      <form onSubmit={handleSendReply} style={{ padding: "var(--nv-space-3)", borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 6 }}>
        <input
          className="nv-input"
          placeholder="Reply..."
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          style={{ flex: 1 }}
        />
        <Button type="submit" size="sm" disabled={!replyText.trim() || sending}>
          {sending ? "..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
