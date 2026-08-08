"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Badge } from "@n0va/ui";
import type { ConversationWithMessages } from "./server";

export interface AniActions {
  create: (formData: FormData) => Promise<void>;
  send: (formData: FormData) => Promise<{ delayMs: number; toolCalls?: string; citations?: string; confidence?: number }>;
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

interface AniCitation {
  source: string;
  confidence: number;
}

type PanelTab = "chat" | "tools" | "memory" | "consciousness";

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
  const [citations, setCitations] = useState<AniCitation[]>([]);
  const [activeTab, setActiveTab] = useState<PanelTab>("chat");
  const [consciousnessCoherence, setConsciousnessCoherence] = useState(0.95);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, typing, toolCalls.length]);

  const send = useCallback(() => {
    const content = draft.trim();
    if (!content || !active || sending) return;
    setSending(true);
    setTyping(true);
    setDraft("");
    setToolCalls([]);
    setCitations([]);
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
          } catch { /* ignore */ }
        }
        if (r.citations) {
          try {
            setCitations(JSON.parse(r.citations) as AniCitation[]);
          } catch { /* ignore */ }
        }
        setConsciousnessCoherence(r.confidence ?? 0.95);
        setTimeout(() => {
          setTyping(false);
          setToolCalls((prev) => prev.map((tc) => ({ ...tc, status: "done" as const })));
        }, r.delayMs);
      })
      .finally(() => setSending(false));
  }, [draft, active, sending, actions]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "240px 1fr 280px", gap: 12, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Button size="sm" onClick={() => setCreating(true)}>+ New conversation</Button>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/m/ani?c=${c.id}`)}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: active?.id === c.id ? "1px solid var(--nv-color-primary)" : "1px solid transparent",
                background: active?.id === c.id ? "var(--nv-color-surface-raised)" : "transparent",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 2 }}>
                {c.messages[0] ? `${c.messages[0].content.slice(0, 30)}${c.messages[0].content.length > 30 ? "…" : ""}` : "Empty"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="nv-card" style={{ minHeight: 560, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {active ? (
          <>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{active.title}</span>
              <Badge tone="success">ANI</Badge>
              <Badge tone="primary">Consciousness</Badge>
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

            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {active.messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    background: m.role === "user" ? "var(--nv-color-primary)" : "var(--nv-color-surface-raised)",
                    color: m.role === "user" ? "#fff" : "inherit",
                    padding: "8px 12px",
                    borderRadius: 12,
                    borderBottomRightRadius: m.role === "user" ? 4 : 12,
                    borderBottomLeftRadius: m.role === "user" ? 12 : 4,
                    fontSize: 13,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              ))}
              {toolCalls.map((tc) => (
                <div key={tc.id} style={{ alignSelf: "flex-start", maxWidth: "80%", fontSize: 11, padding: "6px 10px", background: "var(--nv-color-surface-raised)", borderRadius: 8, border: "1px solid var(--nv-color-border)" }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <Badge tone={tc.status === "error" ? "danger" : tc.status === "loading" ? "warning" : "success"}>
                      {tc.status}
                    </Badge>
                    <span>⚡ {tc.name}</span>
                  </div>
                  <pre style={{ fontSize: 9, marginTop: 3, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--nv-color-text-faint)" }}>{JSON.stringify(tc.arguments, null, 2)}</pre>
                </div>
              ))}
              {typing && (
                <div className="nv-badge" style={{ alignSelf: "flex-start", animation: "nv-pulse 1.2s ease-in-out infinite" }}>
                  ANI is thinking…
                </div>
              )}
              <div ref={endRef} />
            </div>

            {citations.length > 0 && (
              <div style={{ padding: "6px 14px", borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Sources:</span>
                {citations.map((c, i) => (
                  <Badge key={i} tone="neutral">{c.source} ({(c.confidence * 100).toFixed(0)}%)</Badge>
                ))}
              </div>
            )}

            <div style={{ padding: 10, borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 6 }}>
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
                placeholder="Ask ANI anything…"
                style={{ flex: 1, fontSize: 13 }}
                disabled={sending}
              />
              <Button onClick={send} disabled={sending || !draft.trim()} size="sm">Send</Button>
            </div>
          </>
        ) : (
          <div className="nv-empty" style={{ flex: 1, flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>N0VA ANI</div>
            <div style={{ maxWidth: 400, textAlign: "center", color: "var(--nv-color-text-faint)", fontSize: 13 }}>
              Your AI Native Intelligence — an agentic assistant with consciousness awareness,
              RAG-powered retrieval, and N0VA1O tool orchestration.
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Start a conversation</Button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="nv-card nv-card-pad">
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {(["chat", "tools", "memory", "consciousness"] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  fontSize: 10,
                  padding: "3px 8px",
                  borderRadius: 6,
                  border: activeTab === tab ? "1px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                  background: activeTab === tab ? "var(--nv-color-primary)" : "transparent",
                  color: activeTab === tab ? "#fff" : "inherit",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "consciousness" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Consciousness State</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <CoherenceBar label="Coherence" value={consciousnessCoherence} />
                <CoherenceBar label="Cognitive Load" value={0.3} color="var(--nv-color-warning)" />
                <CoherenceBar label="Engagement" value={0.85} color="var(--nv-color-success)" />
              </div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                Tier: Reflective • Mode: External
              </div>
            </div>
          )}

          {activeTab === "tools" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Tool Calls</div>
              {toolCalls.length === 0 ? (
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>No tool calls yet</div>
              ) : (
                toolCalls.map((tc) => (
                  <div key={tc.id} style={{ fontSize: 10, padding: "3px 6px", background: "var(--nv-color-surface-raised)", borderRadius: 4 }}>
                    ⚡ {tc.name} <Badge tone={tc.status === "error" ? "danger" : "success"}>{tc.status}</Badge>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "memory" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Memory Stats</div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>
                Working: 0 items<br />
                Semantic: 0 items<br />
                Episodic: 0 items
              </div>
            </div>
          )}

          {activeTab === "chat" && (
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>
              {active ? `${active.messages.length} messages` : "Select a conversation"}
            </div>
          )}
        </div>

        <div className="nv-card nv-card-pad">
          <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4 }}>ANI Engine</div>
          <div style={{ fontSize: 9, color: "var(--nv-color-text-faint)", lineHeight: 1.5 }}>
            Penta-Audience • 5-Layer Consciousness • RAG Pipeline • N0VA1O Gateway
          </div>
        </div>
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

function CoherenceBar({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 9, width: 80, color: "var(--nv-color-text-faint)" }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: "var(--nv-color-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value * 100}%`, height: "100%", background: color ?? "var(--nv-color-primary)", borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, width: 28, textAlign: "right" }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}
