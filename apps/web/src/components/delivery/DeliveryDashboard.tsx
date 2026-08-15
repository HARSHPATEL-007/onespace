"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { DeliveryInput } from "@/app/(app)/m/chat/actions";
import type { DeliveryPolicy } from "@n0va/modules-chat/delivery";

interface Row {
  id: string;
  [key: string]: unknown;
}

interface DlqRow extends Row {
  reasonCode: string;
  reason: string | null;
  attempts: number;
  status: string;
  quarantinedAt: Date | string;
}

interface DeliveryRow extends Row {
  messageId: string;
  channelId: string;
  target: string;
  channelKind: string;
  state: string;
  attemptCount: number;
  maxAttempts: number;
  correlationId: string;
  lastError: string | null;
  deliveredCount: number;
  targetCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const STATE_COLORS: Record<string, string> = {
  CONFIRMED: "var(--nv-color-success)",
  PENDING: "var(--nv-color-text-faint)",
  SENDING: "var(--nv-color-warning)",
  QUEUED: "var(--nv-color-warning)",
  DELAYED: "var(--nv-color-warning)",
  RETRIED: "var(--nv-color-warning)",
  PARTIALLY_DELIVERED: "var(--nv-color-warning)",
  FAILED: "var(--nv-color-danger)",
  CANCELLED: "var(--nv-color-text-faint)",
};

const BREAKER_COLORS: Record<string, string> = {
  CLOSED: "var(--nv-color-success)",
  HALF_OPEN: "var(--nv-color-warning)",
  OPEN: "var(--nv-color-danger)",
};

export function DeliveryDashboard({
  role,
  stats,
  policies,
  matrix,
  breakers,
  quota,
  dlq,
  recent,
  action,
}: {
  role: string;
  stats: { total: number; confirmed: number; deduped: number; dedupHitRate: number; avgLatencyMs: number | null; avgQueueWaitMs: number | null; maxLatencyMs: number | null; dlqCount: number; byState: Record<string, number>; byOutcome: Record<string, number> };
  policies: DeliveryPolicy[];
  matrix: Array<{ channelKind: string; target: string; policy: { deliverySemantic: string; latencyTargetMs: number; retry: { maxAttempts: number }; priority: number } }>;
  breakers: Array<Record<string, unknown> & { target: string; path: string; state: string; failures: number; total: number; cooldownUntil: Date | null; lastError: string | null }>;
  quota: Array<Record<string, unknown> & { scope: string; scopeKey: string; bucket: string; used: number; windowStart: Date }>;
  dlq: DlqRow[];
  recent: DeliveryRow[];
  action: (input: DeliveryInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "matrix" | "breakers" | "quota" | "dlq" | "recent">("overview");
  const [busy, setBusy] = useState(false);

  const run = async (input: DeliveryInput) => {
    setBusy(true);
    try {
      await action(input);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: unknown): string => (v == null ? "—" : String(v));
  const fmtDate = (d: unknown): string => {
    if (!d) return "—";
    try {
      return new Date(d as string).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(d);
    }
  };

  return (
    <div style={{ padding: "var(--nv-space-4)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Delivery Matrix</h1>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>
            Policy-driven reliability: semantics · retry · breakers · quotas · DLQ
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "deliverDue" })}>▶ Run sweep now</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "resetPolicies" })}>Reset policies</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "resetQuota" })}>Reset quota</Button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(["overview", "matrix", "breakers", "quota", "dlq", "recent"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ border: "1px solid var(--nv-color-border)", background: tab === t ? "var(--nv-color-primary-alpha)" : "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)", textTransform: "capitalize" }}>
            {t} {t === "dlq" && dlq.length > 0 ? `(${dlq.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {[
            { label: "Total deliveries", value: stats.total },
            { label: "Confirmed", value: stats.confirmed },
            { label: "Dedup hit rate", value: (stats.dedupHitRate * 100).toFixed(1) + "%" },
            { label: "Avg latency", value: stats.avgLatencyMs == null ? "—" : stats.avgLatencyMs + "ms" },
            { label: "Avg queue wait", value: stats.avgQueueWaitMs == null ? "—" : stats.avgQueueWaitMs + "ms" },
            { label: "Max latency", value: stats.maxLatencyMs == null ? "—" : stats.maxLatencyMs + "ms" },
            { label: "DLQ", value: stats.dlqCount },
          ].map((c) => (
            <div key={c.label} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{c.value}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginBottom: 6 }}>States</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Object.entries(stats.byState).map(([s, n]) => (
                <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: `1px solid ${STATE_COLORS[s] ?? "var(--nv-color-border)"}`, color: STATE_COLORS[s] ?? "var(--nv-color-text)" }}>
                  {s.toLowerCase()} {n}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "matrix" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>Built-in defaults (click a row to create a workspace override):</div>
          {matrix.map((m) => (
            <div key={`${m.channelKind}:${m.target}`} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 700, minWidth: 110 }}>{m.channelKind}</span>
              <span style={{ minWidth: 100 }}>{m.target}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{m.policy.deliverySemantic.toLowerCase().replace(/_/g, "-")}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{m.policy.latencyTargetMs}ms</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{m.policy.retry.maxAttempts} retries</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>p{m.policy.priority}</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)", marginTop: 8 }}>Workspace overrides:</div>
          {policies.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No overrides — all channels use the built-in matrix.</div>}
          {policies.map((p) => (
            <div key={`${p.channelKind}:${p.target}`} style={{ border: "1px solid var(--nv-color-warning)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, background: "var(--nv-color-warning-alpha, transparent)" }}>
              <span style={{ fontWeight: 700, minWidth: 110 }}>{p.channelKind}</span>
              <span style={{ minWidth: 100 }}>{p.target}</span>
              <span>{p.deliverySemantic.toLowerCase().replace(/_/g, "-")}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{fmt(p.latencyTargetMs)}ms</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{fmt(p.retry.maxAttempts)} retries</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "deletePolicy", channelKind: p.channelKind, target: p.target })}>delete</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "breakers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {breakers.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No breaker state recorded yet.</div>}
          {breakers.map((b) => (
            <div key={`${b.target}:${b.path}`} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 700, minWidth: 120 }}>{b.target}</span>
              <span style={{ minWidth: 60 }}>{b.path}</span>
              <span style={{ color: BREAKER_COLORS[b.state] ?? "var(--nv-color-text)", fontWeight: 700 }}>{b.state}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{b.failures}/{b.total}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }} title={b.lastError ?? ""}>{b.lastError?.slice(0, 40) ?? ""}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "resetBreaker", target: b.target, path: b.path as "read" | "write" })}>reset</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "quota" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {quota.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No quota counters yet — counters are created lazily on dispatch.</div>}
          {quota.map((q) => (
            <div key={`${q.scope}:${q.scopeKey}:${q.bucket}`} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span style={{ fontWeight: 700, minWidth: 80 }}>{q.scope}</span>
              <span style={{ minWidth: 130 }}>{q.scopeKey}</span>
              <span style={{ minWidth: 60 }}>{q.bucket}</span>
              <span>{q.used}</span>
              <span style={{ color: "var(--nv-color-text-faint)" }}>window {fmtDate(q.windowStart)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "dlq" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dlq.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>DLQ is empty — nothing quarantined.</div>}
          {dlq.map((d) => (
            <div key={d.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, minWidth: 90 }}>{d.reasonCode}</span>
              <span style={{ color: "var(--nv-color-text-muted)", minWidth: 70 }}>{d.status}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>×{d.attempts}</span>
              <span style={{ color: "var(--nv-color-text-muted)", flex: 1, minWidth: 160 }} title={d.reason ?? ""}>{d.reason?.slice(0, 80) ?? ""}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "replayDlq", deliveryId: d.id })}>replay</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "resolveDlq", deliveryId: d.id })}>release</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "dropDlq", deliveryId: d.id })}>drop</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "recent" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recent.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No deliveries tracked yet.</div>}
          {recent.map((r) => (
            <div key={r.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: STATE_COLORS[r.state] ?? "var(--nv-color-text)", fontWeight: 700, minWidth: 90 }}>{r.state}</span>
              <span style={{ color: "var(--nv-color-text-muted)", minWidth: 80 }}>{r.target}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{r.channelKind}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>attempt {r.attemptCount}/{r.maxAttempts}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{r.deliveredCount}/{r.targetCount}</span>
              <span style={{ color: "var(--nv-color-text-muted)", flex: 1, minWidth: 120 }} title={r.lastError ?? ""}>{r.lastError?.slice(0, 60) ?? ""}</span>
              <span style={{ color: "var(--nv-color-text-faint)" }}>{fmtDate(r.createdAt)}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "retryDelivery", deliveryId: r.id })}>retry</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "cancelDelivery", deliveryId: r.id })}>cancel</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}