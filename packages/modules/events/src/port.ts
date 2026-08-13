/**
 * Broker-agnostic event bus port. Broker-specific details live in adapters.
 */
import type { CanonicalEvent } from "./envelope";

export interface PublishResult {
  ok: boolean;
  error?: string;
}

export interface ConsumeContext {
  consumerKey: string;
  event: CanonicalEvent;
  retryCount: number;
}

export type EventHandler = (ctx: ConsumeContext) => Promise<void>;

export interface BrokerPort {
  readonly name: "memory" | "redis" | "kafka" | "nats";
  /** Publish one or more events to the given topic(s). */
  publish(topic: string, events: CanonicalEvent[]): Promise<PublishResult>;
  /** Subscribe `handler` to `eventTypes`; events bypass the handler when false. */
  subscribe(eventTypes: string[], consumerKey: string, handler: EventHandler): Promise<void>;
  /** Consumer group lag or null when not applicable. */
  lag?(topic: string): Promise<number | null>;
  /** Raw backend health. */
  health(): Promise<{ ok: boolean; detail?: string }>;
  disconnect(): Promise<void>;
}

export function isEventTypeIn(types: string[], ev: CanonicalEvent): boolean {
  return types.includes(ev.eventType);
}