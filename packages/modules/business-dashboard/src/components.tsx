"use client";

import type { BusinessSnapshot } from "./server";

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export function BusinessDashboard({ snapshot }: { snapshot: BusinessSnapshot }) {
  const { departments, ops } = snapshot;

  const cards: Array<{ label: string; value: string; sub: string; color?: string }> = [
    { label: "Departments", value: String(departments.length), sub: `${departments.reduce((a, d) => a + d.employees, 0)} employees` },
    { label: "Deal pipeline", value: fmtMoney(ops.dealValueCents), sub: `${ops.openDeals}/${ops.deals} open` },
    { label: "Tickets", value: String(ops.tickets), sub: `${ops.openTickets} open`, color: ops.openTickets > 0 ? "var(--nv-color-warning)" : undefined },
    { label: "Campaigns", value: String(ops.campaigns), sub: `${ops.runningCampaigns} running · ${fmtMoney(ops.campaignSpentCents)} spent` },
    { label: "Incidents", value: String(ops.incidents), sub: `${ops.openIncidents} open`, color: ops.openIncidents > 0 ? "#ef4444" : undefined },
    { label: "Invoices", value: String(ops.invoices), sub: `${fmtMoney(ops.outstandingCents)} outstanding`, color: ops.outstandingCents > 0 ? "var(--nv-color-warning)" : undefined },
    { label: "Collected", value: fmtMoney(ops.collectedCents), sub: "lifetime payments" },
    { label: "Team pulse", value: ops.checkinCount > 0 ? `${ops.avgMood.toFixed(1)}/4` : "—", sub: ops.checkinCount > 0 ? `${ops.avgEnergy.toFixed(1)}/3 energy · ${ops.checkinCount} check-ins` : "no check-ins" },
  ];

  const maxEmployees = Math.max(...departments.map((d) => d.employees), 1);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA BUSINESS DASHBOARD</h1>
        <span className="nv-badge nv-badge-amber">department views</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.label} className="nv-card" style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: c.color ?? "inherit", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>{c.label}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {departments.map((d) => (
          <div key={d.name} className="nv-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 220, fontWeight: 800, fontSize: 15, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 10, background: "var(--nv-color-surface-2)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${Math.max((d.employees / maxEmployees) * 100, 3)}%`, height: "100%", background: "var(--nv-color-primary)", borderRadius: 5 }} />
              </div>
            </div>
            <span className="nv-badge" style={{ flexShrink: 0 }}>{d.employees} employees</span>
            {d.onLeave > 0 && (
              <span className="nv-badge" style={{ flexShrink: 0, borderColor: "var(--nv-color-warning)", color: "var(--nv-color-warning)" }} title="inactive / offboarded">
                {d.onLeave} away
              </span>
            )}
          </div>
        ))}
        {departments.length === 0 && (
          <div className="nv-card" style={{ padding: 24, textAlign: "center", color: "var(--nv-color-text-faint)" }}>
            No employees yet — add people in N0VA HR to see department views.
          </div>
        )}
      </div>
    </div>
  );
}
