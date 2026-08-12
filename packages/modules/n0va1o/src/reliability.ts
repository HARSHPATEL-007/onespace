/**
 * N0VA1O Reliability — per-connector circuit breakers, dead-letter queue,
 * replayable event log, and connector health scoring (spec §reliability).
 *
 * Rule: never let one broken connector block the gateway. Ingestion,
 * normalization, and dispatch stay as distinct stages.
 */

import { prisma } from "@n0va/db";

const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;

/** In-process circuit state mirror (fast path); persisted in ConnectorCircuit. */
const circuits = new Map<string, { state: string; failureCount: number; cooldownUntil: number | null; lastError: string | null }>();

export function circuitSnapshot(integrationId: string) {
  return circuits.get(integrationId) ?? { state: "CLOSED", failureCount: 0, cooldownUntil: null, lastError: null };
}

export function isCircuitOpen(integrationId: string): boolean {
  const c = circuits.get(integrationId);
  if (!c || c.state !== "OPEN") return false;
  if (c.cooldownUntil && Date.now() > c.cooldownUntil) {
    // Half-open: allow a probe.
    circuits.set(integrationId, { ...c, state: "HALF_OPEN" });
    return false;
  }
  return true;
}

export async function recordSuccess(integrationId: string, workspaceId: string): Promise<void> {
  circuits.set(integrationId, { state: "CLOSED", failureCount: 0, cooldownUntil: null, lastError: null });
  await prisma.connectorCircuit.upsert({
    where: { integrationId },
    create: { integrationId, workspaceId, state: "CLOSED", failureCount: 0 },
    update: { state: "CLOSED", failureCount: 0, openedAt: null, cooldownUntil: null, lastError: null },
  });
}

export async function recordFailure(integrationId: string, workspaceId: string, error: string): Promise<{ tripped: boolean }> {
  const current = circuits.get(integrationId) ?? { state: "CLOSED", failureCount: 0, cooldownUntil: null, lastError: null };
  const failureCount = current.failureCount + 1;
  const tripped = current.state === "HALF_OPEN" || failureCount >= FAILURE_THRESHOLD;
  const state = tripped ? "OPEN" : current.state === "HALF_OPEN" ? "OPEN" : "CLOSED";
  circuits.set(integrationId, {
    state,
    failureCount,
    cooldownUntil: tripped ? Date.now() + COOLDOWN_MS : current.cooldownUntil,
    lastError: error,
  });
  await prisma.connectorCircuit.upsert({
    where: { integrationId },
    create: { integrationId, workspaceId, state, failureCount, cooldownUntil: tripped ? new Date(Date.now() + COOLDOWN_MS) : null, lastError: error },
    update: {
      state,
      failureCount,
      openedAt: tripped ? new Date() : undefined,
      cooldownUntil: tripped ? new Date(Date.now() + COOLDOWN_MS) : undefined,
      lastError: error,
    },
  });
  return { tripped };
}

export async function resetCircuit(integrationId: string, workspaceId: string): Promise<void> {
  circuits.delete(integrationId);
  await prisma.connectorCircuit.upsert({
    where: { integrationId },
    create: { integrationId, workspaceId, state: "CLOSED", failureCount: 0 },
    update: { state: "CLOSED", failureCount: 0, openedAt: null, cooldownUntil: null, lastError: null },
  });
}

// ── Replayable event log + DLQ ─────────────────────────────────────────

export interface EventLogEntry {
  integrationId?: string | null;
  workspaceId: string;
  direction: "INBOUND" | "OUTBOUND" | "RELAY";
  canonicalObject?: string | null;
  actionType: string;
  payload: Record<string, unknown>;
  provenance?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

export async function writeEventLog(entry: EventLogEntry): Promise<{ id: string; duplicate: boolean }> {
  if (entry.idempotencyKey) {
    const existing = await prisma.connectorEventLog.findUnique({
      where: { idempotencyKey: entry.idempotencyKey },
    });
    if (existing) return { id: existing.id, duplicate: true };
  }
  const row = await prisma.connectorEventLog.create({
    data: {
      integrationId: entry.integrationId,
      workspaceId: entry.workspaceId,
      direction: entry.direction,
      canonicalObject: entry.canonicalObject,
      actionType: entry.actionType,
      payload: entry.payload as never,
      provenance: (entry.provenance ?? {}) as never,
      idempotencyKey: entry.idempotencyKey,
      status: "SUCCESS",
    },
  });
  return { id: row.id, duplicate: false };
}

export async function failEvent(eventId: string, error: string): Promise<void> {
  await prisma.connectorEventLog.update({
    where: { id: eventId },
    data: { status: "FAILED", error, processedAt: new Date() },
  });
}

export function dlqWhere(workspaceId: string, status = "FAILED") {
  return { workspaceId, status };
}

export async function retryDlqEvent(eventId: string, workspaceId: string): Promise<{ id: string; status: string }> {
  const event = await prisma.connectorEventLog.findFirst({ where: { id: eventId, workspaceId } });
  if (!event) throw new Error("Event not found");
  const updated = await prisma.connectorEventLog.update({
    where: { id: eventId },
    data: { status: "PENDING", retryCount: { increment: 1 }, error: null, processedAt: null },
  });
  return { id: updated.id, status: updated.status };
}

// ── Connector health score (spec: health scoring for connectors) ───────

export async function connectorHealth(workspaceId: string, integrationId: string): Promise<{
  score: number;
  circuit: string;
  failedEvents: number;
  successRate: number;
  lastEventAt: Date | null;
}> {
  const circuit = await prisma.connectorCircuit.findUnique({ where: { integrationId } });
  const [failed, success, last] = await Promise.all([
    prisma.connectorEventLog.count({ where: { integrationId, status: "FAILED" } }),
    prisma.connectorEventLog.count({ where: { integrationId, status: "SUCCESS" } }),
    prisma.connectorEventLog.findFirst({ where: { integrationId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const total = failed + success;
  const successRate = total === 0 ? 1 : success / total;
  let score = successRate * 100;
  if (circuit?.state === "OPEN") score -= 35;
  if (circuit?.state === "HALF_OPEN") score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, circuit: circuit?.state ?? "CLOSED", failedEvents: failed, successRate: Math.round(successRate * 100), lastEventAt: last?.createdAt ?? null };
}