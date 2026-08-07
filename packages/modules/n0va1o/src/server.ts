import { z } from "zod";
import { prisma, logAudit, type Integration, type IntegrationLog } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { findProvider, categoryLabel, discoverTools, type DiscoveredTool } from "./catalog";
import { N0va1oGateway, GatewayError, newSecret, retentionExpiry, arrayFromJson, OAUTH_PROVIDERS, generateConnectLink, exchangeCodeForToken, type ConnectLinkResult } from "./gateway";

const MODULE = "n0va1o";

export const integrationSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  token: z.string().max(2000).default(""),
  baseUrl: z.string().max(500).default(""),
  mcpEnabled: z.boolean().default(false),
});

export type IntegrationWithLogs = Integration & { logs: IntegrationLog[] };

export const gateway = new N0va1oGateway();

export class N0va1oService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE" | "ADMIN") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for n0va1o`);
    }
  }

  private async getIntegration(id: string) {
    const integration = await prisma.integration.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!integration) throw new Error("Integration not found");
    return integration;
  }

  /* ---------- catalog ---------- */

  categories() {
    return import("./catalog").then((c) => c.CATEGORIES);
  }

  providers() {
    return import("./catalog").then((c) => c.PROVIDERS);
  }

  /** Intent-driven tool discovery (spec §3.4) — top-N relevant catalog tools. */
  async discoverTools(query: string, maxTools = 5, providers?: string[]): Promise<DiscoveredTool[]> {
    await this.assert("READ");
    return discoverTools(query, { maxTools, providers });
  }

  /* ---------- connections ---------- */

  async list(): Promise<IntegrationWithLogs[]> {
    await this.assert("READ");
    return prisma.integration.findMany({
      where: { workspaceId: this.workspaceId },
      include: { logs: { orderBy: { createdAt: "desc" }, take: 4 } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async connect(input: z.infer<typeof integrationSchema>): Promise<void> {
    await this.assert("CREATE");
    const provider = findProvider(input.provider);
    const config: Record<string, string | boolean> = {};
    if (input.token) config.token = input.token;
    if (input.baseUrl) config.baseUrl = input.baseUrl;
    if (provider?.auth) config.authType = provider.auth;

    const integration = await prisma.integration.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        provider: input.provider,
        name: input.name,
        category: provider?.category ?? "other",
        status: "connected",
        config,
        enabled: true,
        mcpEnabled: input.mcpEnabled,
        webhookEnabled: true,
        webhookSecret: newSecret(24),
        webhookPath: newSecret(12),
        allowlistTools: [],
        blocklistTools: [],
      },
    });
    await prisma.integrationLog.create({
      data: {
        workspaceId: this.workspaceId,
        integrationId: integration.id,
        level: "info",
        direction: "system",
        message: `Connected ${provider?.name ?? input.provider} (${categoryLabel(provider?.category ?? "other")})`,
      },
    });
    await this.audit("integration.connected", input.provider, { provider: input.provider, mcpEnabled: input.mcpEnabled });
  }

  /**
   * Initiate an OAuth connection flow for an OAuth2 provider.
   * Creates (or reuses) an integration row, then returns a redirect URL to the
   * provider's authorization endpoint. The redirect URI points to our callback
   * route at /api/n0va1o/callback/[provider].
   */
  async connectOAuth(provider: string, mcpEnabled = true): Promise<{ integrationId: string; authUrl: string; state: string }> {
    await this.assert("CREATE");
    const p = findProvider(provider);
    if (!p) throw new Error(`Unknown provider: ${provider}`);
    if (p.auth !== "oauth2") throw new Error(`Provider ${provider} does not support OAuth (${p.auth})`);

    // Reuse existing integration or create a new one.
    let integration = await prisma.integration.findFirst({ where: { workspaceId: this.workspaceId, provider } });
    if (!integration) {
      integration = await prisma.integration.create({
        data: {
          workspaceId: this.workspaceId,
          createdById: this.userId,
          provider,
          name: p.name,
          category: p.category ?? "other",
          status: "connected",
          config: { authType: "oauth2" },
          enabled: true,
          mcpEnabled,
          webhookEnabled: false,
          webhookSecret: newSecret(24),
          webhookPath: newSecret(12),
          allowlistTools: [],
          blocklistTools: [],
        },
      });
    }

    const redirectUri = `${(process.env["N0VA1O_PUBLIC_URL"] ?? "http://localhost:3100")}/api/n0va1o/callback/${provider}`;
    // Persist the integration ID and workspace ID in the OAuth state so the
    // callback can verify the round-trip and link the connection.
    const link = generateConnectLink(provider, redirectUri, `${this.workspaceId}|${integration.id}`);
    return { integrationId: integration.id, authUrl: link.authUrl, state: link.state };
  }

  /**
   * Handle the OAuth callback: exchange the authorization code for tokens,
   * then store the credential envelope via upsertConnection.
   */
  async handleOAuthCallback(provider: string, code: string, state: string): Promise<{ connectionId: string; accountId: string; scopes: string[] }> {
    await this.assert("CREATE");
    // Verify the state parameter contains our workspace|integration pair.
    const parts = state.split("|");
    if (parts.length < 2) throw new GatewayError("Invalid OAuth state parameter", 400);
    const workspaceId = parts[0]!;
    const integrationId = parts[1]!;
    if (workspaceId !== this.workspaceId) throw new GatewayError("OAuth state workspace mismatch", 403);

    const integration = await prisma.integration.findFirst({ where: { id: integrationId, workspaceId: this.workspaceId, provider } });
    if (!integration) throw new GatewayError("Integration not found for OAuth callback", 404);

    const redirectUri = `${(process.env["N0VA1O_PUBLIC_URL"] ?? "http://localhost:3100")}/api/n0va1o/callback/${provider}`;
    const tokenResp = await exchangeCodeForToken(provider, code, redirectUri);

    const connId = await this.upsertConnection(integration.id, {
      encryptedToken: tokenResp.accessToken,
      authType: "oauth2",
      allowedScopes: tokenResp.scope ? tokenResp.scope.split(" ") : [],
      expiresAt: tokenResp.expiresIn ? new Date(Date.now() + tokenResp.expiresIn * 1000) : null,
      accountLabel: `${provider} account`,
      refreshToken: tokenResp.refreshToken ?? null,
    });

    // Set as active connection
    await gateway.setActiveConnection({ integrationId: integration.id, workspaceId: this.workspaceId, connectionId: connId });

    await this.audit("integration.oauth_connected", integration.id, { provider, hasRefresh: Boolean(tokenResp.refreshToken) });
    return { connectionId: connId, accountId: "oauth-account", scopes: tokenResp.scope ? tokenResp.scope.split(" ") : [] };
  }

  async update(id: string, patch: {
    name?: string;
    mcpEnabled?: boolean;
    webhookEnabled?: boolean;
    rateLimitPerMin?: number;
    retryMax?: number;
    timeoutMs?: number;
    allowlistTools?: string[];
    blocklistTools?: string[];
  }): Promise<void> {
    await this.assert("UPDATE");
    await this.getIntegration(id);
    await prisma.integration.update({
      where: { id },
      data: {
        name: patch.name?.trim() || undefined,
        mcpEnabled: patch.mcpEnabled,
        webhookEnabled: patch.webhookEnabled,
        rateLimitPerMin: patch.rateLimitPerMin,
        retryMax: patch.retryMax,
        timeoutMs: patch.timeoutMs,
        allowlistTools: patch.allowlistTools ?? undefined,
        blocklistTools: patch.blocklistTools ?? undefined,
      },
    });
    await this.audit("integration.updated", id, { patch: Object.keys(patch) });
  }

  /** Rotate the inbound webhook secret (returns the new secret once). */
  async rotateWebhook(id: string): Promise<{ secret: string; path: string; url: string }> {
    await this.assert("UPDATE");
    await this.getIntegration(id);
    const secret = newSecret(24);
    const path = newSecret(12);
    await prisma.integration.update({ where: { id }, data: { webhookSecret: secret, webhookPath: path } });
    await this.audit("integration.webhook_rotated", id);
    return { secret, path, url: `/api/n0va1o/hooks/${path}` };
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    await this.assert("UPDATE");
    const integration = await this.getIntegration(id);
    await prisma.integration.update({ where: { id }, data: { enabled } });
    await this.audit(enabled ? "integration.enabled" : "integration.paused", integration.provider);
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    const integration = await this.getIntegration(id);
    await prisma.integration.delete({ where: { id } });
    await this.audit("integration.disconnected", integration.provider);
  }

  /** Execute one outbound operation through the gateway. */
  async sync(id: string, tool = "sync", idempotencyKey?: string): Promise<{ message: string; ok: boolean; statusCode: number }> {
    await this.assert("UPDATE");
    const integration = await this.getIntegration(id);
    const result = await gateway.call({
      integration,
      workspaceId: this.workspaceId,
      userId: this.userId,
      actorLabel: this.role.toLowerCase(),
      tool,
      input: { path: "/sync", method: "GET" },
      idempotencyKey,
    });
    return { message: result.message, ok: result.ok, statusCode: result.statusCode };
  }

  /* ---------- JIT connections ---------- */

  async connections(id: string) {
    await this.assert("READ");
    const integration = await this.getIntegration(id);
    const conns = await prisma.integrationConnection.findMany({
      where: { integrationId: id, workspaceId: this.workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, accountLabel: true, authType: true, status: true, tokenState: true, expiresAt: true, lastRefreshed: true, healthScore: true, allowedActions: true, blockedActions: true, createdAt: true },
    });
    return conns.map((c) => ({
      id: c.id,
      accountLabel: c.accountLabel,
      authType: c.authType,
      status: c.status,
      tokenState: c.tokenState,
      healthScore: c.healthScore,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      lastRefreshed: c.lastRefreshed?.toISOString() ?? null,
      allowedActions: arrayFromJson(c.allowedActions),
      blockedActions: arrayFromJson(c.blockedActions),
      createdAt: c.createdAt.toISOString(),
      active: c.id === integration.activeConnectionId,
    }));
  }

  /** Switch the active account for an integration (multi-account, spec §3.6). */
  async setActiveConnection(id: string, connectionId: string | null): Promise<void> {
    await this.assert("UPDATE");
    await this.getIntegration(id);
    await gateway.setActiveConnection({ integrationId: id, workspaceId: this.workspaceId, connectionId });
    await this.audit("integration.active_connection_changed", id, { connectionId });
  }

  async connectionHealth(id: string) {
    await this.assert("READ");
    await this.getIntegration(id);
    return gateway.connectionHealth(id, this.workspaceId);
  }

  async upsertConnection(id: string, input: { encryptedToken: string; authType: string; allowedScopes?: string[]; allowedActions?: string[]; blockedActions?: string[]; expiresAt?: Date | null; accountLabel?: string; refreshToken?: string | null }) {
    await this.assert("UPDATE");
    await this.getIntegration(id);
    const connId = await gateway.upsertConnection({
      integrationId: id,
      workspaceId: this.workspaceId,
      authType: input.authType,
      encryptedToken: input.encryptedToken,
      refreshToken: input.refreshToken ?? null,
      allowedScopes: input.allowedScopes,
      allowedActions: input.allowedActions,
      blockedActions: input.blockedActions,
      expiresAt: input.expiresAt,
      accountLabel: input.accountLabel,
    });
    await this.audit("integration.connection_upserted", id);
    return connId;
  }

  async activity(id: string, take = 12): Promise<IntegrationLog[]> {
    await this.assert("READ");
    await this.getIntegration(id);
    return prisma.integrationLog.findMany({
      where: { integrationId: id },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  /* ---------- compliance & retention ---------- */

  async settings() {
    await this.assert("READ");
    const workspace = await prisma.workspace.findUnique({ where: { id: this.workspaceId } });
    return {
      retentionDays: workspace?.integrationRetentionDays ?? 90,
      mcpKey: workspace?.mcpKey ?? null,
      mcpKeySet: Boolean(workspace?.mcpKey),
    };
  }

  async setRetention(days: number): Promise<void> {
    await this.assert("ADMIN");
    const clamped = Math.max(1, Math.min(3285, Math.round(days))); // 1 day .. 9 years
    await prisma.workspace.update({ where: { id: this.workspaceId }, data: { integrationRetentionDays: clamped } });
    await this.audit("compliance.retention_updated", "workspace", { retentionDays: clamped });
  }

  async purgeExpired(): Promise<{ purged: number }> {
    await this.assert("ADMIN");
    const workspace = await prisma.workspace.findUnique({ where: { id: this.workspaceId } });
    const days = workspace?.integrationRetentionDays ?? 90;
    const purged = await gateway.purgeExpired(this.workspaceId, days);
    if (purged > 0) await this.audit("compliance.logs_purged", "workspace", { purged, retentionDays: days });
    return { purged };
  }

  async exportCsv(): Promise<string> {
    await this.assert("READ");
    const logs = await prisma.integrationLog.findMany({
      where: { workspaceId: this.workspaceId },
      include: { integration: { select: { name: true, provider: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ["timestamp_utc", "integration", "provider", "direction", "level", "status_code", "duration_ms", "idempotency_key", "tool", "method", "path", "message"],
      ...logs.map((l) => [
        l.createdAt.toISOString(),
        l.integration?.name ?? "",
        l.integration?.provider ?? "",
        l.direction,
        l.level,
        l.statusCode ?? "",
        l.durationMs ?? "",
        l.idempotencyKey ?? "",
        (l.meta as Record<string, unknown> | null)?.tool ?? "",
        l.method ?? "",
        l.path ?? "",
        l.message,
      ]),
    ];
    return rows.map((r) => r.map(esc).join(",")).join("\r\n");
  }

  /* ---------- MCP governance ---------- */

  async getMcpKey(): Promise<string> {
    await this.assert("ADMIN");
    const workspace = await prisma.workspace.findUnique({ where: { id: this.workspaceId } });
    if (workspace?.mcpKey) return workspace.mcpKey;
    return this.rotateMcpKey();
  }

  async rotateMcpKey(): Promise<string> {
    await this.assert("ADMIN");
    const key = `n0va1o_${newSecret(20)}`;
    await prisma.workspace.update({ where: { id: this.workspaceId }, data: { mcpKey: key } });
    await this.audit("mcp.key_rotated", "workspace");
    return key;
  }

  async accessRequests(): Promise<Array<{
    id: string;
    integrationName: string;
    provider: string;
    tool: string;
    reason: string;
    requesterLabel: string;
    status: string;
    toolArguments: unknown | null;
    reasoningChain: unknown[] | null;
    sessionContext: unknown[] | null;
    decidedById: string | null;
    approvedSignature: string | null;
    createdAt: Date;
    decidedAt: Date | null;
  }>> {
    await this.assert("READ");
    const rows = await prisma.integrationAccessRequest.findMany({
      where: { workspaceId: this.workspaceId },
      include: { integration: { select: { name: true, provider: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      integrationName: r.integration.name,
      provider: r.integration.provider,
      tool: r.tool,
      reason: r.reason,
      requesterLabel: r.requesterLabel,
      status: r.status,
      toolArguments: (r.toolArguments as unknown) ?? null,
      reasoningChain: (r.reasoningChain as unknown[] | null) ?? null,
      sessionContext: (r.sessionContext as unknown[] | null) ?? null,
      decidedById: r.decidedById,
      approvedSignature: r.approvedSignature,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
    }));
  }

  async decideAccess(requestId: string, approve: boolean, signature?: string): Promise<void> {
    await this.assert("ADMIN");
    const request = await prisma.integrationAccessRequest.findFirst({
      where: { id: requestId, workspaceId: this.workspaceId },
    });
    if (!request) throw new Error("Access request not found");
    if (request.status !== "PENDING") throw new Error("Access request already decided");

    if (approve) {
      const integration = await this.getIntegration(request.integrationId);
      const allowlist = Array.isArray((integration.allowlistTools as unknown) ?? [])
        ? (integration.allowlistTools as unknown as string[])
        : [];
      if (!allowlist.includes(request.tool)) allowlist.push(request.tool);
      await prisma.integration.update({
        where: { id: integration.id },
        data: { allowlistTools: allowlist },
      });
    }

    await prisma.integrationAccessRequest.update({
      where: { id: request.id },
      data: {
        status: approve ? "APPROVED" : "DENIED",
        decidedById: this.userId,
        decidedAt: new Date(),
        approvedSignature: approve && signature ? signature : null,
      },
    });
    await this.audit(approve ? "mcp.access_approved" : "mcp.access_denied", request.tool, { requestId: request.id, signature: Boolean(signature) });
  }

  /* ---------- helpers ---------- */

  isGatewayError(err: unknown): err is GatewayError {
    return err instanceof GatewayError;
  }

  retentionExpiry(days: number) {
    return retentionExpiry(days);
  }

  private audit(action: string, targetId: string, metadata?: Record<string, unknown>) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Integration",
      targetId,
      metadata,
    });
  }
}
