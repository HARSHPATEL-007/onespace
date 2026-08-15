import { prisma } from "@n0va/db";
import { DeliveryError } from "./errors";
import type { DeliveryPolicy } from "./types";

/**
 * Spec §4 — quota management.
 *
 *  - per-tenant, per-connector, per-channel scopes
 *  - daily + hourly windows with lazy reset, plus a burst bucket
 *  - priority tiers (critical work reserves quota first)
 *  - budget-based throttles (cost per operation)
 *  - check BEFORE expensive work; return explicit "deferred" states
 */

export type QuotaScope = "tenant" | "connector" | "channel";
export type QuotaBucket = "daily" | "hourly" | "burst";

const DAILY_MS = 24 * 60 * 60 * 1000;
const HOURLY_MS = 60 * 60 * 1000;
const BURST_MS = 1000; // 1s sliding burst window

export interface QuotaCheck {
  allowed: boolean;
  deferred: boolean;
  scope: QuotaScope;
  bucket: QuotaBucket;
  used: number;
  limit: number;
  retryAfterMs?: number;
  error?: DeliveryError;
}

async function counter(workspaceId: string, scope: QuotaScope, scopeKey: string, bucket: QuotaBucket, now: Date) {
  return prisma.chatQuotaCounter.upsert({
    where: { workspaceId_scope_scopeKey_bucket: { workspaceId, scope, scopeKey, bucket } },
    create: { workspaceId, scope, scopeKey, bucket, windowStart: now },
    update: {},
  });
}

function windowFor(bucket: QuotaBucket, now: Date): { windowMs: number; startedAt: Date } {
  const t = now.getTime();
  switch (bucket) {
    case "daily":
      return { windowMs: DAILY_MS, startedAt: new Date(t - (t % DAILY_MS)) };
    case "hourly":
      return { windowMs: HOURLY_MS, startedAt: new Date(t - (t % HOURLY_MS)) };
    case "burst":
      return { windowMs: BURST_MS, startedAt: new Date(t - (t % BURST_MS)) };
  }
}

function limitFor(policy: DeliveryPolicy, bucket: QuotaBucket): number {
  switch (bucket) {
    case "daily":
      return policy.quota.tenantDailyLimit;
    case "hourly":
      return policy.quota.tenantHourlyLimit;
    case "burst":
      return policy.quota.burstLimit;
  }
}

/**
 * Reserve quota for an operation BEFORE dispatching (spec §4 "check quota
 * before expensive work begins", "reserve quota for high-priority operations").
 *
 * cost = budgetCost per op (already multiplied by caller if batching).
 */
export async function reserveQuota(
  workspaceId: string,
  scope: QuotaScope,
  scopeKey: string,
  policy: DeliveryPolicy,
  opts?: { cost?: number; highPriority?: boolean; now?: Date },
): Promise<QuotaCheck> {
  const now = opts?.now ?? new Date();
  const cost = opts?.cost ?? policy.quota.budgetCost;
  if (!policy.quota.enabled || policy.quota.tenantDailyLimit <= 0) {
    return { allowed: true, deferred: false, scope, bucket: "daily", used: 0, limit: policy.quota.tenantDailyLimit };
  }

  // High-priority critical workflows are admitted even when soft limits are
  // close, but burst remains hard for everyone (fairness).
  const buckets: QuotaBucket[] = ["daily", "hourly", "burst"];

  // Peek counters first (no reservation) to fail fast.
  const peeks = await Promise.all(buckets.map((b) => counter(workspaceId, scope, scopeKey, b, now)));
  const windowed = peeks.map((row, i): { bucket: QuotaBucket; used: number; limit: number; win: { windowMs: number; startedAt: Date } } => {
    const bucket = buckets[i] as QuotaBucket;
    const win = windowFor(bucket, now);
    const expired = row.windowStart.getTime() < win.startedAt.getTime();
    return { bucket, used: expired ? 0 : row.used, limit: limitFor(policy, bucket), win };
  });

  // Hard limit: daily window exhausted → quota exceeded (defer or fail).
  const daily = windowed[0]!;
  if (daily.limit > 0 && daily.used + cost > daily.limit) {
    if (opts?.highPriority && policy.priority >= 3) {
      // Critical traffic may continue on the hourly window when daily is near
      // the ceiling, but burst still gates everything below.
    } else {
      const retryAfterMs = daily.win.startedAt.getTime() + DAILY_MS - now.getTime();
      return { allowed: false, deferred: true, scope, bucket: "daily", used: daily.used, limit: daily.limit, retryAfterMs, error: DeliveryError.quotaDeferred("tenant daily quota exhausted", { retryAfterMs }) };
    }
  }

  const hourly = windowed[1]!;
  if (hourly.limit > 0 && hourly.used + cost > hourly.limit) {
    const retryAfterMs = hourly.win.startedAt.getTime() + HOURLY_MS - now.getTime();
    return { allowed: false, deferred: true, scope, bucket: "hourly", used: hourly.used, limit: hourly.limit, retryAfterMs, error: DeliveryError.quotaDeferred("tenant hourly quota exhausted", { retryAfterMs }) };
  }

  const burst = windowed[2]!;
  if (burst.limit > 0 && burst.used + cost > burst.limit) {
    const retryAfterMs = 1000;
    return { allowed: false, deferred: true, scope, bucket: "burst", used: burst.used, limit: burst.limit, retryAfterMs, error: DeliveryError.quotaDeferred("burst rate exceeded", { retryAfterMs }) };
  }

  // Reserve: increment counters inside the current windows.
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i] as QuotaBucket;
    const win = windowed[i]!.win;
    const row = peeks[i]!;
    const expired = row.windowStart.getTime() < win.startedAt.getTime();
    await prisma.chatQuotaCounter.update({
      where: { workspaceId_scope_scopeKey_bucket: { workspaceId, scope, scopeKey, bucket } },
      data: { used: expired ? cost : { increment: cost }, windowStart: expired ? win.startedAt : row.windowStart, updatedAt: now },
    });
  }

  return { allowed: true, deferred: false, scope, bucket: "daily", used: daily.used + cost, limit: daily.limit };
}

/** Roll back a reservation (release unused quota after a cancelled op). */
export async function releaseQuota(
  workspaceId: string,
  scope: QuotaScope,
  scopeKey: string,
  cost: number,
): Promise<void> {
  for (const bucket of ["daily", "hourly", "burst"] as QuotaBucket[]) {
    await prisma.chatQuotaCounter.updateMany({
      where: { workspaceId, scope, scopeKey, bucket },
      data: { used: { decrement: Math.max(0, cost) } },
    }).catch(() => {});
  }
}

export async function quotaState(workspaceId: string, scope?: QuotaScope, scopeKey?: string) {
  return prisma.chatQuotaCounter.findMany({
    where: { workspaceId, ...(scope ? { scope } : {}), ...(scopeKey ? { scopeKey } : {}) },
    orderBy: [{ scope: "asc" }, { bucket: "asc" }],
  });
}

export async function resetQuota(workspaceId: string, scope?: QuotaScope, scopeKey?: string) {
  await prisma.chatQuotaCounter.deleteMany({ where: { workspaceId, ...(scope ? { scope } : {}), ...(scopeKey ? { scopeKey } : {}) } });
}