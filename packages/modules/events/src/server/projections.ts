/**
 * CQRS projections — denormalized read models built from the event stream.
 * Exactly-once per (projector, eventId) via the idempotency store; the
 * per-projector cursor tracks replay progress.
 */
import { prisma } from "@n0va/db";
import type { CanonicalEvent } from "../envelope";
import { ensureProcessedOnce } from "./idempotency";

export interface Projector {
  name: string;
  handles: string[];
  apply(ev: CanonicalEvent): Promise<void>;
}

async function guarded(name: string, ev: CanonicalEvent, fn: () => Promise<void>): Promise<void> {
  const outcome = await ensureProcessedOnce(`projection:${name}`, ev.eventId);
  if (outcome === "deduped") return;
  await fn();
  await prisma.projectionCursor.upsert({
    where: { name },
    update: { lastEventId: ev.eventId, lastEventAt: new Date(), version: { increment: 1 } },
    create: { name, lastEventId: ev.eventId, lastEventAt: new Date(), version: 1 },
  });
}

export const threadProjector: Projector = {
  name: "thread",
  handles: ["chat.message.created", "thread.decision.confirmed"],
  async apply(ev) {
    const threadId = String(ev.payload.threadId ?? ev.payload.channelId ?? ev.aggregateId ?? "");
    if (!threadId) return;
    await guarded("thread", ev, async () => {
      const existing = await prisma.threadViewProjection.findUnique({ where: { threadId } });
      const preview = String(ev.payload.body ?? "").slice(0, 200);
      await prisma.threadViewProjection.upsert({
        where: { threadId },
        update: {
          channelId: String(ev.payload.channelId ?? existing?.channelId ?? ""),
          summary: preview || existing?.summary,
          messageCount: { increment: 1 },
          lastSpeakerId: String(ev.payload.authorId ?? existing?.lastSpeakerId ?? ""),
          lastActivity: new Date(ev.timestamp),
          participantIds: mergeParticipants(existing?.participantIds ?? [], String(ev.payload.authorId ?? "")),
        },
        create: {
          threadId,
          tenantId: ev.tenantId,
          channelId: String(ev.payload.channelId ?? ""),
          title: String(ev.payload.title ?? "New thread"),
          summary: preview,
          participantIds: String(ev.payload.authorId ?? "") ? [String(ev.payload.authorId)] : [],
          messageCount: 1,
          lastSpeakerId: String(ev.payload.authorId ?? ""),
          lastActivity: new Date(ev.timestamp),
        },
      });
    });
  },
};

export const taskDashboardProjector: Projector = {
  name: "tasks",
  handles: ["task.created", "task.updated", "task.completed"],
  async apply(ev) {
    const tenantId = String(ev.payload.workspaceId ?? ev.tenantId ?? "default");
    const assigneeId = String(ev.payload.assigneeId ?? "");
    if (!assigneeId) return;
    await guarded("tasks", ev, async () => {
      const status = String(ev.payload.status ?? "");
      if (ev.eventType === "task.created") {
        await prisma.taskDashboardProjection.upsert({
          where: { tenantId_assigneeId: { tenantId, assigneeId } },
          update: {
            total: { increment: 1 },
            ...(status === "IN_PROGRESS" ? { inProgress: { increment: 1 } } : status === "DONE" ? { done: { increment: 1 } } : { open: { increment: 1 } }),
            updatedAt: new Date(),
          },
          create: { tenantId, assigneeId, total: 1, open: status === "IN_PROGRESS" || status === "DONE" ? 0 : 1, inProgress: status === "IN_PROGRESS" ? 1 : 0, done: status === "DONE" ? 1 : 0 },
        });
      } else if (ev.eventType === "task.completed") {
        await prisma.taskDashboardProjection.updateMany({
          where: { tenantId, assigneeId },
          data: { done: { increment: 1 }, updatedAt: new Date() },
        });
      } else {
        await prisma.taskDashboardProjection.updateMany({
          where: { tenantId, assigneeId },
          data: {
            ...(status ? { open: status === "OPEN" ? { increment: 1 } : { decrement: 1 } } : {}),
            updatedAt: new Date(),
          },
        });
      }
    });
  },
};

export const inboxProjector: Projector = {
  name: "inbox",
  handles: ["approval.requested", "invoice.flagged", "connector.sync.failed"],
  async apply(ev) {
    const userId = String(ev.payload.requestedBy ?? ev.payload.assigneeId ?? ev.payload.connectorId ?? ev.tenantId ?? "");
    const entityId = String(ev.payload.approvalId ?? ev.payload.invoiceId ?? ev.payload.connectorId ?? ev.aggregateId ?? "");
    if (!userId) return;
    await guarded("inbox", ev, async () => {
      const kind = ev.eventType === "approval.requested" ? "APPROVAL" : ev.eventType === "invoice.flagged" ? "INVOICE" : "CONNECTOR";
      await prisma.inboxProjectionItem.create({
        data: {
          tenantId: ev.tenantId,
          userId,
          sourceEvent: ev.eventType,
          sourceId: entityId,
          kind,
          title: String(ev.payload.reason ?? ev.payload.requestType ?? ev.eventType),
          body: String(ev.payload.error ?? ev.payload.requestType ?? ev.payload.reason ?? ev.eventType),
          link: kind === "APPROVAL" ? `/m/channel/thread/${entityId}` : entityId ? `/m/tasks/${entityId}` : undefined,
          urgent: ev.payload.urgency === "HIGH" || ev.eventType === "connector.sync.failed" || ev.payload.reason === "approval rejected — compensating",
          read: false,
        },
      });
    });
  },
};

export const complianceProjector: Projector = {
  name: "compliance",
  handles: ["invoice.flagged", "approval.requested", "saga.compensated", "task.completed"],
  async apply(ev) {
    const objectId = String(ev.payload.invoiceId ?? ev.payload.approvalId ?? ev.payload.workflowId ?? ev.payload.taskId ?? ev.aggregateId ?? "");
    if (!objectId) return;
    await guarded("compliance", ev, async () => {
      const existing = await prisma.complianceProjection.findFirst({ where: { kind: ev.eventType, objectId } });
      const linked = existing ? [...existing.linkedEvents, ev.eventId] : [ev.eventId];
      await prisma.complianceProjection.upsert({
        where: { id: existing?.id ?? "__none__" },
        update: {
          severity:
            ev.eventType === "invoice.flagged" ? "HIGH" : ev.eventType === "saga.compensated" ? "CRITICAL" : severityFor(ev.eventType),
          status: "WATCH",
          linkedEvents: linked,
          title: String(ev.payload.reason ?? ev.payload.requestType ?? ev.eventType),
          updatedAt: new Date(),
        },
        create: {
          tenantId: ev.tenantId,
          kind: ev.eventType,
          objectId,
          title: String(ev.payload.reason ?? ev.payload.requestType ?? ev.eventType),
          status: "WATCH",
          severity: ev.eventType === "invoice.flagged" ? "HIGH" : ev.eventType === "saga.compensated" ? "CRITICAL" : severityFor(ev.eventType),
          linkedEvents: [ev.eventId],
        },
      });
    });
  },
};

function severityFor(eventType: string): string {
  if (eventType === "approval.requested") return "MEDIUM";
  if (eventType === "task.completed") return "INFO";
  return "INFO";
}

function mergeParticipants(existing: string[], author: string): string[] {
  if (!author) return existing;
  return existing.includes(author) ? existing : [...existing, author];
}

export const PROJECTORS: Projector[] = [threadProjector, taskDashboardProjector, inboxProjector, complianceProjector];

/** Rebuild a projection from stored envelopes (replay-safe, deduped). */
export async function rebuildProjection(name: string, eventTypes?: string[]): Promise<number> {
  const projector = PROJECTORS.find((p) => p.name === name);
  if (!projector) throw new Error(`unknown projector "${name}"`);
  const envelopes = await prisma.eventEnvelope.findMany({
    where: { eventType: { in: eventTypes ?? projector.handles } },
    orderBy: { timestamp: "asc" },
  });
  let applied = 0;
  for (const env of envelopes) {
    const ev: CanonicalEvent = {
      eventId: env.eventId,
      eventType: env.eventType,
      version: env.version,
      schemaVersion: env.schemaVersion,
      timestamp: env.timestamp.toISOString(),
      producer: env.producer,
      tenantId: env.tenantId ?? undefined,
      aggregateId: env.aggregateId ?? undefined,
      correlationId: env.correlationId ?? undefined,
      causationId: env.causationId ?? undefined,
      traceId: env.traceId ?? undefined,
      idempotencyKey: env.idempotencyKey ?? undefined,
      partitionKey: env.partitionKey ?? undefined,
      visibility: env.visibility ?? "INTERNAL",
      payload: (env.payload as Record<string, unknown>) ?? {},
      meta: { retryCount: env.retryCount },
    };
    await projector.apply(ev);
    applied += 1;
  }
  return applied;
}