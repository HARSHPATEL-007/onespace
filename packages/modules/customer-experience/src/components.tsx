"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Ticket, TicketReply } from "@n0va/db";

export interface CxActions {
  create: (formData: FormData) => Promise<void>;
  setStatus: (formData: FormData) => Promise<void>;
  setPriority: (formData: FormData) => Promise<void>;
  reply: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const STATUS_BADGE: Record<string, string> = {
  OPEN: "nv-badge",
  IN_PROGRESS: "nv-badge nv-badge-amber",
  WAITING: "nv-badge nv-badge-amber",
  RESOLVED: "nv-badge nv-badge-green",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "nv-badge nv-badge-green",
  MEDIUM: "nv-badge nv-badge-amber",
  HIGH: "nv-badge nv-badge-amber",
  URGENT: "nv-badge",
};

const NEXT_STATUS: Record<string, string> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "WAITING",
  WAITING: "RESOLVED",
  RESOLVED: "OPEN",
};

export function SupportDesk({
  tickets,
  actions,
}: {
  tickets: Array<Ticket & { replies: TicketReply[] }>;
  actions: CxActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const openTickets = tickets.filter((t) => t.status !== "RESOLVED").length;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA CUSTOMER EXPERIENCE</h1>
        <span className="nv-badge nv-badge-amber">{openTickets} open</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New ticket</Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tickets.map((t) => (
          <div key={t.id} className="nv-card" style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
              <span className={PRIORITY_BADGE[t.priority] ?? "nv-badge"}>{t.priority}</span>
              <span className={STATUS_BADGE[t.status] ?? "nv-badge"}>{t.status}</span>
              <select
                className="nv-input"
                value={t.status}
                onChange={(e) => {
                  const fd = new FormData();
                  fd.set("id", t.id);
                  fd.set("status", e.target.value);
                  void actions.setStatus(fd).then(() => router.refresh());
                }}
                style={{ padding: "4px 6px", fontSize: 12 }}
              >
                {Object.keys(STATUS_BADGE).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                {openId === t.id ? "Hide" : "Open"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm("Delete ticket?")) return; const fd = new FormData(); fd.set("id", t.id); void actions.remove(fd).then(() => router.refresh()); }}>✕</Button>
            </div>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
              {t.requesterName} · {t.requesterEmail} · {t.createdAt.toLocaleString()}
            </div>

            {openId === t.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--nv-color-border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {t.description && (
                  <div style={{ fontSize: 13, background: "var(--nv-color-bg)", borderRadius: 8, padding: 10 }}>{t.description}</div>
                )}
                {t.replies.map((r) => (
                  <div key={r.id} style={{ fontSize: 13, background: "var(--nv-color-surface-raised)", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>
                      Reply · {r.createdAt.toLocaleString()}
                    </div>
                    {r.body}
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="nv-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a reply…"
                    style={{ flex: 1 }}
                  />
                  <Button
                    size="sm"
                    disabled={!draft.trim()}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", t.id);
                      fd.set("body", draft);
                      void actions.reply(fd).then(() => {
                        setDraft("");
                        router.refresh();
                      });
                    }}
                  >
                    Reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {tickets.length === 0 && <div className="nv-empty" style={{ minHeight: 240 }}>No tickets yet</div>}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New support ticket"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-ticket-form">Create</Button>
          </>
        }
      >
        <form
          id="create-ticket-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="subject" placeholder="Subject" required autoFocus />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="nv-input" name="requesterName" placeholder="Requester name" required style={{ flex: 1 }} />
            <input className="nv-input" name="requesterEmail" type="email" placeholder="Email" required style={{ flex: 1 }} />
          </div>
          <select className="nv-input" name="priority" defaultValue="MEDIUM">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
          <textarea className="nv-input" name="description" rows={4} placeholder="Description" style={{ resize: "vertical" }} />
        </form>
      </Dialog>
    </div>
  );
}
