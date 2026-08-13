import { requireWorkspace } from "@/lib/context";
import { busStats, latestEnvelopes, dlqItems } from "@n0va/modules-events/server";
import { rankOf } from "@n0va/authz";
import { EmitEventForm, RetryDlqButton, LineageButton } from "./EventBusClient";

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, maxWidth: 1100, margin: "0 auto" },
  header: { fontSize: 20, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 13, color: "var(--nv-muted, #9a97a8)", marginBottom: 16 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 },
  card: { background: "var(--nv-surface, #16151d)", border: "1px solid var(--nv-border, #2a2936)", borderRadius: "var(--nv-radius-md, 12px)", padding: 14 },
  num: { fontSize: 24, fontWeight: 700 },
  label: { fontSize: 12, color: "var(--nv-muted, #9a97a8)", marginTop: 4 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", color: "var(--nv-muted, #9a97a8)", borderBottom: "1px solid var(--nv-border, #2a2936)", fontWeight: 600 },
  td: { padding: "8px 10px", borderBottom: "1px solid var(--nv-border, #2a2936)", verticalAlign: "top" },
  chip: { display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 },
  mono: { fontFamily: "ui-monospace, monospace", fontSize: 12 },
  section: { fontSize: 14, fontWeight: 600, margin: "20px 0 8px" },
};

function chip(status: string): React.CSSProperties {
  const color =
    status === "SENT" || status === "COMPLETED" ? "#3ddc84"
    : status === "PENDING" || status === "RUNNING" ? "#ffb020"
    : status === "FAILED" || status === "QUARANTINED" ? "#ff6161"
    : status === "COMPENSATED" ? "#ff7ac2"
    : "#9a97a8";
  return { ...s.chip, background: `${color}22`, color };
}

export default async function EventsPage() {
  const ctx = await requireWorkspace();
  const [stats, recent, dlq] = await Promise.all([busStats(), latestEnvelopes(50), dlqItems(20)]);
  const admin = rankOf(ctx.memberRole) >= 3;

  return (
    <div style={s.page}>
      <div style={s.header}>Event Bus</div>
      <div style={s.sub}>Canonical envelope → outbox → broker → projections & sagas. Producer: chat-service, admin console.</div>

      <div style={s.grid}>
        {[
          ["Envelopes", stats.envelopes],
          ["Outbox pending", stats.outboxPending],
          ["Outbox failed", stats.outboxFailed],
          ["DLQ", stats.dlqCount],
          ["Sagas running", stats.sagasRunning],
          ["Sagas completed", stats.sagasCompleted],
          ["Sagas compensated", stats.sagasCompensated],
          ["Dedup records", stats.dedupRecords],
          ["Commands", stats.commands],
          ["Command failures", stats.commandFailed],
          ["Projection cursors", stats.projectionCount],
        ].map(([label, value]) => (
          <div key={String(label)} style={s.card}>
            <div style={s.num}>{value}</div>
            <div style={s.label}>{label}</div>
          </div>
        ))}
      </div>

      {admin && <EmitEventForm />}

      <div style={s.section}>Recent events</div>
      <div style={s.card}>
        {recent.length === 0 ? (
          <div style={s.label}>No events yet — send a chat message to see the bus light up.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Time</th>
                <th style={s.th}>Type</th>
                <th style={s.th}>Producer</th>
                <th style={s.th}>Tenant</th>
                <th style={s.th}>Correlation</th>
                <th style={s.th}>Hops</th>
                <th style={s.th} />
              </tr>
            </thead>
            <tbody>
              {recent.map(({ envelope: e, hops }) => (
                <tr key={e.eventId}>
                  <td style={s.td}>
                    <span className="mono" style={s.mono}>
                      {e.timestamp.toISOString().slice(11, 19)}
                    </span>
                  </td>
                  <td style={s.td}>
                    <span style={chip(e.eventType)}>{e.eventType}</span>
                  </td>
                  <td style={s.td}>{e.producer}</td>
                  <td style={s.td}>{e.tenantId ?? "—"}</td>
                  <td style={s.td}>
                    <span style={s.mono}>{e.correlationId ?? "—"}</span>
                  </td>
                  <td style={s.td}>
                    {hops.length === 0 ? "—" : hops.map((h, i) => <span key={i} style={{ ...chip(h.status), marginRight: 4 }}>{`${h.consumer}:${h.status}`}</span>)}
                  </td>
                  <td style={s.td}>
                    <LineageButton eventId={e.eventId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={s.section}>Dead letter queue</div>
      <div style={s.card}>
        {dlq.length === 0 ? (
          <div style={s.label}>Queue is empty.</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Type</th>
                <th style={s.th}>Reason</th>
                <th style={s.th}>Attempts</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Since</th>
                <th style={s.th} />
              </tr>
            </thead>
            <tbody>
              {dlq.map((item) => (
                <tr key={item.id}>
                  <td style={s.td}>{item.eventType}</td>
                  <td style={s.td}>{item.reason ?? "—"}</td>
                  <td style={s.td}>{item.attempts}</td>
                  <td style={s.td}>
                    <span style={chip(item.status)}>{item.status}</span>
                  </td>
                  <td style={s.td}>{item.quarantinedAt.toISOString().slice(0, 19)}</td>
                  <td style={s.td}>
                    {admin && <RetryDlqButton id={item.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}