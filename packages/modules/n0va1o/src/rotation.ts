/**
 * N0VA1O Token Rotation Orchestration — proactive pre-expiry refresh with
 * single-flight locks per account-connector pair, token versioning, stampede
 * prevention, and reauth workflows on refresh failure (spec §token rotation).
 *
 * Rule: if many requests hit a near-expiry token, only ONE refresh runs;
 * every other caller awaits the same in-flight result.
 */

import { prisma } from "@n0va/db";
import type { IntegrationConnection } from "@n0va/db";
import type { N0va1oGateway } from "./gateway";
import { encryptToken, decryptToken } from "./crypto";

/** In-process single-flight registry: connectionId -> in-flight promise. */
const inFlight = new Map<string, Promise<RefreshOutcome>>();
const lockOwners = new Map<string, number>();

export interface RefreshOutcome {
  refreshed: boolean;
  reason: "fresh" | "refreshed" | "already_in_flight" | "failed";
  tokenVersion: number;
  error?: string;
}

const REFRESH_LEAD_SECONDS = 150; // refresh when <= 150s before expiry
const SCAN_LEAD_SECONDS = 900; // rotation scan looks up to 15min ahead

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = inFlight.get(key);
  if (prev) return prev as unknown as Promise<T>;
  lockOwners.set(key, (lockOwners.get(key) ?? 0) + 1);
  const p = fn().finally(() => {
    inFlight.delete(key);
    const remaining = (lockOwners.get(key) ?? 1) - 1;
    if (remaining <= 0) lockOwners.delete(key);
    else lockOwners.set(key, remaining);
  });
  inFlight.set(key, p as unknown as Promise<RefreshOutcome>);
  return p;
}

export function lockCount(key: string): number {
  return lockOwners.get(key) ?? 0;
}

/**
 * Ensure the connection's access token is valid, refreshing under a
 * single-flight lock when near expiry. Returns the decrypted token plus
 * the outcome of any refresh.
 */
export async function resolveOrRefresh(
  gateway: N0va1oGateway,
  connection: IntegrationConnection,
  workspaceId: string,
): Promise<{ token: string; outcome: RefreshOutcome }> {
  const { decryptToken } = await import("./crypto");
  const token = decryptToken(connection.encryptedToken, workspaceId);

  const nearExpiry =
    connection.expiresAt !== null &&
    connection.expiresAt !== undefined &&
    connection.expiresAt.getTime() - Date.now() < REFRESH_LEAD_SECONDS * 1000;

  if (!nearExpiry || connection.tokenState !== "ACTIVE") {
    return { token, outcome: { refreshed: false, reason: "fresh", tokenVersion: connection.tokenVersion } };
  }

  const outcome = await withLock(`refresh:${connection.id}`, async (): Promise<RefreshOutcome> => {
    // Re-check under the lock — another caller may have refreshed already.
    const current = await prisma.integrationConnection.findUnique({ where: { id: connection.id } });
    if (!current) return { refreshed: false, reason: "failed", tokenVersion: connection.tokenVersion, error: "Connection gone" };
    const stillNearExpiry =
      current.expiresAt !== null &&
      current.expiresAt !== undefined &&
      current.expiresAt.getTime() - Date.now() < REFRESH_LEAD_SECONDS * 1000;
    if (!stillNearExpiry || current.tokenState !== "ACTIVE") {
      return { refreshed: false, reason: "fresh", tokenVersion: current.tokenVersion };
    }
    if (!current.refreshToken) {
      await markDegraded(current, workspaceId, "No refresh token available — reauth required");
      return { refreshed: false, reason: "failed", tokenVersion: current.tokenVersion, error: "No refresh token" };
    }

    const integration = await prisma.integration.findUnique({ where: { id: current.integrationId } });
    if (!integration) return { refreshed: false, reason: "failed", tokenVersion: current.tokenVersion, error: "Integration gone" };

    await prisma.integrationConnection.update({
      where: { id: current.id },
      data: { tokenState: "REFRESHING" },
    });

    try {
      const result = await gateway.refreshAccessToken(integration.provider, decryptToken(current.refreshToken, workspaceId), integration.id, workspaceId);
      if (!result?.accessToken) throw new Error("Provider returned no access token");
      const nextVersion = current.tokenVersion + 1;
      await prisma.integrationConnection.update({
        where: { id: current.id },
        data: {
          encryptedToken: encryptToken(result.accessToken, workspaceId),
          refreshToken: result.refreshToken ? encryptToken(result.refreshToken, workspaceId) : current.refreshToken,
          expiresAt: result.expiresAt ?? null,
          tokenVersion: nextVersion,
          tokenState: "ACTIVE",
          lastRefreshed: new Date(),
          healthScore: Math.min(1, (current.healthScore ?? 1) + 0.05),
        },
      });
      return { refreshed: true, reason: "refreshed", tokenVersion: nextVersion };
    } catch (err) {
      const error = (err as Error).message;
      await markDegraded(current, workspaceId, error);
      return { refreshed: false, reason: "failed", tokenVersion: current.tokenVersion, error };
    }
  });

  const fresh = await prisma.integrationConnection.findUnique({ where: { id: connection.id } });
  const finalToken = fresh ? decryptToken(fresh.encryptedToken, workspaceId) : token;
  return { token: finalToken, outcome };
}

async function markDegraded(connection: IntegrationConnection, workspaceId: string, error: string) {
  const attempts = await prisma.connectorEventLog.count({
    where: { integrationId: connection.integrationId, actionType: "TOKEN_REFRESH", status: "FAILED" },
  });
  const state = attempts >= 2 ? "FAILED" : "DEGRADED";
  await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: { tokenState: state as never, healthScore: Math.max(0, (connection.healthScore ?? 1) - 0.2) },
  });
  await prisma.connectorEventLog.create({
    data: {
      integrationId: connection.integrationId,
      workspaceId,
      direction: "OUTBOUND",
      actionType: "TOKEN_REFRESH",
      canonicalObject: null,
      payload: { connectionId: connection.id, error },
      status: "FAILED",
      error,
    },
  });
}

/**
 * Rotation scan: find connections expiring within the lead window and refresh
 * them sequentially. Returns per-connection outcomes (spec: pre-expiry
 * refresh scheduling).
 */
export async function runRotationScan(gateway: N0va1oGateway, workspaceId: string): Promise<Array<{ connectionId: string; provider: string; outcome: RefreshOutcome }>> {
  const soon = new Date(Date.now() + SCAN_LEAD_SECONDS * 1000);
  const connections = await prisma.integrationConnection.findMany({
    where: { workspaceId, status: "ACTIVE", tokenState: { in: ["ACTIVE", "DEGRADED"] }, expiresAt: { not: null, lte: soon } },
    include: { integration: { select: { provider: true } } },
    take: 50,
  });
  const results: Array<{ connectionId: string; provider: string; outcome: RefreshOutcome }> = [];
  for (const conn of connections) {
    const { outcome } = await resolveOrRefresh(gateway, conn, workspaceId);
    results.push({ connectionId: conn.id, provider: conn.integration.provider, outcome });
  }
  return results;
}

/** Revoke a connection: clear tokens, mark REVOKED, log audit event. */
export async function revokeConnection(connectionId: string, workspaceId: string, reason = "manual"): Promise<void> {
  const conn = await prisma.integrationConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("Connection not found");
  await prisma.integrationConnection.update({
    where: { id: connectionId },
    data: {
      tokenState: "REVOKED",
      status: "REVOKED",
      encryptedToken: "REVOKED",
      refreshToken: null,
      expiresAt: new Date(),
    },
  });
  await prisma.connectorEventLog.create({
    data: {
      integrationId: conn.integrationId,
      workspaceId,
      direction: "OUTBOUND",
      actionType: "TOKEN_REVOKED",
      canonicalObject: null,
      payload: { connectionId, reason },
      status: "SUCCESS",
    },
  });
}

/** Build a reauth URL for a failed/revoked connection (provider callback). */
export function reauthUrlFor(provider: string, workspaceId: string, integrationId: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/n0va1o/connect?provider=${encodeURIComponent(provider)}&workspace=${workspaceId}&integration=${integrationId}`;
}
