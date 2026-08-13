/**
 * Replay & observability tooling (reads envelopes, DLQ, subscriptions).
 * Emit lives in outbox.ts (emitEvent = envelope + outbox in one tx).
 */
import { prisma, type Prisma } from "@n0va/db";
import type { CanonicalEvent } from "../envelope";
import { EVENT_SCHEMAS } from "../envelope";

export { emitEvent } from "./outbox";

export interface ReplayOptions {
  eventTypes?: string[];
  tenantId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Replay stored envelopes as canonical events (ascending timestamp). */
export async function replayEvents(opts: ReplayOptions): Promise<CanonicalEvent[]> {
  const rows = await prisma.eventEnvelope.findMany({
    where: {
      ...(opts.eventTypes && opts.eventTypes.length ? { eventType: { in: opts.eventTypes } } : {}),
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      ...(opts.from ? { timestamp: { gte: opts.from } } : {}),
      ...(opts.to ? { timestamp: { lte: opts.to } } : {}),
    },
    orderBy: { timestamp: "asc" },
    take: opts.limit ?? 500,
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    eventType: r.eventType,
    version: r.version,
    schemaVersion: r.schemaVersion,
    timestamp: r.timestamp.toISOString(),
    producer: r.producer,
    tenantId: r.tenantId ?? undefined,
    aggregateId: r.aggregateId ?? undefined,
    correlationId: r.correlationId ?? undefined,
    causationId: r.causationId ?? undefined,
    traceId: r.traceId ?? undefined,
    idempotencyKey: r.idempotencyKey ?? undefined,
    partitionKey: r.partitionKey ?? undefined,
    visibility: r.visibility ?? "INTERNAL",
    payload: (r.payload as Record<string, unknown>) ?? {},
    meta: { retryCount: r.retryCount },
  }));
}

export interface BusStats {
  envelopes: number;
  outboxPending: number;
  outboxFailed: number;
  dlqCount: number;
  sagasRunning: number;
  sagasCompleted: number;
  sagasCompensated: number;
  projectionCount: number;
  dedupRecords: number;
  commands: number;
  commandFailed: number;
}

export async function busStats(): Promise<BusStats> {
  const [envelopes, outboxPending, outboxFailed, dlqCount, sagasRunning, sagasCompleted, sagasCompensated, projectionCount, dedupRecords, commands, commandFailed] =
    await Promise.all([
      prisma.eventEnvelope.count(),
      prisma.eventOutbox.count({ where: { status: "PENDING" } }),
      prisma.eventOutbox.count({ where: { status: "FAILED" } }),
      prisma.eventDLQ.count(),
      prisma.sagaInstance.count({ where: { status: "RUNNING" } }),
      prisma.sagaInstance.count({ where: { status: "COMPLETED" } }),
      prisma.sagaInstance.count({ where: { status: "COMPENSATED" } }),
      prisma.projectionCursor.count(),
      prisma.idempotencyRecord.count(),
      prisma.eventEnvelope.count({ where: { eventType: { startsWith: "command." } } }),
      prisma.eventEnvelope.count({ where: { eventType: "command.failed" } }),
    ]);
  return { envelopes, outboxPending, outboxFailed, dlqCount, sagasRunning, sagasCompleted, sagasCompensated, projectionCount, dedupRecords, commands, commandFailed };
}

/** Trace an event across hops for the admin page. */
export async function traceEvent(eventId: string) {
  const envelope = await prisma.eventEnvelope.findUnique({ where: { eventId } });
  if (!envelope) return null;
  const hops = await prisma.eventTraceHop.findMany({
    where: { eventId },
    orderBy: { at: "asc" },
  });
  return { envelope, hops };
}

export interface LineageNode {
  envelope: NonNullable<Awaited<ReturnType<typeof traceEvent>>>["envelope"];
  hops: NonNullable<Awaited<ReturnType<typeof traceEvent>>>["hops"];
  children: LineageNode[];
}

/**
 * Causal lineage tree for an event/command: walks downstream causation
 * chains (causationId edges) across the recent envelope window so a command
 * → event₁ → event₂ → saga.* graph can be rendered end-to-end.
 */
export async function traceLineage(eventId: string, opts: { window?: number } = {}): Promise<LineageNode | null> {
  const root = await prisma.eventEnvelope.findUnique({ where: { eventId } });
  if (!root) return null;
  const window = opts.window ?? 1000;

  const rows = await prisma.eventEnvelope.findMany({
    where: { timestamp: { gte: root.timestamp } },
    orderBy: { timestamp: "asc" },
    take: window,
  });
  const hopsRows = await prisma.eventTraceHop.findMany({
    where: { eventId: { in: rows.map((r) => r.eventId) } },
    orderBy: { at: "asc" },
  });
  const hopsByEvent = new Map<string, NonNullable<Awaited<ReturnType<typeof traceEvent>>>["hops"]>();
  for (const h of hopsRows) {
    const list = hopsByEvent.get(h.eventId) ?? [];
    list.push(h);
    hopsByEvent.set(h.eventId, list);
  }

  const childrenOf = new Map<string, NonNullable<Awaited<ReturnType<typeof traceEvent>>>["envelope"][]>();
  for (const row of rows) {
    const parent = row.causationId;
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(row);
    childrenOf.set(parent, list);
  }

  const build = (row: NonNullable<Awaited<ReturnType<typeof traceEvent>>>["envelope"]): LineageNode => {
    const kids = (childrenOf.get(row.eventId) ?? []).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return { envelope: row, hops: hopsByEvent.get(row.eventId) ?? [], children: kids.map(build) };
  };

  return build(root);
}

/** Latest N envelopes with their trace hops for the admin page. */
export async function latestEnvelopes(limit = 50) {
  const rows = await prisma.eventEnvelope.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  const hops = await prisma.eventTraceHop.findMany({
    where: { eventId: { in: rows.map((r) => r.eventId) } },
    orderBy: { at: "asc" },
  });
  const byEvent = new Map<string, typeof hops>();
  for (const h of hops) {
    const list = byEvent.get(h.eventId) ?? [];
    list.push(h);
    byEvent.set(h.eventId, list);
  }
  return rows.map((r) => ({ envelope: r, hops: byEvent.get(r.eventId) ?? [] }));
}

export async function dlqItems(limit = 50) {
  return prisma.eventDLQ.findMany({ orderBy: { quarantinedAt: "desc" }, take: limit });
}

/** Retry a DLQ item: reset its outbox row to PENDING and drop the DLQ entry. */
export async function retryDlqItem(id: string): Promise<boolean> {
  const item = await prisma.eventDLQ.findUnique({ where: { id } });
  if (!item) return false;
  await prisma.$transaction(async (tx) => {
    await tx.eventEnvelope.upsert({
      where: { eventId: item.eventId },
      update: { payload: (item.payload ?? {}) as Prisma.InputJsonObject },
      create: {
        eventId: item.eventId,
        eventType: item.eventType,
        version: "1.0",
        schemaVersion: 1,
        timestamp: new Date(),
        producer: "dlq-retry",
        payload: (item.payload ?? {}) as Prisma.InputJsonObject,
      },
    });
    await tx.eventOutbox.updateMany({
      where: { eventId: item.eventId },
      data: { status: "PENDING", error: null, attempts: 0, nextRetryAt: null },
    });
    const outboxRows = await tx.eventOutbox.count({ where: { eventId: item.eventId } });
    if (outboxRows === 0) {
      await tx.eventOutbox.create({
        data: {
          eventId: item.eventId,
          envelopeId: item.eventId,
          eventType: item.eventType,
          topic: item.topic,
          broker: "relay",
          envelope: {
            eventId: item.eventId,
            eventType: item.eventType,
            version: "1.0",
            timestamp: new Date().toISOString(),
            producer: "dlq-retry",
            payload: (item.payload ?? {}) as Record<string, unknown>,
          } as unknown as Prisma.InputJsonValue,
          status: "PENDING",
        },
      });
    }
    await tx.eventDLQ.delete({ where: { id } });
  });
  return true;
}

/** Register an external consumer subscription for observability. */
export async function registerSubscription(consumerKey: string, eventTypes: string[]): Promise<void> {
  await prisma.eventSubscription.upsert({
    where: { consumerKey },
    update: { eventTypes, enabled: true },
    create: { consumerKey, eventTypes, enabled: true },
  });
}

/** Validate a payload against the registered schema (admin diagnostics). */
export function validatePayload(ev: CanonicalEvent): string[] {
  const schema = EVENT_SCHEMAS[ev.eventType];
  if (!schema) return [`unknown event type "${ev.eventType}"`];
  return schema.required.filter((k) => ev.payload[k] === undefined || ev.payload[k] === null);
}