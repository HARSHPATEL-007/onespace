/**
 * Event bus singleton for the web app. Lazy-initialized once per process
 * (globalThis cache, HMR-safe). Broker selected by N0VA_EVENT_BROKER env:
 * "redis" | "kafka" | "nats" | "memory" (default: memory, or redis when
 * REDIS_URL is present). The relay loop + projection/saga subscriptions
 * are started on first use.
 */
import { createBroker, createEventBus, type EventBusServer } from "@n0va/modules-events/server";
import { startApprovalSweep } from "@n0va/modules-approvals/sweep";
import { startDeliverySweep } from "@n0va/modules-chat/delivery";
import { bridgeEvent } from "@n0va/modules-chat/bridge";

const globalForBus = globalThis as unknown as {
  __n0vaEventBus?: EventBusServer;
  __n0vaApprovalSweep?: { stop: () => void };
  __n0vaDeliverySweep?: { stop: () => void };
};

const BRIDGE_EVENTS = ["task.created", "task.completed", "huddle.started", "huddle.ended"];

export function getEventBus(): EventBusServer {
  if (!globalForBus.__n0vaEventBus) {
    const bus = createEventBus({
      broker: createBroker(),
      logger: (m) => console.log(m),
    });
    globalForBus.__n0vaEventBus = bus;
    void bus.start().then(() => bus.wireDefaultSubscriptions());
    void bus.start().then(async () => {
      console.log("[eventbus] wiring bridge consumers…");
      for (const type of BRIDGE_EVENTS) {
        await bus.broker.subscribe([type], `bridge:${type}`, async ({ event }) => {
          await bridgeEvent(event).catch(() => {});
        });
        console.log(`[eventbus] bridge consumer wired: ${type}`);
      }
    });
    if (!globalForBus.__n0vaApprovalSweep) {
      globalForBus.__n0vaApprovalSweep = startApprovalSweep({ intervalMs: 60_000 });
    }
    if (!globalForBus.__n0vaDeliverySweep) {
      globalForBus.__n0vaDeliverySweep = startDeliverySweep({ intervalMs: 15_000 });
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
  globalForBus.__n0vaDeliverySweep?.stop();
  globalForBus.__n0vaDeliverySweep = undefined;
}