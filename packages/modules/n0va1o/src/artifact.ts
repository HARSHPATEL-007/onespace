/**
 * N0VA1O Artifact Lifecycle Management — sandbox layer (spec §5.2).
 *
 * Generated artifacts have ownership metadata, retention rules, cleanup
 * schedules, and recovery handling. Expired artifacts are automatically purged
 * unless preservation is required by audit policy.
 */

export interface Artifact {
  id: string;
  name: string;
  ownerId: string;
  workspaceId: string;
  createdAt: string;
  expiresAt: string | null;
  sizeBytes: number;
  contentType: string;
  tags: string[];
  /** Whether audit policy requires preservation past expiry. */
  preserveForAudit: boolean;
}

export interface RetentionRule {
  /** Default retention period in days. */
  defaultDays: number;
  /** Per-content-type overrides. */
  byContentType: Record<string, number>;
  /** Whether audit-preserved artifacts are exempt from cleanup. */
  auditExempt: boolean;
}

export const DEFAULT_RETENTION: RetentionRule = {
  defaultDays: 30,
  byContentType: { "application/pdf": 90, "text/csv": 60, "application/json": 14 },
  auditExempt: true,
};

export interface CleanupResult {
  purged: string[];
  preserved: string[];
  totalEvaluated: number;
}

/**
 * Evaluate artifacts against retention rules and return which should be purged
 * vs preserved. Does not delete — the caller performs the actual cleanup.
 */
export function evaluateRetention(
  artifacts: Artifact[],
  rule: RetentionRule = DEFAULT_RETENTION,
  now: Date = new Date(),
): CleanupResult {
  const purged: string[] = [];
  const preserved: string[] = [];

  for (const artifact of artifacts) {
    if (artifact.preserveForAudit && rule.auditExempt) {
      preserved.push(artifact.id);
      continue;
    }
    if (artifact.expiresAt && new Date(artifact.expiresAt).getTime() <= now.getTime()) {
      purged.push(artifact.id);
      continue;
    }
    const retentionDays = rule.byContentType[artifact.contentType] ?? rule.defaultDays;
    const ageDays = (now.getTime() - new Date(artifact.createdAt).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > retentionDays) {
      purged.push(artifact.id);
    } else {
      preserved.push(artifact.id);
    }
  }

  return { purged, preserved, totalEvaluated: artifacts.length };
}

/** Compute the expiry date for a new artifact given a retention rule. */
export function computeExpiry(createdAt: Date, contentType: string, rule: RetentionRule = DEFAULT_RETENTION): Date {
  const days = rule.byContentType[contentType] ?? rule.defaultDays;
  const expiry = new Date(createdAt);
  expiry.setUTCDate(expiry.getUTCDate() + days);
  return expiry;
}

/** Whether an artifact is currently expired. */
export function isExpired(artifact: Artifact, now: Date = new Date()): boolean {
  if (!artifact.expiresAt) return false;
  return new Date(artifact.expiresAt).getTime() <= now.getTime();
}
