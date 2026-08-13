/**
 * Kafka adapter — durable event backbone, analytics, replay, CQRS projections.
 * Partition by partitionKey (thread/task/tenant/aggregate) for causal order.
 */
import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";
import type { BrokerPort, EventHandler, PublishResult } from "../port";
import type { CanonicalEvent } from "../envelope";
import { partitionKeyFor } from "../envelope";

export function createKafkaBroker(opts: {
  brokers?: string[];
  clientId?: string;
  groupId?: string;
  logger?: (msg: string) => void;
}): BrokerPort {
  const brokers = opts.brokers ?? (process.env.KAFKA_BROKERS ?? "localhost:9092").split(",").map((s) => s.trim());
  const clientId = opts.clientId ?? "n0va-events";
  const groupId = opts.groupId ?? process.env.KAFKA_GROUP_ID ?? "n0va-events-consumers";
  const log = opts.logger ?? (() => {});
  let producer: Producer | undefined;
  let consumer: Consumer | undefined;

  const kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.ERROR,
    retry: { retries: 5, initialRetryTime: 300 },
  });

  async function topicForEvent(ev: CanonicalEvent): Promise<string> {
    return ev.tenantId ? `n0va.events.${ev.tenantId}` : "n0va.events";
  }

  return {
    name: "kafka",
    async publish(_topic, events) {
      try {
        if (!producer) producer = kafka.producer();
        await producer.connect();
        const batches = new Map<string, { topic: string; messages: import("kafkajs").ProducerRecord["messages"] }[]>();
        for (const ev of events) {
          const topic = await topicForEvent(ev);
          const key = partitionKeyFor(ev);
          const message = { key, value: JSON.stringify(ev) };
          const list = batches.get(topic) ?? [];
          list.push({ topic, messages: [message] });
          batches.set(topic, list);
        }
        for (const [topic, msgs] of batches) {
          await producer.send({ topic, messages: msgs.flatMap((m) => m.messages) });
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    async subscribe(eventTypes, consumerKey, handler) {
      if (!consumer) consumer = kafka.consumer({ groupId, sessionTimeout: 12000 });
      await consumer.connect().catch(() => {});
      const topics = eventTypes.length === 0 ? ["n0va.events"] : eventTypes;
      await consumer.subscribe({ topics, fromBeginning: false }).catch((e) => log(`[kafka] subscribe error: ${e.message}`));
      await consumer
        .run({
          eachMessage: async ({ message }) => {
            try {
              const ev = JSON.parse(message.value?.toString() ?? "{}") as CanonicalEvent;
              if (eventTypes.length === 0 || eventTypes.includes(ev.eventType)) {
                await handler({ consumerKey, event: ev, retryCount: ev.meta?.retryCount ?? 0 });
              }
            } catch (e) {
              log(`[kafka] handler error: ${e instanceof Error ? e.message : String(e)}`);
            }
          },
        })
        .catch(() => {});
    },
    async health() {
      try {
        if (!producer) producer = kafka.producer();
        await producer.connect();
        await producer.send({ topic: "_n0va_health", messages: [{ value: "ping" }] }).catch(() => {});
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: e instanceof Error ? e.message : String(e) };
      }
    },
    async disconnect() {
      if (consumer) await consumer.disconnect().catch(() => {});
      if (producer) await producer.disconnect().catch(() => {});
    },
  };
}