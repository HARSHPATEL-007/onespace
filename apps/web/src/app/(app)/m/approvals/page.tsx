import { ApprovalService } from "@n0va/modules-approvals/server";
import { ApprovalsAdmin, type AdminApprovalDetail } from "@n0va/modules-approvals/components";
import { requireWorkspace } from "@/lib/context";
import { approvalAdminAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const ctx = await requireWorkspace();
  const svc = new ApprovalService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  const [rawApprovals, policies, config, metrics] = await Promise.all([
    svc.listAll(100).catch(() => []),
    svc.listPolicies().catch(() => []),
    svc.config().catch(() => null),
    svc.metrics().catch(() => null),
  ]);

  const approvals: AdminApprovalDetail[] = rawApprovals.map((a) => ({
    id: a.id,
    requestType: a.requestType,
    status: a.status,
    amountCents: a.amountCents,
    currency: a.currency,
    requesterName: a.requesterName ?? a.requester?.name ?? null,
    decisionNote: a.decisionNote,
    erpSyncStatus: a.erpSyncStatus,
    erpSyncError: a.erpSyncError,
    erpReference: a.erpReference,
    createdAt: a.createdAt,
    decisionAt: a.decisionAt,
    rationale: a.rationale,
    comments: a.comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      kind: c.kind,
      createdAt: c.createdAt,
    })),
    auditEntries: a.auditEntries.map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      details: e.details,
      createdAt: e.createdAt,
    })),
  }));

  return (
    <div style={{ padding: "var(--nv-space-4)", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ fontWeight: 800, fontSize: "var(--nv-font-xl)", marginBottom: 4 }}>Approvals</div>
      <div style={{ fontSize: 13, color: "var(--nv-color-text-muted)", marginBottom: 16 }}>
        AI-assisted approval routing, ERP write-back and reconciliation.
      </div>
      <ApprovalsAdmin
        approvals={approvals}
        policies={policies.map((p) => ({
          id: p.id,
          name: p.name,
          requestType: p.requestType,
          approverRole: p.approverRole,
          slaMinutes: p.slaMinutes,
          active: p.active,
        }))}
        config={{
          erpProvider: config?.erpProvider ?? "MOCK",
          erpIntegrationId: config?.erpIntegrationId ?? null,
          autoRaiseThresholdCents: config?.autoRaiseThresholdCents ?? null,
          defaultSlaMinutes: config?.defaultSlaMinutes ?? 1440,
          nudgeBeforeMinutes: config?.nudgeBeforeMinutes ?? 120,
        }}
        metrics={
          metrics ?? {
            total: 0,
            byStatus: {},
            byType: {},
            erpSync: {},
            avgTimeToDecisionMinutes: null,
          }
        }
        action={approvalAdminAction}
      />
    </div>
  );
}