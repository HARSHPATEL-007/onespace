/**
 * N0VA1O Events — webhook ingestion, signature verification, dedup,
 * event subscriptions, and dispatch to transformers. (spec §events)
 *
 * Integration: Gateway handles signature verification via GatewayWebhook,
 * but the module needs the ingest path for queue consumers and MCP servers.
 */

import { prisma } from "@n0va/db";
import type { Integration } from "@n0va/db";
import { verifyWebhookSignature } from "./adapter-engine";
import { transformPluginFor, normalizeRecord, type TransformPlugin } from "./transform";
import { writeEventLog, failEvent } from "./reliability";

export interface IngestEventInput {
  integrationId: string;
  workspaceId: string;
  provider: string;
  raw: Record<string, unknown>;
  signature?: string | null;
  secret?: string | null;
  headers?: Record<string, string>;
  messageId?: string | null;
}

export interface IngestEventResult {
  accepted: boolean;
  eventId?: string;
  duplicate?: boolean;
  normalizedCount: number;
  warnings: string[];
  error?: string;
}

export async function ingestEvent(input: IngestEventInput): Promise<IngestEventResult> {
  const { integrationId, workspaceId, provider, raw, signature, secret, headers, messageId } = input;

  if (signature && secret && !verifyWebhookSignature(secret, JSON.stringify(raw), signature)) {
    return { accepted: false, normalizedCount: 0, warnings: [], error: "Signature verification failed" };
  }

  const idempotencyKey = messageId ? `${integrationId}:webhook:${messageId}` : null;
  const eventRow = await writeEventLog({
    integrationId,
    workspaceId,
    direction: "INBOUND",
    canonicalObject: null,
    actionType: "WEBHOOK_RECEIVED",
    payload: { raw, provider },
    provenance: { origin: provider, sourceMessageId: messageId ?? null },
    idempotencyKey,
  });
  if (eventRow.duplicate) {
    return { accepted: true, eventId: eventRow.id, duplicate: true, normalizedCount: 0, warnings: [] };
  }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration) {
    await failEvent(eventRow.id, "Integration gone");
    return { accepted: false, normalizedCount: 0, warnings: [], error: "Integration gone" };
  }

  try {
    const plugin = transformPluginFor(provider);
    const warnings: string[] = [];
    const normalized = normalizeSingle(plugin, raw, warnings);
    const normEvent = await writeEventLog({
      integrationId,
      workspaceId,
      direction: "INBOUND",
      canonicalObject: normalized.canonicalObject,
      actionType: "NORMALIZED",
      payload: { normalized: normalized.fields, warnings: normalized.warnings },
      provenance: { origin: provider, sourceMessageId: messageId ?? null },
      idempotencyKey: messageId ? `${integrationId}:norm:${messageId}` : undefined,
    });
    return {
      accepted: true,
      eventId: eventRow.id,
      normalizedCount: normEvent.duplicate ? 0 : 1,
      warnings: normalized.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown normalization error";
    await failEvent(eventRow.id, message);
    return { accepted: false, normalizedCount: 0, warnings: [], error: message };
  }
}

function normalizeSingle(plugin: TransformPlugin, raw: Record<string, unknown>, warnings: string[]): { canonicalObject: string; fields: Record<string, unknown>; warnings: string[] } {
  const record = normalizeRecord(plugin, raw);
  warnings.push(...record.warnings);
  return { canonicalObject: record.canonicalObject, fields: record.fields, warnings };
}

export async function listRecentEvents(workspaceId: string, limit = 50) {
  return prisma.connectorEventLog.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}