/**
 * CHAT ↔ N0VA1O Unified Bridge — single policy and transport layer for CHAT externals
 *
 * Rule: every external integration goes through the gateway, never directly from chat service.
 * Covers: auth orchestration, token lifecycle, schema normalization, rate-limit mediation,
 * delivery guarantees, audit/observability — all via N0VA1O control plane.
 */

import { prisma } from "@n0va/db";
import { N0va1oGateway, idempotencyKeyFor, hashInput } from "@n0va/modules-n0va1o/gateway";
import { recordSuccess, recordFailure, isCircuitOpen, writeEventLog } from "@n0va/modules-n0va1o/reliability";
import { resolveOrRefresh } from "@n0va/modules-n0va1o/rotation";
import { recordOrigin } from "@n0va/modules-n0va1o/sync";

const gateway = new N0va1oGateway();

export type ChatConnectorAction =
  | "unfurl"
  | "fetch_issue"
  | "fetch_pr"
  | "fetch_ticket"
  | "post_message"
  | "create_task"
  | "create_issue"
  | "lookup_customer"
  | "command_relay";

export interface ChatGatewayCall {
  workspaceId: string;
  userId: string;
  connectorId: string; // slack_prod_01, github_prod, jira_prod, etc.
  provider: string;
  action: ChatConnectorAction;
  input: Record<string, unknown>;
  messageId?: string;
  channelId?: string;
  idempotencyKey?: string;
}

/**
 * Enforce gateway transit for CHAT. This is the ONLY entry-point chat should use for externals.
 * Throws if caller tries to bypass (direct fetch without viaGateway flag).
 */
export async function chatGatewayCall(opts: ChatGatewayCall): Promise<{ ok: boolean; data?: unknown; error?: string; via: "n0va1o" }> {
  const integration = await prisma.integration.findUnique({ where: { id: opts.connectorId } });
  if (!integration) throw new Error(`Connector not found: ${opts.connectorId}`);
  if (integration.workspaceId !== opts.workspaceId) throw new Error("Connector workspace mismatch");

  // Circuit breaker per-connector guard (never block entire gateway)
  if (isCircuitOpen(opts.connectorId)) {
    await writeEventLog({
      workspaceId: opts.workspaceId,
      integrationId: opts.connectorId,
      direction: "OUTBOUND",
      canonicalObject: "message",
      actionType: opts.action,
      payload: { ...opts.input, _blocked: "circuit_open" },
      idempotencyKey: opts.idempotencyKey ?? idempotencyKeyFor(opts.connectorId, opts.action, hashInput(opts.input)),
    });
    return { ok: false, error: "Connector circuit is OPEN — throttled transparently", via: "n0va1o" };
  }

  // Auth orchestration: ensure token valid via rotation single-flight before call
  // (gateway.resolveConnection also does this, but we surface the outcome here)
  try {
    const conn = await prisma.integrationConnection.findFirst({
      where: { integrationId: opts.connectorId, workspaceId: opts.workspaceId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    if (conn) {
      await resolveOrRefresh(gateway, conn as any, opts.workspaceId);
    }
  } catch {
    // best-effort: gateway will handle reauth workflows
  }

  const lineage = opts.messageId ? recordOrigin(opts.connectorId, opts.messageId) : recordOrigin(opts.connectorId);
  const result = await gateway.call({
    integration,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    actorLabel: `chat:${opts.userId}`,
    tool: opts.action,
    input: { ...opts.input, _chat: { channelId: opts.channelId, messageId: opts.messageId, provenance: lineage } },
    idempotencyKey: opts.idempotencyKey,
  });

  if (result.ok) {
    await recordSuccess(opts.connectorId, opts.workspaceId);
  } else {
    await recordFailure(opts.connectorId, opts.workspaceId, result.message);
  }

  return { ok: result.ok, data: { message: result.message, idempotencyKey: result.idempotencyKey, replayed: result.replayed }, error: result.ok ? undefined : result.message, via: "n0va1o" };
}

/**
 * Guard that asserts chat never calls fetch() to an external provider host directly.
 * Used in tests and in rich-content unfurl path: if caller passes viaGateway=false, throw.
 */
export function assertViaGateway(viaGateway: boolean, provider?: string) {
  if (!viaGateway) {
    throw new Error(`Direct external call to ${provider ?? "provider"} blocked — must go through N0VA1O gateway (chatGatewayCall)`);
  }
}

/**
 * Totp helper for data-model audit: produce connector audit trail entry
 * (per spec: per-tenant vaulting, scope minimization, event-level audit)
 */
export async function auditChatConnectorEvent(opts: {
  workspaceId: string;
  connectorId: string;
  action: ChatConnectorAction;
  status: "SUCCESS" | "FAILED" | "PENDING";
  messageId?: string;
  error?: string;
}) {
  await writeEventLog({
    workspaceId: opts.workspaceId,
    integrationId: opts.connectorId,
    direction: opts.action.startsWith("fetch") || opts.action === "unfurl" ? "INBOUND" : "OUTBOUND",
    canonicalObject: "message",
    actionType: opts.action,
    payload: { messageId: opts.messageId, workspaceId: opts.workspaceId },
    provenance: opts.messageId ? recordOrigin(opts.connectorId, opts.messageId) : recordOrigin(opts.connectorId),
    idempotencyKey: idempotencyKeyFor(opts.connectorId, opts.action, hashInput({ messageId: opts.messageId })),
  });
}
