/**
 * Event bus singleton for the web app. Lazy-initialized once per process
 * (globalThis cache, HMR-safe). Broker selected by N0VA_EVENT_BROKER env:
 * "redis" | "kafka" | "nats" | "memory" (default: memory, or redis when
 * REDIS_URL is present). The relay loop + projection/saga subscriptions
 * are started on first use.
 */
import { createBroker, createEventBus, type EventBusServer } from "@n0va/modules-events/server";
import { startApprovalSweep } from "@n0va/modules-approvals/sweep";

const globalForBus = globalThis as unknown as { __n0vaEventBus?: EventBusServer; __n0vaApprovalSweep?: { stop: () => void } };

export function getEventBus(): EventBusServer {
  if (!globalForBus.__n0vaEventBus) {
    const bus = createEventBus({
      broker: createBroker(),
      logger: (m) => console.log(m),
    });
    globalForBus.__n0vaEventBus = bus;
    void bus.start().then(() => bus.wireDefaultSubscriptions());
    if (!globalForBus.__n0vaApprovalSweep) {
      globalForBus.__n0vaApprovalSweep = startApprovalSweep({ intervalMs: 60_000 });
    }
  }
  return globalForBus.__n0vaEventBus;
}

export async function stopEventBus(): Promise<void> {
  if (globalForBus.__n0vaEventBus) {
    await globalForBus.__n0vaEventBus.stop();
    globalForBus.__n0vaEventBus = undefined;
  }
  globalForBus.__n0vaApprovalSweep?.stop();
  globalForBus.__n0vaApprovalSweep = undefined;
}