import type { DeliverySemantic, ChatDeliveryState, ChatAttemptOutcome, ChatBreakerState, ChatDLQStatus } from "@n0va/db";

export type {
  DeliverySemantic,
  ChatDeliveryState,
  ChatAttemptOutcome,
  ChatBreakerState,
  ChatDLQStatus,
};

/** Spec §12 data model — per-channel delivery policy. */
export interface DeliveryPolicy {
  channelKind: string;
  target: string;
  deliverySemantic: DeliverySemantic;
  latencyTargetMs: number;
  priority: number;
  retry: {
    maxAttempts: number;
    backoff: "FIXED" | "LINEAR" | "EXPONENTIAL" | "EXPONENTIAL_JITTER";
    maxDurationSec: number;
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    windowMs: number;
    cooldownSec: number;
    halfOpenProbes: number;
  };
  quota: {
    enabled: boolean;
    tenantDailyLimit: number;
    tenantHourlyLimit: number;
    burstLimit: number;
    budgetCost: number;
  };
  active: boolean;
}

export type DeliveryOutcome =
  | "SUCCESS"
  | "DEFERRED"
  | "RETRY"
  | "FAILED"
  | "DEDUPED";

export interface DeliveryDispatchResult {
  ok: boolean;
  targetCount: number;
  deliveredCount: number;
  retryable?: boolean;
  retryAfterMs?: number;
  reasonCode?: string;
  reason?: string;
}

/** Spec §11 user-visible states. */
export const USER_VISIBLE_STATES: ReadonlyArray<ChatDeliveryState> = [
  "PENDING",
  "SENDING",
  "QUEUED",
  "DELAYED",
  "RETRIED",
  "PARTIALLY_DELIVERED",
  "FAILED",
  "CONFIRMED",
  "CANCELLED",
];

/** Spec §1 latency bands, in ms. */
export const LATENCY_BANDS: { presence: number; chat: number; notifications: number; approvals: number; media: number; voice: number; broker: number; search: number } = {
  presence: 250,
  chat: 3000,
  notifications: 3000,
  approvals: 10_000,
  media: 100,
  voice: 100,
  broker: 60_000,
  search: 60_000,
};

export const REASON_CODES = {
  PERMANENT: "PERMANENT",
  MALFORMED: "MALFORMED",
  UNAUTHORIZED: "UNAUTHORIZED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  BREAKER: "BREAKER",
  POISON: "POISON",
} as const;

/** Channel kinds a policy can target. */
export const CHANNEL_KINDS = ["CHANNEL", "DM", "ANNOUNCEMENT", "ALL"] as const;
export type PolicyChannelKind = (typeof CHANNEL_KINDS)[number];

/** Delivery targets. */
export const TARGETS = ["chat", "notifications", "approvals", "telemetry", "media", "voice", "broker", "connector"] as const;
export type DeliveryTarget = (typeof TARGETS)[number];

/** Builder for an idempotency key: stable across retries, unique per logical action. */
export function idempotencyKeyFor(parts: Array<string | number | undefined>): string {
  const raw = ["dlv", ...parts.filter((p) => p !== undefined && p !== null && p !== "")].join(":");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/** Random short correlation id. */
export function newCorrelationId(): string {
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}