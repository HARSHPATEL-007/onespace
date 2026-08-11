"use client";
import { useState, useCallback } from "react";

type PaneType = "NONE" | "DOCS" | "TASKS" | "CALENDAR" | "CRM" | "THREAD" | "EMBED";
const PANES: { id: PaneType; label: string; icon: string }[] = [
  { id: "DOCS", label: "Docs", icon: "📄" },
  { id: "TASKS", label: "Tasks", icon: "✅" },
  { id: "CALENDAR", label: "Calendar", icon: "📅" },
  { id: "CRM", label: "CRM", icon: "👤" },
  { id: "THREAD", label: "Thread", icon: "💬" },
  { id: "EMBED", label: "Embeds", icon: "🔗" },
];

export function AdaptivePane({ channelId, workspaceId }: { channelId: string; workspaceId: string }) {
  const [activePane, setActivePane] = useState<PaneType>("NONE");
  const [collapsed, setCollapsed] = useState(false);

  const switchPane = useCallback((pane: PaneType) => {
    setActivePane(p => p === pane ? "NONE" : pane);
    fetch("/api/collaboration/panes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activePane: pane }) });
  }, []);

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 48, borderRight: "1px solid var(--nv-color-border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "var(--nv-space-2)" }}>
        {PANES.map(p => (
          <button key={p.id} onClick={() => switchPane(p.id)} title={p.label} style={{ width: 36, height: 36, borderRadius: "var(--nv-radius-md)", border: "none", background: activePane === p.id ? "var(--nv-color-primary-alpha)" : "transparent", cursor: "pointer", fontSize: 16 }}>
            {p.icon}
          </button>
        ))}
      </div>
      {!collapsed && activePane !== "NONE" && (
        <div style={{ width: 320, borderRight: "1px solid var(--nv-color-border)", overflowY: "auto", padding: "var(--nv-space-3)" }}>
          <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", marginBottom: "var(--nv-space-3)" }}>{PANES.find(p => p.id === activePane)?.label}</div>
          <PaneContent pane={activePane} channelId={channelId} workspaceId={workspaceId} />
        </div>
      )}
    </div>
  );
}

function PaneContent({ pane, channelId, workspaceId }: { pane: PaneType; channelId: string; workspaceId: string }) {
  if (pane === "THREAD") return <ThreadSummary channelId={channelId} />;
  if (pane === "EMBED") return <EmbedList channelId={channelId} />;
  return <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No {pane.toLowerCase()} context available for this channel.</div>;
}

function ThreadSummary({ channelId }: { channelId: string }) {
  return <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Thread summary will appear here.</div>;
}

function EmbedList({ channelId }: { channelId: string }) {
  return <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Shared embeds will appear here.</div>;
}
