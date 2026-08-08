"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { MailLabel, MailLabelMap, MailMessage } from "@n0va/db";
import type { MailUnreadCounts } from "./server";

export interface MailActions {
  send: (formData: FormData) => Promise<void>;
  reply: (formData: FormData) => Promise<void>;
  markRead: (formData: FormData) => Promise<void>;
  toggleStar: (formData: FormData) => Promise<void>;
  archive: (formData: FormData) => Promise<void>;
  trash: (formData: FormData) => Promise<void>;
  restore: (formData: FormData) => Promise<void>;
  createLabel: (formData: FormData) => Promise<void>;
  assignLabel: (formData: FormData) => Promise<void>;
  unassignLabel: (formData: FormData) => Promise<void>;
  summarizeThread: (formData: FormData) => Promise<{ content: string }>;
  suggestReply: (formData: FormData) => Promise<{ content: string }>;
  extractActionItems: (formData: FormData) => Promise<{ items: string[] }>;
  adjustTone: (formData: FormData) => Promise<{ content: string }>;
  saveDraft: (formData: FormData) => Promise<void>;
  createRule: (formData: FormData) => Promise<void>;
  toggleRule: (formData: FormData) => Promise<void>;
  deleteRule: (formData: FormData) => Promise<void>;
}

type MessageWithLabels = MailMessage & { labels: Array<MailLabelMap & { label: MailLabel }> };
export interface MailThread {
  threadId: string;
  messages: MessageWithLabels[];
  unread: number;
  starred: boolean;
  latestSentAt: Date;
}

const FOLDERS = [
  { key: "INBOX", label: "Inbox", glyph: "▣" },
  { key: "SENT", label: "Sent", glyph: "➤" },
  { key: "ARCHIVE", label: "Archive", glyph: "▤" },
  { key: "TRASH", label: "Trash", glyph: "✕" },
] as const;

const AI_TONES = [
  { key: "formal", label: "Formal" },
  { key: "concise", label: "Concise" },
  { key: "friendly", label: "Friendly" },
  { key: "persuasive", label: "Persuasive" },
] as const;

interface RuleItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  runCount: number;
}

export function MailApp({
  folder,
  threads,
  labels,
  unreadCounts,
  actions,
  rules: initialRules,
}: {
  folder: string;
  threads: MailThread[];
  labels: Array<MailLabel & { _count: { messages: number } }>;
  unreadCounts: MailUnreadCounts;
  actions: MailActions;
  rules?: RuleItem[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeThreadId = searchParams.get("t");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [newRuleOpen, setNewRuleOpen] = useState(false);

  // AI state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiActionItems, setAiActionItems] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState<string | null>(null);

  const activeThread = threads.find((t) => t.threadId === activeThreadId) ?? null;

  useEffect(() => {
    if (activeThread && activeThread.unread > 0) {
      const fd = new FormData();
      fd.set("threadId", activeThread.threadId);
      void actions.markRead(fd).then(() => setTimeout(() => router.refresh(), 50));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  // Clear AI state when thread changes
  useEffect(() => {
    setAiSummary(null);
    setAiReply(null);
    setAiActionItems([]);
  }, [activeThreadId]);

  const toggleLabel = (messageId: string, labelId: string, isAssigned: boolean) => {
    const fd = new FormData();
    fd.set("messageId", messageId);
    fd.set("labelId", labelId);
    void (isAssigned ? actions.unassignLabel(fd) : actions.assignLabel(fd)).then(() => setTimeout(() => router.refresh(), 50));
  };

  const activeLabelIds = new Set(
    activeThread ? activeThread.messages[activeThread.messages.length - 1]!.labels.map((lm) => lm.labelId) : [],
  );

  const runAi = useCallback(
    async (kind: "summarize" | "reply" | "actions") => {
      if (!activeThreadId) return;
      setAiLoading(kind);
      try {
        const fd = new FormData();
        fd.set("threadId", activeThreadId);
        if (kind === "summarize") {
          const result = await actions.summarizeThread(fd);
          setAiSummary(result.content);
        } else if (kind === "reply") {
          const result = await actions.suggestReply(fd);
          setAiReply(result.content);
        } else if (kind === "actions") {
          const result = await actions.extractActionItems(fd);
          setAiActionItems(result.items);
        }
      } catch (err) {
        console.error("AI action failed:", err);
      } finally {
        setAiLoading(null);
      }
    },
    [activeThreadId, actions],
  );

  const handleAdjustTone = useCallback(
    async (tone: string) => {
      if (!activeThreadId || !aiReply) return;
      setAiLoading("tone");
      try {
        const fd = new FormData();
        fd.set("threadId", activeThreadId);
        fd.set("content", aiReply);
        fd.set("tone", tone);
        const result = await actions.adjustTone(fd);
        setAiReply(result.content);
      } catch (err) {
        console.error("Tone adjustment failed:", err);
      } finally {
        setAiLoading(null);
      }
    },
    [activeThreadId, aiReply, actions],
  );

  const insertReply = useCallback(() => {
    if (aiReply) {
      setAiReply(null);
      setReplyOpen(true);
    }
  }, [aiReply]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchQuery.trim()) {
      params.set("q", searchQuery.trim());
    } else {
      params.delete("q");
    }
    router.push(`/m/mail?${params.toString()}`);
  };

  return (
    <div style={{ display: "flex", gap: "var(--nv-space-4)", height: "calc(100dvh - 150px)", minHeight: 440 }}>
      {/* Rail */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "var(--nv-radius-lg)",
          padding: "var(--nv-space-3)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <Button size="md" style={{ marginBottom: 10 }} onClick={() => setComposeOpen(true)}>
          + Compose
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSearchOpen((o) => !o)} style={{ marginBottom: 4 }}>
          {searchOpen ? "✕ Close search" : "🔍 Search"}
        </Button>
        {searchOpen && (
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 4, marginBottom: 6 }}>
            <input
              className="nv-input"
              type="text"
              placeholder="Search mail…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, fontSize: 12, padding: "4px 8px" }}
            />
            <Button type="submit" size="sm" variant="secondary">Go</Button>
          </form>
        )}
        {FOLDERS.map((f) => (
          <a
            key={f.key}
            href={`/m/mail?folder=${f.key}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: "var(--nv-radius-md)",
              textDecoration: "none",
              color: "var(--nv-color-text)",
              fontSize: "var(--nv-font-sm)",
              fontWeight: folder === f.key ? 700 : 500,
              background: folder === f.key ? "var(--nv-color-primary-alpha)" : "transparent",
            }}
          >
            <span>{f.glyph}</span>
            <span style={{ flex: 1 }}>{f.label}</span>
            {unreadCounts[f.key] > 0 && <span className="nv-badge nv-badge-primary">{unreadCounts[f.key]}</span>}
          </a>
        ))}
        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: "var(--nv-color-text-faint)", padding: "0 10px 6px" }}>
          LABELS
        </div>
        {labels.map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: "var(--nv-font-sm)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: "inline-block" }} />
            <span style={{ flex: 1 }}>{l.name}</span>
            <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>{l._count.messages}</span>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setNewLabelOpen(true)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
          + New label
        </Button>
        <div style={{ marginTop: 14, fontWeight: 700, fontSize: 12, color: "var(--nv-color-text-faint)", padding: "0 10px 6px" }}>
          AUTOMATION
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRulesOpen(true)} style={{ alignSelf: "flex-start", marginBottom: 4 }}>
          ⚙ Manage rules ({initialRules?.length ?? 0})
        </Button>
      </div>

      {/* Thread list */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "var(--nv-radius-lg)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {threads.length === 0 && <div className="nv-empty">Nothing here</div>}
        {threads.map((t) => {
          const latest = t.messages[t.messages.length - 1]!;
          return (
            <a
              key={t.threadId}
              href={`/m/mail?folder=${folder}&t=${t.threadId}`}
              style={{
                padding: "var(--nv-space-3)",
                borderBottom: "1px solid var(--nv-color-border)",
                textDecoration: "none",
                color: "var(--nv-color-text)",
                background: activeThreadId === t.threadId ? "var(--nv-color-primary-alpha)" : "transparent",
                display: "block",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{t.starred ? "★" : "☆"}</span>
                <span style={{ fontWeight: t.unread > 0 ? 700 : 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {latest.subject || "(no subject)"}
                </span>
                <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{t.latestSentAt.toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                {latest.fromName ? `${latest.fromName} — ` : ""}
                {latest.body.slice(0, 90)}
              </div>
              {t.messages[0]!.labels.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  {t.messages[0]!.labels.map((lm) => (
                    <button
                      key={lm.labelId}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleLabel(t.messages[0]!.id, lm.labelId, true);
                      }}
                      style={{
                        fontSize: 11,
                        padding: "1px 8px",
                        borderRadius: 999,
                        color: lm.label.color,
                        background: "transparent",
                        border: `1px solid ${lm.label.color}`,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {lm.label.name}
                    </button>
                  ))}
                </div>
              )}
            </a>
          );
        })}
      </div>

      {/* Reading pane */}
      <div
        style={{
          flex: 1,
          background: "var(--nv-color-surface)",
          border: "1px solid var(--nv-color-border)",
          borderRadius: "var(--nv-radius-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {!activeThread ? (
          <div className="nv-empty" style={{ flex: 1 }}>
            <div>Select a conversation</div>
          </div>
        ) : (
          <>
            <div style={{ padding: "var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: "var(--nv-font-lg)" }}>
                {activeThread.messages[activeThread.messages.length - 1]!.subject || "(no subject)"}
              </div>
              {activeThread.messages[activeThread.messages.length - 1]!.labels.length > 0 && (
                <div style={{ display: "flex", gap: 4 }}>
                  {activeThread.messages[activeThread.messages.length - 1]!.labels.map((lm) => (
                    <button
                      key={lm.labelId}
                      type="button"
                      onClick={() => toggleLabel(activeThread.messages[activeThread.messages.length - 1]!.id, lm.labelId, true)}
                      style={{
                        fontSize: 11,
                        padding: "1px 8px",
                        borderRadius: 999,
                        color: lm.label.color,
                        background: "transparent",
                        border: `1px solid ${lm.label.color}`,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {lm.label.name}
                    </button>
                  ))}
                </div>
              )}
              <LabelPicker
                key={activeThreadId}
                labels={labels}
                assigned={activeLabelIds}
                onToggle={(labelId, isAssigned) =>
                  toggleLabel(activeThread.messages[activeThread.messages.length - 1]!.id, labelId, isAssigned)
                }
              />
              <div style={{ flex: 1 }} />
              <form action={actions.toggleStar} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                <input type="hidden" name="messageId" value={activeThread.messages[activeThread.messages.length - 1]!.id} />
                <Button variant="ghost" size="sm">{activeThread.starred ? "★ Starred" : "☆ Star"}</Button>
              </form>
              {folder === "INBOX" && (
                <form action={actions.archive} onSubmit={() => setTimeout(() => router.push("/m/mail?folder=INBOX"), 50)}>
                  <input type="hidden" name="threadId" value={activeThread.threadId} />
                  <Button variant="ghost" size="sm">Archive</Button>
                </form>
              )}
              {folder === "TRASH" ? (
                <form action={actions.restore} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                  <input type="hidden" name="threadId" value={activeThread.threadId} />
                  <Button variant="ghost" size="sm">Restore</Button>
                </form>
              ) : (
                <form action={actions.trash} onSubmit={() => setTimeout(() => router.refresh(), 50)}>
                  <input type="hidden" name="threadId" value={activeThread.threadId} />
                  <Button variant="danger" size="sm">Trash</Button>
                </form>
              )}
            </div>

            {/* AI Toolbar */}
            <div style={{ padding: "var(--nv-space-2) var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", gap: 6, flexWrap: "wrap", background: "var(--nv-color-surface-alt)" }}>
              <Button variant="ghost" size="sm" disabled={aiLoading === "summarize"} onClick={() => runAi("summarize")}>
                {aiLoading === "summarize" ? "…" : "📋 Summarize"}
              </Button>
              <Button variant="ghost" size="sm" disabled={aiLoading === "reply"} onClick={() => runAi("reply")}>
                {aiLoading === "reply" ? "…" : "💡 Smart Reply"}
              </Button>
              <Button variant="ghost" size="sm" disabled={aiLoading === "actions"} onClick={() => runAi("actions")}>
                {aiLoading === "actions" ? "…" : "✅ Action Items"}
              </Button>
              {aiReply && (
                <Button variant="ghost" size="sm" onClick={insertReply}>
                  ↪ Use reply
                </Button>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-4)", display: "flex", flexDirection: "column", gap: "var(--nv-space-4)" }}>
              {/* AI Summary */}
              {aiSummary && (
                <div className="nv-card" style={{ padding: "var(--nv-space-4)", borderLeft: "3px solid var(--nv-color-primary)" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", color: "var(--nv-color-primary)", marginBottom: 6 }}>
                    📋 Thread Summary
                  </div>
                  <div style={{ fontSize: "var(--nv-font-md)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{aiSummary}</div>
                </div>
              )}

              {/* AI Action Items */}
              {aiActionItems.length > 0 && (
                <div className="nv-card" style={{ padding: "var(--nv-space-4)", borderLeft: "3px solid var(--nv-color-success)" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", color: "var(--nv-color-success)", marginBottom: 6 }}>
                    ✅ Action Items
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: "var(--nv-font-md)", lineHeight: 1.8 }}>
                    {aiActionItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI Suggested Reply */}
              {aiReply && (
                <div className="nv-card" style={{ padding: "var(--nv-space-4)", borderLeft: "3px solid var(--nv-color-accent)" }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", color: "var(--nv-color-accent)", marginBottom: 6 }}>
                    💡 Suggested Reply
                  </div>
                  <div style={{ fontSize: "var(--nv-font-md)", whiteSpace: "pre-wrap", lineHeight: 1.6, marginBottom: 8 }}>{aiReply}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)", alignSelf: "center" }}>Adjust tone:</span>
                    {AI_TONES.map((t) => (
                      <Button key={t.key} variant="ghost" size="sm" disabled={aiLoading === "tone"} onClick={() => handleAdjustTone(t.key)}>
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {activeThread.messages.map((m) => (
                <div key={m.id} className="nv-card" style={{ padding: "var(--nv-space-4)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "var(--nv-color-primary-alpha)",
                        color: "var(--nv-color-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      {(m.fromName || m.fromEmail)[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)" }}>
                        {m.fromName || m.fromEmail}
                        {m.direction === "OUT" && <span style={{ color: "var(--nv-color-text-faint)", fontWeight: 500 }}> (you)</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                        to {Array.isArray(m.toEmails) ? String((m.toEmails as string[]).join(", ")) : String(m.toEmails)} · {m.sentAt.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--nv-font-md)", lineHeight: 1.6 }}>{m.body}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: "var(--nv-space-3)", borderTop: "1px solid var(--nv-color-border)", display: "flex", gap: 8 }}>
              <Button variant="secondary" size="md" onClick={() => setReplyOpen(true)}>
                Reply
              </Button>
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  const body = activeThread.messages[activeThread.messages.length - 1]!.body;
                  navigator.clipboard.writeText(body);
                }}
              >
                Copy
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Compose */}
      <Dialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="New message"
        actions={
          <>
            <Button variant="secondary" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="compose-form">
              Send
            </Button>
          </>
        }
      >
        <form
          id="compose-form"
          action={(fd) => {
            void actions.send(fd).then(() => {
              setComposeOpen(false);
              router.refresh();
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}
        >
          <input className="nv-input" name="to" type="email" placeholder="To" required autoFocus />
          <input className="nv-input" name="subject" placeholder="Subject" />
          <textarea className="nv-input" name="body" placeholder="Write your message…" rows={7} style={{ resize: "vertical" }} />
        </form>
      </Dialog>

      {/* Reply */}
      <Dialog
        open={replyOpen}
        onClose={() => setReplyOpen(false)}
        title="Reply"
        actions={
          <>
            <Button variant="secondary" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="reply-form">
              Send
            </Button>
          </>
        }
      >
        <form
          id="reply-form"
          action={(fd) => {
            fd.set("threadId", activeThread?.threadId ?? "");
            void actions.reply(fd).then(() => {
              setReplyOpen(false);
              router.refresh();
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}
        >
          {aiReply && (
            <div style={{ padding: "var(--nv-space-2)", background: "var(--nv-color-primary-alpha)", borderRadius: "var(--nv-radius-sm)", fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>
              <span style={{ fontWeight: 600 }}>AI suggested: </span>
              {aiReply.slice(0, 120)}
              {aiReply.length > 120 ? "…" : ""}
            </div>
          )}
          <textarea className="nv-input" name="body" placeholder="Write your reply…" rows={6} required autoFocus style={{ resize: "vertical" }} defaultValue={aiReply ?? ""} />
        </form>
      </Dialog>

      {/* New label */}
      <Dialog
        open={newLabelOpen}
        onClose={() => setNewLabelOpen(false)}
        title="New label"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewLabelOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="label-form">
              Create
            </Button>
          </>
        }
      >
        <form
          id="label-form"
          action={(fd) => {
            void actions.createLabel(fd).then(() => {
              setNewLabelOpen(false);
              router.refresh();
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 300 }}
        >
          <input className="nv-input" name="name" placeholder="Label name (e.g. Product)" required autoFocus />
          <input className="nv-input" name="color" type="color" defaultValue="#7c5cfc" style={{ padding: 4, height: 40 }} />
        </form>
      </Dialog>

      {/* Rules management */}
      <Dialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        title="Automation Rules"
        actions={
          <>
            <Button variant="ghost" onClick={() => setNewRuleOpen(true)}>
              + New Rule
            </Button>
            <Button variant="secondary" onClick={() => setRulesOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        <div style={{ minWidth: 480, maxHeight: 400, overflowY: "auto" }}>
          {(initialRules ?? []).length === 0 && (
            <div style={{ padding: "var(--nv-space-4)", textAlign: "center", color: "var(--nv-color-text-faint)", fontSize: "var(--nv-font-sm)" }}>
              No rules yet. Create one to automate your inbox.
            </div>
          )}
          {(initialRules ?? []).map((rule) => (
            <div key={rule.id} style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--nv-font-sm)" }}>{rule.name}</div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                  {rule.description || "No description"} · Priority {rule.priority} · Triggered {rule.runCount}×
                </div>
              </div>
              <form
                action={(fd) => {
                  fd.set("ruleId", rule.id);
                  void actions.toggleRule(fd).then(() => setTimeout(() => router.refresh(), 50));
                }}
              >
                <Button variant={rule.enabled ? "secondary" : "ghost"} size="sm" type="submit">
                  {rule.enabled ? "ON" : "OFF"}
                </Button>
              </form>
              <form
                action={(fd) => {
                  fd.set("ruleId", rule.id);
                  void actions.deleteRule(fd).then(() => setTimeout(() => router.refresh(), 50));
                }}
              >
                <Button variant="danger" size="sm" type="submit">✕</Button>
              </form>
            </div>
          ))}
        </div>
      </Dialog>

      {/* New rule */}
      <Dialog
        open={newRuleOpen}
        onClose={() => setNewRuleOpen(false)}
        title="Create Rule"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewRuleOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="rule-form-create">
              Create
            </Button>
          </>
        }
      >
        <form
          id="rule-form-create"
          action={(fd) => {
            void actions.createRule(fd).then(() => {
              setNewRuleOpen(false);
              setRulesOpen(true);
              router.refresh();
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 420 }}
        >
          <input className="nv-input" name="name" placeholder="Rule name (e.g. Auto-label newsletters)" required autoFocus />
          <input className="nv-input" name="description" placeholder="Description (optional)" />
          <input className="nv-input" name="priority" type="number" defaultValue={100} placeholder="Priority (lower = higher)" />
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Conditions (JSON):</div>
          <textarea
            className="nv-input"
            name="conditions"
            placeholder='{"operator":"AND","conditions":[{"field":"subject","operator":"contains","value":"newsletter"}]}'
            rows={3}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Actions (JSON array):</div>
          <textarea
            className="nv-input"
            name="actions"
            placeholder='[{"type":"moveToFolder","folder":"ARCHIVE"},{"type":"markRead"}]'
            rows={3}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
        </form>
      </Dialog>
    </div>
  );
}

function LabelPicker({
  labels,
  assigned,
  onToggle,
}: {
  labels: Array<MailLabel & { _count: { messages: number } }>;
  assigned: Set<string>;
  onToggle: (labelId: string, isAssigned: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
        + label
      </Button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            zIndex: 20,
            minWidth: 180,
            padding: 4,
            background: "var(--nv-color-surface)",
            border: "1px solid var(--nv-color-border)",
            borderRadius: "var(--nv-radius-md)",
            boxShadow: "var(--nv-shadow-lg)",
          }}
        >
          {labels.map((l) => {
            const isAssigned = assigned.has(l.id);
            return (
              <button
                key={l.id}
                type="button"
                className={cn("nv-palette-item", isAssigned && "nv-palette-item-active")}
                onClick={() => {
                  onToggle(l.id, isAssigned);
                  setOpen(false);
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: "inline-block" }} />
                <span className="nv-palette-item-name">{l.name}</span>
                {isAssigned && <span>✓</span>}
              </button>
            );
          })}
          {labels.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: "var(--nv-font-xs)", color: "var(--nv-color-text-faint)" }}>
              No labels yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
