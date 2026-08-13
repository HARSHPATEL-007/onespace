"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@n0va/ui";
import type { WorkspaceModeValue } from "@n0va/modules-chat";
import { notificationDecision, MODES } from "@n0va/modules-chat/adaptive-policy";

interface Notification { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; }
const ICONS: Record<string, string> = { chat_mention: "💬", chat_message: "📨", chat_reaction: "👍", huddle_invite: "🎥", system: "🔔" };
function ago(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? m + "m" : Math.floor(m / 60) < 24 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d"; }

/** kind → priority (0-100). Mentions and system events outrank chatter. */
const KIND_PRIORITY: Record<string, number> = {
  chat_mention: 95,
  system: 80,
  huddle_invite: 60,
  chat_message: 40,
  chat_reaction: 30,
};

export function NotificationPanel({ mode, onClose }: { mode: WorkspaceModeValue; onClose?: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { const r = await globalThis.fetch("/api/notifications"); if (r.ok) { const d = await r.json(); setItems(d.notifications ?? []); setUnread(d.unreadCount ?? 0); } } catch { } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const markRead = async (id: string) => { await globalThis.fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id }) }); load(); };
  const markAll = async () => { await globalThis.fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) }); load(); };

  // Mode-aware policy (spec: state-sensitive notification adaptation).
  const classified = useMemo(() => {
    const immediate: Notification[] = [];
    const digest: Notification[] = [];
    const queued: Notification[] = [];
    for (const n of items) {
      const kind = n.type ?? "system";
      const d = notificationDecision(mode, {
        kind,
        priority: KIND_PRIORITY[kind] ?? 50,
        mentionsSelf: kind === "chat_mention",
      });
      if (d.disposition === "IMMEDIATE") immediate.push(n);
      else if (d.disposition === "DIGEST") digest.push(n);
      else queued.push(n);
    }
    return { immediate, digest, queued };
  }, [items, mode]);

  const modeLabel = MODES[mode]?.label ?? mode;

  const row = (n: Notification) => (
    <a key={n.id} href={n.link ?? "#"} onClick={() => !n.readAt && markRead(n.id)} style={{ display: "flex", gap: 10, padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-text)", background: n.readAt ? "transparent" : "var(--nv-color-primary-alpha)" }}>
      <span style={{ fontSize: 18 }}>{ICONS[n.type] ?? "🔔"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: n.readAt ? 400 : 600 }}>{n.title}</div>
        {n.body && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{ago(n.createdAt)}</div>
      </div>
      {!n.readAt && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--nv-color-primary)", flexShrink: 0, marginTop: 4 }} />}
    </a>
  );

  const section = (title: string, list: Notification[], hint?: string) =>
    list.length > 0 ? (
      <div>
        <div style={{ padding: "6px var(--nv-space-3)", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--nv-color-text-faint)" }}>
          {title} {hint && <span style={{ fontWeight: 400 }}>· {hint}</span>}
        </div>
        {list.map(row)}
      </div>
    ) : null;

  return (
    <div style={{ width: 360, maxHeight: 520, display: "flex", flexDirection: "column", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", boxShadow: "var(--nv-shadow-lg)", overflow: "hidden" }}>
      <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center" }}>
        <span style={{ fontWeight: 700, flex: 1 }}>Notifications</span>
        <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginRight: 6, fontWeight: 700 }}>{modeLabel} policy</span>
        {unread > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6 }}><span className="nv-badge nv-badge-primary">{unread}</span><Button size="sm" variant="secondary" onClick={markAll}>Mark all read</Button></span>}
        {onClose && <Button variant="ghost" size="sm" onClick={onClose} style={{ marginLeft: 4 }}>✕</Button>}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div className="nv-empty">Loading...</div>}
        {!loading && items.length === 0 && <div className="nv-empty"><div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div><div>No notifications</div></div>}
        {section("Now", classified.immediate, mode === "CRISIS" ? "priority inbox only" : undefined)}
        {section("Digest (deferred)", classified.digest, `batched by ${modeLabel} policy`)}
        {classified.queued.length > 0 && (
          <details>
            <summary style={{ padding: "6px var(--nv-space-3)", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--nv-color-text-faint)", cursor: "pointer" }}>
              {classified.queued.length} queued quietly by {modeLabel}
            </summary>
            {classified.queued.map(row)}
          </details>
        )}
      </div>
    </div>
  );
}