/**
 * N0VA1O Adaptive Fine-Tuning Hooks — tenant-specific customization paths for
 * SFT, RFT, DPO, and preference optimization without rebuilding the platform.
 */

/* ---------- tenant customization paths ---------- */

export interface TenantProfile {
  tenantId: string;
  tone: string;
  terminology: Record<string, string>;
  taskFormats: Record<string, string>;
  workflowConventions: string[];
}

/**
 * Create a tenant customization profile. Pure.
 */
export function createTenantProfile(tenantId: string, overrides: Partial<Omit<TenantProfile, "tenantId">>): TenantProfile {
  return { tenantId, tone: "professional", terminology: {}, taskFormats: {}, workflowConventions: [], ...overrides };
}

/** Apply tenant terminology to a string. Pure. */
export function applyTerminology(text: string, profile: TenantProfile): string {
  let result = text;
  for (const [key, value] of Object.entries(profile.terminology)) {
    result = result.replace(new RegExp(`\\b${key}\\b`, "gi"), value);
  }
  return result;
}

/* ---------- SFT readiness ---------- */

export interface SFTExample {
  input: string;
  output: string;
  schema?: Record<string, string>;
}

export interface SFTDataset {
  tenantId: string;
  version: string;
  examples: SFTExample[];
  validationSplit: number;
  createdAt: string;
}

/**
 * Build a labeled SFT dataset with validation split and versioning. Pure.
 */
export function buildSFDDataset(tenantId: string, examples: SFTExample[], validationSplit: number = 0.2): SFTDataset {
  return { tenantId, version: `v${Date.now()}`, examples, validationSplit, createdAt: new Date().toISOString() };
}

/** Split dataset into train/validation sets. Pure. */
export function splitDataset(dataset: SFTDataset): { train: SFTExample[]; validation: SFTExample[] } {
  const splitIdx = Math.floor(dataset.examples.length * (1 - dataset.validationSplit));
  return { train: dataset.examples.slice(0, splitIdx), validation: dataset.examples.slice(splitIdx) };
}

/** Validate an output against a schema. Pure. */
export function validateSchema(output: Record<string, unknown>, schema: Record<string, string>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [field, type] of Object.entries(schema)) {
    if (!(field in output)) errors.push(`Missing field: ${field}`);
    else if (type === "number" && typeof output[field] !== "number") errors.push(`${field} must be number`);
  }
  return { valid: errors.length === 0, errors };
}

/* ---------- RFT readiness ---------- */

export interface RewardFunction {
  name: string;
  description: string;
  grader: (output: string, expected: string) => number;
}

export interface RFTCheckpoint {
  checkpointId: string;
  epoch: number;
  rewardScore: number;
  timestamp: string;
}

/**
 * Evaluate output with a custom reward function. Pure.
 */
export function gradeWithReward(fn: RewardFunction, output: string, expected: string): number {
  return Math.max(0, Math.min(1, fn.grader(output, expected)));
}

/** Create a training checkpoint. Pure. */
export function createCheckpoint(epoch: number, rewardScore: number): RFTCheckpoint {
  return { checkpointId: `ckpt_${Date.now().toString(32)}`, epoch, rewardScore, timestamp: new Date().toISOString() };
}

/* ---------- DPO and preference signals ---------- */

export interface PreferencePair {
  prompt: string;
  chosen: string;
  rejected: string;
}

export interface DPODataSet {
  tenantId: string;
  pairs: PreferencePair[];
  reviewed: boolean;
}

/**
 * Build a preference dataset. Requires human review for regulated behavior. Pure.
 */
export function buildDPODataset(tenantId: string, pairs: PreferencePair[], reviewed: boolean): DPODataSet {
  return { tenantId, pairs, reviewed };
}

/* ---------- data lifecycle ---------- */

export interface DatasetLineage {
  datasetId: string;
  sourceData: string[];
  transformations: string[];
  redacted: string[];
  version: string;
}

/**
 * Record dataset lineage from source to tuned model. Pure.
 */
export function recordLineage(datasetId: string, sourceData: string[], transformations: string[]): DatasetLineage {
  return { datasetId, sourceData, transformations, redacted: [], version: `v${Date.now()}` };
}

/** Redact sensitive data from a dataset. Pure. */
export function redactDataset<T extends { input: string }>(examples: T[], patterns: RegExp[]): { redacted: T[]; redactedCount: number } {
  let redactedCount = 0;
  const redacted = examples.map((ex) => {
    let input = ex.input;
    for (const pattern of patterns) {
      if (pattern.test(input)) { input = input.replace(pattern, "[REDACTED]"); redactedCount++; }
    }
    return { ...ex, input };
  });
  return { redacted, redactedCount };
}

/* ---------- governance ---------- */

export interface DeploymentApproval {
  modelVersion: string;
  tenantId: string;
  status: "pending" | "approved" | "rejected";
  canary: boolean;
  baseModelVersion: string;
}

/**
 * Request production deployment approval for a tuned model. Pure.
 */
export function requestDeployment(opts: { modelVersion: string; tenantId: string; baseModelVersion: string; canary?: boolean }): DeploymentApproval {
  return { ...opts, status: "pending", canary: opts.canary ?? true };
}

/* ---------- evaluation ---------- */

export interface FineTuningMetrics {
  taskAccuracy: number;
  formatCompliance: number;
  policyAdherence: number;
  regressionVsBaseline: number;
}

/**
 * Compare tuned vs baseline behavior. Blocks deployment if regressions. Pure.
 */
export function evaluateFineTuning(opts: { tunedAccuracy: number; baselineAccuracy: number; formatErrors: number; totalOutputs: number; policyViolations: number }): FineTuningMetrics & { deploySafe: boolean } {
  const formatCompliance = opts.totalOutputs > 0 ? 1 - opts.formatErrors / opts.totalOutputs : 0;
  const policyAdherence = opts.totalOutputs > 0 ? 1 - opts.policyViolations / opts.totalOutputs : 0;
  const regressionVsBaseline = opts.baselineAccuracy > 0 ? opts.tunedAccuracy / opts.baselineAccuracy : 0;
  const deploySafe = opts.tunedAccuracy >= opts.baselineAccuracy && policyAdherence >= 0.95;
  return { taskAccuracy: opts.tunedAccuracy, formatCompliance, policyAdherence, regressionVsBaseline, deploySafe };
}
