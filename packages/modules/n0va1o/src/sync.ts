/**
 * N0VA1O Bidirectional Sync — two-way state consistency between N0VA and
 * external systems with conflict detection, merge policy, loop prevention,
 * idempotency, and sync checkpoints (spec §bidirectional sync).
 *
 * Rules:
 * - idempotency keys + message lineage IDs on every write
 * - echo-loop prevention: skip records whose provenance.origin == this connector
 * - sync only object types with stable semantics
 */

import { prisma } from "@n0va/db";
import type { NormalizedRecord } from "./transform";
import { writeEventLog } from "./reliability";

export type ConflictPolicy = "LWW" | "REMOTE_WINS" | "LOCAL_WINS" | "NONE";
export type SyncDirection = "PUSH" | "PULL";

export interface ConflictRecord {
  localId: string;
  remoteId: string;
  kind: string;
  resolvedBy: ConflictPolicy;
  winner: "LOCAL" | "REMOTE" | "UNRESOLVED";
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
}

export interface SyncResult {
  objectType: string;
  direction: SyncDirection;
  synced: number;
  skipped: number;
  conflicts: ConflictRecord[];
  newCursor: string;
}

interface SyncRecord {
  externalId: string;
  fields: Record<string, unknown>;
  updatedAt: string;
  provenance?: { origin?: string; sourceMessageId?: string };
}

export function recordOrigin(systemId: string, sourceMessageId?: string): { origin: string; sourceMessageId?: string } {
  return { origin: systemId, ...(sourceMessageId ? { sourceMessageId } : {}) };
}

export async function getCheckpoint(integrationId: string, workspaceId: string, objectType: string) {
  return prisma.connectorSyncCheckpoint.findUnique({
    where: { integrationId_objectType: { integrationId, objectType } },
  });
}

export async function setCheckpoint(integrationId: string, workspaceId: string, objectType: string, cursor: Record<string, unknown> | string, conflictPolicy: ConflictPolicy, lastError?: string | null): Promise<void> {
  await prisma.connectorSyncCheckpoint.upsert({
    where: { integrationId_objectType: { integrationId, objectType } },
    create: { integrationId, workspaceId, objectType, cursor: cursor as never, conflictPolicy, lastError: lastError ?? null },
    update: { cursor: cursor as never, conflictPolicy, lastSyncedAt: new Date(), lastError: lastError ?? null },
  });
}

export function cursorToString(cursor: Record<string, unknown> | string): string {
  return typeof cursor === "string" ? cursor : JSON.stringify(cursor);
}

/**
 * Push normalized records to the external system, or pull/apply records
 * from it. `apply` handles the inbound side (normalize → checkpoint →
 * conflict resolution); `push` side calls back with an external write fn.
 */
export async function syncRecords(opts: {
  integrationId: string;
  workspaceId: string;
  objectType: string;
  direction: SyncDirection;
  conflictPolicy: ConflictPolicy;
  records: SyncRecord[];
  /** inbound: full records fetched from external. outbound: pass null. */
  externalWrite?: (record: SyncRecord) => Promise<{ ok: boolean; error?: string }>;
}): Promise<SyncResult> {
  const { integrationId, workspaceId, objectType, direction, conflictPolicy, records } = opts;
  const checkpoint = await getCheckpoint(integrationId, workspaceId, objectType);
  const lastCursor = checkpoint?.cursor ? cursorToString(checkpoint.cursor as never) : null;

  const conflicts: ConflictRecord[] = [];
  let synced = 0;
  let skipped = 0;

  for (const record of records) {
    // Loop prevention: records that originated from this connector.
    if (record.provenance?.origin === integrationId) {
      skipped += 1;
      continue;
    }
    if (lastCursor && record.updatedAt <= lastCursor) {
      skipped += 1;
      continue;
    }

    if (direction === "PULL") {
      // Conflict detection: local states are represented by prior event log
      // entries keyed by externalId; LWW compares timestamps.
      const prior = await prisma.connectorEventLog.findFirst({
        where: { workspaceId, idempotencyKey: `${integrationId}:${objectType}:${record.externalId}` },
      });
      if (prior) {
        const priorUpdated = new Date((prior.payload as Record<string, unknown>)?.updatedAt as string).getTime();
        const remoteUpdated = new Date(record.updatedAt).getTime();
        if (priorUpdated > remoteUpdated) {
          conflicts.push({
            localId: (prior.payload as Record<string, unknown>)?.externalId as string ?? record.externalId,
            remoteId: record.externalId,
            kind: objectType,
            resolvedBy: conflictPolicy,
            winner: conflictPolicy === "REMOTE_WINS" ? "REMOTE" : conflictPolicy === "NONE" ? "UNRESOLVED" : "LOCAL",
            localUpdatedAt: new Date(priorUpdated).toISOString(),
            remoteUpdatedAt: record.updatedAt,
          });
          if (conflictPolicy === "NONE" || conflictPolicy === "LOCAL_WINS") continue;
        }
      }
      await writeEventLog({
        integrationId,
        workspaceId,
        direction: "INBOUND",
        canonicalObject: objectType,
        actionType: "SYNC_APPLY",
        payload: { externalId: record.externalId, updatedAt: record.updatedAt, ...record.fields } as Record<string, unknown>,
        provenance: record.provenance ?? null,
        idempotencyKey: `${integrationId}:${objectType}:${record.externalId}`,
      });
      synced += 1;
    } else {
      if (!opts.externalWrite) throw new Error("externalWrite required for PUSH");
      await writeEventLog({
        integrationId,
        workspaceId,
        direction: "OUTBOUND",
        canonicalObject: objectType,
        actionType: "SYNC_PUSH",
        payload: { externalId: record.externalId, updatedAt: record.updatedAt, ...record.fields } as Record<string, unknown>,
        provenance: record.provenance ?? null,
        idempotencyKey: `${integrationId}:${objectType}:push:${record.externalId}`,
      });
      const result = await opts.externalWrite(record);
      if (!result.ok) throw new Error(result.error ?? "External write failed");
      synced += 1;
    }
  }

  const newCursor = records.reduce<string>((max, r) => (r.updatedAt > max ? r.updatedAt : max), lastCursor ?? "");
  await setCheckpoint(integrationId, workspaceId, objectType, newCursor, conflictPolicy);
  return { objectType, direction, synced, skipped, conflicts, newCursor };
}

export async function applyInboundRecords(opts: {
  integrationId: string;
  workspaceId: string;
  objectType: string;
  conflictPolicy: ConflictPolicy;
  normalized: NormalizedRecord[];
}): Promise<SyncResult> {
  const records: SyncRecord[] = opts.normalized.map((n) => ({
    externalId: n.id,
    fields: n.fields,
    updatedAt: String((n.fields.updatedAt as string) ?? new Date().toISOString()),
    provenance: (n.fields.provenance as { origin?: string; sourceMessageId?: string }) ?? undefined,
  }));
  return syncRecords({
    integrationId: opts.integrationId,
    workspaceId: opts.workspaceId,
    objectType: opts.objectType,
    direction: "PULL",
    conflictPolicy: opts.conflictPolicy,
    records,
  });
}

export async function listCheckpoints(integrationId: string) {
  return prisma.connectorSyncCheckpoint.findMany({
    where: { integrationId },
    orderBy: { lastSyncedAt: "desc" },
  });
}