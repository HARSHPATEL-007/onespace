import { prisma } from "@n0va/db";
import type { ChatMessageDelivery as DeliveryRow } from "@n0va/db";
import { resolvePolicy } from "./policy";
import { reserveQuota, releaseQuota } from "./quota";
import { checkBreaker, recordBreakerSuccess, recordBreakerFailure } from "./breaker";
import { computeBackoffMs, shouldRetry, outcomeForError } from "./retry";
import { quarantine, replayDlq, listDlq, requeueDueFromHolding } from "./dlq";
import { classifyError, DeliveryError, isPermanent } from "./errors";
import { idempotencyKeyFor, newCorrelationId } from "./types";
import type { DeliveryPolicy, DeliveryTarget, PolicyChannelKind, DeliveryDispatchResult } from "./types";
import { REASON_CODES } from "./types";

/**
 * Spec core — policy-driven delivery engine.
 *
 * Flow per dispatch:
 *   resolve policy → dedup (idempotency key) → quota reserve →
 *   circuit breaker → backend dispatch → attempt log → retry/DLQ.
 */

export interface DispatchContext {
  workspaceId: string;
  channelId?: string;
  messageId?: string;
  target: DeliveryTarget;
  payload: Record<string, unknown>;
  policy: DeliveryPolicy;
  channelKind: PolicyChannelKind;
  idempotencyKey: string;
  correlationId: string;
  attempt: number;
}

export type BackendFn = (ctx: DispatchContext) => Promise<DeliveryDispatchResult>;

const globalForBackends = globalThis as unknown as { __n0vaDeliveryBackends?: Map<string, BackendFn> };
function getBackends(): Map<string, BackendFn> {
  if (!globalForBackends.__n0vaDeliveryBackends) {
    globalForBackends.__n0vaDeliveryBackends = new Map<string, BackendFn>();
  }
  return globalForBackends.__n0vaDeliveryBackends;
}

/**
 * Spec §9 — per-target concurrency caps (backpressure). A slow downstream must
 * not let dispatch calls pile up unbounded; when a target is at its cap, new
 * work is deferred to the next sweep instead of starting a nested attempt.
 * Shared on globalThis for the same multi-bundle reason as the registry.
 */
export const DEFAULT_CONCURRENCY_CAP = 50;
const globalForLimits = globalThis as unknown as { __n0vaDeliveryLimits?: Map<string, { active: number; cap: number }> };
function getLimits(): Map<string, { active: number; cap: number }> {
  if (!globalForLimits.__n0vaDeliveryLimits) {
    globalForLimits.__n0vaDeliveryLimits = new Map<string, { active: number; cap: number }>();
  }
  return globalForLimits.__n0vaDeliveryLimits;
}
export function setConcurrencyCap(target: string, cap: number): void {
  const lim = getLimits().get(target) ?? { active: 0, cap: DEFAULT_CONCURRENCY_CAP };
  lim.cap = Math.max(1, cap);
  getLimits().set(target, lim);
}
export function concurrencyState(): Array<{ target: string; active: number; cap: number }> {
  return [...getLimits().entries()].map(([target, lim]) => ({ target, active: lim.active, cap: lim.cap }));
}
function tryAcquire(target: string): boolean {
  const lim = getLimits().get(target) ?? { active: 0, cap: DEFAULT_CONCURRENCY_CAP };
  if (lim.active >= lim.cap) return false;
  lim.active += 1;
  getLimits().set(target, lim);
  return true;
}
function release(target: string): void {
  const lim = getLimits().get(target);
  if (!lim) return;
  lim.active = Math.max(0, lim.active - 1);
}

export function registerBackend(target: DeliveryTarget, fn: BackendFn): void {
  getBackends().set(target, fn);
}

export function hasBackend(target: string): boolean {
  return getBackends().has(target);
}

export interface DeliverInput {
  workspaceId: string;
  channelId?: string;
  messageId?: string;
  target: DeliveryTarget;
  channelKind: PolicyChannelKind;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: "high" | "normal";
  enqueueOnly?: boolean;
}

export class DeliveryEngine {
  /**
   * Enqueue + dispatch a delivery. Idempotency keys make concurrent duplicate
   * calls safe: the second call sees the existing row and reports DEDUPED.
   */
  async deliver(input: DeliverInput): Promise<DeliveryRow> {
    const policy = await resolvePolicy(input.workspaceId, input.channelKind, input.target);
    const key = input.idempotencyKey ?? idempotencyKeyFor([input.workspaceId, input.target, input.messageId ?? input.channelId, Date.now()]);

    const existing = await prisma.chatMessageDelivery.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.state !== "FAILED" && existing.state !== "CANCELLED") {
        await prisma.chatMessageDelivery.update({ where: { id: existing.id }, data: { dedupHit: true } }).catch(() => {});
        return existing;
      }
    }

    const correlationId = newCorrelationId();
    const row = await prisma.chatMessageDelivery.create({
      data: {
        workspaceId: input.workspaceId,
        channelId: input.channelId ?? "",
        messageId: input.messageId ?? "",
        target: input.target,
        channelKind: input.channelKind,
        state: "PENDING",
        payload: (input.payload ?? {}) as never,
        maxAttempts: policy.retry.maxAttempts,
        correlationId,
        idempotencyKey: key,
      },
    });

    if (!input.enqueueOnly) {
      await this.dispatchOnce(row, policy, input.priority === "high");
    }
    return row;
  }

  /** Perform a single attempt for a delivery row through the full pipeline. */
  async dispatchOnce(row: DeliveryRow, policy?: DeliveryPolicy, highPriority?: boolean): Promise<DeliveryRow> {
    if (["CONFIRMED", "CANCELLED"].includes(row.state)) return row;
    const resolvedPolicy = policy ?? (await resolvePolicy(row.workspaceId, (row.channelKind as PolicyChannelKind) ?? "CHANNEL", row.target as DeliveryTarget));
    const ctx: DispatchContext = {
      workspaceId: row.workspaceId,
      channelId: row.channelId || undefined,
      messageId: row.messageId || undefined,
      target: row.target as DeliveryTarget,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      policy: resolvedPolicy,
      channelKind: (row.channelKind as PolicyChannelKind) ?? "CHANNEL",
      idempotencyKey: row.idempotencyKey,
      correlationId: row.correlationId,
      attempt: row.attemptCount + 1,
    };

    const started = Date.now();
    const queueWaitMs = started - row.enqueuedAt.getTime();

    if (!row.firstAttemptAt) {
      await prisma.chatMessageDelivery.update({ where: { id: row.id }, data: { firstAttemptAt: new Date(started) } });
    }

    // 1) Quota reserve (check before expensive work).
    const quotaScope = row.target === "chat" ? "channel" : "tenant";
    const quota = await reserveQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy, {
      highPriority,
      now: new Date(started),
    });
    if (!quota.allowed) {
      const retryAfter = quota.retryAfterMs ?? computeBackoffMs(resolvedPolicy, ctx.attempt);
      const next = new Date(started + retryAfter);
      await this.logAttempt(row, ctx, {
        outcome: quota.error?.cls === "QUOTA_EXCEEDED" ? "QUOTA_EXCEEDED" : "QUOTA_DEFERRED",
        reason: quota.error?.message,
        retryAfterMs: retryAfter,
        queueWaitMs,
      });
      return prisma.chatMessageDelivery.update({
        where: { id: row.id },
        data: { state: "DELAYED", lastOutcome: quota.error?.cls === "QUOTA_EXCEEDED" ? "QUOTA_EXCEEDED" : "QUOTA_DEFERRED", nextRetryAt: next, lastError: quota.error?.message ?? null },
      });
    }

    // 2) Circuit breaker.
    const breakerPath: "read" | "write" = "write";
    const breakerTarget = `${row.target}-fanout:${row.channelId || row.workspaceId}`;
    const breaker = await checkBreaker(row.workspaceId, breakerTarget, breakerPath, resolvedPolicy, new Date(started));
    if (!breaker.allowed) {
      const retryAfter = computeBackoffMs(resolvedPolicy, ctx.attempt, { retryAfterMs: resolvedPolicy.circuitBreaker.cooldownSec * 1000 });
      const next = new Date(started + retryAfter);
      await this.logAttempt(row, ctx, { outcome: "BREAKER_OPEN", reason: breaker.error?.message, breakerState: breaker.state, retryAfterMs: retryAfter, queueWaitMs });
      await releaseQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy.quota.budgetCost);
      return prisma.chatMessageDelivery.update({
        where: { id: row.id },
        data: { state: "DELAYED", lastOutcome: "BREAKER_OPEN", nextRetryAt: next, lastError: breaker.error?.message ?? null },
      });
    }

    // 3) Dispatch.
    const backend = getBackends().get(row.target);
    if (!backend) {
      await releaseQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy.quota.budgetCost);
      return this.fail(row, ctx, "PERMANENT", "no backend registered for target", started, queueWaitMs, quotaScope);
    }

    // Backpressure: if the target is at its concurrency cap, defer (don't nest).
    if (!tryAcquire(row.target)) {
      const retryAfter = computeBackoffMs(resolvedPolicy, ctx.attempt, { retryAfterMs: 1000 });
      const next = new Date(started + retryAfter);
      await this.logAttempt(row, ctx, { outcome: "DEFERRED", reason: `concurrency_cap:${row.target}`, retryAfterMs: retryAfter, queueWaitMs });
      await releaseQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy.quota.budgetCost);
      return prisma.chatMessageDelivery.update({
        where: { id: row.id },
        data: { state: "QUEUED", lastOutcome: "DEFERRED", nextRetryAt: next, lastError: `concurrency cap reached for ${row.target}` },
      });
    }

    await prisma.chatMessageDelivery.update({ where: { id: row.id }, data: { state: "SENDING" } });
    const attemptStarted = Date.now();
    let result: DeliveryDispatchResult;
    let err: unknown;
    try {
      result = await backend(ctx);
    } catch (e) {
      err = e;
      result = { ok: false, targetCount: 0, deliveredCount: 0, retryable: true, reason: e instanceof Error ? e.message : String(e) };
    } finally {
      release(row.target);
    }
    const latencyMs = Date.now() - attemptStarted;

    if (result.ok) {
      await recordBreakerSuccess(row.workspaceId, breakerTarget, breakerPath);
      const state = result.deliveredCount > 0 && result.targetCount > 0 && result.deliveredCount < result.targetCount ? "PARTIALLY_DELIVERED" : "CONFIRMED";
      await this.logAttempt(row, ctx, { outcome: "SUCCESS", latencyMs, breakerState: "CLOSED", quotaConsumed: resolvedPolicy.quota.budgetCost, queueWaitMs });
      return prisma.chatMessageDelivery.update({
        where: { id: row.id },
        data: {
          state,
          lastOutcome: "SUCCESS",
          deliveredCount: result.deliveredCount,
          targetCount: result.targetCount,
          deliveredAt: new Date(),
          nextRetryAt: null,
          totalLatencyMs: Date.now() - started,
          lastError: null,
        },
      });
    }

    // Failure path.
    const failureError: Error = err instanceof Error ? err : new DeliveryError(result.reasonCode === "BREAKER" ? "BREAKER_OPEN" : "TRANSIENT", result.reason ?? "dispatch failed");
    const cls = classifyError(failureError).cls;
    if (["TRANSIENT", "TIMEOUT"].includes(cls) && resolvedPolicy.circuitBreaker.enabled) {
      await recordBreakerFailure(row.workspaceId, breakerTarget, breakerPath, resolvedPolicy, failureError.message);
    }

    if (isPermanent(failureError)) {
      await releaseQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy.quota.budgetCost);
      return this.fail(row, ctx, cls, failureError.message, started, queueWaitMs, quotaScope);
    }

    // Retry decision.
    const decision = shouldRetry(resolvedPolicy, ctx.attempt, failureError);
    if (decision.retry) {
      const retryAfter = result.retryAfterMs ?? decision.retryAfterMs ?? computeBackoffMs(resolvedPolicy, ctx.attempt, { retryAfterMs: decision.retryAfterMs });
      const next = new Date(Date.now() + retryAfter);
      await this.logAttempt(row, ctx, { outcome: outcomeForError(failureError).outcome, reason: failureError.message, retryAfterMs: retryAfter, queueWaitMs, latencyMs });
      await releaseQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy.quota.budgetCost);
      return prisma.chatMessageDelivery.update({
        where: { id: row.id },
        data: { state: "RETRIED", lastOutcome: outcomeForError(failureError).outcome, nextRetryAt: next, lastError: failureError.message, totalLatencyMs: Date.now() - started },
      });
    }

    // Exhausted → DLQ.
    await releaseQuota(row.workspaceId, quotaScope, row.channelId || "default", resolvedPolicy.quota.budgetCost);
    return this.fail(row, ctx, cls, failureError.message, started, queueWaitMs, quotaScope);
  }

  private async fail(row: DeliveryRow, ctx: DispatchContext, reasonCode: string, reason: string, started: number, queueWaitMs: number, quotaScope: string): Promise<DeliveryRow> {
    await this.logAttempt(row, ctx, { outcome: reasonCode === "PERMANENT" || reasonCode === "MALFORMED" || reasonCode === "UNAUTHORIZED" || reasonCode === "QUOTA_EXCEEDED" ? reasonCode : "DLQ", reason, queueWaitMs });
    const dlqReason = isPermanentCode(reasonCode) ? reasonCode : REASON_CODES.PERMANENT;
    await quarantine({
      workspaceId: row.workspaceId,
      deliveryId: row.id,
      channelId: row.channelId || undefined,
      messageId: row.messageId || undefined,
      target: row.target,
      reasonCode: dlqReason,
      reason,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      attempts: row.attemptCount,
      lastError: reason,
    });
    return prisma.chatMessageDelivery.update({
      where: { id: row.id },
      data: { state: "FAILED", lastOutcome: dlqReason === REASON_CODES.PERMANENT ? "PERMANENT" : dlqReason as never, failedAt: new Date(), nextRetryAt: null, lastError: reason, totalLatencyMs: Date.now() - started },
    });
  }

  private async logAttempt(
    row: DeliveryRow,
    ctx: DispatchContext,
    opts: { outcome: string; reason?: string; latencyMs?: number; breakerState?: string; retryAfterMs?: number; queueWaitMs?: number; quotaConsumed?: number },
  ) {
    await prisma.chatDeliveryAttempt.create({
      data: {
        deliveryId: row.id,
        workspaceId: row.workspaceId,
        attempt: ctx.attempt,
        outcome: opts.outcome as never,
        reason: opts.reason ?? null,
        latencyMs: opts.latencyMs ?? null,
        breakerState: (opts.breakerState as never) ?? null,
        quotaConsumed: opts.quotaConsumed ?? 0,
        queueWaitMs: opts.queueWaitMs ?? null,
        retryAfterMs: opts.retryAfterMs ?? null,
      },
    }).catch(() => {});
    // Best-effort: bump attempt counter on the delivery row.
    await prisma.chatMessageDelivery.update({ where: { id: row.id }, data: { attemptCount: { increment: 1 }, updatedAt: new Date() } }).catch(() => {});
  }

  // ── Operator actions ────────────────────────────────────────────────────────

  async retryDelivery(deliveryId: string): Promise<DeliveryRow | null> {
    const row = await prisma.chatMessageDelivery.findUnique({ where: { id: deliveryId } });
    if (!row) return null;
    if (row.dlqId) {
      await replayDlq(row.workspaceId, row.dlqId);
    }
    await prisma.chatMessageDelivery.update({ where: { id: deliveryId }, data: { state: "QUEUED", nextRetryAt: new Date(), failedAt: null, lastError: null } });
    return this.dispatchOnce(await prisma.chatMessageDelivery.findUniqueOrThrow({ where: { id: deliveryId } }));
  }

  async cancelDelivery(deliveryId: string): Promise<DeliveryRow | null> {
    const row = await prisma.chatMessageDelivery.findUnique({ where: { id: deliveryId } });
    if (!row) return null;
    return prisma.chatMessageDelivery.update({
      where: { id: deliveryId },
      data: { state: "CANCELLED", cancelledAt: new Date(), nextRetryAt: null },
    });
  }

  // ── Sweep helpers ───────────────────────────────────────────────────────────

  /** Re-dispatch all deliveries whose retry time has arrived. */
  async deliverDue(now = new Date(), limit = 200): Promise<number> {
    const due = await prisma.chatMessageDelivery.findMany({
      where: { state: { in: ["QUEUED", "DELAYED", "RETRIED"] }, nextRetryAt: { not: null, lte: now } },
      orderBy: { nextRetryAt: "asc" },
      take: limit,
    });
    for (const row of due) {
      try {
        const policy = await resolvePolicy(row.workspaceId, (row.channelKind as PolicyChannelKind) ?? "CHANNEL", row.target as DeliveryTarget);
        await this.dispatchOnce(row, policy);
      } catch {
        // one item must not break the sweep
      }
    }
    return due.length;
  }

  async requeueHolding(now = new Date()): Promise<number> {
    return requeueDueFromHolding(now);
  }

  // ── Observability (spec §10) ───────────────────────────────────────────────

  async stats(workspaceId: string) {
    const [byState, byOutcome, attempts, dlq, total, confirmed] = await Promise.all([
      prisma.chatMessageDelivery.groupBy({ by: ["state"], where: { workspaceId }, _count: { _all: true } }),
      prisma.chatDeliveryAttempt.groupBy({ by: ["outcome"], where: { workspaceId }, _count: { _all: true } }),
      prisma.chatDeliveryAttempt.aggregate({ where: { workspaceId }, _avg: { latencyMs: true, queueWaitMs: true }, _max: { latencyMs: true } }),
      prisma.chatDeliveryDLQ.count({ where: { workspaceId } }),
      prisma.chatMessageDelivery.count({ where: { workspaceId } }),
      prisma.chatMessageDelivery.count({ where: { workspaceId, state: "CONFIRMED" } }),
    ]);
    const deduped = await prisma.chatMessageDelivery.count({ where: { workspaceId, dedupHit: true } });
    return {
      total,
      confirmed,
      deduped,
      dedupHitRate: total > 0 ? deduped / total : 0,
      avgLatencyMs: attempts._avg.latencyMs,
      avgQueueWaitMs: attempts._avg.queueWaitMs,
      maxLatencyMs: attempts._max.latencyMs,
      dlqCount: dlq,
      byState: Object.fromEntries(byState.map((r) => [r.state, r._count._all])),
      byOutcome: Object.fromEntries(byOutcome.map((r) => [r.outcome, r._count._all])),
    };
  }

  async deliveries(workspaceId: string, channelId?: string, state?: string, limit = 100) {
    return prisma.chatMessageDelivery.findMany({
      where: { workspaceId, ...(channelId ? { channelId } : {}), ...(state ? { state: state as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { attempts: { orderBy: { attempt: "asc" } } },
    });
  }

  async deliveryAttempts(deliveryId: string) {
    return prisma.chatDeliveryAttempt.findMany({ where: { deliveryId }, orderBy: { attempt: "asc" } });
  }

  // ── Spec §9 backpressure observability ─────────────────────────────────────

  /** Number of items currently pending dispatch (due or scheduled). */
  async queueDepth(now = new Date()): Promise<number> {
    return prisma.chatMessageDelivery.count({
      where: { state: { in: ["QUEUED", "DELAYED", "RETRIED", "PENDING"] }, nextRetryAt: { lte: now } },
    });
  }

  /** Count of items awaiting a future retry (not yet due). */
  async backlog(now = new Date()): Promise<number> {
    return prisma.chatMessageDelivery.count({
      where: { state: { in: ["QUEUED", "DELAYED", "RETRIED"] }, nextRetryAt: { gt: now } },
    });
  }

  // ── Spec §5/§8 reconciliation ──────────────────────────────────────────────

  /**
   * Reconcile stuck state: requeue deliveries stranded in SENDING (crash
   * orphans) and quarantine stale due rows that have stopped progressing.
   */
  async reconcile(now = new Date()): Promise<{ requeued: number; quarantined: number }> {
    const stuckSince = new Date(now.getTime() - 60_000);
    const requeuedRows = await prisma.chatMessageDelivery.findMany({
      where: { state: "SENDING", updatedAt: { lt: stuckSince } },
      take: 100,
    });
    for (const r of requeuedRows) {
      await prisma.chatMessageDelivery.update({
        where: { id: r.id },
        data: { state: "QUEUED", nextRetryAt: now, lastError: "reconciled: stuck in SENDING" },
      }).catch(() => {});
    }

    const staleSince = new Date(now.getTime() - 30 * 60 * 1000);
    const staleRows = await prisma.chatMessageDelivery.findMany({
      where: { state: { in: ["QUEUED", "DELAYED", "RETRIED"] }, nextRetryAt: { lte: now }, updatedAt: { lt: staleSince } },
      take: 100,
    });
    for (const r of staleRows) {
      const policy = await resolvePolicy(r.workspaceId, (r.channelKind as PolicyChannelKind) ?? "CHANNEL", r.target as DeliveryTarget).catch(() => null);
      const exhausted = policy != null && r.attemptCount >= policy.retry.maxAttempts;
      if (exhausted) {
        const ctx: DispatchContext = {
          workspaceId: r.workspaceId,
          channelId: r.channelId || undefined,
          messageId: r.messageId || undefined,
          target: r.target as DeliveryTarget,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          policy,
          channelKind: (r.channelKind as PolicyChannelKind) ?? "CHANNEL",
          idempotencyKey: r.idempotencyKey,
          correlationId: r.correlationId,
          attempt: r.attemptCount + 1,
        };
        await this.fail(r, ctx, "DLQ", `reconciled: retries exhausted (${r.attemptCount}/${policy.retry.maxAttempts})`, now.getTime(), 0, r.target === "chat" ? "channel" : "tenant");
      } else {
        await prisma.chatMessageDelivery.update({
          where: { id: r.id },
          data: { state: "QUEUED", nextRetryAt: now, lastError: "reconciled: stale due row requeued" },
        }).catch(() => {});
      }
    }
    return { requeued: requeuedRows.length, quarantined: staleRows.length };
  }
}

function isPermanentCode(code: string): boolean {
  return code === "PERMANENT" || code === "MALFORMED" || code === "UNAUTHORIZED" || code === "QUOTA_EXCEEDED";
}

/** Default engine singleton (safe under HMR via globalThis). */
const globalForEngine = globalThis as unknown as { __n0vaDeliveryEngine?: DeliveryEngine };
export function getDeliveryEngine(): DeliveryEngine {
  if (!globalForEngine.__n0vaDeliveryEngine) {
    globalForEngine.__n0vaDeliveryEngine = new DeliveryEngine();
  }
  return globalForEngine.__n0vaDeliveryEngine;
}

export { listDlq };