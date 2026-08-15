import type { DeliveryPolicy } from "./types";
import { classifyError, isPermanent, retryAfterMsFrom } from "./errors";

/**
 * Spec §2 — adaptive, bounded, class-aware retries.
 *
 *  - exponential backoff with jitter
 *  - honor Retry-After when present
 *  - max attempts + max duration per policy (class-aware)
 *  - immediate fail for permanent / malformed / unauthorized
 */

export const DEFAULT_BACKOFF_BASE_MS = 250;
export const BACKOFF_CAP_MS = 30_000;

export function computeBackoffMs(
  policy: DeliveryPolicy,
  attempt: number, // 1-based attempt that just failed
  opts?: { retryAfterMs?: number; now?: number },
): number {
  const now = opts?.now ?? Date.now();

  // Honor Retry-After first.
  if (opts?.retryAfterMs != null && opts.retryAfterMs > 0) {
    return Math.min(opts.retryAfterMs, BACKOFF_CAP_MS);
  }

  const base = DEFAULT_BACKOFF_BASE_MS;
  const mode = policy.retry.backoff;

  let delayMs: number;
  switch (mode) {
    case "FIXED":
      delayMs = base * 2;
      break;
    case "LINEAR":
      delayMs = base * attempt;
      break;
    case "EXPONENTIAL":
      delayMs = base * Math.pow(2, attempt - 1);
      break;
    case "EXPONENTIAL_JITTER":
    default: {
      const exp = base * Math.pow(2, attempt - 1);
      const jitter = exp * 0.3 * (Math.random() - 0.5);
      delayMs = Math.max(base / 2, exp + jitter);
      break;
    }
  }

  delayMs = Math.min(delayMs, BACKOFF_CAP_MS);

  // Clamp to the policy's max retry duration from the current time.
  const maxDurationMs = policy.retry.maxDurationSec * 1000;
  if (delayMs > maxDurationMs) delayMs = maxDurationMs;
  void now;
  return Math.max(1, Math.round(delayMs));
}

/** Decide whether to schedule another attempt given the error class and attempt count. */
export function shouldRetry(policy: DeliveryPolicy, attempt: number, err: unknown): {
  retry: boolean;
  reason: string;
  retryAfterMs?: number;
} {
  if (attempt >= policy.retry.maxAttempts) {
    return { retry: false, reason: `max_attempts(${policy.retry.maxAttempts})` };
  }
  if (isPermanent(err)) {
    return { retry: false, reason: "permanent_error" };
  }
  const cls = classifyError(err).cls;
  const retryAfterMs = retryAfterMsFrom(err);
  switch (cls) {
    case "BREAKER_OPEN":
    case "QUOTA_DEFERRED":
    case "TRANSIENT":
    case "TIMEOUT":
      return { retry: true, reason: cls.toLowerCase(), retryAfterMs };
    default:
      return { retry: false, reason: cls.toLowerCase() };
  }
}

/** Final outcome code for the attempt log. */
export function outcomeForError(err: unknown): {
  outcome: "TRANSIENT" | "PERMANENT" | "MALFORMED" | "UNAUTHORIZED" | "QUOTA_DEFERRED" | "QUOTA_EXCEEDED" | "BREAKER_OPEN" | "TIMEOUT";
} {
  return { outcome: classifyError(err).cls };
}