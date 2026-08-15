import { prisma } from "@n0va/db";
import {
  resolvePolicy,
  checkBreaker,
  recordBreakerSuccess,
  recordBreakerFailure,
  reserveQuota,
  releaseQuota,
  computeBackoffMs,
  shouldRetry,
  classifyError,
  idempotencyKeyFor,
  type DeliveryPolicy,
} from "@n0va/modules-chat/delivery";

/**
 * Notification dispatch through the delivery matrix (spec §1/§7/§8).
 *
 * Each channel in the notification's channel plan gets a DeliveryRecord
 * (per-channel reliability tracking). Dispatch is idempotent per
 * notificationId+channel, gated by the per-target policy's circuit breaker
 * and quota, with class-aware backoff retries. On terminal failure the record
 * is dead-lettered (status FAILED) and the event rolls up to FAILED.
 */

const QUOTA_SCOPE = "connector" as const;
const QUOTA_PATH = "read" as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulated channel sink — real FCM/SMS/EMAIL adapters plug in here. */
async function sinkChannel(channel: string): Promise<void> {
  await Promise.resolve();
  if (channel === "FCM" && process.env.N0VA_MOCK_FCM_FAIL === "1") {
    throw new Error("FCM_CHANNEL_00 provider unavailable");
  }
}

export async function dispatchNotificationEvent(opts: {
  workspaceId: string;
  notificationId: string;
  recipientId: string;
  channelPlan: string[];
}): Promise<void> {
  for (const channel of opts.channelPlan) {
    await dispatchChannel({ ...opts, channel }).catch(() => {
      // one channel must not break the plan
    });
  }
  await rollupEventStatus(opts.workspaceId, opts.notificationId).catch(() => {});
}

async function dispatchChannel(opts: { workspaceId: string; notificationId: string; channel: string }) {
  const { workspaceId, notificationId, channel } = opts;
  const idempotencyKey = idempotencyKeyFor(["notif", notificationId, channel]);

  const existing = await prisma.deliveryRecord.findUnique({ where: { idempotencyKey } });
  if (existing && existing.status !== "PENDING") return;
  if (existing?.status === "FAILED") return;

  const policy: DeliveryPolicy = await resolvePolicy(workspaceId, "CHANNEL", "notifications");

  const record =
    existing ??
    (await prisma.deliveryRecord.create({
      data: { notificationId, channel: channel as never, status: "PENDING", idempotencyKey },
    }));

  const breaker = await checkBreaker(workspaceId, "notifications", QUOTA_PATH, policy);
  if (!breaker.allowed) {
    await prisma.deliveryRecord.update({
      where: { id: record.id },
      data: { status: "FAILED", failureReason: breaker.error?.message ?? "circuit open", failedAt: new Date() },
    });
    return;
  }

  const quota = await reserveQuota(workspaceId, QUOTA_SCOPE, channel, policy);
  if (!quota.allowed) {
    await prisma.deliveryRecord.update({
      where: { id: record.id },
      data: { status: "FAILED", failureReason: quota.error?.message ?? "quota exceeded", failedAt: new Date() },
    });
    return;
  }

  let attempt = 0;
  let delivered = false;
  let lastErr: unknown = null;

  while (attempt < Math.max(1, policy.retry.maxAttempts)) {
    attempt += 1;
    try {
      await sinkChannel(channel);
      delivered = true;
      break;
    } catch (err) {
      lastErr = err;
      await recordBreakerFailure(workspaceId, "notifications", QUOTA_PATH, policy).catch(() => {});
      const decision = shouldRetry(policy, attempt, err);
      if (!decision.retry) break;
      await prisma.deliveryRecord.update({
        where: { id: record.id },
        data: { status: "PENDING", attemptCount: attempt, lastAttemptAt: new Date(), failureReason: classifyError(err).message },
      });
      await delay(computeBackoffMs(policy, attempt, { retryAfterMs: decision.retryAfterMs }));
    }
  }

  if (delivered) {
    await recordBreakerSuccess(workspaceId, "notifications", QUOTA_PATH).catch(() => {});
    await releaseQuota(workspaceId, QUOTA_SCOPE, channel, policy.quota.budgetCost).catch(() => {});
    await prisma.deliveryRecord.update({
      where: { id: record.id },
      data: { status: "DELIVERED", attemptCount: attempt, lastAttemptAt: new Date(), deliveredAt: new Date(), failureReason: null },
    });
  } else {
    await prisma.deliveryRecord.update({
      where: { id: record.id },
      data: { status: "FAILED", attemptCount: attempt, lastAttemptAt: new Date(), failedAt: new Date(), failureReason: classifyError(lastErr).message },
    });
  }
}

async function rollupEventStatus(workspaceId: string, notificationId: string): Promise<void> {
  const records = await prisma.deliveryRecord.findMany({ where: { notificationId } });
  if (records.length === 0) return;
  const delivered = records.some((r) => r.status === "DELIVERED");
  const pending = records.some((r) => r.status === "PENDING");
  await prisma.notificationEvent.update({
    where: { id: notificationId },
    data: { status: delivered ? "DELIVERED" : pending ? "DELIVERING" : "FAILED" },
  });
}