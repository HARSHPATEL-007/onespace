"use client";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@n0va/ui";

interface Notification { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string; }
const ICONS: Record<string, string> = { chat_mention: "💬", chat_message: "📨", chat_reaction: "👍", huddle_invite: "🎥", system: "🔔" };
function ago(d: string) { const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000); return m < 1 ? "now" : m < 60 ? m + "m" : Math.floor(m / 60) < 24 ? Math.floor(m / 60) + "h" : Math.floor(m / 1440) + "d"; }

export function NotificationPanel({ onClose }: { onClose?: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { const r = await globalThis.fetch("/api/notifications"); if (r.ok) { const d = await r.json(); setItems(d.notifications ?? []); setUnread(d.unreadCount ?? 0); } } catch { } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const markRead = async (id: string) => { await globalThis.fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: id }) }); load(); };
  const markAll = async () => { await globalThis.fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) }); load(); };

  return (
    <div style={{ width: 360, maxHeight: 520, display: "flex", flexDirection: "column", background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", boxShadow: "var(--nv-shadow-lg)", overflow: "hidden" }}>
      <div style={{ padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", alignItems: "center" }}>
        <span style={{ fontWeight: 700, flex: 1 }}>Notifications</span>
        {unread > 0 && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 6 }}><span className="nv-badge nv-badge-primary">{unread}</span><Button size="sm" variant="secondary" onClick={markAll}>Mark all read</Button></span>}
        {onClose && <Button variant="ghost" size="sm" onClick={onClose} style={{ marginLeft: 4 }}>✕</Button>}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div className="nv-empty">Loading...</div>}
        {!loading && items.length === 0 && <div className="nv-empty"><div style={{ fontSize: 24, marginBottom: 8 }}>🔔</div><div>No notifications</div></div>}
        {items.map(n => (
          <a key={n.id} href={n.link ?? "#"} onClick={() => !n.readAt && markRead(n.id)} style={{ display: "flex", gap: 10, padding: "var(--nv-space-3)", borderBottom: "1px solid var(--nv-color-border)", textDecoration: "none", color: "var(--nv-color-text)", background: n.readAt ? "transparent" : "var(--nv-color-primary-alpha)" }}>
            <span style={{ fontSize: 18 }}>{ICONS[n.type] ?? "🔔"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--nv-font-sm)", fontWeight: n.readAt ? 400 : 600 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>}
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{ago(n.createdAt)}</div>
            </div>
            {!n.readAt && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--nv-color-primary)", flexShrink: 0, marginTop: 4 }} />}
          </a>
        ))}
      </div>
    </div>
  );
}
