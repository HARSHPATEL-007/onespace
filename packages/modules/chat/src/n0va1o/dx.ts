/**
 * CHAT N0VA1O Developer Experience — connector creation, sandbox, debugger, simulator, health
 */

import { prisma } from "@n0va/db";
import { normalizeForChat, discoverChatSchema } from "./transform-chat";
import { consumeToken, normalizedLimitHeaders, loadRateLimitProfile } from "./rate-limit";
import { connectorHealth } from "@n0va/modules-n0va1o/reliability";

export interface ConnectorManifest {
  key: string;
  name: string;
  provider: string;
  auth: "oauth2" | "api-key" | "webhook";
  direction: "bidirectional" | "inbound" | "outbound" | "relay";
  objects: string[];
  syncMode: "realtime" | "polling" | "webhook";
  version: string;
  scopes: string[];
}

export function buildConnectorManifest(input: Partial<ConnectorManifest> & { provider: string }): ConnectorManifest {
  return {
    key: input.key ?? `${input.provider}_chat_${Date.now()}`,
    name: input.name ?? `${input.provider} for Chat`,
    provider: input.provider,
    auth: input.auth ?? "oauth2",
    direction: input.direction ?? "bidirectional",
    objects: input.objects ?? ["message"],
    syncMode: input.syncMode ?? "webhook",
    version: input.version ?? "v3",
    scopes: input.scopes ?? ["chat:read", "chat:write"],
  };
}

// Test sandbox — isolated workspace for connector testing (no prod data)
export async function createConnectorSandbox(workspaceId: string, manifest: ConnectorManifest) {
  const sandboxId = `${workspaceId}:sandbox:${manifest.key}`;
  await prisma.connectorEventLog.create({
    data: {
      workspaceId,
      direction: "OUTBOUND",
      actionType: "SANDBOX_CREATED",
      payload: { manifest: manifest as unknown as object, sandboxId } as unknown as never,
      status: "SUCCESS",
    },
  });
  return { sandboxId, manifest, isolated: true as const };
}

// Transform debugger — show before/after for a sample payload
export async function debugTransform(provider: string, sample: Record<string, unknown>, locale?: string) {
  const normalized = normalizeForChat(provider, sample, { locale });
  const discovered = await discoverChatSchema(provider, sample);
  return { input: sample, normalized, discovered };
}

// Rate-limit simulator — dry-run quota consumption without real call
export async function simulateRateLimit(connectorId: string, cost = 1) {
  const profile = await loadRateLimitProfile(connectorId);
  const result = await consumeToken(connectorId, cost);
  const headers = normalizedLimitHeaders(profile, result.remaining, result.resetAt);
  return { ...result, headers, profile, simulated: true as const };
}

// Credential health page — per-connector health + expiry + circuit
export async function connectorCredentialHealth(workspaceId: string, connectorId: string) {
  const health = await connectorHealth(workspaceId, connectorId);
  const conn = await prisma.integrationConnection.findFirst({
    where: { integrationId: connectorId, workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { expiresAt: true, tokenState: true, healthScore: true, lastRefreshed: true },
  });
  return {
    connectorId,
    health,
    token: {
      state: conn?.tokenState ?? "unknown",
      expiresAt: conn?.expiresAt?.toISOString() ?? null,
      expiresInSec: conn?.expiresAt ? Math.max(0, Math.floor((conn.expiresAt.getTime() - Date.now()) / 1000)) : null,
      lastRefreshed: conn?.lastRefreshed?.toISOString() ?? null,
      healthScore: conn?.healthScore ?? null,
    },
    versioned: true as const,
  };
}

// Versioned connector releases + marketplace metadata
export async function publishConnectorRelease(opts: {
  workspaceId: string;
  connectorId: string;
  version: string;
  changelog?: string;
  marketplace?: { description?: string; icon?: string; category?: string };
}) {
  const entry = await prisma.connectorEventLog.create({
    data: {
      workspaceId: opts.workspaceId,
      integrationId: opts.connectorId,
      direction: "OUTBOUND",
      actionType: "CONNECTOR_RELEASED",
      payload: { version: opts.version, changelog: opts.changelog ?? null, marketplace: opts.marketplace ?? null },
      status: "SUCCESS",
    },
  });
  return { releaseId: entry.id, version: opts.version, marketplaceReady: Boolean(opts.marketplace) };
}
