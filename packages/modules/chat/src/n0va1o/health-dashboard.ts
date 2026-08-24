/**
 * Connector Health Dashboard — scoring, lag, DLQ, replayable log
 */

import { prisma } from "@n0va/db";
import { connectorHealth } from "@n0va/modules-n0va1o/reliability";
import { listCheckpoints } from "@n0va/modules-n0va1o/sync";

export async function chatConnectorHealthDashboard(workspaceId: string) {
  const integrations = await prisma.integration.findMany({ where: { workspaceId } });
  const rows = await Promise.all(
    integrations.map(async (ig) => {
      const health = await connectorHealth(workspaceId, ig.id).catch(() => ({ score: 0, circuit: "UNKNOWN", failedEvents: 0, successRate: 0, lastEventAt: null }));
      const checkpoints = await listCheckpoints(ig.id).catch(() => []);
      // Lag = now - lastSyncedAt for each checkpoint
      const lag = checkpoints.map((cp: { objectType: string; lastSyncedAt: Date | null; conflictPolicy: string; cursor: unknown }) => ({
        objectType: cp.objectType,
        lastSyncedAt: cp.lastSyncedAt?.toISOString() ?? null,
        lagSec: cp.lastSyncedAt ? Math.floor((Date.now() - cp.lastSyncedAt.getTime()) / 1000) : null,
        conflictPolicy: cp.conflictPolicy,
        cursor: cp.cursor,
      }));
      const dlq = await prisma.connectorEventLog.count({ where: { workspaceId, integrationId: ig.id, status: "FAILED" } });
      return {
        connectorId: ig.id,
        provider: ig.provider,
        status: ig.status,
        health,
        lag,
        dlqCount: dlq,
        lastSyncAt: ig.lastSyncAt?.toISOString() ?? null,
      };
    }),
  );
  return rows;
}

export async function replayableEventLog(workspaceId: string, limit = 50) {
  return prisma.connectorEventLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, integrationId: true, direction: true, actionType: true, canonicalObject: true, status: true, createdAt: true, idempotencyKey: true },
  });
}
