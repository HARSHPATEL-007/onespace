"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Dialog } from "@n0va/ui";
import type { GovernanceInput } from "@/app/(app)/m/chat/actions";

interface AuditEntry { id: string; actorName: string | null; action: string; objectType: string | null; objectId: string | null; outcome: string; policyApplied: string | null; hash: string; chainIndex: number; createdAt: string; }
interface Hold { id: string; scope: string; objectType: string | null; objectId: string | null; reason: string; placedBy: string; placedAt: string; active: boolean; }
interface Policy { id: string; name: string; tier: string; scope: string; durationDays: number | null; anchor: string; active: boolean; }
interface Approval { id: string; action: string; rationale: string; status: string; requestedBy: { name: string | null; email: string }; createdAt: string; }
interface Config { watermarkEnabled: boolean; watermarkStyle: string; externalStronger: boolean; pqRequired: boolean; exportRedaction: boolean; keyRotationDays: number; }
interface Stats { held: number; expiringSoon: number; expired: number; dlpBlocked: number; deniedActions: number; records: number; watermarkCoverage: number; pqRequired: number; keys: Array<{ purpose: string; keyVersion: number; masterKeyVersion: number; rotatedAt: string | null; pqReady: boolean }>; }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—");
const tierColor = (tier: string) =>
  tier === "COMPLIANCE" ? "var(--nv-color-warning)" : tier === "BLOCKCHAIN" ? "var(--nv-color-danger)" : tier === "LEGAL_HOLD" ? "var(--nv-color-danger)" : tier === "GOVERNANCE" ? "var(--nv-color-primary)" : "var(--nv-color-text-faint)";

export function GovernancePanel({
  onClose,
  governance,
}: {
  onClose: () => void;
  governance: (input: GovernanceInput) => Promise<unknown>;
}) {
  const [tab, setTab] = useState<"overview" | "audit" | "holds" | "policies" | "approvals" | "config">("overview");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [holdScope, setHoldScope] = useState("WORKSPACE");
  const [policyId, setPolicyId] = useState("");

  const run = useCallback(async (input: GovernanceInput): Promise<any> => {
    setError("");
    try {
      return await governance(input);
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [governance]);

  useEffect(() => {
    void run({ op: "listAudit", limit: 40 }).then((r) => r && setAudit(r));
    void run({ op: "listHolds" }).then((r) => r && setHolds(r));
    void run({ op: "listPolicies" }).then((r) => r && setPolicies(r));
    void run({ op: "listApprovals" }).then((r) => r && setApprovals(r));
    void run({ op: "getConfig" }).then((r) => r && setConfig(r));
    void run({ op: "stats" }).then((r) => r && setStats(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async () => {
    const r = await run({ op: "verifyChain" });
    if (r) setChainValid(r.valid);
  };

  return (
    <Dialog open onClose={onClose} title="Compliance & governance" actions={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(["overview", "audit", "holds", "policies", "approvals", "config"] as const).map((t) => (
          <Button key={t} size="sm" variant={tab === t ? "primary" : "secondary"} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</Button>
        ))}
      </div>
      {error && <div style={{ color: "var(--nv-color-danger)", fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {tab === "overview" && stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
          {[
            ["Records governed", stats.records],
            ["Legal holds", stats.held],
            ["Expiring ≤30d", stats.expiringSoon],
            ["Expired", stats.expired],
            ["DLP blocked", stats.dlpBlocked],
            ["Denied actions", stats.deniedActions],
            ["Watermark coverage", `${stats.watermarkCoverage}%`],
            ["PQ-required", stats.pqRequired],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ padding: 10, borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{label}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4 }}>
            {stats.keys.map((k) => (
              <div key={k.purpose} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 10px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)" }}>
                <span>{k.purpose} key · v{k.keyVersion} · master v{k.masterKeyVersion}{k.pqReady ? " · PQ-ready" : ""}</span>
                <span style={{ color: "var(--nv-color-text-faint)" }}>rotated {fmt(k.rotatedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
            <Button size="sm" variant="secondary" onClick={verify}>Verify chain</Button>
            {chainValid !== null && (
              <span style={{ fontSize: 12, color: chainValid ? "var(--nv-color-success)" : "var(--nv-color-danger)", fontWeight: 700 }}>
                {chainValid ? "✓ chain intact" : "✗ chain tampered"}
              </span>
            )}
          </div>
          {audit.map((a) => (
            <div key={a.id} style={{ fontSize: 12, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: "var(--nv-color-text-faint)", minWidth: 90 }}>{fmt(a.createdAt)}</span>
              <span style={{ fontWeight: 600, minWidth: 120 }}>{a.actorName ?? a.actorName === null ? a.actorName ?? "—" : "—"}</span>
              <span style={{ color: a.outcome === "DENIED" ? "var(--nv-color-danger)" : "var(--nv-color-text)", flex: 1 }}>{a.action}</span>
              {a.policyApplied && <span style={{ color: tierColor(a.policyApplied), fontSize: 11 }}>{a.policyApplied}</span>}
              <span title={a.hash} style={{ color: "var(--nv-color-text-faint)", fontSize: 10 }}>#{a.chainIndex}·{a.hash.slice(0, 8)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "holds" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="nv-input" value={holdScope} onChange={(e) => setHoldScope(e.target.value)} style={{ width: 160 }}>
              <option value="WORKSPACE">Workspace</option>
              <option value="MESSAGE">Message</option>
              <option value="EXPORT">Export</option>
            </select>
            <input className="nv-input" placeholder="Object id (for message/export)" style={{ flex: 1 }} onChange={(e) => { if (holdScope !== "WORKSPACE") setPolicyId(e.target.value); }} />
            <input className="nv-input" placeholder="Reason" style={{ flex: 1 }} value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" onClick={async () => {
              const r = await run({
                op: "placeHold",
                scope: holdScope,
                objectId: holdScope === "WORKSPACE" ? undefined : policyId || undefined,
                objectType: holdScope === "MESSAGE" ? "MESSAGE" : "EXPORT",
                reason: reason || "Legal hold",
              });
              if (r) { setReason(""); void run({ op: "listHolds" }).then((res) => res && setHolds(res)); }
            }}>Place hold</Button>
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {holds.length === 0 && <div className="nv-empty">No active legal holds</div>}
            {holds.map((h) => (
              <div key={h.id} style={{ fontSize: 12, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 700, color: "var(--nv-color-danger)" }}>⛔</span>
                <span style={{ flex: 1 }}>{h.scope}{h.objectId ? ` · ${h.objectId.slice(0, 8)}` : ""} — {h.reason}</span>
                <span style={{ color: "var(--nv-color-text-faint)" }}>placed {fmt(h.placedAt)}</span>
                <Button size="sm" variant="secondary" onClick={async () => {
                  const r = await run({ op: "releaseHold", holdId: h.id, reason: "Released by admin" });
                  if (r) void run({ op: "listHolds" }).then((res) => res && setHolds(res));
                }}>Release</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "policies" && (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {policies.map((p) => (
            <div key={p.id} style={{ fontSize: 12, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: tierColor(p.tier), fontWeight: 700, minWidth: 90 }}>{p.tier}</span>
              <span style={{ flex: 1 }}>{p.name} <span style={{ color: "var(--nv-color-text-faint)" }}>({p.scope.toLowerCase()} · {p.anchor.toLowerCase()} anchor{p.durationDays ? ` · ${p.durationDays}d` : " · indefinite"}{p.active ? "" : " · inactive"})</span></span>
              <Button size="sm" variant="secondary" onClick={async () => {
                const r = await run({ op: "updatePolicy", policyId: p.id, durationDays: (p.durationDays ?? 0) + 365 });
                if (r) void run({ op: "listPolicies" }).then((res) => res && setPolicies(res));
              }}>+365d</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "approvals" && (
        <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          {approvals.length === 0 && <div className="nv-empty">No approval requests</div>}
          {approvals.map((a) => (
            <div key={a.id} style={{ fontSize: 12, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, minWidth: 150 }}>{a.action}</span>
              <span style={{ flex: 1 }}>{a.rationale} <span style={{ color: "var(--nv-color-text-faint)" }}>by {a.requestedBy.name ?? a.requestedBy.email}</span></span>
              <span style={{ color: a.status === "PENDING" ? "var(--nv-color-warning)" : a.status === "APPROVED" ? "var(--nv-color-success)" : "var(--nv-color-danger)" }}>{a.status}</span>
              {a.status === "PENDING" && (
                <span style={{ display: "flex", gap: 4 }}>
                  <Button size="sm" onClick={async () => { const r = await run({ op: "reviewApproval", approvalId: a.id, approve: true, note: "Approved" }); if (r) void run({ op: "listApprovals" }).then((res) => res && setApprovals(res)); }}>Approve</Button>
                  <Button size="sm" variant="secondary" onClick={async () => { const r = await run({ op: "reviewApproval", approvalId: a.id, approve: false, note: "Rejected" }); if (r) void run({ op: "listApprovals" }).then((res) => res && setApprovals(res)); }}>Reject</Button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "config" && config && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 420 }}>
          {([
            ["watermarkEnabled", "Watermarking enabled", config.watermarkEnabled],
            ["externalStronger", "Stronger watermark for external guests", config.externalStronger],
            ["pqRequired", "Post-quantum required records", config.pqRequired],
            ["exportRedaction", "Redact secrets in exports", config.exportRedaction],
          ] as Array<[keyof Config, string, boolean]>).map(([key, label, value]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={value} onChange={async (e) => {
                const patch = { ...config, [key]: e.target.checked } as unknown as NonNullable<GovernanceInput["config"]>;
                const r = await run({ op: "updateConfig", config: patch });
                if (r) setConfig(r);
              }} />
              {label}
            </label>
          ))}
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            Watermark style: <strong>{config.watermarkStyle}</strong> · Key rotation target: every {config.keyRotationDays} days
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <Button size="sm" onClick={async () => { const r = await run({ op: "rotateKeys" }); if (r) { setStats(null); void run({ op: "stats" }).then((s) => s && setStats(s)); } }}>Rotate master key</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
