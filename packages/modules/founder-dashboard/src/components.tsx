"use client";

import type { FounderSnapshot } from "./server";

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export function FounderDashboard({ snapshot }: { snapshot: FounderSnapshot }) {
  const kpis: Array<{ label: string; value: string; color?: string }> = [
    { label: "MRR", value: fmtMoney(snapshot.mrrCents), color: "var(--nv-color-success)" },
    { label: "Collected", value: fmtMoney(snapshot.collectedCents) },
    { label: "Outstanding", value: fmtMoney(snapshot.outstandingCents), color: "var(--nv-color-warning)" },
    { label: "Open pipeline", value: fmtMoney(snapshot.openPipelineCents), color: "#0ea5e9" },
    { label: "Won", value: fmtMoney(snapshot.wonCents), color: "var(--nv-color-success)" },
    { label: "Campaigns running", value: String(snapshot.campaignsRunning) },
    { label: "Marketing spent", value: fmtMoney(snapshot.campaignSpentCents) },
    { label: "Open tickets", value: String(snapshot.openTickets), color: snapshot.openTickets > 0 ? "var(--nv-color-warning)" : undefined },
    { label: "Open incidents", value: String(snapshot.incidentsOpen), color: snapshot.incidentsOpen > 0 ? "#ef4444" : undefined },
    { label: "Employees", value: String(snapshot.employees) },
    { label: "Members", value: String(snapshot.members) },
    { label: "Docs", value: String(snapshot.docs) },
    { label: "Tasks open", value: String(snapshot.tasksOpen) },
    { label: "Meetings", value: String(snapshot.meetings) },
    { label: "Sites", value: String(snapshot.sites) },
    { label: "Automations", value: String(snapshot.automations) },
    { label: "Integrations", value: String(snapshot.integrations) },
    { label: "Devices", value: String(snapshot.devices) },
    { label: "Vault secrets", value: String(snapshot.vaultEntries) },
    { label: "Avg sleep", value: `${snapshot.avgSleep.toFixed(1)}h`, color: "#0ea5e9" },
    { label: "Check-ins (30d)", value: String(snapshot.checkinCount) },
  ];

  const max = Math.max(...snapshot.activity.map((a) => a.count), 1);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA FOUNDER DASHBOARD</h1>
        <span className="nv-badge nv-badge-amber">company KPIs</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} className="nv-card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: k.color ?? "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="nv-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Workspace activity — 14 days</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130 }}>
            {snapshot.activity.map((a) => (
              <div key={a.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  title={`${a.date}: ${a.count}`}
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
            <span>{snapshot.activity[0]?.date?.slice(5) ?? ""}</span>
            <span>{snapshot.activity[snapshot.activity.length - 1]?.date?.slice(5) ?? ""}</span>
          </div>
        </div>

        <div className="nv-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>Latest events</div>
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {snapshot.recentAudit.map((l) => (
              <div key={l.id} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "var(--nv-color-text-faint)", fontFamily: "monospace", fontSize: 11, flexShrink: 0 }}>
                  {l.createdAt.toLocaleDateString()} {l.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="nv-badge" style={{ flexShrink: 0 }}>{l.module}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
