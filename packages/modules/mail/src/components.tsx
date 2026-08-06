"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";
import type { MailLabel, MailLabelMap, MailMessage } from "@n0va/db";

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

export function MailApp({
  folder,
  threads,
  labels,
  unreadCount,
  actions,
}: {
  folder: string;
  threads: MailThread[];
  labels: Array<MailLabel & { _count: { messages: number } }>;
  unreadCount: number;
  actions: MailActions;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeThreadId = searchParams.get("t");
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [newLabelOpen, setNewLabelOpen] = useState(false);

  const activeThread = threads.find((t) => t.threadId === activeThreadId) ?? null;

  useEffect(() => {
    if (activeThread && activeThread.unread > 0) {
      const fd = new FormData();
      fd.set("threadId", activeThread.threadId);
      void actions.markRead(fd).then(() => setTimeout(() => router.refresh(), 50));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

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
            {f.key === "INBOX" && unreadCount > 0 && (
              <span
                style={{
                  background: "var(--nv-color-primary)",
                  color: "#fff",
                  borderRadius: 999,
                  fontSize: 11,
                  padding: "1px 8px",
                  fontWeight: 700,
                }}
              >
                {unreadCount}
              </span>
            )}
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
                    <span
                      key={lm.labelId}
                      style={{
                        fontSize: 11,
                        padding: "1px 8px",
                        borderRadius: 999,
                        color: lm.label.color,
                        background: "transparent",
                        border: `1px solid ${lm.label.color}`,
                      }}
                    >
                      {lm.label.name}
                    </span>
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

            <div style={{ flex: 1, overflowY: "auto", padding: "var(--nv-space-4)", display: "flex", flexDirection: "column", gap: "var(--nv-space-4)" }}>
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

            <div style={{ padding: "var(--nv-space-3)", borderTop: "1px solid var(--nv-color-border)" }}>
              <Button variant="secondary" size="md" onClick={() => setReplyOpen(true)}>
                Reply
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
          <textarea className="nv-input" name="body" placeholder="Write your reply…" rows={6} required autoFocus style={{ resize: "vertical" }} />
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
    </div>
  );
}
