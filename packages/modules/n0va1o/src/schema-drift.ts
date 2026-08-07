/**
 * N0VA1O Adaptive Schema Drift Recovery — integration layer (spec §3.2).
 *
 * Detects breaking API and schema changes, suggests field mappings, deprecated-
 * field replacements, and connector repair steps. Auto-adapts minor drift and
 * flags high-risk changes for review.
 */

export interface FieldMapping {
  from: string;
  to: string;
  reason: string;
  safe: boolean;
}

export interface DriftReport {
  provider: string;
  detectedAt: string;
  breaking: boolean;
  changes: SchemaChange[];
  suggestedMappings: FieldMapping[];
  autoAdaptable: boolean;
  requiresReview: boolean;
}

export interface SchemaChange {
  type: "removed" | "added" | "typeChanged" | "deprecated" | "renamed";
  field: string;
  details: string;
}

/**
 * Detect drift between a known schema (expected) and the latest observed
 * schema. Returns a report with changes, suggested mappings, and whether the
 * drift can be auto-adapted.
 */
export function detectSchemaDrift(opts: {
  provider: string;
  expectedFields: string[];
  observedFields: string[];
  renamedPairs?: { from: string; to: string }[];
  deprecatedFields?: string[];
}): DriftReport {
  const { expectedFields, observedFields } = opts;
  const expectedSet = new Set(expectedFields);
  const observedSet = new Set(observedFields);
  const changes: SchemaChange[] = [];
  const mappings: FieldMapping[] = [];

  // Removed fields: expected but not observed.
  for (const f of expectedFields) {
    if (!observedSet.has(f)) {
      const rename = opts.renamedPairs?.find((r) => r.from === f);
      if (rename) {
        changes.push({ type: "renamed", field: f, details: `Renamed to "${rename.to}"` });
        mappings.push({ from: f, to: rename.to, reason: "Detected rename", safe: true });
      } else {
        changes.push({ type: "removed", field: f, details: `Field "${f}" no longer present` });
        mappings.push({ from: f, to: "", reason: "Field removed — manual review needed", safe: false });
      }
    }
  }

  // Added fields: observed but not expected.
  for (const f of observedFields) {
    if (!expectedSet.has(f)) {
      changes.push({ type: "added", field: f, details: `New field "${f}" detected` });
    }
  }

  // Deprecated fields.
  for (const f of opts.deprecatedFields ?? []) {
    if (observedSet.has(f)) {
      changes.push({ type: "deprecated", field: f, details: `Field "${f}" is deprecated` });
      mappings.push({ from: f, to: "", reason: "Deprecated — replace before removal", safe: false });
    }
  }

  const breaking = changes.some((c) => c.type === "removed" || c.type === "typeChanged");
  const autoAdaptable = !breaking && mappings.every((m) => m.safe);

  return {
    provider: opts.provider,
    detectedAt: new Date().toISOString(),
    breaking,
    changes,
    suggestedMappings: mappings,
    autoAdaptable,
    requiresReview: breaking || !autoAdaptable,
  };
}

/**
 * Apply safe (auto-adaptable) mappings to a record, renaming fields in place.
 * Returns a new record with safe mappings applied and a list of applied changes.
 */
export function applySafeMappings<T extends Record<string, unknown>>(
  record: T,
  mappings: FieldMapping[],
): { result: Record<string, unknown>; applied: string[] } {
  const out: Record<string, unknown> = {};
  const applied: string[] = [];
  const safeByName = new Map(mappings.filter((m) => m.safe).map((m) => [m.from, m.to]));

  for (const [key, value] of Object.entries(record)) {
    const target = safeByName.get(key);
    if (target) {
      out[target] = value;
      applied.push(`${key} -> ${target}`);
    } else {
      out[key] = value;
    }
  }
  return { result: out, applied };
}
