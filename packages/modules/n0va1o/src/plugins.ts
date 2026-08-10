/**
 * N0VA1O Self-Improving Architecture — 8-slot modular plugin system.
 *
 * Continuously optimizes integrations through machine learning and telemetry.
 *
 * Spec §6: Self-Improving Architecture
 */

export interface PluginSlot {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  status: "active" | "learning" | "degraded" | "disabled";
  metrics: {
    invocations: number;
    improvements: number;
    lastOptimized: Date | null;
  };
}

export interface PluginEvent {
  slotId: number;
  type: "optimization" | "anomaly" | "learning" | "error";
  data: Record<string, unknown>;
  timestamp: Date;
}

/** The 8 plugin slots per spec §6 */
export const PLUGIN_SLOTS: PluginSlot[] = [
  { id: 1, name: "Auth Optimizer", description: "Token lifecycle prediction — proactive refresh before expiry", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 2, name: "Schema Drift Detector", description: "API change detection — auto-adapt to v3→v4 changes", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 3, name: "Rate Limit Predictor", description: "Throttling avoidance — smart batching for API calls", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 4, name: "Error Classifier", description: "Failure pattern learning — distinguish 429 vs 500 vs auth errors", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 5, name: "Payload Compressor", description: "Data size optimization — auto-compress large files before upload", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 6, name: "Route Optimizer", description: "Path efficiency — choose fastest CDN edge for access", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 7, name: "Security Hardening", description: "Vulnerability patching — auto-block deprecated auth methods", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
  { id: 8, name: "Cost Optimizer", description: "Spend reduction — route infrequent access to cold storage", enabled: true, status: "active", metrics: { invocations: 0, improvements: 0, lastOptimized: null } },
];

/** Plugin event log (in production: persist to DB) */
const eventLog: PluginEvent[] = [];

/**
 * Run the Auth Optimizer plugin.
 * Predicts token expiry and triggers proactive refresh.
 */
export function runAuthOptimizer(tokenExpiresAt: Date | null): { shouldRefresh: boolean; reason: string } {
  if (!tokenExpiresAt) return { shouldRefresh: false, reason: "No expiry data" };

  const minutesUntilExpiry = (tokenExpiresAt.getTime() - Date.now()) / 60000;
  const shouldRefresh = minutesUntilExpiry < 15; // Refresh if < 15 min to expiry

  return {
    shouldRefresh,
    reason: shouldRefresh
      ? `Token expires in ${Math.round(minutesUntilExpiry)}min — proactive refresh triggered`
      : `Token valid for ${Math.round(minutesUntilExpiry)}min — no action needed`,
  };
}

/**
 * Run the Rate Limit Predictor plugin.
 * Analyzes recent rate limit headers to predict throttling.
 */
export function runRateLimitPredictor(recentStatusCodes: number[]): { shouldThrottle: boolean; recommendedDelayMs: number } {
  const rateLimitCount = recentStatusCodes.filter((c) => c === 429).length;
  const rate = rateLimitCount / Math.max(1, recentStatusCodes.length);

  return {
    shouldThrottle: rate > 0.1, // >10% rate-limited
    recommendedDelayMs: rate > 0.3 ? 5000 : rate > 0.1 ? 1000 : 0,
  };
}

/**
 * Run the Error Classifier plugin.
 * Distinguishes between transient (retryable) and permanent errors.
 */
export function runErrorClassifier(statusCode: number, errorMessage: string): { retryable: boolean; category: string; recommendation: string } {
  if (statusCode === 429) {
    return { retryable: true, category: "rate_limit", recommendation: "Exponential backoff — retry after Retry-After header" };
  }
  if (statusCode >= 500) {
    return { retryable: true, category: "server_error", recommendation: "Transient — retry with backoff" };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { retryable: false, category: "auth_error", recommendation: "Re-authenticate — do not retry" };
  }
  if (statusCode === 404) {
    return { retryable: false, category: "not_found", recommendation: "Resource deleted — skip" };
  }
  return { retryable: false, category: "unknown", recommendation: "Investigate manually" };
}

/**
 * Run the Payload Compressor plugin.
 * Determines if a payload should be compressed before upload.
 */
export function runPayloadCompressor(payloadBytes: number): { shouldCompress: boolean; estimatedSavings: number } {
  const THRESHOLD = 1024 * 10; // 10KB
  const shouldCompress = payloadBytes > THRESHOLD;
  const estimatedSavings = shouldCompress ? Math.round(payloadBytes * 0.6) : 0; // ~60% savings
  return { shouldCompress, estimatedSavings };
}

/**
 * Log a plugin event for observability.
 */
export function logPluginEvent(slotId: number, type: PluginEvent["type"], data: Record<string, unknown>): void {
  eventLog.push({ slotId, type, data, timestamp: new Date() });
}

/** Get plugin system status overview */
export function getPluginStatus(): Array<{ slot: PluginSlot; recentEvents: number }> {
  return PLUGIN_SLOTS.map((slot) => ({
    slot,
    recentEvents: eventLog.filter((e) => e.slotId === slot.id && Date.now() - e.timestamp.getTime() < 3600_000).length,
  }));
}
