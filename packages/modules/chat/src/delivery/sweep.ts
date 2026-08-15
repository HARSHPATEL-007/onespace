import { getDeliveryEngine } from "./engine";

const RUNNING = new Set<string>();

/** Spec §9 — queue-depth alarm threshold (pending due items). */
export const QUEUE_DEPTH_ALARM_THRESHOLD = 500;

/** Adaptive batch sizing: keep batch size in sync with observed sweep latency. */
export const ADAPTIVE_MIN_BATCH = 50;
export const ADAPTIVE_MAX_BATCH = 500;

let adaptiveBatch = 200;
let adaptiveLastDuration = 0;

/**
 * Background delivery sweep — retries due deliveries, requeues holding-queue
 * items, advances breaker probes. Idempotent, safe per-process, matches the
 * approvals-sweep pattern.
 */
export function startDeliverySweep(opts: { intervalMs?: number; now?: boolean } = {}): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? 15_000;
  const id = `delivery-sweep:${Math.random().toString(36).slice(2, 8)}`;

  const tick = async () => {
    if (RUNNING.has(id)) return;
    RUNNING.add(id);
    const started = Date.now();
    try {
      const engine = getDeliveryEngine();

      // Queue-depth alarm: alert on unbounded pending work instead of hiding it.
      const depth = await engine.queueDepth(new Date());
      if (depth >= QUEUE_DEPTH_ALARM_THRESHOLD) {
        console.warn(`[delivery-sweep] QUEUE DEPTH ALARM pending=${depth} threshold=${QUEUE_DEPTH_ALARM_THRESHOLD}`);
      }

      const retried = await engine.deliverDue(new Date(), adaptiveBatch);
      const requeued = await engine.requeueHolding(new Date());
      if (retried > 0 || requeued > 0) {
        console.log(`[delivery-sweep] retried=${retried} requeued=${requeued} batch=${adaptiveBatch}`);
      }

      // Adaptive batching (§9): raise the batch when the sweep is fast, lower it when slow.
      const duration = Date.now() - started;
      adaptiveLastDuration = duration;
      if (duration < 150) adaptiveBatch = Math.min(ADAPTIVE_MAX_BATCH, adaptiveBatch + 50);
      else if (duration > 600) adaptiveBatch = Math.max(ADAPTIVE_MIN_BATCH, adaptiveBatch - 50);
    } catch {
      // sweep must never crash the host
    } finally {
      RUNNING.delete(id);
    }
  };

  if (opts.now ?? true) void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return { stop: () => clearInterval(handle) };
}