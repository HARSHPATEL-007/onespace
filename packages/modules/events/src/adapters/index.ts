/**
 * Adapter factory — picks the broker from N0VA_EVENT_BROKER:
 * "redis" (default when REDIS_URL present), "kafka", "nats", "memory".
 */
import type { BrokerPort } from "../port";
import { createRedisBroker } from "./redis";
import { createKafkaBroker } from "./kafka";
import { createNatsBroker } from "./nats";
import { createMemoryBroker } from "./memory";

export type BrokerName = "memory" | "redis" | "kafka" | "nats";

export function brokerNameFromEnv(): BrokerName {
  const raw = (process.env.N0VA_EVENT_BROKER ?? "").toLowerCase();
  if (raw === "kafka" || raw === "nats" || raw === "memory") return raw;
  if (process.env.REDIS_URL) return "redis";
  return "memory";
}

export function createBroker(opts?: { name?: BrokerName; logger?: (msg: string) => void }): BrokerPort {
  const name = opts?.name ?? brokerNameFromEnv();
  switch (name) {
    case "redis":
      return createRedisBroker({ logger: opts?.logger });
    case "kafka":
      return createKafkaBroker({ logger: opts?.logger });
    case "nats":
      return createNatsBroker({ logger: opts?.logger });
    default:
      return createMemoryBroker({ logger: opts?.logger });
  }
}