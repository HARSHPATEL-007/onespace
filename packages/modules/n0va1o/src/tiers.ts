/**
 * N0VA1O Tier-Aware Feature Gating — product & monetization (spec §7.2).
 *
 * Feature availability is mapped to subscription tier. The UI and API
 * communicate what is included, restricted, or requires an add-on.
 */

export type Tier = "free" | "growth" | "pro" | "enterprise" | "transcendent";

export interface TierLimit {
  apiCallsPerDay: number;
  concurrentAgents: number;
  sandboxMinutes: number;
  maxAccounts: number;
  features: string[];
}

export const TIER_LIMITS: Record<Tier, TierLimit> = {
  free: { apiCallsPerDay: 100, concurrentAgents: 1, sandboxMinutes: 5, maxAccounts: 3, features: ["basic_integrations", "stdio_transport"] },
  growth: { apiCallsPerDay: 10_000, concurrentAgents: 10, sandboxMinutes: 10, maxAccounts: 25, features: ["basic_integrations", "all_transports", "webhook_triggers", "recipe_compile"] },
  pro: { apiCallsPerDay: 100_000, concurrentAgents: 50, sandboxMinutes: 60, maxAccounts: 100, features: ["all_integrations", "all_transports", "webhook_triggers", "recipe_compile", "policy_engine", "multi_account"] },
  enterprise: { apiCallsPerDay: 1_000_000, concurrentAgents: 500, sandboxMinutes: 240, maxAccounts: Number.POSITIVE_INFINITY, features: ["all_integrations", "all_transports", "webhook_triggers", "recipe_compile", "policy_engine", "multi_account", "sso", "audit_log"] },
  transcendent: { apiCallsPerDay: Number.POSITIVE_INFINITY, concurrentAgents: Number.POSITIVE_INFINITY, sandboxMinutes: Number.POSITIVE_INFINITY, maxAccounts: Number.POSITIVE_INFINITY, features: ["all"] },
};

export interface FeatureStatus {
  feature: string;
  included: boolean;
  restricted: boolean;
  requiresAddOn: string | null;
}

/**
 * Check whether a feature is available for a given tier. Returns a clear
 * status that the UI/API can communicate to the operator.
 */
export function checkFeature(tier: Tier, feature: string): FeatureStatus {
  const limit = TIER_LIMITS[tier];
  const included = limit.features.includes("all") || limit.features.includes(feature);
  return {
    feature,
    included,
    restricted: !included,
    requiresAddOn: included ? null : suggestAddOn(feature),
  };
}

function suggestAddOn(feature: string): string | null {
  const addOnMap: Record<string, string> = {
    sso: "enterprise_plan",
    audit_log: "enterprise_plan",
    multi_account: "multi_account_pack",
    recipe_compile: "recipe_compilation_addon",
  };
  return addOnMap[feature] ?? "contact_sales";
}

/** Whether a usage amount is within the tier's quota. */
export function withinQuota(tier: Tier, metric: "apiCallsPerDay" | "concurrentAgents" | "sandboxMinutes" | "maxAccounts", value: number): boolean {
  const limit = TIER_LIMITS[tier][metric];
  return value <= limit;
}

/** The next tier up, or null if already at the top. */
export function nextTier(tier: Tier): Tier | null {
  const order: Tier[] = ["free", "growth", "pro", "enterprise", "transcendent"];
  const idx = order.indexOf(tier);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1]! : null;
}
