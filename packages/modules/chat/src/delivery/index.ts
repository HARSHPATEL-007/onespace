export { DeliveryEngine, registerBackend, getDeliveryEngine, hasBackend, setConcurrencyCap, concurrencyState, DEFAULT_CONCURRENCY_CAP, type DispatchContext, type BackendFn, type DeliverInput } from "./engine";
export { startDeliverySweep, QUEUE_DEPTH_ALARM_THRESHOLD } from "./sweep";
export {
  BUILTIN_MATRIX, DEFAULT_POLICY, resolvePolicy, listPolicies, upsertPolicy, deletePolicy, resetPolicies, matrixRows, toDeliveryPolicy,
  type PolicyPatch,
} from "./policy";
export { computeBackoffMs, shouldRetry, DEFAULT_BACKOFF_BASE_MS, BACKOFF_CAP_MS } from "./retry";
export { DeliveryError, classifyError, isPermanent, retryAfterMsFrom, type ErrorClass } from "./errors";
export { checkBreaker, recordBreakerSuccess, recordBreakerFailure, breakerStates, resetBreaker, type BreakerCheck } from "./breaker";
export { reserveQuota, releaseQuota, quotaState, resetQuota, type QuotaCheck, type QuotaScope, type QuotaBucket } from "./quota";
export { quarantine, replayDlq, resolveDlq, dropDlq, listDlq, requeueDueFromHolding, POISON_THRESHOLD } from "./dlq";
export {
  idempotencyKeyFor, newCorrelationId, REASON_CODES, CHANNEL_KINDS, TARGETS, LATENCY_BANDS, USER_VISIBLE_STATES,
  type DeliveryPolicy, type DeliveryOutcome, type DeliveryDispatchResult, type DeliveryTarget, type PolicyChannelKind,
} from "./types";

export type { DeliverySemantic, ChatDeliveryState, ChatAttemptOutcome, ChatBreakerState, ChatDLQStatus } from "./types";