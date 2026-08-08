"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { ConversationWithMessages } from "./server";

export interface AniActions {
  create: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<{ delayMs: number; toolCalls?: string }>;
  clear: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

interface AniToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "pending" | "loading" | "done" | "error";
  result?: string;
}

export function AniChat({
  conversations,
  active,
  actions,
}: {
  conversations: Array<ConversationWithMessages & { unread: number }>;
  active: ConversationWithMessages | null;
  actions: AniActions;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toolCalls, setToolCalls] = useState<AniToolCall[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, typing, toolCalls.length]);

  const send = () => {
    const content = draft.trim();
    if (!content || !active || sending) return;
    setSending(true);
    setTyping(true);
    setDraft("");
    setToolCalls([]);
    const fd = new FormData();
    fd.set("id", active.id);
    fd.set("content", content);
    void actions
      .send(fd)
      .then((r) => {
        if (r.toolCalls) {
          try {
            const calls = JSON.parse(r.toolCalls) as Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
            setToolCalls(calls.map((c) => ({ ...c, status: "loading" as const })));
          } catch {}
        }
        setTimeout(() => {
          setTyping(false);
          setToolCalls([]);
        }, r.delayMs);
      })
      .finally(() => setSending(false));
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Button size="sm" onClick={() => setCreating(true)}>+ New conversation</Button>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/m/ani?c=${c.id}`)}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 10,
                border: active?.id === c.id ? "1px solid var(--nv-color-primary)" : "1px solid transparent",
                background: active?.id === c.id ? "var(--nv-color-surface-raised)" : "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>
                {c.messages[0] ? `${c.messages[0].content.slice(0, 40)}${c.messages[0].content.length > 40 ? "…" : ""}` : "Empty"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="nv-card" style={{ minHeight: 560, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {active ? (
          <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 800 }}>{active.title}</span>
              <span className="nv-badge nv-badge-green">ANI</span>
              <div style={{ flex: 1 }} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!window.confirm("Clear this conversation?")) return;
                  const fd = new FormData();
                  fd.set("id", active.id);
                  void actions.clear(fd).then(() => router.refresh());
                }}
              >
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!window.confirm("Delete this conversation?")) return;
                  const fd = new FormData();
                  fd.set("id", active.id);
                  void actions.remove(fd).then(() => router.push("/m/ani"));
                }}
              >
                ✕
              </Button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {active.messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "78%",
                    background: m.role === "user" ? "var(--nv-color-primary)" : "var(--nv-color-surface-raised)",
                    color: m.role === "user" ? "#fff" : "inherit",
                    padding: "10px 14px",
                    borderRadius: 14,
                    borderBottomRightRadius: m.role === "user" ? 4 : 14,
                    borderBottomLeftRadius: m.role === "user" ? 14 : 4,
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              ))}
              {toolCalls.map((tc) => (
                <div key={tc.id} style={{ alignSelf: "flex-start", maxWidth: "78%", fontSize: 12, padding: "8px 12px", background: "var(--nv-color-surface-raised)", borderRadius: 10, border: "1px solid var(--nv-color-border)" }}>
                  <div style={{ fontWeight: 600 }}>Calling tool: {tc.name}</div>
                  <pre style={{ fontSize: 10, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(tc.arguments, null, 2)}</pre>
                  {tc.status === "loading" && <div style={{ marginTop: 4, color: "var(--nv-color-text-faint)" }}>Waiting for result…</div>}
                  {tc.result && <div style={{ marginTop: 4 }}>{tc.result}</div>}
                </div>
              ))}
              {typing && (
                <div className="nv-badge" style={{ alignSelf: "flex-start", animation: "nv-pulse 1.2s ease-in-out infinite" }}>
                  ANI is typing…
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div style={{ padding: 12, borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 8 }}>
              <input
                className="nv-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Message ANI…"
                style={{ flex: 1 }}
                disabled={sending}
              />
              <Button onClick={send} disabled={sending || !draft.trim()}>Send</Button>
            </div>
          </>
        ) : (
          <div className="nv-empty" style={{ flex: 1 }}>
            <div>Select a conversation, or start a new one</div>
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Start a conversation</Button>
          </div>
        )}

      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New conversation"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-conversation-form">Start</Button>
          </>
        }
      >
        <form
          id="create-conversation-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="Conversation title" required autoFocus />
        </form>
      </Dialog>
    </div>
  );
}
