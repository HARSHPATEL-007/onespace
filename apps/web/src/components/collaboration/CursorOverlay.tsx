"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface Cursor { userId: string; userName: string; color: string; x: number; y: number; lastUpdate: number; }

export function CursorOverlay({ workspaceId, resourceId }: { workspaceId: string; resourceId: string }) {
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/collaboration/presence");
      if (!r.ok) return;
      const data = await r.json();
      const now = Date.now();
      setCursors((data.presences ?? [])
        .filter((p: any) => p.cursorResourceId === resourceId && p.cursorX != null && now - new Date(p.lastHeartbeat).getTime() < 30000)
        .map((p: any) => ({ userId: p.userId, userName: p.user.name ?? p.user.email, color: p.color, x: p.cursorX, y: p.cursorY, lastUpdate: new Date(p.lastHeartbeat).getTime() })));
    } catch { }
  }, [resourceId]);

  useEffect(() => { load(); const i = setInterval(load, 2000); return () => clearInterval(i); }, [load]);

  const sendCursor = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    fetch("/api/collaboration/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursorX: x, cursorY: y, cursorResourceId: resourceId }) });
  }, [resourceId]);

  return (
    <div ref={containerRef} onMouseMove={sendCursor} style={{ position: "relative", width: "100%", height: "100%" }}>
      {cursors.map(c => (
        <div key={c.userId} style={{ position: "absolute", left: c.x, top: c.y, pointerEvents: "none", transition: "left 0.1s, top 0.1s", zIndex: 100 }}>
          <svg width="16" height="20" viewBox="0 0 16 20" fill={c.color}><path d="M0 0L16 12L8 12L4 20L0 0Z" /></svg>
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: c.color, color: "#fff", whiteSpace: "nowrap", marginLeft: 4 }}>{c.userName.split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}
