"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, cn } from "@n0va/ui";

export interface ApprovalCommentView {
  id: string;
  authorName: string | null;
  body: string;
  kind: string;
  createdAt: Date | string;
}

export interface ApprovalView {
  id: string;
  requestType: string;
  sourceMessageId: string | null;
  requesterId: string;
  requesterName: string | null;
  amountCents: number | null;
  currency: string;
  status: string;
  rationale: string | null;
  evidence: unknown;
  policyRuleName: string | null;
  thresholdCents: number | null;
  costCenter: string | null;
  approverChain: unknown;
  currentApproverIndex: number;
  dueAt: Date | string | null;
  decisionNote: string | null;
  erpReference: string | null;
  erpSyncStatus: string;
  erpSyncError: string | null;
  createdAt: Date | string;
  requester?: { name: string | null } | null;
  decisionBy?: { name: string | null } | null;
  comments?: ApprovalCommentView[];
}

export interface CardApprovalActions {
  decide: (approvalId: string, decision: "APPROVED" | "REJECTED", note?: string) => Promise<unknown>;
  cancel: (approvalId: string) => Promise<unknown>;
  forceSync: (approvalId: string) => Promise<unknown>;
  refresh: () => void;
}

export interface ApprovalActions extends CardApprovalActions {
  comment: (approvalId: string, body: string, kind?: string) => Promise<unknown>;
  createPolicy: (input: Record<string, unknown>) => Promise<unknown>;
  updatePolicy: (ruleId: string, input: Record<string, unknown>) => Promise<unknown>;
  deletePolicy: (ruleId: string) => Promise<unknown>;
  setConfig: (input: Record<string, unknown>) => Promise<unknown>;
}

const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "var(--nv-color-warning)" },
  DETECTED: { label: "Detected", color: "var(--nv-color-info)" },
  APPROVED: { label: "Approved", color: "var(--nv-color-success)" },
  REJECTED: { label: "Rejected", color: "var(--nv-color-danger)" },
  CANCELLED: { label: "Cancelled", color: "var(--nv-color-text-faint)" },
  EXPIRED: { label: "Expired", color: "var(--nv-color-text-faint)" },
};

const TYPE_LABELS: Record<string, string> = {
  PO_APPROVAL: "Purchase order",
  INVOICE_APPROVAL: "Invoice approval",
  EXPENSE_APPROVAL: "Expense approval",
  PAYMENT_RELEASE: "Payment release",
  VENDOR_ONBOARDING: "Vendor onboarding",
  ACCESS_REQUEST: "Access request",
  BUDGET_EXCEPTION: "Budget exception",
  JOURNAL_ENTRY: "Journal entry",
  GENERAL: "General approval",
};

function fmtMoney(cents: number | null, currency: string): string {
  if (cents === null) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

function fmtTime(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function chainOf(approval: ApprovalView): Array<{ userId: string; name?: string; role?: string }> {
  return Array.isArray(approval.approverChain) ? (approval.approverChain as Array<{ userId: string; name?: string; role?: string }>) : [];
}

export function ApprovalCard({
  approval,
  currentUserId,
  onAction,
}: {
  approval: ApprovalView;
  currentUserId: string;
  onAction: CardApprovalActions;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const st = STATUS_STYLE[approval.status] ?? { label: approval.status, color: "var(--nv-color-text)" };
  const chain = chainOf(approval);
  const currentApprover = chain[approval.currentApproverIndex];
  const canDecide = approval.status === "PENDING" && currentApprover?.userId === currentUserId;
  const isRequester = approval.requesterId === currentUserId;

  const run = async (fn: () => Promise<unknown>, refetch = true) => {
    setBusy(true);
    try {
      await fn();
      if (refetch) onAction.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", background: "var(--nv-color-surface-2)", padding: 12, margin: "8px 8px 8px 44px", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 800 }}>{TYPE_LABELS[approval.requestType] ?? approval.requestType}</span>
        <span style={{ color: st.color, fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{st.label}</span>
        {approval.amountCents !== null && <span style={{ fontWeight: 700 }}>{fmtMoney(approval.amountCents, approval.currency)}</span>}
        {approval.policyRuleName && (
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>policy: {approval.policyRuleName}</span>
        )}
        {approval.erpSyncStatus === "SYNCED" && approval.erpReference && (
          <span style={{ fontSize: 11, color: "var(--nv-color-success)" }}>ERP {approval.erpReference}</span>
        )}
        {approval.erpSyncStatus === "SYNC_FAILED" && (
          <span style={{ fontSize: 11, color: "var(--nv-color-danger)" }}>ERP sync failed</span>
        )}
      </div>

      {approval.rationale && <div style={{ marginBottom: 8, color: "var(--nv-color-text)" }}>{approval.rationale}</div>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8, fontSize: 11, color: "var(--nv-color-text-muted)" }}>
        <span>Requested by {approval.requester?.name ?? approval.requesterName ?? "unknown"}</span>
        {approval.dueAt && <span>Due {fmtTime(approval.dueAt)}</span>}
        {currentApprover && <span>Approver: {currentApprover.name ?? currentApprover.userId}</span>}
        {approval.decisionNote && <span>Note: {approval.decisionNote}</span>}
        {approval.erpSyncError && <span style={{ color: "var(--nv-color-danger)" }}>{approval.erpSyncError}</span>}
      </div>

      {approval.comments && approval.comments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
          {approval.comments.map((c) => (
            <div key={c.id} style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>
              <strong>{c.authorName ?? "?"}</strong>{" "}
              {c.kind === "REQUEST_INFO" ? "requested info:" : c.kind === "INFO_PROVIDED" ? "provided info:" : ":"} {c.body}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {canDecide && (
          <>
            <Button size="sm" disabled={busy} onClick={() => run(() => onAction.decide(approval.id, "APPROVED"))}>
              Approve
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setShowNote(true)}>
              Reject…
            </Button>
          </>
        )}
        {isRequester && approval.status === "PENDING" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => onAction.cancel(approval.id))}>
            Cancel
          </Button>
        )}
        {approval.status === "APPROVED" && approval.erpSyncStatus === "SYNC_FAILED" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => onAction.forceSync(approval.id))}>
            Retry ERP sync
          </Button>
        )}
        <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{fmtTime(approval.createdAt)}</span>
      </div>

      <Dialog open={showNote} onClose={() => setShowNote(false)} title={`Reject ${TYPE_LABELS[approval.requestType] ?? "approval"}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input className="nv-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" autoFocus />
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await onAction.decide(approval.id, "REJECTED", note);
                setShowNote(false);
                setNote("");
              })
            }
          >
            Reject
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export interface AdminApprovalDetail {
  id: string;
  requestType: string;
  status: string;
  amountCents: number | null;
  currency: string;
  requesterName: string | null;
  decisionNote: string | null;
  erpSyncStatus: string;
  erpSyncError: string | null;
  erpReference: string | null;
  createdAt: Date | string;
  decisionAt: Date | string | null;
  rationale: string | null;
  comments: ApprovalCommentView[];
  auditEntries: Array<{ id: string; action: string; actorName: string | null; fromStatus: string | null; toStatus: string | null; details: unknown; createdAt: Date | string }>;
}

export interface AdminActionInput {
  op: "decide" | "forceSync" | "cancel" | "createPolicy" | "updatePolicy" | "deletePolicy" | "setConfig";
  approvalId?: string;
  decision?: string;
  note?: string;
  ruleId?: string;
  input?: Record<string, unknown>;
}

export function ApprovalsAdmin({
  approvals,
  policies,
  config,
  metrics,
  action,
}: {
  approvals: AdminApprovalDetail[];
  policies: Array<{ id: string; name: string; requestType: string; approverRole: string | null; slaMinutes: number; active: boolean }>;
  config: { erpProvider: string; erpIntegrationId: string | null; autoRaiseThresholdCents: number | null; defaultSlaMinutes: number; nudgeBeforeMinutes: number };
  metrics: { total: number; byStatus: Record<string, number>; byType: Record<string, number>; erpSync: Record<string, number>; avgTimeToDecisionMinutes: number | null };
  action: (input: AdminActionInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdminApprovalDetail | null>(null);
  const [newPolicy, setNewPolicy] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => router.refresh();
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
        <div className="nv-stat"><div style={{ fontSize: 20, fontWeight: 800 }}>{metrics.total}</div><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>total</div></div>
        {Object.entries(metrics.byStatus).map(([k, v]) => (
          <div className="nv-stat" key={k}><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{k.toLowerCase()}</div></div>
        ))}
        <div className="nv-stat"><div style={{ fontSize: 20, fontWeight: 800 }}>{metrics.avgTimeToDecisionMinutes != null ? `${Math.round(metrics.avgTimeToDecisionMinutes)}m` : "—"}</div><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>avg decision</div></div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" onClick={() => setNewPolicy(true)}>+ Policy rule</Button>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          ERP provider:
          <select
            value={config.erpProvider}
            disabled={busy}
            onChange={(e) => run(() => action({ op: "setConfig", input: { erpProvider: e.target.value } }))}
            style={{ padding: "4px 6px", borderRadius: "var(--nv-radius-md)", border: "1px solid var(--nv-color-border)", background: "var(--nv-color-surface)" }}
          >
            <option value="MOCK">Mock</option>
            <option value="XERO">Xero</option>
            <option value="QUICKBOOKS">QuickBooks</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {policies.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "8px 10px", fontSize: 12 }}>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div style={{ color: "var(--nv-color-text-muted)" }}>{p.requestType} · {p.approverRole ?? "default"} · SLA {p.slaMinutes}m</div>
            <button style={{ fontSize: 11, border: "none", background: "none", color: "var(--nv-color-danger)", cursor: "pointer" }} disabled={busy} onClick={() => run(() => action({ op: "deletePolicy", ruleId: p.id }))}>delete</button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {approvals.map((a) => (
          <div key={a.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{TYPE_LABELS[a.requestType] ?? a.requestType} {a.amountCents !== null && <span style={{ fontWeight: 400, color: "var(--nv-color-text-muted)" }}>· {fmtMoney(a.amountCents, a.currency)}</span>}</div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>{a.requesterName ?? "?"} · {fmtTime(a.createdAt)} · ERP {a.erpSyncStatus}</div>
              {a.erpSyncError && <div style={{ fontSize: 11, color: "var(--nv-color-danger)" }}>{a.erpSyncError}</div>}
            </div>
            <span style={{ color: (STATUS_STYLE[a.status] ?? { color: "var(--nv-color-text)" }).color, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>{a.status}</span>
            {a.status === "APPROVED" && a.erpSyncStatus === "SYNC_FAILED" && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => action({ op: "forceSync", approvalId: a.id }))}>Retry sync</Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setSelected(a)}>Detail</Button>
          </div>
        ))}
        {approvals.length === 0 && <div className="nv-empty">No approvals yet</div>}
      </div>

      {selected && (
        <Dialog open onClose={() => setSelected(null)} title={`Approval ${selected.id.slice(0, 8)}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "60vh", overflowY: "auto" }}>
            <div>{selected.rationale}</div>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>
              {selected.decisionAt && <>Decided {fmtTime(selected.decisionAt)}{selected.decisionNote ? ` — ${selected.decisionNote}` : ""}</>}
              {selected.erpReference && <><br />ERP ref: {selected.erpReference}</>}
            </div>
            {selected.comments.map((c) => (
              <div key={c.id} style={{ fontSize: 12 }}><strong>{c.authorName ?? "?"}</strong> ({c.kind.toLowerCase()}): {c.body}</div>
            ))}
            <div style={{ fontWeight: 700, marginTop: 6 }}>Audit trail</div>
            {selected.auditEntries.map((e) => (
              <div key={e.id} style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>
                #{e.id.slice(0, 4)} [{e.action}] {e.actorName ?? "system"} {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : ""} · {fmtTime(e.createdAt)}
              </div>
            ))}
          </div>
        </Dialog>
      )}

      {newPolicy && (
        <PolicyRuleForm
          onSave={async (input) => {
            await action({ op: "createPolicy", input });
            setNewPolicy(false);
          }}
          onClose={() => setNewPolicy(false)}
        />
      )}
    </div>
  );
}

function PolicyRuleForm({ onSave, onClose }: { onSave: (input: Record<string, unknown>) => Promise<void>; onClose: () => void }) {
  const [f, setF] = useState({ name: "", requestType: "PO_APPROVAL", minAmountCents: "", maxAmountCents: "", costCenter: "", approverRole: "ADMIN", slaMinutes: "1440", priority: "10" });
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onClose={onClose} title="New policy rule">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(["name", "requestType", "minAmountCents", "maxAmountCents", "costCenter", "approverRole", "slaMinutes", "priority"] as const).map((k) => (
          <label key={k} style={{ fontSize: 12 }}>
            {k}
            <input
              className="nv-input"
              value={f[k]}
              onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))}
              style={{ display: "block", width: "100%", marginTop: 2 }}
            />
          </label>
        ))}
        <Button
          disabled={saving}
          onClick={() => {
            if (saving) return;
            setSaving(true);
            void onSave({
              name: f.name,
              requestType: f.requestType,
              minAmountCents: f.minAmountCents ? Number(f.minAmountCents) : null,
              maxAmountCents: f.maxAmountCents ? Number(f.maxAmountCents) : null,
              costCenter: f.costCenter || null,
              approverRole: f.approverRole || null,
              slaMinutes: Number(f.slaMinutes),
              priority: Number(f.priority),
            }).finally(() => setSaving(false));
          }}
        >
          Create
        </Button>
      </div>
    </Dialog>
  );
}

export { fmtMoney, TYPE_LABELS as REQUEST_TYPE_LABELS_UI };