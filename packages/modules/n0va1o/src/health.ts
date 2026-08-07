/**
 * N0VA1O Connector Health Scoring — integration layer (spec §3.1).
 *
 * Derives a live health score (0..1) from latency, error rate, authentication
 * freshness, schema drift, rate-limit pressure, and recent retries. The score
 * influences routing, retry strategy, and fallback selection.
 */

export interface HealthSignals {
  /** Average latency in ms over the recent window. */
  avgLatencyMs: number;
  /** Error rate 0..1 over the recent window. */
  errorRate: number;
  /** 1 = fresh auth, 0 = expired/revoked. */
  authFreshness: number;
  /** Number of schema drift events detected recently. */
  schemaDriftCount: number;
  /** Rate-limit pressure 0..1 (1 = throttled). */
  rateLimitPressure: number;
  /** Number of retries in the recent window. */
  retryCount: number;
  /** Total observations in the window (for confidence). */
  totalCalls: number;
}

export interface HealthScore {
  score: number;
  grade: "healthy" | "degraded" | "unhealthy" | "failing";
  factors: { name: string; weight: number; contribution: number }[];
  confidence: number;
  recommendation: string;
}

const DEFAULT_WEIGHTS = {
  latency: 0.2,
  errorRate: 0.3,
  authFreshness: 0.2,
  schemaDrift: 0.1,
  rateLimit: 0.1,
  retries: 0.1,
};

/** Compute a health score from raw signals. Pure function. */
export function computeHealthScore(signals: HealthSignals): HealthScore {
  const w = DEFAULT_WEIGHTS;

  // Latency factor: 0ms -> 1.0, >= 5000ms -> 0.0.
  const latencyScore = clamp01(1 - signals.avgLatencyMs / 5000);
  // Error rate: directly penalizes.
  const errorScore = clamp01(1 - signals.errorRate);
  // Auth freshness: pass through.
  const authScore = clamp01(signals.authFreshness);
  // Schema drift: each drift event costs 0.2, floor at 0.
  const driftScore = clamp01(1 - signals.schemaDriftCount * 0.2);
  // Rate-limit pressure: directly penalizes.
  const rateScore = clamp01(1 - signals.rateLimitPressure);
  // Retries: each retry costs 0.1, floor at 0.
  const retryScore = clamp01(1 - signals.retryCount * 0.1);

  const weighted =
    latencyScore * w.latency +
    errorScore * w.errorRate +
    authScore * w.authFreshness +
    driftScore * w.schemaDrift +
    rateScore * w.rateLimit +
    retryScore * w.retries;

  const score = clamp01(weighted);
  const grade = scoreToGrade(score);
  const confidence = clamp01(Math.min(1, signals.totalCalls / 50));

  const factors = [
    { name: "latency", weight: w.latency, contribution: latencyScore * w.latency },
    { name: "errorRate", weight: w.errorRate, contribution: errorScore * w.errorRate },
    { name: "authFreshness", weight: w.authFreshness, contribution: authScore * w.authFreshness },
    { name: "schemaDrift", weight: w.schemaDrift, contribution: driftScore * w.schemaDrift },
    { name: "rateLimit", weight: w.rateLimit, contribution: rateScore * w.rateLimit },
    { name: "retries", weight: w.retries, contribution: retryScore * w.retries },
  ];

  return {
    score: Math.round(score * 100) / 100,
    grade,
    factors,
    confidence: Math.round(confidence * 100) / 100,
    recommendation: recommend(grade, signals),
  };
}

function scoreToGrade(score: number): HealthScore["grade"] {
  if (score >= 0.8) return "healthy";
  if (score >= 0.5) return "degraded";
  if (score >= 0.2) return "unhealthy";
  return "failing";
}

function recommend(grade: HealthScore["grade"], signals: HealthSignals): string {
  if (grade === "healthy") return "Operating normally.";
  if (signals.errorRate > 0.5) return "High error rate — investigate provider status and credentials.";
  if (signals.authFreshness < 0.3) return "Authentication stale — rotate or refresh credentials.";
  if (signals.rateLimitPressure > 0.7) return "Rate limit pressure high — reduce call frequency or upgrade quota.";
  if (signals.schemaDriftCount > 2) return "Multiple schema drifts detected — review and remap fields.";
  if (signals.avgLatencyMs > 3000) return "Elevated latency — consider fallback connector.";
  return "Degraded — monitor closely.";
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
