/**
 * N0VA1O Unified Policy Engine — core platform (spec §4.1).
 *
 * Evaluates tenant policy, user intent, data sensitivity, operational risk, and
 * execution context BEFORE any tool invocation. Returns one of three outcomes:
 * ALLOW, DENY, or REQUIRE_APPROVAL. Every decision is logged with policy
 * version, matched rules, and final disposition.
 *
 * This module is intentionally pure (no Prisma, no IO) so the decision logic is
 * fully unit-testable and the gateway can call it synchronously at call time.
 */

export type PolicyOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PolicyRule {
  name: string;
  /** Higher priority rules are evaluated first. */
  priority: number;
  riskLevel: RiskLevel;
  /** Static deny: always blocks regardless of context. */
  deny?: boolean;
  /** Destructive tools require approval when true. */
  requireApproval?: boolean;
  /** Allowed action names (allowlist). Empty/undefined = no restriction. */
  allowedActions?: string[];
  /** Blocked action names (blocklist — wins over allowlist). */
  blockedActions?: string[];
  /** Only applies to these providers (undefined = all). */
  providers?: string[];
  /** Maximum risk score this rule tolerates before requiring approval. */
  maxRiskScore?: number;
}

export interface PolicyContext {
  provider: string;
  tool: string;
  actorLabel: string;
  isDestructive: boolean;
  /** Connection token state (e.g. ACTIVE, DEGRADED, FAILED). */
  tokenState: string;
  /** Whether the tool is in the integration allowlist. */
  inAllowlist: boolean;
  /** Connection health score 0..1. */
  healthScore: number;
  /** Wall-clock hour of the execution (0-23), for temporal gating. */
  hour?: number;
  /** Extra signal: number of items the operation targets (for mass-op gating). */
  targetCount?: number;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  policyVersion: string;
  matchedRules: string[];
  riskLevel: RiskLevel;
  riskScore: number;
  disposition: string;
  /** Populated when outcome is REQUIRE_APPROVAL. */
  approvalReason?: string;
}

export const POLICY_VERSION = "2026.07.1";

export const DEFAULT_POLICY: PolicyRule[] = [
  {
    name: "blocked-action",
    priority: 100,
    riskLevel: "high",
    deny: true,
    blockedActions: ["delete_account", "modify_billing", "force_push", "delete_repo", "delete_branch"],
  },
  {
    name: "connection-failed",
    priority: 95,
    riskLevel: "critical",
    deny: true,
  },
  {
    name: "connection-degraded",
    priority: 90,
    riskLevel: "high",
    requireApproval: true,
  },
  {
    name: "destructive-requires-approval",
    priority: 80,
    riskLevel: "high",
    requireApproval: true,
  },
  {
    name: "off-hours-destructive",
    priority: 60,
    riskLevel: "medium",
    requireApproval: true,
    maxRiskScore: 0,
  },
  {
    name: "mass-operation",
    priority: 70,
    riskLevel: "high",
    requireApproval: true,
    maxRiskScore: 0,
  },
  {
    name: "off-hours-any",
    priority: 60,
    riskLevel: "medium",
    requireApproval: true,
    maxRiskScore: 0,
  },
  {
    name: "off-hours-destructive",
    priority: 60,
    riskLevel: "medium",
    requireApproval: true,
    maxRiskScore: 0,
  },
  {
    name: "allow-read",
    priority: 10,
    riskLevel: "low",
    maxRiskScore: 0,
  },
];

function ruleApplies(rule: PolicyRule, ctx: PolicyContext): boolean {
  if (rule.providers && rule.providers.length > 0) {
    if (!rule.providers.includes(ctx.provider)) return false;
  }
  if (rule.blockedActions && rule.blockedActions.length > 0) {
    return rule.blockedActions.includes(ctx.tool);
  }
  if (rule.allowedActions && rule.allowedActions.length > 0) {
    return rule.allowedActions.includes(ctx.tool);
  }
  return true;
}

function computeRiskScore(ctx: PolicyContext): number {
  let score = 0;
  if (ctx.isDestructive) score += 40;
  if (!ctx.inAllowlist) score += 20;
  if (ctx.tokenState === "DEGRADED") score += 25;
  if (ctx.tokenState === "FAILED") score += 60;
  if (ctx.healthScore < 0.8) score += 15;
  if (ctx.targetCount && ctx.targetCount > 500) score += 30;
  else if (ctx.targetCount && ctx.targetCount > 50) score += 15;
  const hour = ctx.hour ?? new Date().getHours();
  if (hour < 6 || hour > 22) score += 10;
  return Math.min(100, score);
}

function scoreToRisk(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function isOffHours(hour?: number): boolean {
  const h = hour ?? new Date().getHours();
  return h < 6 || h > 22;
}

/**
 * Evaluate the policy for a single tool invocation. Pure function — no IO.
 * The caller (gateway) is responsible for persisting the decision to the audit
 * log with the returned PolicyDecision fields.
 */
export function evaluatePolicy(
  ctx: PolicyContext,
  rules: PolicyRule[] = DEFAULT_POLICY,
  policyVersion: string = POLICY_VERSION,
): PolicyDecision {
  const riskScore = computeRiskScore(ctx);
  const riskLevel = scoreToRisk(riskScore);
  const matched: string[] = [];

  // Connection hard failures always deny regardless of rules.
  if (ctx.tokenState === "FAILED" || ctx.tokenState === "REVOKED") {
    return {
      outcome: "DENY",
      policyVersion,
      matchedRules: ["connection-unavailable"],
      riskLevel: "critical",
      riskScore,
      disposition: `Denied: connection is ${ctx.tokenState}`,
    };
  }

  const ordered = [...rules].sort((a, b) => b.priority - a.priority);
  let requireApproval = false;
  let approvalReason: string | undefined;

  for (const rule of ordered) {
    if (!ruleApplies(rule, ctx)) continue;
    matched.push(rule.name);

    if (rule.deny) {
      // Connection deny rules only fire for unhealthy token states.
      if ((rule.name === "connection-failed" || rule.name === "connection-degraded") && ctx.tokenState !== "FAILED" && ctx.tokenState !== "REVOKED" && ctx.tokenState !== "DEGRADED") {
        continue;
      }
      return {
        outcome: "DENY",
        policyVersion,
        matchedRules: matched,
        riskLevel: rule.riskLevel,
        riskScore,
        disposition: `Denied by rule "${rule.name}" (risk ${riskLevel})`,
      };
    }
    if (rule.requireApproval) {
      // Connection rules only fire for non-healthy token states.
      if ((rule.name === "connection-failed" || rule.name === "connection-degraded") && ctx.tokenState !== "FAILED" && ctx.tokenState !== "REVOKED" && ctx.tokenState !== "DEGRADED") continue;
      // destructive-requires-approval only fires for destructive tools.
      if (rule.name === "destructive-requires-approval" && !ctx.isDestructive) continue;
      // mass-operation only fires for large target counts.
      if (rule.name === "mass-operation" && !(ctx.targetCount && ctx.targetCount > 50)) continue;
      // off-hours-destructive only fires for destructive tools outside business hours.
      if (rule.name === "off-hours-destructive" && (!ctx.isDestructive || !isOffHours(ctx.hour))) continue;
      // off-hours-any only fires outside business hours.
      if (rule.name === "off-hours-any" && !isOffHours(ctx.hour)) continue;
      requireApproval = true;
      approvalReason = approvalReason ?? `Rule "${rule.name}" requires approval (risk ${rule.riskLevel})`;
    }
  }

  if (requireApproval) {
    return {
      outcome: "REQUIRE_APPROVAL",
      policyVersion,
      matchedRules: matched,
      riskLevel,
      riskScore,
      disposition: approvalReason ?? `Approval required (risk ${riskLevel})`,
      approvalReason,
    };
  }

  return {
    outcome: "ALLOW",
    policyVersion,
    matchedRules: matched,
    riskLevel,
    riskScore,
    disposition: `Allowed (risk ${riskLevel}, score ${riskScore})`,
  };
}

/** Convenience: is this operation high-risk enough to warrant a human review? */
export function isHighRisk(ctx: PolicyContext): boolean {
  return computeRiskScore(ctx) >= 50;
}
