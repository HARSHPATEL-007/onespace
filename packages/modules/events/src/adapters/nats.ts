/**
 * NATS adapter (JetStream) — low-latency command and notification routing.
 */
import { connect, StringCodec, type NatsConnection, type JetStreamClient, type Subscription } from "nats";
import type { BrokerPort, EventHandler, PublishResult } from "../port";
import type { CanonicalEvent } from "../envelope";

export function createNatsBroker(opts: {
  servers?: string[];
  stream?: string;
  logger?: (msg: string) => void;
}): BrokerPort {
  const servers = opts.servers ?? (process.env.NATS_URL ?? "nats://localhost:4222").split(",").map((s) => s.trim());
  const stream = opts.stream ?? "n0va_events";
  const log = opts.logger ?? (() => {});
  const sc = StringCodec();
  let nc: NatsConnection | undefined;
  let js: JetStreamClient | undefined;
  let subs: Subscription[] = [];

  async function ensure(): Promise<{ nc: NatsConnection; js: JetStreamClient }> {
    if (!nc) {
      nc = await connect({ servers });
      js = nc.jetstream();
      await js
        .streams
        .add({ name: stream, subjects: [`n0va.events.*`, "n0va.events"], storage: "file", discard_policy: "discard_new", max_msgs: 1_000_000 })
        .catch(() => {});
    }
    return { nc, js: js! };
  }

  return {
    name: "nats",
    async publish(topic, events) {
      try {
        const { js } = await ensure();
        for (const ev of events) {
          await js.publish(topic, sc.encode(JSON.stringify(ev)));
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async subscribe(eventTypes, consumerKey, handler) {
      const { nc } = await ensure();
      const subjects = eventTypes.length === 0 ? ["n0va.events", "n0va.events.*"] : eventTypes.map((t) => `n0va.events.${t}`);
      const sub = nc.subscribe(subjects.length === 1 ? subjects[0] : subjects, { queue: consumerKey });
      (async () => {
        for await (const msg of sub) {
          try {
            const ev = JSON.parse(sc.decode(msg.data)) as CanonicalEvent;
            if (eventTypes.length === 0 || eventTypes.includes(ev.eventType)) {
              await handler({ consumerKey, event: ev, retryCount: ev.meta?.retryCount ?? 0 });
            }
          } catch (e) {
            log(`[nats] handler error: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      })();
      subs.push(sub);
    },
    async health() {
      try {
        const { nc } = await ensure();
        return { ok: nc.info?.host !== undefined };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },
    async disconnect() {
      for (const s of subs) s.unsubscribe().catch(() => {});
      if (nc) {
        await nc.drain().catch(() => {});
        nc.close();
      }
    },
  };
}