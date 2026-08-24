/**
 * CHAT Rate-Limit Mediation — per-connector quota, token-bucket, adaptive backoff,
 * normalized headers, budget throttling, burst protection, concurrency caps
 */

import { prisma } from "@n0va/db";

type BucketState = {
  tokens: number;
  capacity: number;
  refillPerSec: number;
  lastRefill: number;
  queue: number;
  concurrency: number;
  maxConcurrency: number;
};

const buckets = new Map<string, BucketState>();
const budgets = new Map<string, { used: number; budget: number; resetAt: number }>();

function nowMs() {
  return Date.now();
}

function refill(bucket: BucketState) {
  const now = nowMs();
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  if (elapsedSec <= 0) return;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsedSec * bucket.refillPerSec);
  bucket.lastRefill = now;
}

export interface RateLimitProfile {
  connectorId: string;
  policy: "token_bucket" | "leaky_bucket";
  perMinute: number;
  burst: number;
  concurrency: number;
  budgetPerHour?: number;
}

export async function loadRateLimitProfile(connectorId: string): Promise<RateLimitProfile> {
  const row = await prisma.integration.findUnique({ where: { id: connectorId }, select: { rateLimitPerMin: true } }).catch(() => null);
  const perMinute = (row as { rateLimitPerMin?: number } | null)?.rateLimitPerMin ?? 60;
  return {
    connectorId,
    policy: "token_bucket",
    perMinute,
    burst: Math.ceil(perMinute / 4),
    concurrency: 5,
    budgetPerHour: perMinute * 10,
  };
}

export async function consumeToken(connectorId: string, cost = 1): Promise<{ allowed: boolean; remaining: number; resetAt: string; retryAfterMs?: number }> {
  const profile = await loadRateLimitProfile(connectorId);
  const key = `rl:${connectorId}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      tokens: profile.perMinute,
      capacity: profile.perMinute + profile.burst,
      refillPerSec: profile.perMinute / 60,
      lastRefill: nowMs(),
      queue: 0,
      concurrency: 0,
      maxConcurrency: profile.concurrency,
    };
    buckets.set(key, bucket);
  }

  refill(bucket);

  // Budget-based throttling for costly APIs
  if (profile.budgetPerHour) {
    const bKey = `budget:${connectorId}`;
    let b = budgets.get(bKey);
    const windowMs = 60 * 60 * 1000;
    if (!b || nowMs() > b.resetAt) {
      b = { used: 0, budget: profile.budgetPerHour, resetAt: nowMs() + windowMs };
      budgets.set(bKey, b);
    }
    if (b.used + cost > b.budget) {
      return { allowed: false, remaining: Math.max(0, b.budget - b.used), resetAt: new Date(b.resetAt).toISOString(), retryAfterMs: b.resetAt - nowMs() };
    }
    b.used += cost;
  }

  // Burst protection + concurrency caps
  if (bucket.concurrency >= bucket.maxConcurrency) {
    return { allowed: false, remaining: Math.floor(bucket.tokens), resetAt: new Date(bucket.lastRefill + 60000).toISOString(), retryAfterMs: 250 };
  }
  if (bucket.tokens < cost) {
    const needed = cost - bucket.tokens;
    const waitSec = needed / bucket.refillPerSec;
    return { allowed: false, remaining: 0, resetAt: new Date(nowMs() + waitSec * 1000).toISOString(), retryAfterMs: Math.ceil(waitSec * 1000) };
  }

  bucket.tokens -= cost;
  bucket.concurrency += 1;
  // Decrement concurrency after short window (simulate request lifetime)
  setTimeout(() => {
    const b = buckets.get(key);
    if (b) b.concurrency = Math.max(0, b.concurrency - 1);
  }, 500);

  return { allowed: true, remaining: Math.floor(bucket.tokens), resetAt: new Date(bucket.lastRefill + 60000).toISOString() };
}

/**
 * Adaptive backoff & retries — exponential with jitter, respect Retry-After
 */
export async function withAdaptiveBackoff<T>(connectorId: string, fn: () => Promise<T>, opts?: { maxRetries?: number }): Promise<T> {
  const max = opts?.maxRetries ?? 3;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= max) {
    const { allowed, retryAfterMs } = await consumeToken(connectorId, 1);
    if (!allowed) {
      await new Promise((r) => setTimeout(r, retryAfterMs ?? 250));
      attempt++;
      continue;
    }
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const msg = (e as Error).message ?? "";
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate limit");
      if (!isRateLimit || attempt === max) throw e;
      const jitter = Math.random() * 200;
      const backoff = Math.min(8000, 250 * 2 ** attempt + jitter);
      await new Promise((r) => setTimeout(r, backoff));
      attempt++;
    }
  }
  throw lastErr;
}

/**
 * Normalized limit headers/metadata for CHAT consumers
 */
export function normalizedLimitHeaders(profile: RateLimitProfile, remaining: number, resetAt: string) {
  return {
    "X-N0VA1O-Limit": String(profile.perMinute),
    "X-N0VA1O-Remaining": String(remaining),
    "X-N0VA1O-Reset": resetAt,
    "X-N0VA1O-Policy": profile.policy,
    "Retry-After": remaining === 0 ? "1" : undefined,
  } as Record<string, string | undefined>;
}

export function resetRateLimitForTest(connectorId: string) {
  buckets.delete(`rl:${connectorId}`);
  budgets.delete(`budget:${connectorId}`);
}
