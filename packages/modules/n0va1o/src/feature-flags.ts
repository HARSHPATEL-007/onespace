/**
 * N0VA1O Tenant-Level Feature Flags — routing layer (spec §6.4).
 *
 * Experimental capabilities deployable behind tenant-scoped feature flags.
 * Flags support staged rollout, emergency disablement, and audit logging of
 * activation changes.
 */

export type RolloutStage = "off" | "canary" | "partial" | "full";

export interface FeatureFlag {
  name: string;
  description: string;
  stage: RolloutStage;
  /** Tenant IDs explicitly included (for canary/partial). */
  includeTenants: string[];
  /** Tenant IDs explicitly excluded. */
  excludeTenants: string[];
  /** Whether the flag was emergency-disabled. */
  emergencyDisabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface FlagChange {
  flagName: string;
  previousStage: RolloutStage;
  newStage: RolloutStage;
  changedAt: string;
  changedBy: string;
  reason: string;
}

export interface FlagEvaluation {
  enabled: boolean;
  flagName: string;
  reason: string;
}

/**
 * Evaluate whether a feature flag is enabled for a given tenant. Pure function.
 */
export function evaluateFlag(flag: FeatureFlag, tenantId: string): FlagEvaluation {
  if (flag.emergencyDisabled) {
    return { enabled: false, flagName: flag.name, reason: "Emergency disabled" };
  }
  if (flag.stage === "off") {
    return { enabled: false, flagName: flag.name, reason: "Flag is off" };
  }
  if (flag.excludeTenants.includes(tenantId)) {
    return { enabled: false, flagName: flag.name, reason: "Tenant explicitly excluded" };
  }
  if (flag.stage === "full") {
    return { enabled: true, flagName: flag.name, reason: "Full rollout" };
  }
  if (flag.includeTenants.includes(tenantId)) {
    return { enabled: true, flagName: flag.name, reason: `Included in ${flag.stage} rollout` };
  }
  return { enabled: false, flagName: flag.name, reason: `Not in ${flag.stage} rollout` };
}

/**
 * Transition a flag to a new rollout stage. Returns the change record for audit.
 */
export function transitionFlag(
  flag: FeatureFlag,
  newStage: RolloutStage,
  changedBy: string,
  reason: string,
): { flag: FeatureFlag; change: FlagChange } {
  const previousStage = flag.stage;
  const updated: FeatureFlag = {
    ...flag,
    stage: newStage,
    emergencyDisabled: newStage === "off" ? flag.emergencyDisabled : false,
    updatedAt: new Date().toISOString(),
    updatedBy: changedBy,
  };
  const change: FlagChange = {
    flagName: flag.name,
    previousStage,
    newStage,
    changedAt: updated.updatedAt,
    changedBy,
    reason,
  };
  return { flag: updated, change };
}

/**
 * Emergency-disable a flag. Immediately disables for all tenants regardless of
 * rollout stage. Returns the change record for audit.
 */
export function emergencyDisable(flag: FeatureFlag, changedBy: string, reason: string): { flag: FeatureFlag; change: FlagChange } {
  const previousStage = flag.stage;
  const updated: FeatureFlag = {
    ...flag,
    emergencyDisabled: true,
    updatedAt: new Date().toISOString(),
    updatedBy: changedBy,
  };
  const change: FlagChange = {
    flagName: flag.name,
    previousStage,
    newStage: "off",
    changedAt: updated.updatedAt,
    changedBy,
    reason: `EMERGENCY: ${reason}`,
  };
  return { flag: updated, change };
}
