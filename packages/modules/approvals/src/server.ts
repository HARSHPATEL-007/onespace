import { prisma, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { NotificationEngine } from "@n0va/modules-notification-engine/server";
import { approvalRequested, approvalDecision, emitEvent } from "@n0va/modules-events/server";
import { auditAppend } from "./audit";

export { auditAppend, verifyApprovalChain } from "./audit";
import { erpAdapterFor, getConfig } from "./erp";
import {
  STATUS,
  ERP_SYNC,
  DECISION,
  REQUEST_TYPE_LABELS,
  MAX_SYNC_ATTEMPTS,
  AUDIT_ACTION,
} from "./constants";
import type { DetectionResult } from "./detector";

export { detectApproval, type DetectionInput, type DetectionResult } from "./detector";

const MODULE = "approvals";

export interface DetectionContext {
  channelId: string;
  channelName?: string | null;
  sourceMessageId: string;
  requesterName?: string | null;
}

export interface PolicyRuleInput {
  name: string;
  requestType: string;
  minAmountCents?: number | null;
  maxAmountCents?: number | null;
  costCenter?: string | null;
  approverRole?: string | null;
  approverUserId?: string | null;
  backupUserId?: string | null;
  slaMinutes?: number;
  priority?: number;
  active?: boolean;
}

export class ApprovalService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE" | "ADMIN") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for approvals`);
    }
  }

  private async actor() {
    return prisma.user.findUnique({ where: { id: this.userId }, select: { name: true, email: true } });
  }

  private async notify(recipientId: string, title: string, body: string, link?: string) {
    try {
      const engine = new NotificationEngine(this.workspaceId, this.userId, this.role);
      await engine.createEvent({
        recipientId,
        sourceType: "approval",
        sourceId: `approval:${recipientId}:${title}`,
        roomId: undefined,
        title,
        body,
        link,
      });
    } catch {
      // best-effort
    }
  }

  private async currentApproverId(approval: { approverChain: unknown; currentApproverIndex: number }): Promise<string | null> {
    const chain = Array.isArray(approval.approverChain) ? (approval.approverChain as Array<{ userId: string }>) : [];
    return chain[approval.currentApproverIndex]?.userId ?? null;
  }

  // ── Detection + raise ─────────────────────────────────────────────

  /** Called from the chat sendMessage hook (best-effort). */
  async handleMessageDetection(detection: DetectionResult, ctx: DetectionContext) {
    try {
      await this.assert("CREATE");
    } catch {
      return null;
    }
    const existing = await prisma.approvalRequest.findFirst({
      where: { workspaceId: this.workspaceId, sourceMessageId: ctx.sourceMessageId },
    });
    if (existing) return existing;

    const approval = await prisma.approvalRequest.create({
      data: {
        workspaceId: this.workspaceId,
        requestType: detection.requestType!,
        sourceMessageId: ctx.sourceMessageId,
        sourceChannelId: ctx.channelId,
        requesterId: this.userId,
        requesterName: ctx.requesterName ?? null,
        amountCents: detection.amountCents,
        policyRuleId: detection.policyRuleId,
        policyRuleName: detection.policyRuleName,
        thresholdCents: detection.thresholdCents,
        costCenter: detection.costCenter,
        rationale: detection.rationale ?? null,
        evidence: detection.evidence as unknown as object,
        status: detection.confidence >= 0.7 ? STATUS.PENDING : STATUS.DETECTED,
        erpSyncStatus: ERP_SYNC.NOT_SYNCED,
        downstreamStatus: "NONE",
      },
    });

    await auditAppend(this.workspaceId, {
      action: AUDIT_ACTION.DETECTED,
      actorId: this.userId,
      actorName: ctx.requesterName,
      approvalId: approval.id,
      toStatus: approval.status,
      details: {
        requestType: detection.requestType,
        confidence: Math.round(detection.confidence * 100) / 100,
        amountCents: detection.amountCents,
        signals: detection.signals,
      },
    });

    if (approval.status === STATUS.PENDING) {
      await this.route(approval.id);
    }
    return approval;
  }

  /** Assign an approver chain per policy; set SLA. */
  async route(approvalId: string) {
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) throw new Error("Approval not found");

    const rule = approval.policyRuleId
      ? await prisma.approvalPolicyRule.findUnique({ where: { id: approval.policyRuleId } })
      : null;
    const approverRole = rule?.approverRole ?? "ADMIN";
    const slaMinutes = rule?.slaMinutes ?? 1440;

    // Owner is always an eligible senior approver; ADMIN pools also accept OWNER.
    const allowedRoles: Role[] =
      approverRole === "OWNER" ? ["OWNER"] : approverRole === "ADMIN" ? ["ADMIN", "OWNER"] : [approverRole as Role, "OWNER"];

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId, role: { in: allowedRoles }, userId: { not: approval.requesterId } },
      include: { user: { select: { name: true } } },
    });
    const candidates = members.map((m) => ({ userId: m.userId, name: m.user.name }));

    const pool = rule?.approverUserId
      ? [{ userId: rule.approverUserId, name: rule.approverUserId }]
      : candidates;

    // Least-workload assignment (count live approvals already assigned to each candidate).
    const open = await prisma.approvalRequest.findMany({
      where: { workspaceId: this.workspaceId, status: STATUS.PENDING },
      select: { approverChain: true },
    });
    const workload = new Map<string, number>();
    for (const o of open) {
      const chain = Array.isArray(o.approverChain) ? (o.approverChain as Array<{ userId: string }>) : [];
      for (const c of chain) workload.set(c.userId, (workload.get(c.userId) ?? 0) + 1);
    }
    pool.sort((a, b) => (workload.get(a.userId) ?? 0) - (workload.get(b.userId) ?? 0));

    const primary = pool[0];
    if (!primary) {
      // No eligible approver — hold as DETECTED for admin reconciliation instead of rotting in PENDING.
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: { status: STATUS.DETECTED },
      });
      await auditAppend(this.workspaceId, {
        action: AUDIT_ACTION.ROUTED,
        actorId: this.userId,
        approvalId: approval.id,
        fromStatus: approval.status,
        toStatus: STATUS.DETECTED,
        details: { error: "no_eligible_approver", approverRole },
      });
      return approval;
    }

    const chain = [{ userId: primary.userId, name: primary.name ?? primary.userId, role: approverRole }];
    if (rule?.backupUserId && rule.backupUserId !== primary.userId) {
      chain.push({ userId: rule.backupUserId, name: rule.backupUserId, role: "BACKUP" });
    }

    const dueAt = new Date(Date.now() + slaMinutes * 60_000);
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: {
        status: STATUS.PENDING,
        approverChain: chain as unknown as object,
        currentApproverIndex: 0,
        dueAt,
      },
    });

    await auditAppend(this.workspaceId, {
      action: AUDIT_ACTION.ROUTED,
      actorId: this.userId,
      approvalId: approval.id,
      fromStatus: approval.status,
      toStatus: STATUS.PENDING,
      details: { approverChain: chain, slaMinutes },
    });

    await this.notify(
      primary.userId,
      `Approval requested: ${REQUEST_TYPE_LABELS[approval.requestType] ?? approval.requestType}`,
      `${approval.requesterName ?? "A user"} is awaiting your decision${approval.amountCents ? ` ($${(approval.amountCents / 100).toFixed(2)})` : ""}.`,
      `/m/approvals?a=${approval.id}`,
    );

    try {
      await emitEvent(approvalRequested({
        approvalId: approval.id,
        requestType: approval.requestType,
        requestedBy: approval.requesterId,
        amountCents: approval.amountCents,
        channelId: approval.sourceChannelId,
        messageId: approval.sourceMessageId,
      }, {
        producer: "approvals",
        tenantId: this.workspaceId,
        aggregateId: approval.id,
        partitionKey: approval.sourceChannelId ?? approval.id,
      }), "memory");
    } catch {
      // best-effort
    }

    return approval;
  }

  // ── Decisions ─────────────────────────────────────────────────────

  async decide(approvalId: string, decision: string, note?: string) {
    await this.assert("UPDATE");
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== STATUS.PENDING) throw new Error(`Approval is ${approval.status.toLowerCase()}`);

    const current = await this.currentApproverId(approval);
    const isAdmin = this.role === "ADMIN" || this.role === "OWNER";
    if (!isAdmin && current !== this.userId) {
      throw new Error("Not assigned as the approver for this request");
    }
    const actor = await this.actor();

    if (decision === DECISION.APPROVED) {
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: STATUS.APPROVED,
          decisionAt: new Date(),
          decisionById: this.userId,
          decisionNote: note ?? null,
          erpSyncStatus: ERP_SYNC.PENDING_SYNC,
        },
      });
      await auditAppend(this.workspaceId, {
        action: AUDIT_ACTION.APPROVED,
        actorId: this.userId,
        actorName: actor?.name,
        approvalId: approval.id,
        fromStatus: STATUS.PENDING,
        toStatus: STATUS.APPROVED,
        details: { note },
      });
      await this.writeBack(approval.id);
      await this.emitDecision(approval.id, DECISION.APPROVED);
      return this.get(approvalId);
    }

    if (decision === DECISION.REJECTED) {
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          status: STATUS.REJECTED,
          decisionAt: new Date(),
          decisionById: this.userId,
          decisionNote: note ?? null,
        },
      });
      await auditAppend(this.workspaceId, {
        action: AUDIT_ACTION.REJECTED,
        actorId: this.userId,
        actorName: actor?.name,
        approvalId: approval.id,
        fromStatus: STATUS.PENDING,
        toStatus: STATUS.REJECTED,
        details: { note },
      });
      await this.emitDecision(approval.id, DECISION.REJECTED);
      return this.get(approvalId);
    }

    if (decision === DECISION.REQUEST_INFO) {
      await this.comment(approvalId, note ?? "More information requested.", "REQUEST_INFO");
      await this.notify(
        approval.requesterId,
        "Approval needs more info",
        `The approver asked for additional information on your ${REQUEST_TYPE_LABELS[approval.requestType] ?? "approval"} request.`,
        `/m/approvals?a=${approval.id}`,
      );
      return this.get(approvalId);
    }

    throw new Error(`Unknown decision: ${decision}`);
  }

  private async emitDecision(approvalId: string, decision: string) {
    const approval = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!approval) return;
    try {
      await emitEvent(approvalDecision({
        approvalId: approval.id,
        requestType: approval.requestType,
        decision,
        decidedBy: this.userId,
        erpReference: approval.erpReference,
      }, {
        producer: "approvals",
        tenantId: this.workspaceId,
        aggregateId: approval.id,
        partitionKey: approval.sourceChannelId ?? approval.id,
        correlationId: approval.id,
      }), "memory");
    } catch {
      // best-effort
    }
  }

  async provideInfo(approvalId: string, body: string) {
    await this.assert("UPDATE");
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) throw new Error("Approval not found");
    if (approval.requesterId !== this.userId) throw new Error("Only the requester can provide information");
    await this.comment(approvalId, body, "INFO_PROVIDED");
    const current = await this.currentApproverId(approval);
    if (current) {
      await this.notify(
        current,
        "Additional information provided",
        `The requester answered your question on ${REQUEST_TYPE_LABELS[approval.requestType] ?? "an approval"} request.`,
        `/m/approvals?a=${approval.id}`,
      );
    }
    return this.get(approvalId);
  }

  async comment(approvalId: string, body: string, kind: "COMMENT" | "REQUEST_INFO" | "INFO_PROVIDED" = "COMMENT") {
    await this.assert("UPDATE");
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) throw new Error("Approval not found");
    const actor = await this.actor();
    await prisma.approvalComment.create({
      data: {
        workspaceId: this.workspaceId,
        approvalId: approval.id,
        authorId: this.userId,
        authorName: actor?.name ?? actor?.email ?? null,
        body,
        kind,
      },
    });
    await auditAppend(this.workspaceId, {
      action: kind === "REQUEST_INFO" ? AUDIT_ACTION.REQUEST_INFO : kind === "INFO_PROVIDED" ? AUDIT_ACTION.INFO_PROVIDED : AUDIT_ACTION.COMMENTED,
      actorId: this.userId,
      actorName: actor?.name,
      approvalId: approval.id,
      details: { body },
    });
    return this.get(approvalId);
  }

  async cancel(approvalId: string, note?: string) {
    await this.assert("UPDATE");
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) throw new Error("Approval not found");
    const isAdmin = this.role === "ADMIN" || this.role === "OWNER";
    if (!isAdmin && approval.requesterId !== this.userId) {
      throw new Error("Only the requester or an admin can cancel");
    }
    if (approval.status === STATUS.APPROVED || approval.status === STATUS.REJECTED) {
      throw new Error("Cannot cancel a decided approval");
    }
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: STATUS.CANCELLED, decisionNote: note ?? null },
    });
    await auditAppend(this.workspaceId, {
      action: AUDIT_ACTION.CANCELLED,
      actorId: this.userId,
      approvalId: approval.id,
      fromStatus: approval.status,
      toStatus: STATUS.CANCELLED,
      details: { note },
    });
    return this.get(approvalId);
  }

  // ── ERP write-back ────────────────────────────────────────────────

  async writeBack(approvalId: string) {
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) return null;
    if (approval.status !== STATUS.APPROVED) {
      return approval;
    }
    const config = await getConfig(this.workspaceId);
    let adapter;
    try {
      adapter = erpAdapterFor(config);
    } catch (e) {
      await this.markSyncFailed(approval.id, (e as Error).message);
      return approval;
    }

    try {
      const result = await adapter.writeDecision({
        approvalId: approval.id,
        requestType: approval.requestType,
        decision: DECISION.APPROVED,
        workspaceId: this.workspaceId,
        requesterId: approval.requesterId,
        requesterName: approval.requesterName,
        amountCents: approval.amountCents,
        currency: approval.currency,
        rationale: approval.rationale,
        evidence: Array.isArray(approval.evidence) ? (approval.evidence as Array<{ type: string; id: string; label: string }>) : [],
      });
      if (!result.ok) {
        await this.markSyncFailed(approval.id, result.error ?? "ERP write-back failed");
        return approval;
      }
      await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: {
          erpSyncStatus: ERP_SYNC.SYNCED,
          erpReference: result.erpReference ?? null,
          erpSyncAttempts: { increment: 1 },
          erpSyncError: null,
          retryUntil: null,
          downstreamStatus: "COMPLETED",
        },
      });
      await auditAppend(this.workspaceId, {
        action: AUDIT_ACTION.ERP_WRITE_BACK,
        actorId: this.userId,
        approvalId: approval.id,
        fromStatus: ERP_SYNC.PENDING_SYNC,
        toStatus: ERP_SYNC.SYNCED,
        details: { erpReference: result.erpReference },
      });
    } catch (e) {
      await this.markSyncFailed(approval.id, (e as Error).message);
    }
    return approval;
  }

  private async markSyncFailed(approvalId: string, error: string) {
    const approval = await prisma.approvalRequest.findUnique({ where: { id: approvalId } });
    if (!approval) return;
    const attempts = (approval.erpSyncAttempts ?? 0) + 1;
    const backoffMs = Math.min(2 ** attempts * 60_000, 30 * 60_000);
    const data: Prisma.ApprovalRequestUpdateInput = {
      erpSyncStatus: ERP_SYNC.SYNC_FAILED,
      erpSyncAttempts: attempts,
      erpSyncError: error.slice(0, 2000),
      retryUntil: new Date(Date.now() + backoffMs),
    };
    await prisma.approvalRequest.update({ where: { id: approval.id }, data });
    await auditAppend(this.workspaceId, {
      action: AUDIT_ACTION.ERP_SYNC_FAILED,
      actorId: this.userId,
      approvalId: approval.id,
      fromStatus: ERP_SYNC.PENDING_SYNC,
      toStatus: ERP_SYNC.SYNC_FAILED,
      details: { attempts, error },
    });
    if (attempts >= MAX_SYNC_ATTEMPTS) {
      const admins = await prisma.workspaceMember.findMany({
        where: { workspaceId: this.workspaceId, role: { in: ["ADMIN", "OWNER"] } },
        select: { userId: true },
      });
      for (const a of admins) {
        await this.notify(
          a.userId,
          "Approval ERP sync failing",
          `Approval ${approvalId.slice(0, 8)} has failed ${attempts} ERP sync attempts. Manual reconciliation required.`,
          `/m/approvals?a=${approval.id}`,
        );
      }
    }
  }

  async forceSync(approvalId: string) {
    await this.assert("ADMIN");
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval) throw new Error("Approval not found");
    if (approval.status !== STATUS.APPROVED) throw new Error("Only approved approvals can sync");
    return this.writeBack(approval.id);
  }

  // ── Read surfaces ─────────────────────────────────────────────────

  async get(approvalId: string) {
    await this.assert("READ");
    return prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
      include: {
        requester: { select: { name: true, email: true } },
        decisionBy: { select: { name: true, email: true } },
        comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
        auditEntries: { orderBy: { chainIndex: "asc" } },
      },
    });
  }

  async listAll(limit = 50) {
    await this.assert("READ");
    return prisma.approvalRequest.findMany({
      where: { workspaceId: this.workspaceId },
      include: {
        requester: { select: { name: true } },
        decisionBy: { select: { name: true } },
        comments: { orderBy: { createdAt: "asc" }, select: { id: true, authorName: true, body: true, kind: true, createdAt: true } },
        auditEntries: { orderBy: { chainIndex: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async listForChannel(channelId: string) {
    await this.assert("READ");
    return prisma.approvalRequest.findMany({
      where: { workspaceId: this.workspaceId, sourceChannelId: channelId },
      include: {
        requester: { select: { name: true } },
        decisionBy: { select: { name: true } },
        comments: { orderBy: { createdAt: "asc" }, select: { id: true, authorName: true, body: true, kind: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async pendingCountsByChannel() {
    await this.assert("READ");
    const rows = await prisma.approvalRequest.groupBy({
      by: ["sourceChannelId"],
      where: { workspaceId: this.workspaceId, status: { in: [STATUS.PENDING, STATUS.DETECTED] } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.sourceChannelId, r._count._all]));
  }

  async metrics() {
    await this.assert("READ");
    const [byStatus, byType, sync] = await Promise.all([
      prisma.approvalRequest.groupBy({ by: ["status"], where: { workspaceId: this.workspaceId }, _count: { _all: true } }),
      prisma.approvalRequest.groupBy({ by: ["requestType"], where: { workspaceId: this.workspaceId }, _count: { _all: true } }),
      prisma.approvalRequest.groupBy({ by: ["erpSyncStatus"], where: { workspaceId: this.workspaceId }, _count: { _all: true } }),
    ]);
    const decided = await prisma.approvalRequest.findMany({
      where: { workspaceId: this.workspaceId, decisionAt: { not: null } },
      select: { createdAt: true, decisionAt: true },
    });
    const avgMinutes = decided.length
      ? decided.reduce((acc, d) => acc + (d.decisionAt!.getTime() - d.createdAt.getTime()) / 60_000, 0) / decided.length
      : null;
    return {
      total: (await prisma.approvalRequest.count({ where: { workspaceId: this.workspaceId } })),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      byType: Object.fromEntries(byType.map((r) => [r.requestType, r._count._all])),
      erpSync: Object.fromEntries(sync.map((r) => [r.erpSyncStatus, r._count._all])),
      avgTimeToDecisionMinutes: avgMinutes,
    };
  }

  // ── Policy rules ──────────────────────────────────────────────────

  async listPolicies() {
    await this.assert("READ");
    return prisma.approvalPolicyRule.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ requestType: "asc" }, { priority: "asc" }],
    });
  }

  async createPolicy(input: PolicyRuleInput) {
    await this.assert("ADMIN");
    return prisma.approvalPolicyRule.create({
      data: {
        workspaceId: this.workspaceId,
        name: input.name,
        requestType: input.requestType,
        minAmountCents: input.minAmountCents ?? null,
        maxAmountCents: input.maxAmountCents ?? null,
        costCenter: input.costCenter ?? null,
        approverRole: input.approverRole ?? null,
        approverUserId: input.approverUserId ?? null,
        backupUserId: input.backupUserId ?? null,
        slaMinutes: input.slaMinutes ?? 1440,
        priority: input.priority ?? 10,
        active: input.active ?? true,
        createdById: this.userId,
      },
    });
  }

  async updatePolicy(ruleId: string, input: Partial<PolicyRuleInput>) {
    await this.assert("ADMIN");
    return prisma.approvalPolicyRule.updateMany({
      where: { id: ruleId, workspaceId: this.workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.requestType !== undefined ? { requestType: input.requestType } : {}),
        ...(input.minAmountCents !== undefined ? { minAmountCents: input.minAmountCents } : {}),
        ...(input.maxAmountCents !== undefined ? { maxAmountCents: input.maxAmountCents } : {}),
        ...(input.costCenter !== undefined ? { costCenter: input.costCenter } : {}),
        ...(input.approverRole !== undefined ? { approverRole: input.approverRole } : {}),
        ...(input.approverUserId !== undefined ? { approverUserId: input.approverUserId } : {}),
        ...(input.backupUserId !== undefined ? { backupUserId: input.backupUserId } : {}),
        ...(input.slaMinutes !== undefined ? { slaMinutes: input.slaMinutes } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
  }

  async deletePolicy(ruleId: string) {
    await this.assert("ADMIN");
    return prisma.approvalPolicyRule.deleteMany({ where: { id: ruleId, workspaceId: this.workspaceId } });
  }

  // ── Config ────────────────────────────────────────────────────────

  async config() {
    await this.assert("READ");
    return getConfig(this.workspaceId);
  }

  async setConfig(input: {
    erpProvider?: string;
    erpIntegrationId?: string | null;
    autoRaiseThresholdCents?: number | null;
    defaultSlaMinutes?: number;
    nudgeBeforeMinutes?: number;
  }) {
    await this.assert("ADMIN");
    return prisma.workspaceApprovalConfig.upsert({
      where: { workspaceId: this.workspaceId },
      create: {
        workspaceId: this.workspaceId,
        erpProvider: input.erpProvider ?? "MOCK",
        erpIntegrationId: input.erpIntegrationId ?? null,
        autoRaiseThresholdCents: input.autoRaiseThresholdCents ?? null,
        defaultSlaMinutes: input.defaultSlaMinutes ?? 1440,
        nudgeBeforeMinutes: input.nudgeBeforeMinutes ?? 120,
      },
      update: {
        ...(input.erpProvider !== undefined ? { erpProvider: input.erpProvider } : {}),
        ...(input.erpIntegrationId !== undefined ? { erpIntegrationId: input.erpIntegrationId } : {}),
        ...(input.autoRaiseThresholdCents !== undefined ? { autoRaiseThresholdCents: input.autoRaiseThresholdCents } : {}),
        ...(input.defaultSlaMinutes !== undefined ? { defaultSlaMinutes: input.defaultSlaMinutes } : {}),
        ...(input.nudgeBeforeMinutes !== undefined ? { nudgeBeforeMinutes: input.nudgeBeforeMinutes } : {}),
      },
    });
  }

  // ── Sweep-driven ops ──────────────────────────────────────────────

  /** Escalate every overdue PENDING approval in the workspace. */
  async escalateForSweepAll() {
    const overdue = await prisma.approvalRequest.findMany({
      where: { workspaceId: this.workspaceId, status: STATUS.PENDING, dueAt: { lte: new Date() } },
    });
    let count = 0;
    for (const a of overdue) {
      await this.escalateForSweep(a.id);
      count += 1;
    }
    return count;
  }

  /** Advance the approver chain; expire when exhausted. Called by sweep loop. */
  async escalateForSweep(approvalId: string) {
    const approval = await prisma.approvalRequest.findFirst({
      where: { id: approvalId, workspaceId: this.workspaceId },
    });
    if (!approval || approval.status !== STATUS.PENDING) return null;
    const chain = Array.isArray(approval.approverChain) ? (approval.approverChain as Array<{ userId: string; name?: string }>) : [];
    const next = approval.currentApproverIndex + 1;
    if (next >= chain.length) {
      await prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: STATUS.EXPIRED } });
      await auditAppend(this.workspaceId, {
        action: AUDIT_ACTION.EXPIRED,
        approvalId: approval.id,
        fromStatus: STATUS.PENDING,
        toStatus: STATUS.EXPIRED,
        details: { reason: "approver_chain_exhausted" },
      });
      await this.notify(
        approval.requesterId,
        "Approval expired",
        `Your ${REQUEST_TYPE_LABELS[approval.requestType] ?? "approval"} request expired without a decision.`,
        `/m/approvals?a=${approval.id}`,
      );
      return approval;
    }
    const nextApprover = chain[next];
    if (!nextApprover) return approval;
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { currentApproverIndex: next, escalationAt: new Date() },
    });
    await auditAppend(this.workspaceId, {
      action: AUDIT_ACTION.ESCALATED,
      approvalId: approval.id,
      details: { fromIndex: approval.currentApproverIndex, toIndex: next },
    });
    await this.notify(
      nextApprover.userId,
      "Approval escalated to you",
      `The previous approver did not respond in time. You are now responsible for ${REQUEST_TYPE_LABELS[approval.requestType] ?? "this approval"}.`,
      `/m/approvals?a=${approval.id}`,
    );
    return approval;
  }

  /** Retry ERP sync for SYNC_FAILED approvals past retryUntil. Called by sweep loop. */
  async retrySyncForSweep() {
    const due = await prisma.approvalRequest.findMany({
      where: {
        workspaceId: this.workspaceId,
        erpSyncStatus: ERP_SYNC.SYNC_FAILED,
        retryUntil: { lte: new Date() },
      },
    });
    for (const a of due) {
      await auditAppend(this.workspaceId, {
        action: AUDIT_ACTION.ERP_SYNC_RETRIED,
        approvalId: a.id,
        details: { attempts: a.erpSyncAttempts },
      });
      await this.writeBack(a.id);
    }
    return due.length;
  }

  /** Remind current approver when approaching SLA. Called by sweep loop. */
  async remindForSweep() {
    const config = await getConfig(this.workspaceId);
    const nudge = config.nudgeBeforeMinutes ?? 120;
    const cutoff = new Date(Date.now() + nudge * 60_000);
    const candidates = await prisma.approvalRequest.findMany({
      where: {
        workspaceId: this.workspaceId,
        status: STATUS.PENDING,
        dueAt: { lte: cutoff, gte: new Date() },
      },
    });
    let count = 0;
    for (const a of candidates) {
      if (a.lastRemindedAt && a.lastRemindedAt.getTime() > Date.now() - 60 * 60_000) continue;
      const current = await this.currentApproverId(a);
      if (current) {
        await this.notify(current, `Reminder: approval due soon`, `Your decision is due ${a.dueAt?.toLocaleString()}.`, `/m/approvals?a=${a.id}`);
        await prisma.approvalRequest.update({ where: { id: a.id }, data: { lastRemindedAt: new Date() } });
        await auditAppend(this.workspaceId, {
          action: AUDIT_ACTION.REMINDED,
          approvalId: a.id,
          details: { approverId: current },
        });
        count += 1;
      }
    }
    return count;
  }
}