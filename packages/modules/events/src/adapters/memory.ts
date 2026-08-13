/**
 * In-memory broker — dev/CLI/testing fallback. Subscribers receive events
 * synchronously after publish; no durability.
 */
import type { BrokerPort, EventHandler, PublishResult } from "../port";
import type { CanonicalEvent } from "../envelope";

interface SubscriptionEntry {
  eventTypes: string[];
  consumerKey: string;
  handler: EventHandler;
}

export function createMemoryBroker(opts?: { logger?: (msg: string) => void }): BrokerPort {
  const log = opts?.logger ?? (() => {});
  const subs: SubscriptionEntry[] = [];
  const pending: Array<{ topic: string; events: CanonicalEvent[] }> = [];

  async function deliver(events: CanonicalEvent[]): Promise<void> {
    for (const ev of events) {
      for (const sub of subs) {
        if (sub.eventTypes.length === 0 || sub.eventTypes.includes(ev.eventType)) {
          try {
            await sub.handler({ consumerKey: sub.consumerKey, event: ev, retryCount: ev.meta?.retryCount ?? 0 });
          } catch (e) {
            log(`[memory] handler error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }
    }
  }

  return {
    name: "memory",
    async publish(topic, events) {
      pending.push({ topic, events });
      await deliver(events);
      return { ok: true };
    },
    async subscribe(eventTypes, consumerKey, handler) {
      subs.push({ eventTypes, consumerKey, handler });
      for (const batch of pending) {
        for (const ev of batch.events) {
          if (eventTypes.length === 0 || eventTypes.includes(ev.eventType)) {
            try {
              await handler({ consumerKey, event: ev, retryCount: ev.meta?.retryCount ?? 0 });
            } catch (e) {
              log(`[memory] subscriber error: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
    },
    async health() {
      return { ok: true };
    },
    async disconnect() {
      subs.length = 0;
      pending.length = 0;
    },
  };
}