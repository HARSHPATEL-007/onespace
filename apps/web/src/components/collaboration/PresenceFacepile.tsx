"use client";
import { useState, useEffect, useCallback } from "react";
import { Avatar } from "@n0va/ui";

interface Presence { id: string; userId: string; status: string; activeSection: string | null; typingInChannel: string | null; color: string; lastHeartbeat: string; user: { id: string; name: string | null; email: string; image: string | null }; }

const STATUS_COLORS: Record<string, string> = { ONLINE: "var(--nv-color-success)", IDLE: "var(--nv-color-warning)", AWAY: "var(--nv-color-text-faint)", BUSY: "var(--nv-color-danger)", READ_ONLY: "var(--nv-color-text-muted)", OFFLINE: "var(--nv-color-text-faint)" };

export function PresenceFacepile({ workspaceId, channelId }: { workspaceId: string; channelId?: string }) {
  const [presences, setPresences] = useState<Presence[]>([]);
  const load = useCallback(async () => { try { const r = await fetch("/api/collaboration/presence"); if (r.ok) setPresences((await r.json()).presences ?? []); } catch { } }, []);
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  const active = presences.filter(p => p.status !== "OFFLINE");
  const typing = channelId ? active.filter(p => p.typingInChannel === channelId) : [];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {typing.length > 0 && <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", fontStyle: "italic" }}>{typing.map(t => t.user.name ?? "Someone").join(", ")} typing...</span>}
      <div style={{ display: "flex", alignItems: "center" }}>
        {active.slice(0, 6).map(p => (
          <div key={p.id} style={{ position: "relative", marginLeft: -8, cursor: "pointer" }} title={`${p.user.name ?? p.user.email} — ${p.status.toLowerCase()}${p.activeSection ? ` • ${p.activeSection}` : ""}`}>
            <Avatar name={p.user.name ?? p.user.email} size="sm" />
            <span style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: STATUS_COLORS[p.status] ?? "var(--nv-color-text-faint)", border: "2px solid var(--nv-color-surface)" }} />
          </div>
        ))}
        {active.length > 6 && <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginLeft: 4 }}>+{active.length - 6}</span>}
      </div>
    </div>
  );
}
