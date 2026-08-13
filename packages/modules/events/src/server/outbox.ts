/**
 * Transactional outbox: business write + envelope/outbox rows happen in the
 * SAME database transaction, so no event is ever lost. A relay loop drains
 * PENDING rows to the broker, marks them SENT, and records trace hops.
 */
import { prisma, type Prisma } from "@n0va/db";
import type { BrokerPort } from "../port";
import type { CanonicalEvent } from "../envelope";
import { topicFor } from "../envelope";

export interface OutboxEnqueueOptions {
  event: CanonicalEvent;
  tx?: Prisma.TransactionClient;
  broker?: string;
}

const MAX_RELAY_ATTEMPTS = 5;

/** Base topic for all brokers; ordering/isolation ride on partitionKey and
 * envelope tenantId. Fine-grained tenant topics remain a kafka/nats upgrade
 * path — for now consumers join the same stream and filter client-side. */
function topicForBroker(_broker: string, _ev: CanonicalEvent): string {
  return "n0va.events";
}

function envelopeJson(ev: CanonicalEvent): Prisma.InputJsonObject {
  return {
    ...ev,
    meta: (ev.meta ?? {}) as unknown as Record<string, unknown>,
  } as unknown as Prisma.InputJsonObject;
}

/** Enqueue a canonical event into the outbox (same tx as the business write). */
export async function enqueueEvent(opts: OutboxEnqueueOptions): Promise<string> {
  const ev = opts.event;
  const db = opts.tx ?? prisma;
  await db.eventOutbox.create({
    data: {
      eventId: ev.eventId,
      envelopeId: ev.eventId,
      tenantId: ev.tenantId,
      eventType: ev.eventType,
      topic: topicForBroker(opts.broker ?? "memory", ev),
      broker: opts.broker ?? "memory",
      envelope: envelopeJson(ev),
      status: "PENDING",
    },
  });
  return ev.eventId;
}

/**
 * Emit an event end-to-end: canonical envelope (source of truth for replay)
 * + outbox row in the same transaction.
 */
export async function emitEvent(ev: CanonicalEvent, broker = "memory"): Promise<{ ok: boolean; errors: string[] }> {
  const errors = validateForEmit(ev);
  if (errors.length) return { ok: false, errors };
  await prisma.$transaction(async (tx) => {
    await tx.eventEnvelope.upsert({
      where: { eventId: ev.eventId },
      update: {},
      create: {
        eventId: ev.eventId,
        eventType: ev.eventType,
        version: ev.version,
        schemaVersion: ev.schemaVersion,
        timestamp: new Date(ev.timestamp),
        producer: ev.producer,
        tenantId: ev.tenantId,
        aggregateId: ev.aggregateId,
        correlationId: ev.correlationId,
        causationId: ev.causationId,
        traceId: ev.traceId,
        idempotencyKey: ev.idempotencyKey,
        partitionKey: ev.partitionKey,
        visibility: ev.visibility ?? "INTERNAL",
        payload: ev.payload as unknown as Prisma.InputJsonObject,
        retryCount: ev.meta?.retryCount ?? 0,
      },
    });
    await tx.eventOutbox.create({
      data: {
        eventId: ev.eventId,
        envelopeId: ev.eventId,
        tenantId: ev.tenantId,
        eventType: ev.eventType,
        topic: topicForBroker(broker, ev),
        broker,
        envelope: envelopeJson(ev),
        status: "PENDING",
      },
    });
  });
  return { ok: true, errors: [] };
}

function validateForEmit(ev: CanonicalEvent): string[] {
  const errors: string[] = [];
  if (!ev.eventId) errors.push("eventId is required");
  if (!ev.eventType) errors.push("eventType is required");
  if (!ev.timestamp) errors.push("timestamp is required");
  if (!ev.producer) errors.push("producer is required");
  return errors;
}

function fromEnvelopeRow(row: {
  eventId: string;
  eventType: string;
  version: string;
  schemaVersion: number;
  timestamp: Date;
  producer: string;
  tenantId: string | null;
  aggregateId: string | null;
  correlationId: string | null;
  causationId: string | null;
  traceId: string | null;
  idempotencyKey: string | null;
  partitionKey: string | null;
  visibility: string;
  payload: Prisma.JsonValue;
  retryCount: number;
}): CanonicalEvent {
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    version: row.version,
    schemaVersion: row.schemaVersion,
    timestamp: row.timestamp.toISOString(),
    producer: row.producer,
    tenantId: row.tenantId ?? undefined,
    aggregateId: row.aggregateId ?? undefined,
    correlationId: row.correlationId ?? undefined,
    causationId: row.causationId ?? undefined,
    traceId: row.traceId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    partitionKey: row.partitionKey ?? undefined,
    visibility: (row.visibility as CanonicalEvent["visibility"]) ?? "INTERNAL",
    payload: (row.payload as Record<string, unknown>) ?? {},
    meta: { retryCount: row.retryCount },
  };
}

export { fromEnvelopeRow };

/**
 * One relay cycle: claim PENDING rows, publish to the broker, mark SENT.
 * Failures increment attempts; rows past MAX_RELAY_ATTEMPTS go FAILED.
 */
export async function relayCycle(opts: { broker: BrokerPort; batch?: number }): Promise<{ relayed: number; failed: number }> {
  const batch = opts.batch ?? 50;
  const rows = await prisma.eventOutbox.findMany({
    where: { status: "PENDING" },
    orderBy: { enqueuedAt: "asc" },
    take: batch,
  });
  let relayed = 0;
  let failed = 0;
  for (const row of rows) {
    const started = Date.now();
    const ev = (row.envelope as CanonicalEvent) ?? {};
    try {
      const result = await opts.broker.publish(row.topic ?? topicFor(ev.eventType, ev.tenantId), [ev]);
      if (result.ok) {
        await prisma.eventOutbox.update({
          where: { id: row.id },
          data: { status: "SENT", attempts: { increment: 1 }, publishedAt: new Date(), error: null },
        });
        await recordHop(ev, opts.broker.name, "relayed", "OK", Date.now() - started, row.attempts + 1);
        relayed += 1;
      } else {
        await markFailed(row, opts.broker, result.error ?? "publish failed");
        failed += 1;
      }
    } catch (e) {
      await markFailed(row, opts.broker, e instanceof Error ? e.message : String(e));
      failed += 1;
    }
  }
  return { relayed, failed };
}

async function markFailed(
  row: { id: string; eventId: string; attempts: number; envelope: Prisma.JsonValue; topic: string | null },
  broker: BrokerPort,
  error: string,
): Promise<void> {
  const attempts = row.attempts + 1;
  const status = attempts >= MAX_RELAY_ATTEMPTS ? "FAILED" : "PENDING";
  await prisma.eventOutbox.update({
    where: { id: row.id },
    data: {
      attempts,
      status,
      error,
      nextRetryAt: status === "PENDING" ? new Date(Date.now() + attempts * 2_000) : undefined,
    },
  });
  const ev = (row.envelope as CanonicalEvent) ?? {};
  await recordHop(ev, broker.name, "relay-failed", "FAILED", 0, attempts, error);
}

async function recordHop(ev: CanonicalEvent, consumer: string, action: string, status: string, latencyMs: number, retryCount: number, detail?: string): Promise<void> {
  try {
    await prisma.eventTraceHop.create({
      data: {
        traceId: ev.traceId ?? ev.eventId,
        correlationId: ev.correlationId,
        eventId: ev.eventId,
        producer: ev.producer,
        consumer,
        broker: consumer,
        hop: retryCount,
        status,
        latencyMs,
        retryCount,
        detail: detail ?? action,
      },
    });
  } catch {
    // trace hops must never break the relay
  }
}

/** Auto-advance relay: run every `intervalMs` until stopped. */
export function startRelayLoop(opts: { broker: BrokerPort; intervalMs?: number; batch?: number }): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? 1500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await relayCycle({ broker: opts.broker, batch: opts.batch });
    } catch {
      // keep going; failures surface in outbox rows
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  void tick();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}