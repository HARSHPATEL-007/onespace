/**
 * Redis Streams adapter — lightweight operational queues and short-lived
 * job buses. Consumer groups give at-least-once delivery; handlers must be
 * idempotent (see idempotency store).
 */
import Redis from "ioredis";
import type { BrokerPort, EventHandler, PublishResult } from "../port";
import type { CanonicalEvent } from "../envelope";

const MAX_RETRIES = 8;

export function createRedisBroker(opts: { url?: string; consumerGroup?: string; logger?: (msg: string) => void }): BrokerPort {
  const url = opts.url ?? process.env.REDIS_URL ?? "redis://localhost:6379";
  const group = opts.consumerGroup ?? "n0va-events-default";
  const log = opts.logger ?? (() => {});
  let client: Redis | undefined;
  let shuttingDown = false;
  let runner: Promise<void> | undefined;

  async function ensure(): Promise<Redis> {
    if (!client) {
      client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
      await client.connect().catch((e) => {
        log(`[redis] connect failed: ${e.message}`);
      });
    }
    return client;
  }

  function encodeEvent(ev: CanonicalEvent): string {
    return JSON.stringify({ ...ev, payload: sanitize(ev.payload) });
  }

  function sanitize(value: unknown): unknown {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  async function publish(topic: string, events: CanonicalEvent[]): Promise<PublishResult> {
    try {
      const c = await ensure();
      for (const ev of events) {
        await c.xadd(topic, "*", "event", encodeEvent(ev));
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  function dispatchLoop(handler: EventHandler, topics: string[], consumerKey: string): void {
    const streamGroup = `${group}-${consumerKey}`;
    const streams = ["n0va.events", ...topics].filter((t, i, a) => a.indexOf(t) === i);
    runner = (async () => {
      let c: Redis | undefined;
      for (let attempt = 0; attempt < MAX_RETRIES && !shuttingDown; attempt++) {
        try {
          c = await ensure();
          for (const topic of streams) {
            await c.xgroup("CREATE", topic, streamGroup, "$", "MKSTREAM").catch(() => {});
          }
          await c.xgroup("CREATE", "n0va.events:dlq", streamGroup, "$", "MKSTREAM").catch(() => {});
          break;
        } catch (e) {
          c?.disconnect();
          c = undefined;
          await sleep(1000 * (attempt + 1));
        }
      }
      if (!c) return;
      while (!shuttingDown) {
        try {
          const reply = await c.xreadgroup("GROUP", streamGroup, consumerKey, "COUNT", "16", "BLOCK", "1000", "STREAMS", ...streams, ...streams.map(() => ">"));
          if (!reply) continue;
          const parsed = reply as unknown as Array<[string, Array<[string, string[] | null]>]>;
          for (const [topic, entries] of parsed) {
            for (const [id, fields] of entries) {
              const raw = fieldsToObject(fields ?? [])["event"] ?? "{}";
              let ev: CanonicalEvent;
              try {
                ev = JSON.parse(raw) as CanonicalEvent;
              } catch {
                await c.xack(topic, streamGroup, id);
                continue;
              }
              try {
                await handler({ consumerKey, event: ev, retryCount: ev.meta?.retryCount ?? 0 });
                await c.xack(topic, streamGroup, id);
              } catch (e) {
                const err = e instanceof Error ? e.message : String(e);
                ev.meta = { ...(ev.meta ?? {}), retryCount: (ev.meta?.retryCount ?? 0) + 1 };
                if ((ev.meta.retryCount ?? 0) >= 3) {
                  await c.xadd("n0va.events:dlq", "*", "event", encodeEvent({ ...ev, meta: { ...ev.meta, retryCount: ev.meta.retryCount } }), "reason", err);
                  log(`[redis] ${ev.eventType} → dlq: ${err}`);
                } else {
                  await c.xadd(topic, "*", "event", encodeEvent(ev));
                  log(`[redis] ${ev.eventType} retry ${ev.meta.retryCount}: ${err}`);
                }
                await c.xack(topic, streamGroup, id);
              }
            }
          }
        } catch (e) {
          if (!shuttingDown) {
            log(`[redis] consume error: ${e instanceof Error ? e.message : String(e)}`);
            await sleep(1000);
          }
        }
      }
      c.disconnect();
    })();
  }

  return {
    name: "redis",
    async publish(topic, events) {
      return publish(topic, events);
    },
    async subscribe(eventTypes, consumerKey, handler) {
      const topics = buildTopics(eventTypes);
      // Redis streams deliver by topic, filter by type on arrival.
      const filtered: EventHandler = async (ctx) => {
        if (eventTypes.length === 0 || eventTypes.includes(ctx.event.eventType)) {
          await handler(ctx);
        }
      };
      dispatchLoop(filtered, topics, consumerKey);
    },
    async lag(topic) {
      try {
        const c = await ensure();
        const info = await c.xinfo("GROUPS", topic);
        if (!Array.isArray(info)) return null;
        const groupInfo = info[0] as Record<string, unknown>;
        if (!groupInfo) return null;
        return Number(groupInfo["lag"] ?? 0);
      } catch {
        return null;
      }
    },
    async health() {
      try {
        const c = await ensure();
        await c.ping();
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },
    async disconnect() {
      shuttingDown = true;
      if (runner) await runner.catch(() => {});
      if (client) client.disconnect();
    },
  };
}

function fieldsToObject(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const k = fields[i];
    const v = fields[i + 1];
    if (k !== undefined) out[k] = v ?? "";
  }
  return out;
}

function buildTopics(eventTypes: string[]): string[] {
  return ["n0va.events"];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}