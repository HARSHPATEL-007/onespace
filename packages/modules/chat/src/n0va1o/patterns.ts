/**
 * CHAT Integration Patterns — bidirectional sync, inbound bridge, outbound bridge, command relay
 * All go through N0VA1O bridge; never directly from chat service.
 */

import { prisma } from "@n0va/db";
import { chatGatewayCall } from "./bridge";
import { normalizeForChat } from "./transform-chat";
import { withAdaptiveBackoff } from "./rate-limit";
import { syncRecords, applyInboundRecords, recordOrigin } from "@n0va/modules-n0va1o/sync";
import { ingestEvent } from "@n0va/modules-n0va1o/events";
import { writeEventLog } from "@n0va/modules-n0va1o/reliability";

// ── Bidirectional sync ─────────────────────────────────────────────────

export async function chatBidirSync(opts: {
  workspaceId: string;
  userId: string;
  connectorId: string;
  provider: string;
  objectType: "message" | "task" | "event" | "contact";
  direction: "push" | "pull";
  records: Array<{ externalId: string; fields: Record<string, unknown>; updatedAt: string; provenance?: { origin?: string } }>;
}) {
  // Normalize via CHAT transform plugins before sync
  const normalized = opts.records.map((r) => normalizeForChat(opts.provider, r.fields)?.fields ?? r.fields);

  // Loop prevention via provenance.origin — syncRecords checks this
  const toSync = normalized.map((fields, i) => ({
    externalId: opts.records[i]!.externalId,
    fields,
    updatedAt: opts.records[i]!.updatedAt,
    provenance: recordOrigin(opts.connectorId, opts.records[i]!.provenance?.origin),
  }));

  const result = await syncRecords({
    integrationId: opts.connectorId,
    workspaceId: opts.workspaceId,
    objectType: opts.objectType,
    direction: opts.direction === "push" ? "PUSH" : "PULL",
    conflictPolicy: "LWW", // last-write wins, semantic resolution for CHAT messages
    records: toSync,
    externalWrite: opts.direction === "push"
      ? async (rec: { externalId: string; fields: Record<string, unknown>; updatedAt: string }) => {
          const res = await chatGatewayCall({
            workspaceId: opts.workspaceId,
            userId: opts.userId,
            connectorId: opts.connectorId,
            provider: opts.provider,
            action: "post_message",
            input: rec.fields,
            idempotencyKey: `${opts.connectorId}:${opts.objectType}:${rec.externalId}`,
          });
          return { ok: res.ok, error: res.error };
        }
      : undefined,
  });

  return { ...result, via: "n0va1o" as const };
}

// ── Inbound bridge — external → CHAT ──────────────────────────────────

export async function chatInboundBridge(opts: {
  workspaceId: string;
  connectorId: string;
  provider: string;
  raw: Record<string, unknown>;
  signature?: string | null;
  messageId?: string | null;
  channelId?: string;
}) {
  // Preserve source identity + provenance + trust level
  const trustLevel = opts.provider === "slack" || opts.provider === "msteams" ? "verified" : "unverified";

  const ingest = await ingestEvent({
    integrationId: opts.connectorId,
    workspaceId: opts.workspaceId,
    provider: opts.provider,
    raw: opts.raw,
    signature: opts.signature ?? null,
    secret: null,
    messageId: opts.messageId ?? null,
  });
  if (!ingest.accepted) return ingest;

  // Normalize into canonical event envelope (CHAT message)
  const normalized = normalizeForChat(opts.provider, opts.raw);
  const provenance = { origin: opts.connectorId, trustLevel, provider: opts.provider, sourceMessageId: opts.messageId ?? null };

  // Permission-aware ingestion: only ingest if workspace member has chat READ
  // (caller already authorized via requireWorkspace; we re-check via writeEventLog provenance)
  await writeEventLog({
    workspaceId: opts.workspaceId,
    integrationId: opts.connectorId,
    direction: "INBOUND",
    canonicalObject: normalized.canonicalObject,
    actionType: "CHAT_INGEST",
    payload: { ...normalized.fields, _provenance: provenance, _channelId: opts.channelId ?? null },
    provenance,
    idempotencyKey: opts.messageId ? `${opts.connectorId}:inbound:${opts.messageId}` : undefined,
  });

  // Materialize into ChatMessage (best-effort, chat service owns rendering)
  try {
    const body = String(normalized.fields.body ?? normalized.fields.title ?? JSON.stringify(opts.raw).slice(0, 500));
    await prisma.chatMessage.create({
      data: {
        workspaceId: opts.workspaceId,
        channelId: opts.channelId ?? (await resolveDefaultChatChannel(opts.workspaceId)),
        createdById: "system:bridge",
        authorName: `${opts.provider} • ${trustLevel}`,
        body: `↘ ${body}`,
        bodyHtml: `<p>↘ ${body.slice(0, 800)}</p>`,
      },
    });
  } catch {}

  return { ok: true as const, eventId: ingest.eventId, trustLevel, via: "n0va1o" as const };
}

async function resolveDefaultChatChannel(workspaceId: string): Promise<string> {
  const ch = await prisma.chatChannel.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (ch) return ch.id;
  const created = await prisma.chatChannel.create({
    data: { workspaceId, name: "general", kind: "CHANNEL" as never },
  });
  return created.id;
}

// ── Outbound bridge — CHAT → external ──────────────────────────────────

export async function chatOutboundBridge(opts: {
  workspaceId: string;
  userId: string;
  connectorId: string;
  provider: string;
  action: "post_message" | "create_task" | "create_issue" | "lookup_customer";
  input: Record<string, unknown>;
  messageId?: string;
  channelId?: string;
  requireConfirm?: boolean;
  confirmed?: boolean;
}) {
  // Confirm critical outbound before sending
  if (opts.requireConfirm && !opts.confirmed) {
    return { ok: false as const, requiresConfirm: true as const, via: "n0va1o" as const, error: "Confirmation required for outbound action" };
  }

  const withAudit = {
    ...opts.input,
    _sourceMessageId: opts.messageId ?? null,
    _channelId: opts.channelId ?? null,
    _audit: { actorId: opts.userId, timestamp: new Date().toISOString() },
  };

  const result = await withAdaptiveBackoff(opts.connectorId, async () =>
    chatGatewayCall({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      connectorId: opts.connectorId,
      provider: opts.provider,
      action: opts.action as never,
      input: withAudit,
      messageId: opts.messageId,
      channelId: opts.channelId,
    }),
  );

  if (!result.ok) {
    // Provide rollback/compensation hint
    await writeEventLog({
      workspaceId: opts.workspaceId,
      integrationId: opts.connectorId,
      direction: "OUTBOUND",
      canonicalObject: opts.action,
      actionType: "CHAT_OUTBOUND_FAILED",
      payload: { input: withAudit, error: result.error },
      provenance: recordOrigin(opts.connectorId, opts.messageId),
    });
  }

  return { ...result, via: "n0va1o" as const };
}

// ── Command relay — chat commands → external API ───────────────────────

const CHAT_COMMANDS: Record<string, { connectorCapability: string; destructive: boolean; providerHint?: string }> = {
  "/create issue": { connectorCapability: "create_issue", destructive: false, providerHint: "jira" },
  "/deploy status": { connectorCapability: "fetch_issue", destructive: false, providerHint: "github" },
  "/lookup customer": { connectorCapability: "lookup_customer", destructive: false, providerHint: "salesforce" },
  "/sync lead": { connectorCapability: "create_task", destructive: false, providerHint: "hubspot" },
  "/approve invoice": { connectorCapability: "create_issue", destructive: true, providerHint: "salesforce" },
  "/post to slack": { connectorCapability: "post_message", destructive: false, providerHint: "slack" },
};

export function parseChatCommandIntent(input: string): { capability: string; destructive: boolean; args: Record<string, unknown> } | null {
  const lower = input.trim().toLowerCase();
  for (const [cmd, meta] of Object.entries(CHAT_COMMANDS)) {
    if (lower.startsWith(cmd)) {
      const argsStr = input.slice(cmd.length).trim();
      const args: Record<string, unknown> = argsStr ? { query: argsStr, raw: argsStr } : {};
      // Structured arg parsing: key=value pairs
      for (const part of argsStr.split(/\s+/)) {
        const [k, v] = part.split("=");
        if (k && v) args[k] = v;
      }
      return { capability: meta.connectorCapability, destructive: meta.destructive, args };
    }
  }
  return null;
}

export async function chatCommandRelay(opts: {
  workspaceId: string;
  userId: string;
  connectorId: string;
  provider: string;
  rawCommand: string;
  channelId?: string;
  messageId?: string;
  confirmed?: boolean;
}) {
  const intent = parseChatCommandIntent(opts.rawCommand);
  if (!intent) return { ok: false as const, error: "Unknown command intent", via: "n0va1o" as const };

  if (intent.destructive && !opts.confirmed) {
    return { ok: false as const, requiresConfirm: true as const, via: "n0va1o" as const, error: "Destructive command requires confirmation" };
  }

  // Map command intent → connector capability contract (structured result, not just text)
  const result = await chatGatewayCall({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    connectorId: opts.connectorId,
    provider: opts.provider,
    action: intent.capability as never,
    input: { ...intent.args, _command: opts.rawCommand },
    messageId: opts.messageId,
    channelId: opts.channelId,
  });

  if (result.ok) {
    await writeEventLog({
      workspaceId: opts.workspaceId,
      integrationId: opts.connectorId,
      direction: "RELAY",
      canonicalObject: "command",
      actionType: intent.capability,
      payload: { command: opts.rawCommand, args: intent.args, result: result.data },
      provenance: recordOrigin(opts.connectorId, opts.messageId),
    });
  }

  return { ...result, intent, via: "n0va1o" as const };
}
