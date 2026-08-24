/**
 * CHAT Connector Catalog — searchable registry with governance surface area
 * Extends N0VA1O catalog.ts with CHAT-specific connector records
 */

import { PROVIDERS, findProvider, type CatalogProvider } from "@n0va/modules-n0va1o/catalog";
import { prisma } from "@n0va/db";

export type ChatConnectorStatus = "production" | "beta" | "planned";
export type ChatSyncMode = "realtime" | "polling" | "webhook";
export type ChatDirection = "bidirectional" | "inbound" | "outbound" | "relay";
export type ReliabilityTier = "tier1" | "tier2" | "tier3";

export interface ChatConnectorCatalogEntry {
  connectorId: string; // e.g. slack_prod_01
  provider: string; // slack
  providerName: string;
  status: ChatConnectorStatus;
  auth: { type: "oauth2" | "api-key" | "webhook" | "basic"; tokenState: string; refreshScheduledAt: string | null };
  mode: ChatDirection;
  objects: string[]; // message, task, event, contact, etc.
  syncMode: ChatSyncMode;
  rateLimit: { policy: "token_bucket"; perMinute: number; remaining: number; resetAt: string };
  transform: { schemaVersion: string; canonicalObject: string };
  dataResidency: string; // e.g. "us", "eu", "global"
  reliabilityTier: ReliabilityTier;
  healthScore: number | null;
}

const CHAT_PROVIDERS = new Set([
  "slack",
  "msteams",
  "discord",
  "github",
  "jira",
  "linear",
  "asana",
  "hubspot",
  "salesforce",
  "gcal",
  "gmail",
  "notion",
  "airtable",
  "zendesk",
  "intercom",
  "twilio",
]);

function tierFor(provider: string): ReliabilityTier {
  if (["slack", "github", "jira", "salesforce"].includes(provider)) return "tier1";
  if (["linear", "hubspot", "gmail"].includes(provider)) return "tier2";
  return "tier3";
}

export async function listChatConnectorCatalog(workspaceId: string): Promise<ChatConnectorCatalogEntry[]> {
  const integrations = await prisma.integration.findMany({
    where: { workspaceId },
    include: { connections: { orderBy: { updatedAt: "desc" }, take: 1 } },
  });

  const entries: ChatConnectorCatalogEntry[] = [];

  for (const ig of integrations) {
    if (!CHAT_PROVIDERS.has(ig.provider)) continue;
    const provider = findProvider(ig.provider) as CatalogProvider | undefined;
    const conn = ig.connections[0];
    const anyIg = ig as unknown as Record<string, unknown>;
    entries.push({
      connectorId: ig.id,
      provider: ig.provider,
      providerName: provider?.name ?? ig.provider,
      status: (ig.status === "connected" || ig.status === "ACTIVE" ? "production" : ig.status === "planned" ? "planned" : "beta") as ChatConnectorStatus,
      auth: {
        type: (provider?.auth as never) ?? "oauth2",
        tokenState: conn?.tokenState ?? "unknown",
        refreshScheduledAt: conn?.expiresAt ? new Date(conn.expiresAt.getTime() - 150 * 1000).toISOString() : null,
      },
      mode: ((anyIg.direction as string) as ChatDirection) ?? "bidirectional",
      objects: (anyIg.objectsSupported as string[] | undefined) ?? (provider ? provider.tools.slice(0, 4).map((t) => t.name) : ["message"]),
      syncMode: ((anyIg.syncMode as string) as ChatSyncMode) ?? "webhook",
      rateLimit: {
        policy: "token_bucket",
        perMinute: ig.rateLimitPerMin ?? 60,
        remaining: 0, // populated live via rate-limit bucket if needed
        resetAt: new Date(Date.now() + 60000).toISOString(),
      },
      transform: {
        schemaVersion: "v3",
        canonicalObject: "message",
      },
      dataResidency: (anyIg.dataResidency as string | undefined) ?? "global",
      reliabilityTier: tierFor(ig.provider),
      healthScore: conn?.healthScore ?? null,
    });
  }

  // Also surface catalog-only providers not yet installed (planned)
  for (const key of CHAT_PROVIDERS) {
    if (entries.some((e) => e.provider === key)) continue;
    const provider = findProvider(key);
    if (!provider) continue;
    entries.push({
      connectorId: `${key}_planned`,
      provider: key,
      providerName: provider.name,
      status: "planned",
      auth: { type: provider.auth as never, tokenState: "unconfigured", refreshScheduledAt: null },
      mode: "bidirectional",
      objects: provider.tools.slice(0, 3).map((t) => t.name),
      syncMode: "polling",
      rateLimit: { policy: "token_bucket", perMinute: 60, remaining: 60, resetAt: new Date(Date.now() + 60000).toISOString() },
      transform: { schemaVersion: "v3", canonicalObject: "message" },
      dataResidency: "global",
      reliabilityTier: tierFor(key),
      healthScore: null,
    });
  }

  return entries.sort((a, b) => {
    const order = { production: 0, beta: 1, planned: 2 } as const;
    return order[a.status] - order[b.status];
  });
}

export async function searchChatConnectors(workspaceId: string, query: string): Promise<ChatConnectorCatalogEntry[]> {
  const all = await listChatConnectorCatalog(workspaceId);
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter(
    (e) =>
      e.provider.toLowerCase().includes(q) ||
      e.providerName.toLowerCase().includes(q) ||
      e.objects.some((o) => o.toLowerCase().includes(q)) ||
      e.status.includes(q as never) ||
      e.mode.includes(q as never),
  );
}
