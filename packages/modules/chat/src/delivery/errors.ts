/**
 * Spec §2 — retryable error taxonomy.
 *
 * Errors are classified so the delivery engine can decide:
 *  - retry with backoff (transient, quota-deferred, breaker)
 *  - fail immediately (malformed, unauthorized)
 *  - fail permanently (non-retryable 4xx/5xx terminal conditions)
 */

export type ErrorClass =
  | "TRANSIENT"
  | "PERMANENT"
  | "MALFORMED"
  | "UNAUTHORIZED"
  | "QUOTA_DEFERRED"
  | "QUOTA_EXCEEDED"
  | "BREAKER_OPEN"
  | "TIMEOUT";

export class DeliveryError extends Error {
  readonly cls: ErrorClass;
  readonly retryAfterMs?: number;
  readonly reasonCode?: string;

  constructor(cls: ErrorClass, message: string, opts?: { retryAfterMs?: number; reasonCode?: string; cause?: unknown }) {
    super(message, { cause: opts?.cause });
    this.name = "DeliveryError";
    this.cls = cls;
    this.retryAfterMs = opts?.retryAfterMs;
    this.reasonCode = opts?.reasonCode;
  }

  static transient(message: string, opts?: { retryAfterMs?: number }) {
    return new DeliveryError("TRANSIENT", message, opts);
  }
  static permanent(message: string, opts?: { reasonCode?: string }) {
    return new DeliveryError("PERMANENT", message, opts);
  }
  static malformed(message: string) {
    return new DeliveryError("MALFORMED", message);
  }
  static unauthorized(message: string) {
    return new DeliveryError("UNAUTHORIZED", message);
  }
  static quotaDeferred(message: string, opts?: { retryAfterMs?: number }) {
    return new DeliveryError("QUOTA_DEFERRED", message, opts);
  }
  static quotaExceeded(message: string, opts?: { retryAfterMs?: number }) {
    return new DeliveryError("QUOTA_EXCEEDED", message, opts);
  }
  static breakerOpen(message: string) {
    return new DeliveryError("BREAKER_OPEN", message);
  }
  static timeout(message: string) {
    return new DeliveryError("TIMEOUT", message);
  }
}

export function classifyError(err: unknown): DeliveryError {
  if (err instanceof DeliveryError) return err;
  const e = err instanceof Error ? err : new Error(String(err));
  const msg = e.message ?? String(e);

  if (msg.includes("CHAT_00") || /malformed|invalid payload|schema validation/i.test(msg)) {
    return DeliveryError.malformed(msg);
  }
  if (/unauthorized|forbidden|403|401|credential|token.*invalid|permission/i.test(msg)) {
    return DeliveryError.unauthorized(msg);
  }
  if (/quota|rate limit|429|too many/i.test(msg)) {
    return DeliveryError.quotaExceeded(msg);
  }
  if (/timeout|timed?out|ETIMEDOUT|deadline/i.test(msg)) {
    return DeliveryError.timeout(msg);
  }
  // 5xx + network = transient
  return DeliveryError.transient(msg);
}

/** Returns true when an error should never be retried. */
export function isPermanent(err: unknown): boolean {
  const c = classifyError(err).cls;
  return c === "PERMANENT" || c === "MALFORMED" || c === "UNAUTHORIZED" || c === "QUOTA_EXCEEDED";
}

/** Extract Retry-After if the error carries one (seconds, or HTTP-date). */
export function retryAfterMsFrom(err: unknown, fallbackMs?: number): number | undefined {
  if (err instanceof DeliveryError && err.retryAfterMs != null) return err.retryAfterMs;
  if (err instanceof Error) {
    const m = /retry.?after[:\s]*(\d+)/i.exec(err.message);
    if (m) return Number(m[1]) * 1000;
  }
  return fallbackMs;
}