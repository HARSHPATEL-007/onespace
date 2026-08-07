/**
 * N0VA1O Add-On Bundling Recommendations — product & monetization (spec §7.3).
 *
 * Recommends the most cost-effective upgrade path based on observed usage
 * patterns. Considers connector count, execution volume, and multi-account usage.
 */

import { Tier } from "./tiers";

export interface UsageProfile {
  connectorCount: number;
  monthlyApiCalls: number;
  monthlyExecutions: number;
  activeAccounts: number;
  currentTier: Tier;
}

export interface AddOnRecommendation {
  addOn: string;
  reason: string;
  estimatedMonthlySavings: number;
  priority: "high" | "medium" | "low";
}

export interface UpgradeRecommendation {
  recommendedTier: Tier;
  reasons: string[];
  addOns: AddOnRecommendation[];
  monthlyEstimate: number;
}

const TIER_PRICING: Record<Tier, number> = { free: 0, growth: 99, pro: 499, enterprise: 2499, transcendent: 9999 };

/**
 * Recommend the most cost-effective upgrade path from observed usage. Pure
 * function over a usage profile.
 */
export function recommendUpgrade(profile: UsageProfile): UpgradeRecommendation {
  const reasons: string[] = [];
  const addOns: AddOnRecommendation[] = [];

  // Determine minimum tier from volume.
  let recommendedTier: Tier = profile.currentTier;
  if (profile.monthlyApiCalls > 100_000 || profile.activeAccounts > 100) {
    recommendedTier = "enterprise";
    reasons.push("API volume or account count exceeds Pro limits");
  } else if (profile.monthlyApiCalls > 10_000 || profile.activeAccounts > 25) {
    recommendedTier = "pro";
    reasons.push("API volume or account count exceeds Growth limits");
  } else if (profile.monthlyApiCalls > 100) {
    recommendedTier = "growth";
    reasons.push("API volume exceeds Free tier");
  }

  // Multi-account pack recommendation.
  if (profile.activeAccounts > TIER_LIMIT_ACCOUNTS(profile.currentTier)) {
    addOns.push({ addOn: "multi_account_pack", reason: "Active accounts exceed tier limit", estimatedMonthlySavings: 50, priority: "high" });
  }

  // Recipe compilation add-on.
  if (profile.monthlyExecutions > 1000 && profile.currentTier === "growth") {
    addOns.push({ addOn: "recipe_compilation_addon", reason: "High recipe execution volume", estimatedMonthlySavings: 100, priority: "medium" });
  }

  // Extra API calls add-on.
  if (profile.monthlyApiCalls > 50_000 && recommendedTier === profile.currentTier) {
    addOns.push({ addOn: "extra_api_calls_100k", reason: "Approaching API quota", estimatedMonthlySavings: 75, priority: "medium" });
  }

  if (reasons.length === 0 && addOns.length === 0) {
    reasons.push("Current tier meets usage needs");
  }

  return {
    recommendedTier,
    reasons,
    addOns,
    monthlyEstimate: TIER_PRICING[recommendedTier],
  };
}

function TIER_LIMIT_ACCOUNTS(tier: Tier): number {
  const limits: Record<Tier, number> = { free: 3, growth: 25, pro: 100, enterprise: Number.POSITIVE_INFINITY, transcendent: Number.POSITIVE_INFINITY };
  return limits[tier];
}
