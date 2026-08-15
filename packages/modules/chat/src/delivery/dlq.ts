import { prisma } from "@n0va/db";
import type { ChatDeliveryDLQ as DlqRow } from "@n0va/db";
import { REASON_CODES } from "./types";

/**
 * Spec §8 — dead-letter and holding queues.
 *
 *  - reason codes (permanent/malformed/unauthorized/quota/breaker/poison)
 *  - poison-message quarantine (repeated failure patterns)
 *  - manual replay + scheduled requeue from the holding queue
 *  - alerting on repeated failure patterns (creates a notification event)
 */

export const POISON_THRESHOLD = 3;

export async function quarantine(
  opts: {
    workspaceId: string;
    deliveryId: string;
    channelId?: string;
    messageId?: string;
    target: string;
    reasonCode: string;
    reason?: string;
    payload?: unknown;
    attempts: number;
    lastError?: string;
    requeueAt?: Date;
  },
): Promise<DlqRow> {
  const row = await prisma.chatDeliveryDLQ.create({
    data: {
      workspaceId: opts.workspaceId,
      deliveryId: opts.deliveryId,
      channelId: opts.channelId ?? null,
      messageId: opts.messageId ?? null,
      target: opts.target,
      reasonCode: opts.reasonCode,
      reason: opts.reason ?? null,
      attempts: opts.attempts,
      payload: (opts.payload ?? {}) as never,
      lastError: opts.lastError ?? null,
      status: opts.requeueAt ? "QUARANTINED" : "QUARANTINED",
      requeueAt: opts.requeueAt ?? null,
    },
  });

  // Link the delivery row to its DLQ entry.
  await prisma.chatMessageDelivery.update({
    where: { id: opts.deliveryId },
    data: { dlqId: row.id, state: "FAILED", failedAt: new Date(), lastError: opts.lastError ?? null },
  }).catch(() => {});

  await alertOnRepeatedFailures(opts.workspaceId, row);

  return row;
}

async function alertOnRepeatedFailures(workspaceId: string, row: DlqRow): Promise<void> {
  const recent = await prisma.chatDeliveryDLQ.count({
    where: { workspaceId, reasonCode: row.reasonCode, quarantinedAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
  });
  if (recent >= POISON_THRESHOLD && row.reasonCode !== REASON_CODES.POISON) {
    await prisma.chatDeliveryDLQ.update({
      where: { id: row.id },
      data: { reasonCode: REASON_CODES.POISON, reason: `poison pattern: ${recent} quarantined events in 30m (${row.reasonCode})` },
    });
    // Alerting: create a NotificationEvent for admins (best-effort).
    try {
      const admins = await prisma.workspaceMember.findMany({ where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
      const admin = admins[0];
      if (admin) {
        await prisma.notificationEvent.create({
          data: {
            recipientId: admin.userId,
            workspaceId,
            sourceType: "delivery.dlq.poison",
            sourceId: row.id,
            title: `Delivery poison pattern detected (${row.target})`,
            body: `Quarantined ${recent} deliveries with reason ${row.reasonCode}. Check /m/delivery.`,
            priorityScore: 8,
            channelPlan: ["WEBSOCKET", "EMAIL"],
            status: "QUEUED",
          },
        }).catch(() => {});
      }
    } catch {
      // best-effort
    }
  }
}

export async function listDlq(workspaceId: string, status?: string, limit = 50) {
  return prisma.chatDeliveryDLQ.findMany({
    where: { workspaceId, ...(status ? { status: status as never } : {}) },
    orderBy: { quarantinedAt: "desc" },
    take: limit,
  });
}

/** Manual replay — reset to PENDING so the sweep re-delivers immediately. */
export async function replayDlq(workspaceId: string, dlqId: string): Promise<DlqRow | null> {
  const row = await prisma.chatDeliveryDLQ.findFirst({ where: { id: dlqId, workspaceId } });
  if (!row) return null;

  await prisma.chatDeliveryDLQ.update({
    where: { id: dlqId },
    data: { status: "REQUEUED", requeuedAt: new Date(), requeueAt: null, resolvedAt: null },
  });
  if (row.deliveryId) {
    await prisma.chatMessageDelivery.update({
      where: { id: row.deliveryId },
      data: { state: "QUEUED", nextRetryAt: new Date(), dlqId: null, failedAt: null, lastError: null },
    }).catch(() => {});
  }
  return row;
}

/** Release (resolve) a DLQ entry without replay — acknowledged by an operator. */
export async function resolveDlq(workspaceId: string, dlqId: string) {
  const row = await prisma.chatDeliveryDLQ.findFirst({ where: { id: dlqId, workspaceId } });
  if (!row) return null;
  await prisma.chatDeliveryDLQ.update({ where: { id: dlqId }, data: { status: "RELEASED", resolvedAt: new Date() } });
  return row;
}

export async function dropDlq(workspaceId: string, dlqId: string) {
  const row = await prisma.chatDeliveryDLQ.findFirst({ where: { id: dlqId, workspaceId } });
  if (!row) return null;
  await prisma.chatDeliveryDLQ.update({ where: { id: dlqId }, data: { status: "DROPPED", resolvedAt: new Date() } });
  return row;
}

/** Scheduled requeue for recoverable (holding-queue) items. */
export async function requeueDueFromHolding(now = new Date()): Promise<number> {
  const due = await prisma.chatDeliveryDLQ.findMany({
    where: { status: "QUARANTINED", requeueAt: { not: null, lte: now } },
    take: 50,
  });
  for (const row of due) {
    await prisma.chatDeliveryDLQ.update({
      where: { id: row.id },
      data: { status: "REQUEUED", requeuedAt: now, requeueAt: null },
    });
    if (row.deliveryId) {
      await prisma.chatMessageDelivery.update({
        where: { id: row.deliveryId },
        data: { state: "QUEUED", nextRetryAt: now, dlqId: null, failedAt: null, lastError: null },
      }).catch(() => {});
    }
  }
  return due.length;
}