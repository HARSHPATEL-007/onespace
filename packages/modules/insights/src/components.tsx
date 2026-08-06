"use client";

import type { ActivityDay, WorkspaceSnapshot } from "./server";
import type { AuditLog } from "@n0va/db";

const KPI: Array<{ key: keyof WorkspaceSnapshot; label: string; color: string }> = [
  { key: "totalDocs", label: "Docs", color: "#4285f4" },
  { key: "totalSlides", label: "Slides", color: "#f4b400" },
  { key: "totalSheets", label: "Sheets", color: "#0f9d58" },
  { key: "totalTasks", label: "Tasks", color: "#0f9d58" },
  { key: "totalMeetings", label: "Meetings", color: "#ea4335" },
  { key: "totalMessages", label: "Messages", color: "#7c5cff" },
  { key: "totalFiles", label: "Files", color: "#4285f4" },
  { key: "totalSites", label: "Sites", color: "#7c5cff" },
  { key: "totalLearningSets", label: "Learning sets", color: "#0f9d58" },
  { key: "totalCallLogs", label: "Call logs", color: "#0ea5e9" },
  { key: "totalAutomations", label: "Automations", color: "#f59e0b" },
  { key: "totalIntegrations", label: "Integrations", color: "#0ea5e9" },
  { key: "totalDevices", label: "Devices", color: "#059669" },
  { key: "totalMembers", label: "Members", color: "#7c5cff" },
];

export function Insights({
  snapshot,
  activity,
  audit,
}: {
  snapshot: WorkspaceSnapshot;
  activity: ActivityDay[];
  audit: AuditLog[];
}) {
  const max = Math.max(...activity.map((a) => a.count), 1);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA INSIGHTS</h1>
        <span className="nv-badge nv-badge-amber">analytics</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
        {KPI.map((k) => (
          <div key={k.key} className="nv-card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{snapshot[k.key]}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div className="nv-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Activity — last 14 days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
            {activity.map((a) => (
              <div key={a.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  title={`${a.date}: ${a.count} events`}
                  style={{
                    width: "100%",
                    background: a.count > 0 ? "var(--nv-color-primary)" : "var(--nv-color-border)",
                    borderRadius: 4,
                    height: `${Math.max((a.count / max) * 100, 2)}%`,
                    minHeight: 3,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>
            <span>{activity[0]?.date?.slice(5) ?? ""}</span>
            <span>{activity[activity.length - 1]?.date?.slice(5) ?? ""}</span>
          </div>
        </div>

        <div className="nv-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Recent events</div>
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {audit.slice(0, 20).map((l) => (
              <div key={l.id} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "var(--nv-color-text-faint)", fontFamily: "monospace", fontSize: 11, flexShrink: 0 }}>
                  {l.createdAt.toLocaleDateString()} {l.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="nv-badge" style={{ flexShrink: 0 }}>{l.module}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.action}</span>
              </div>
            ))}
            {audit.length === 0 && <div className="nv-empty" style={{ fontSize: 12 }}>No events yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
