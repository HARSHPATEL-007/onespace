import { prisma } from "@n0va/db";
import type { ChatDeliveryPolicy as DbPolicy } from "@n0va/db";
import type { DeliveryPolicy, DeliveryTarget, PolicyChannelKind } from "./types";
import { LATENCY_BANDS } from "./types";

/**
 * Spec §1/§6/§7 — per-channel delivery semantics matrix.
 *
 * Built-in defaults keyed by channel kind × target. Workspace overrides
 * (ChatDeliveryPolicy rows) are layered on top; resolution falls back to
 * the built-in matrix, and the matrix itself falls back to a sane default.
 */

export interface BuiltinPolicySpec {
  channelKind: PolicyChannelKind;
  target: DeliveryTarget;
  deliverySemantic: DeliveryPolicy["deliverySemantic"];
  latencyTargetMs: number;
  priority: number;
  retryMaxAttempts: number;
  retryBackoff: DeliveryPolicy["retry"]["backoff"];
  retryMaxDurationSec: number;
  breakerEnabled: boolean;
  breakerFailureThreshold: number;
  breakerCooldownSec: number;
  quotaEnabled: boolean;
  tenantDailyLimit: number;
  tenantHourlyLimit: number;
  burstLimit: number;
}

export const BUILTIN_MATRIX: BuiltinPolicySpec[] = [
  // Presence / telemetry — at-most-once, best effort, ultra low latency.
  { channelKind: "ALL", target: "telemetry", deliverySemantic: "AT_MOST_ONCE", latencyTargetMs: LATENCY_BANDS.presence, priority: 0, retryMaxAttempts: 1, retryBackoff: "FIXED", retryMaxDurationSec: 5, breakerEnabled: false, breakerFailureThreshold: 0.8, breakerCooldownSec: 30, quotaEnabled: false, tenantDailyLimit: 1000000, tenantHourlyLimit: 200000, burstLimit: 1000 },

  // Chat messages — at-least-once, low single-digit seconds, dedup visible.
  { channelKind: "CHANNEL", target: "chat", deliverySemantic: "AT_LEAST_ONCE", latencyTargetMs: LATENCY_BANDS.chat, priority: 2, retryMaxAttempts: 5, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 300, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 60, quotaEnabled: true, tenantDailyLimit: 10000, tenantHourlyLimit: 2000, burstLimit: 50 },
  { channelKind: "DM", target: "chat", deliverySemantic: "AT_LEAST_ONCE", latencyTargetMs: LATENCY_BANDS.chat, priority: 2, retryMaxAttempts: 5, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 300, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 60, quotaEnabled: true, tenantDailyLimit: 10000, tenantHourlyLimit: 2000, burstLimit: 50 },
  // Announcements — durable, longer retry budget.
  { channelKind: "ANNOUNCEMENT", target: "chat", deliverySemantic: "AT_LEAST_ONCE", latencyTargetMs: 5000, priority: 3, retryMaxAttempts: 8, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 600, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 60, quotaEnabled: true, tenantDailyLimit: 5000, tenantHourlyLimit: 1000, burstLimit: 25 },

  // Notifications / mentions — high priority, shorter retry budget.
  { channelKind: "ALL", target: "notifications", deliverySemantic: "AT_LEAST_ONCE", latencyTargetMs: LATENCY_BANDS.notifications, priority: 4, retryMaxAttempts: 5, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 180, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 60, quotaEnabled: true, tenantDailyLimit: 20000, tenantHourlyLimit: 4000, burstLimit: 100 },

  // Approvals / finance — effectively-once, idempotent, durable, long budget.
  { channelKind: "ALL", target: "approvals", deliverySemantic: "EFFECTIVELY_ONCE", latencyTargetMs: LATENCY_BANDS.approvals, priority: 5, retryMaxAttempts: 8, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 600, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 60, quotaEnabled: true, tenantDailyLimit: 5000, tenantHourlyLimit: 1000, burstLimit: 25 },

  // Broker-internal projections — effectively-once via dedup + outbox/inbox.
  { channelKind: "ALL", target: "broker", deliverySemantic: "EFFECTIVELY_ONCE", latencyTargetMs: LATENCY_BANDS.broker, priority: 1, retryMaxAttempts: 10, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 900, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 120, quotaEnabled: false, tenantDailyLimit: 0, tenantHourlyLimit: 0, burstLimit: 0 },

  // Voice / media / control — bounded loss, constrained rate, low latency.
  { channelKind: "ALL", target: "voice", deliverySemantic: "BOUNDED_LOSS", latencyTargetMs: LATENCY_BANDS.voice, priority: 5, retryMaxAttempts: 2, retryBackoff: "FIXED", retryMaxDurationSec: 10, breakerEnabled: true, breakerFailureThreshold: 0.7, breakerCooldownSec: 30, quotaEnabled: true, tenantDailyLimit: 50000, tenantHourlyLimit: 10000, burstLimit: 200 },
  { channelKind: "ALL", target: "media", deliverySemantic: "BOUNDED_LOSS", latencyTargetMs: LATENCY_BANDS.media, priority: 5, retryMaxAttempts: 2, retryBackoff: "FIXED", retryMaxDurationSec: 10, breakerEnabled: true, breakerFailureThreshold: 0.7, breakerCooldownSec: 30, quotaEnabled: true, tenantDailyLimit: 50000, tenantHourlyLimit: 10000, burstLimit: 200 },

  // Connector / external sends — effectively-once with idempotency.
  { channelKind: "ALL", target: "connector", deliverySemantic: "EFFECTIVELY_ONCE", latencyTargetMs: 15000, priority: 3, retryMaxAttempts: 5, retryBackoff: "EXPONENTIAL_JITTER", retryMaxDurationSec: 300, breakerEnabled: true, breakerFailureThreshold: 0.5, breakerCooldownSec: 60, quotaEnabled: true, tenantDailyLimit: 5000, tenantHourlyLimit: 1000, burstLimit: 25 },
];

const MATRIX_INDEX = new Map<string, BuiltinPolicySpec>();
for (const spec of BUILTIN_MATRIX) {
  MATRIX_INDEX.set(`${spec.channelKind}:${spec.target}`, spec);
}

/** Per-workspace fallback default when nothing matches. */
export const DEFAULT_POLICY: DeliveryPolicy = {
  channelKind: "ALL",
  target: "chat",
  deliverySemantic: "AT_LEAST_ONCE",
  latencyTargetMs: 5000,
  priority: 0,
  retry: { maxAttempts: 5, backoff: "EXPONENTIAL_JITTER", maxDurationSec: 300 },
  circuitBreaker: { enabled: true, failureThreshold: 0.5, windowMs: 60_000, cooldownSec: 60, halfOpenProbes: 1 },
  quota: { enabled: true, tenantDailyLimit: 10_000, tenantHourlyLimit: 2_000, burstLimit: 50, budgetCost: 1 },
  active: true,
};

export function toDeliveryPolicy(spec: BuiltinPolicySpec): DeliveryPolicy {
  return {
    channelKind: spec.channelKind,
    target: spec.target,
    deliverySemantic: spec.deliverySemantic,
    latencyTargetMs: spec.latencyTargetMs,
    priority: spec.priority,
    retry: { maxAttempts: spec.retryMaxAttempts, backoff: spec.retryBackoff, maxDurationSec: spec.retryMaxDurationSec },
    circuitBreaker: {
      enabled: spec.breakerEnabled,
      failureThreshold: spec.breakerFailureThreshold,
      windowMs: 60_000,
      cooldownSec: spec.breakerCooldownSec,
      halfOpenProbes: 1,
    },
    quota: {
      enabled: spec.quotaEnabled,
      tenantDailyLimit: spec.tenantDailyLimit,
      tenantHourlyLimit: spec.tenantHourlyLimit,
      burstLimit: spec.burstLimit,
      budgetCost: 1,
    },
    active: true,
  };
}

export function dbPolicyToPolicy(row: DbPolicy): DeliveryPolicy {
  return {
    channelKind: row.channelKind,
    target: row.target,
    deliverySemantic: row.deliverySemantic,
    latencyTargetMs: row.latencyTargetMs,
    priority: row.priority,
    retry: { maxAttempts: row.retryMaxAttempts, backoff: row.retryBackoff as DeliveryPolicy["retry"]["backoff"], maxDurationSec: row.retryMaxDurationSec },
    circuitBreaker: {
      enabled: row.breakerEnabled,
      failureThreshold: row.breakerFailureThreshold,
      windowMs: row.breakerWindowMs,
      cooldownSec: row.breakerCooldownSec,
      halfOpenProbes: row.breakerHalfOpenProbes,
    },
    quota: {
      enabled: row.quotaEnabled,
      tenantDailyLimit: row.quotaTenantDailyLimit,
      tenantHourlyLimit: row.quotaTenantHourlyLimit,
      burstLimit: row.quotaBurstLimit,
      budgetCost: row.quotaBudgetCost,
    },
    active: row.active,
  };
}

/** Resolve the effective policy for a workspace + channel kind + target. */
export async function resolvePolicy(
  workspaceId: string,
  channelKind: PolicyChannelKind,
  target: DeliveryTarget,
): Promise<DeliveryPolicy> {
  const override = await prisma.chatDeliveryPolicy.findUnique({
    where: { workspaceId_channelKind_target: { workspaceId, channelKind, target } },
  });
  if (override && override.active) return dbPolicyToPolicy(override);

  const builtin = MATRIX_INDEX.get(`${channelKind}:${target}`) ?? MATRIX_INDEX.get(`ALL:${target}`);
  if (builtin) return toDeliveryPolicy(builtin);
  return { ...DEFAULT_POLICY, channelKind, target };
}

// ── Admin CRUD ────────────────────────────────────────────────────────────────

export type PolicyPatch = Partial<Pick<DbPolicy, "deliverySemantic" | "latencyTargetMs" | "priority" | "retryMaxAttempts" | "retryBackoff" | "retryMaxDurationSec" | "breakerEnabled" | "breakerFailureThreshold" | "breakerWindowMs" | "breakerCooldownSec" | "breakerHalfOpenProbes" | "quotaEnabled" | "quotaTenantDailyLimit" | "quotaTenantHourlyLimit" | "quotaBurstLimit" | "quotaBudgetCost" | "active">>;

export async function listPolicies(workspaceId: string) {
  const rows = await prisma.chatDeliveryPolicy.findMany({ where: { workspaceId }, orderBy: [{ channelKind: "asc" }, { target: "asc" }] });
  return rows.map((r) => dbPolicyToPolicy(r));
}

export async function upsertPolicy(workspaceId: string, channelKind: PolicyChannelKind, target: DeliveryTarget, patch: PolicyPatch) {
  const existing = await prisma.chatDeliveryPolicy.findUnique({
    where: { workspaceId_channelKind_target: { workspaceId, channelKind, target } },
  });
  return prisma.chatDeliveryPolicy.upsert({
    where: { workspaceId_channelKind_target: { workspaceId, channelKind, target } },
    create: { workspaceId, channelKind, target, ...patch },
    update: { ...patch },
  });
}

export async function deletePolicy(workspaceId: string, channelKind: PolicyChannelKind, target: DeliveryTarget) {
  await prisma.chatDeliveryPolicy.deleteMany({ where: { workspaceId, channelKind, target } });
}

/** Reset a workspace to the built-in matrix by removing all overrides. */
export async function resetPolicies(workspaceId: string) {
  await prisma.chatDeliveryPolicy.deleteMany({ where: { workspaceId } });
}

export function matrixRows(): Array<{ channelKind: string; target: string; policy: DeliveryPolicy }> {
  return BUILTIN_MATRIX.map((spec) => ({ channelKind: spec.channelKind, target: spec.target, policy: toDeliveryPolicy(spec) }));
}