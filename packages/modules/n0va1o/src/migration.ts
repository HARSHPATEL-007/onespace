/**
 * N0VA1O Migration Assistance — product & monetization (spec §7.4).
 *
 * Provides migration tooling for legacy integrations, including connector
 * mapping, cutover planning, effort estimation, and post-migration validation.
 */

export interface LegacyConnector {
  name: string;
  provider: string;
  toolCount: number;
  authType: string;
}

export interface MigrationMapping {
  legacy: string;
  target: string;
  compatibility: "direct" | "adapted" | "manual";
  notes: string;
}

export interface MigrationPlan {
  planId: string;
  sourceSystem: string;
  mappings: MigrationMapping[];
  totalSteps: number;
  estimatedEffortHours: number;
  riskLevel: "low" | "medium" | "high";
  cutoverSteps: string[];
}

export interface ValidationResult {
  mapping: string;
  passed: boolean;
  details: string;
}

/**
 * Map legacy connectors to N0VA1O equivalents. Detects direct matches,
 * adaptations, and manual migrations needed.
 */
export function mapLegacyConnectors(legacy: LegacyConnector[]): MigrationMapping[] {
  return legacy.map((conn) => {
    const known = KNOWN_MAPPINGS[conn.provider];
    if (known) {
      return { legacy: conn.name, target: known, compatibility: "direct", notes: "Direct mapping available" };
    }
    if (conn.authType === "oauth2" || conn.authType === "api-key") {
      return { legacy: conn.name, target: `custom_${conn.provider}`, compatibility: "adapted", notes: "Auth-compatible — adapter template available" };
    }
    return { legacy: conn.name, target: `manual_${conn.provider}`, compatibility: "manual", notes: "Manual migration required — contact support" };
  });
}

const KNOWN_MAPPINGS: Record<string, string> = {
  "zendesk": "zendesk", "salesforce": "salesforce", "hubspot": "hubspot",
  "slack": "slack", "github": "github", "jira": "jira", "stripe": "stripe",
};

/**
 * Build a cutover plan from connector mappings. Estimates effort and risk.
 */
export function buildMigrationPlan(sourceSystem: string, legacy: LegacyConnector[]): MigrationPlan {
  const mappings = mapLegacyConnectors(legacy);
  const manualCount = mappings.filter((m) => m.compatibility === "manual").length;
  const adaptedCount = mappings.filter((m) => m.compatibility === "adapted").length;
  const directCount = mappings.filter((m) => m.compatibility === "direct").length;

  const estimatedEffortHours = directCount * 0.5 + adaptedCount * 2 + manualCount * 4;
  const riskLevel = manualCount > 2 ? "high" : manualCount > 0 || adaptedCount > 3 ? "medium" : "low";

  const cutoverSteps = [
    `Export configuration from ${sourceSystem}`,
    "Validate connector mappings in dry-run",
    `Migrate ${directCount} direct-mapped connectors`,
    `Adapt ${adaptedCount} connectors with templates`,
    ...(manualCount > 0 ? [`Plan ${manualCount} manual migrations`] : []),
    "Run post-migration validation",
    "Cutover traffic to N0VA1O",
  ];

  return {
    planId: `mig_${Date.now().toString(32)}`,
    sourceSystem,
    mappings,
    totalSteps: cutoverSteps.length,
    estimatedEffortHours: Math.round(estimatedEffortHours * 10) / 10,
    riskLevel,
    cutoverSteps,
  };
}

/**
 * Validate a migration by checking each mapping. Pure function over results.
 */
export function validateMigration(mappingResults: { mapping: string; success: boolean; details: string }[]): ValidationResult[] {
  return mappingResults.map((r) => ({
    mapping: r.mapping,
    passed: r.success,
    details: r.details,
  }));
}
