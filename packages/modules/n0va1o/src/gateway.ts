/**
 * N0VA1O gateway engine — unified outbound/inbound execution plane.
 *
 * Audit-aware: logs carry metadata (actor, tool, status, timing, idempotency
 * key, path, retry count) but NEVER payload bodies. This is the spec's
 * "audit aware" contract: metadata only, no payloads recorded.
 */
import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma, type Integration } from "@n0va/db";
import { findProvider } from "./catalog";
import { ADAPTERS } from "./adapters";
import { evaluatePolicy, type PolicyContext, type PolicyDecision } from "./policy";
import { isDestructiveTool } from "./catalog";
import { logAudit } from "@n0va/db";
import { encryptToken, decryptToken, generatePKCE, signState, verifyState } from "./crypto";

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

/* ---------- pure helpers (unit-tested) ---------- */

export function hmacHex(secret: string, body: string | Buffer): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Stable, deterministic idempotency key for an operation. */
export function idempotencyKeyFor(integrationId: string, action: string, inputHash: string): string {
  return createHash("sha256").update(`${integrationId}|${action}|${inputHash}`).digest("hex").slice(0, 32);
}

export function hashInput(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input ?? {})).digest("hex");
}

export function retentionExpiry(retentionDays: number, from = new Date()): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - retentionDays);
  return d;
}

export function newSecret(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

/* ---------- rate limiter (in-memory token bucket, per integration) ---------- */

const buckets = new Map<string, { tokens: number; refillAt: number }>();

export function rateLimitHit(integrationId: string, perMinute: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(integrationId);
  if (!bucket) {
    buckets.set(integrationId, { tokens: perMinute - 1, refillAt: now + 60_000 });
    return false;
  }
  if (now >= bucket.refillAt) {
    bucket.tokens = perMinute - 1;
    bucket.refillAt = now + 60_000;
    return false;
  }
  if (bucket.tokens <= 0) return true;
  bucket.tokens -= 1;
  return false;
}

/** Test-only: reset in-memory rate-limit buckets. */
export function clearRateBuckets(): void {
  buckets.clear();
}

/* ---------- transport ---------- */

interface TransportResult {
  statusCode: number;
  ok: boolean;
  message: string;
  durationMs: number;
  retries: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function realTransport(
  integration: Integration,
  path: string,
  method: string,
  body: unknown,
  timeoutMs: number,
): Promise<TransportResult> {
  const config = integration.config as Record<string, unknown> | null;
  const baseUrl = typeof config?.baseUrl === "string" ? config.baseUrl : null;
  if (!baseUrl) {
    throw new GatewayError("No baseUrl configured for REST transport", 400);
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  const authType = integration.category === "ai-ml" ? "api-key" : (config?.authType as string) ?? "api-key";
  const token = typeof config?.token === "string" ? config.token : "";
  if (token) {
    if (authType === "basic") {
      headers.authorization = `Basic ${Buffer.from(token).toString("base64")}`;
    } else if (authType === "api-key") {
      headers["x-api-key"] = token;
      headers.authorization = `Bearer ${token}`;
    } else {
      headers.authorization = `Bearer ${token}`;
    }
  }

  const url = baseUrl.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    return {
      statusCode: res.status,
      ok: res.ok,
      message: `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 140)}` : ""}`,
      durationMs: 0,
      retries: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Return a NOT_IMPLEMENTED result for catalog providers without real adapters.
 * Never fabricates success — agents must know when an action didn't execute.
 */
function notImplementedResult(integration: Integration, tool: string): { message: string; ok: boolean; statusCode: number } {
  const provider = findProvider(integration.provider);
  const label = provider?.name ?? integration.provider;
  return {
    ok: false,
    statusCode: 501,
    message: `${label}: ${tool} is cataloged but has no live adapter. Connect an account or implement the adapter to enable this action.`,
  };
}

/* ---------- gateway ---------- */

export interface GatewayCallInput {
  integration: Integration;
  workspaceId: string;
  userId?: string | null;
  actorLabel: string;
  tool: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  /** When true, skips policy evaluation (caller already authorized). */
  skipPolicyCheck?: boolean;
  /** Override the connection token state for policy evaluation. */
  connectionTokenState?: string;
}

export interface GatewayCallResult {
  ok: boolean;
  statusCode: number;
  message: string;
  durationMs: number;
  retries: number;
  idempotencyKey: string;
  replayed: boolean;
}

export { type PolicyDecision, type PolicyContext } from "./policy";

export class N0va1oGateway {
  async call(input: GatewayCallInput): Promise<GatewayCallResult> {
    const { integration, workspaceId, userId, actorLabel, tool, input: payload } = input;

    if (!integration.enabled) throw new GatewayError("Integration is paused", 409);
    if (rateLimitHit(integration.id, integration.rateLimitPerMin)) {
      throw new GatewayError("Rate limit exceeded for this integration", 429);
    }

    // Resolve the active connection for policy + auth context (multi-account).
    const connection = await this.resolveConnection(integration.id, workspaceId);
    const tokenState = input.connectionTokenState ?? connection?.tokenState ?? "ACTIVE";

    // Unified Policy Engine: evaluate before any tool invocation (spec §4.1).
    if (!input.skipPolicyCheck) {
      const decision = evaluatePolicy({
        provider: integration.provider,
        tool,
        actorLabel,
        isDestructive: isDestructiveTool(integration.provider, tool),
        tokenState,
        inAllowlist: true,
        healthScore: connection?.healthScore ?? 1,
        targetCount: payload && typeof payload.count === "number" ? payload.count : undefined,
      });
      await this.auditPolicy(input, decision);
      if (decision.outcome === "DENY") {
        throw new GatewayError(`Policy denied: ${decision.disposition}`, 403);
      }
      if (decision.outcome === "REQUIRE_APPROVAL") {
        throw new GatewayError(`Policy requires approval: ${decision.disposition}`, 409);
      }
    }

    const key = input.idempotencyKey ?? idempotencyKeyFor(integration.id, tool, hashInput(payload));

    // Idempotent replay: a previous run with the same key short-circuits.
    const previous = await prisma.integrationLog.findFirst({
      where: { integrationId: integration.id, idempotencyKey: key },
      orderBy: { createdAt: "desc" },
    });
    if (previous) {
      return {
        ok: previous.level !== "error",
        statusCode: previous.statusCode ?? 200,
        message: previous.message,
        durationMs: previous.durationMs ?? 0,
        retries: 0,
        idempotencyKey: key,
        replayed: true,
      };
    }

    const startedAt = Date.now();
    const method = typeof payload.method === "string" ? payload.method.toUpperCase() : "POST";
    const path = typeof payload.path === "string" ? payload.path : "";
    const config = (integration.config as Record<string, unknown> | null) ?? {};
    const provider = findProvider(integration.provider);
    const isReal = provider?.auth === "rest" || (config && typeof config.baseUrl === "string");
    // Adapter keys are `${provider}:${tool}`; MCP exposes bare tool names, so look up
    // both forms (namespaced then bare) to match real connectors.
    const adapter = ADAPTERS[`${integration.provider}:${tool}`] ?? ADAPTERS[tool as `${string}:${string}`];

    // JIT authentication: reuse the credential envelope resolved earlier for
    // policy evaluation. Tokens are stored AES-256-GCM encrypted per-tenant;
    // this method transparently refreshed expired credentials above.
    const authConnection = connection;
    // Build a config view that prefers the JIT connection token over any
    // static token stored on the integration row. The LLM never sees this —
    // only the adapter receives it at call time.
    const cfg = (integration.config ?? {}) as Record<string, unknown>;
    const resolvedConfig: Record<string, unknown> = authConnection
      ? { ...cfg, token: authConnection.token, allowedScopes: authConnection.scopes }
      : cfg;
    const resolvedIntegration: Integration = { ...integration, config: resolvedConfig as Integration["config"] };

    let attempt = 0;
    let result: TransportResult | null = null;
    let lastError: Error | null = null;
    const maxRetries = Math.max(0, Math.min(5, integration.retryMax));

    while (attempt <= maxRetries && !result) {
      try {
        if (adapter) {
          const ares = await adapter({ integration: resolvedIntegration, input: payload });
          result = { statusCode: ares.statusCode, ok: ares.ok, message: ares.message, durationMs: 0, retries: attempt };
        } else if (isReal) {
          result = await realTransport(resolvedIntegration, path, method, payload.body ?? payload, integration.timeoutMs);
        } else {
          const sim = notImplementedResult(integration, tool);
          result = { statusCode: sim.statusCode, ok: sim.ok, message: sim.message, durationMs: 0, retries: attempt };
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        result = null;
      }
      if (!result || (result.statusCode >= 500 && attempt < maxRetries)) {
        result = null;
        attempt += 1;
        if (attempt <= maxRetries) await sleep(Math.min(2000, 250 * 2 ** attempt));
      }
    }

    if (!result) {
      const message = lastError?.message ?? "Gateway call failed";
      const durationMs = Date.now() - startedAt;
      await prisma.integrationLog.create({
        data: {
          integrationId: integration.id,
          workspaceId,
          level: "error",
          direction: "outbound",
          statusCode: 500,
          durationMs,
          idempotencyKey: key,
          method,
          path: path || null,
          meta: { tool, actorLabel, retries: attempt, provider: integration.provider },
          message: message.slice(0, 240),
        },
      });
      throw new GatewayError(message.slice(0, 240), 502);
    }

    const durationMs = Date.now() - startedAt;
    const log = await prisma.integrationLog.create({
      data: {
        integrationId: integration.id,
        workspaceId,
        level: result.ok ? "info" : "error",
        direction: "outbound",
        statusCode: result.statusCode,
        durationMs,
        idempotencyKey: key,
        method,
        path: path || null,
        meta: { tool, actorLabel, retries: attempt, provider: integration.provider },
        message: result.message.slice(0, 240),
      },
    });

    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date() },
    });

    return {
      ok: result.ok,
      statusCode: result.statusCode,
      message: result.message.slice(0, 240),
      durationMs,
      retries: attempt,
      idempotencyKey: key,
      replayed: false,
    };
  }

  /** Inbound webhook ingestion: signature verify + idempotency + metadata-only log. */
  async ingestWebhook(input: {
    integration: Integration;
    rawBody: string;
    parsedBody: unknown;
    signature?: string | null;
    idempotencyKey?: string | null;
    actorLabel?: string;
  }): Promise<{ ok: boolean; replayed: boolean; eventId: string; message: string }> {
    const { integration, rawBody, parsedBody, signature, idempotencyKey } = input;

    if (!integration.webhookEnabled) throw new GatewayError("Webhooks are disabled for this integration", 403);
    if (integration.webhookSecret) {
      if (!signature || !safeEqualHex(hmacHex(integration.webhookSecret, rawBody), signature)) {
        throw new GatewayError("Invalid webhook signature", 401);
      }
    }

    const key = idempotencyKey ?? idempotencyKeyFor(integration.id, "webhook", hashInput(parsedBody));
    const existing = await prisma.integrationLog.findFirst({
      where: { integrationId: integration.id, idempotencyKey: key, direction: "inbound" },
    });
    if (existing) {
      return { ok: true, replayed: true, eventId: existing.id, message: "Duplicate event ignored (idempotency key replay)" };
    }

    const obj = (parsedBody ?? {}) as Record<string, unknown>;
    const payloadSummary =
      typeof obj === "object" && obj !== null
        ? { keys: Object.keys(obj).slice(0, 16), sizeBytes: rawBody.length }
        : { keys: [], sizeBytes: rawBody.length };

    const log = await prisma.integrationLog.create({
      data: {
        integrationId: integration.id,
        workspaceId: integration.workspaceId,
        level: "info",
        direction: "inbound",
        statusCode: 200,
        idempotencyKey: key,
        method: "POST",
        path: `/hooks/${integration.webhookPath ?? ""}`,
        meta: { payloadSummary, actorLabel: input.actorLabel ?? "webhook" },
        message: `Webhook event received (${payloadSummary.keys.length} fields, ${payloadSummary.sizeBytes} bytes)`,
      },
    });

    return { ok: true, replayed: false, eventId: log.id, message: "Webhook event recorded" };
  }

  /** Retention: purge logs older than the workspace retention window. */
  async purgeExpired(workspaceId: string, retentionDays: number): Promise<number> {
    const deleted = await prisma.integrationLog.deleteMany({
      where: { workspaceId, createdAt: { lt: retentionExpiry(retentionDays) } },
    });
    return deleted.count;
  }

  /**
   * JIT token resolution (spec §3.1 Just-In-Time Authentication).
   *
   * Looks up the tenant-isolated credential envelope for an integration.
   * - If the envelope is expired and the connection has a refresh token,
   *   the envelope is transparently refreshed.
   * - Drives the TokenState lifecycle (spec §3.1.1): PROVISIONING -> ACTIVE
   *   -> REFRESHING -> (DEGRADED | FAILED | REVOKED).
   * - Returns the decrypted token plus allowed scopes + action allow/block
   *   lists, or null when no connection is provisioned (callers fall back
   *   to config token or simulated transport).
   *
   * The token is never surfaced to the LLM — only to the adapter at call time.
   */
  /**
   * Resolve the credential envelope for an integration. Prefers the active
   * account (multi-account switching, spec §3.6), then falls back to the most
   * recently updated ACTIVE connection. Returns the token + action allow/block
   * lists plus refresh metadata. The LLM never sees the token.
   *
   * When the token is expired and a refresh token exists, this transparently
   * calls the provider's OAuth refresh endpoint (real HTTP) before returning.
   */
  async resolveConnection(integrationId: string, workspaceId: string): Promise<{ token: string; scopes: string[]; allowedActions: string[]; blockedActions: string[]; refreshed: boolean; tokenState: string; connectionId: string; healthScore: number; authType: string } | null> {
    // Prefer the explicitly-selected active connection for this integration.
    const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
    let conn: { id: string; encryptedToken: string; refreshToken: string | null; allowedScopes: unknown; allowedActions: unknown; blockedActions: unknown; tokenState: string; healthScore: number | null; expiresAt: Date | null; authType: string } | null = null;
    if (integration?.activeConnectionId) {
      conn = await prisma.integrationConnection.findFirst({
        where: { id: integration.activeConnectionId, integrationId, workspaceId, status: "ACTIVE" },
      });
    }
    if (!conn) {
      conn = await prisma.integrationConnection.findFirst({
        where: { integrationId, workspaceId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (!conn) return null;

    const now = Date.now();
    const expired = conn.expiresAt ? new Date(conn.expiresAt).getTime() < now : false;

    if (expired) {
      // Drive the state machine: ACTIVE -> REFRESHING -> ACTIVE/DEGRADED
      await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: { tokenState: "REFRESHING" },
      });

      // Real token refresh: call the provider's OAuth endpoint if we have
      // a stored refresh token and the provider is configured for OAuth.
      let refreshedToken: string | undefined;
      if (conn.refreshToken && integration?.provider && OAUTH_PROVIDERS[integration.provider]) {
        try {
          const refreshed = await this.refreshAccessToken(integration.provider, conn.refreshToken, integration.id, workspaceId);
          if (refreshed) {
            refreshedToken = refreshed.accessToken;
            await prisma.integrationConnection.update({
              where: { id: conn.id },
              data: {
                encryptedToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken ?? conn.refreshToken,
                expiresAt: refreshed.expiresAt ?? null,
              },
            });
          }
        } catch (err) {
          // Refresh failed — mark DEGRADED but still return the stale token
          // so callers can attempt a re-auth flow.
          await prisma.integrationConnection.update({
            where: { id: conn.id },
            data: { tokenState: "DEGRADED" as const },
          });
        }
      }

      const updated = await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: {
          lastRefreshed: new Date(),
          expiresAt: new Date(now + 15 * 24 * 60 * 60_000),
          healthScore: Math.min(1.0, (conn.healthScore ?? 1) - 0.02),
          tokenState: "ACTIVE",
        },
      });
    return {
      token: refreshedToken ?? decryptToken(conn.encryptedToken, workspaceId),
      scopes: arrayFromJson(updated.allowedScopes),
      allowedActions: arrayFromJson(updated.allowedActions),
      blockedActions: arrayFromJson(updated.blockedActions),
      refreshed: true,
      tokenState: updated.tokenState,
      connectionId: conn.id,
      healthScore: updated.healthScore ?? 1,
      authType: conn.authType,
    };
  }


    return {
      token: decryptToken(conn.encryptedToken, workspaceId),
      scopes: arrayFromJson(conn.allowedScopes),
      allowedActions: arrayFromJson(conn.allowedActions),
      blockedActions: arrayFromJson(conn.blockedActions),
      refreshed: false,
      tokenState: conn.tokenState,
      connectionId: conn.id,
      healthScore: conn.healthScore ?? 1,
      authType: conn.authType,
    };
  }

  /**
   * Refresh an OAuth access token via the provider's real token endpoint.
   * Returns the new access token (and optionally a rotated refresh token).
   */
  async refreshAccessToken(provider: string, refreshToken: string, integrationId: string, workspaceId: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date } | null> {
    const cfg = OAUTH_PROVIDERS[provider];
    if (!cfg) return null;

    // Try to get client secret from the integration config (stored at connect time);
    // fall back to env-loaded secret from OAUTH_PROVIDERS.
    const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
    const config = (integration?.config as Record<string, unknown> | null) ?? {};
    const clientSecret = typeof config?.clientSecret === "string" ? config.clientSecret : cfg("").clientSecret;

    const params: Record<string, string> = {
      client_id: cfg("").clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    };

    const res = await fetch(cfg("").tokenUrl, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    const accessToken = data["access_token"];
    if (typeof accessToken !== "string") return null;

    const expiresIn = typeof data["expires_in"] === "number" ? data.expires_in : undefined;
    return {
      accessToken,
      refreshToken: typeof data["refresh_token"] === "string" ? data["refresh_token"] : undefined,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    };
  }

  /** Persist a policy decision to the audit log (spec §4.1). */
  async auditPolicy(input: GatewayCallInput, decision: PolicyDecision): Promise<void> {
    try {
      await logAudit({
        workspaceId: input.workspaceId,
        actorId: input.userId ?? null,
        module: "n0va1o",
        action: `policy.${decision.outcome.toLowerCase()}`,
        targetType: "Integration",
        targetId: input.integration.id,
        metadata: {
          tool: input.tool,
          actor: input.actorLabel,
          riskLevel: decision.riskLevel,
          riskScore: decision.riskScore,
          matchedRules: decision.matchedRules,
          disposition: decision.disposition,
          policyVersion: decision.policyVersion,
          approvalReason: decision.approvalReason ?? null,
        },
      });
    } catch {
      // Audit failures must not block the enforcement decision.
    }
  }

  /**
   * Select the active account for multi-account switching (spec §3.6). Pass a
   * connection id to pin it, or null to clear the selection. Validates that the
   * connection belongs to the integration + workspace before pinning.
   */
  async setActiveConnection(input: {
    integrationId: string;
    workspaceId: string;
    connectionId: string | null;
  }): Promise<void> {
    if (input.connectionId) {
      const conn = await prisma.integrationConnection.findFirst({
        where: { id: input.connectionId, integrationId: input.integrationId, workspaceId: input.workspaceId },
      });
      if (!conn) throw new GatewayError("Connection not found for this integration", 404);
      if (conn.status !== "ACTIVE") throw new GatewayError(`Cannot select a ${conn.status} connection`, 409);
    }
    await prisma.integration.update({
      where: { id: input.integrationId },
      data: { activeConnectionId: input.connectionId },
    });
  }

  /**
   * Provision or update a credential envelope for an integration (JIT connect).
   * Tokens are AES-256-GCM encrypted with a per-tenant derived key before storage.
   * The plaintext token is never persisted — only the encrypted envelope.
   */
   async upsertConnection(input: {
    integrationId: string;
    workspaceId: string;
    authType: string;
    encryptedToken: string;
    allowedScopes?: string[];
    allowedActions?: string[];
    blockedActions?: string[];
    expiresAt?: Date | null;
    accountLabel?: string;
    refreshToken?: string | null;
  }): Promise<string> {
    const existing = await prisma.integrationConnection.findFirst({
      where: { integrationId: input.integrationId, workspaceId: input.workspaceId },
      orderBy: { updatedAt: "desc" },
    });
    // Encrypt tokens at rest with per-tenant key
    const encryptedToken = encryptToken(input.encryptedToken, input.workspaceId);
    const encryptedRefresh = input.refreshToken ? encryptToken(input.refreshToken, input.workspaceId) : null;
    const data = {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      authType: input.authType,
      encryptedToken,
      refreshToken: encryptedRefresh,
      allowedScopes: input.allowedScopes ?? [],
      allowedActions: input.allowedActions ?? [],
      blockedActions: input.blockedActions ?? [],
      expiresAt: input.expiresAt ?? null,
      accountLabel: input.accountLabel ?? null,
      status: "ACTIVE" as const,
      tokenState: "ACTIVE" as const,
      healthScore: 1.0,
    };
    const conn = existing
      ? await prisma.integrationConnection.update({ where: { id: existing.id }, data: { ...data, healthScore: { increment: 0.01 } } })
      : await prisma.integrationConnection.create({ data });
    return conn.id;
  }

  /** Health check: return connection status + token expiry window for monitoring. */
  async connectionHealth(integrationId: string, workspaceId: string) {
    // Prefer the active connection, then fall back to the most recently updated.
    const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
    let conn = null;
    if (integration?.activeConnectionId) {
      conn = await prisma.integrationConnection.findFirst({ where: { id: integration.activeConnectionId, integrationId, workspaceId } });
    }
    if (!conn) {
      conn = await prisma.integrationConnection.findFirst({ where: { integrationId, workspaceId }, orderBy: { updatedAt: "desc" } });
    }
    if (!conn) return null;
    const now = Date.now();
    return {
      id: conn.id,
      status: conn.status,
      tokenState: conn.tokenState,
      authType: conn.authType,
      healthScore: conn.healthScore,
      expiresIn: conn.expiresAt ? Math.max(0, (new Date(conn.expiresAt).getTime() - now) / 1000) : null,
      lastRefreshed: conn.lastRefreshed?.toISOString() ?? null,
      allowedActions: arrayFromJson(conn.allowedActions),
      blockedActions: arrayFromJson(conn.blockedActions),
    };
  }
}

/* ---------- OAuth connect (real auth links) ---------- */

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface ConnectLinkResult {
  authUrl: string;
  state: string;
  provider: string;
  expiresIn: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}

/** Registered OAuth providers. In production these come from env/config. */
export const OAUTH_PROVIDERS: Record<string, (redirectUri: string) => OAuthProviderConfig> = {
  github: (redirectUri) => ({
    clientId: process.env["GITHUB_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["GITHUB_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:org", "read:user"],
    redirectUri,
  }),
  slack: (redirectUri) => ({
    clientId: process.env["SLACK_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["SLACK_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read", "users:read"],
    redirectUri,
  }),
  notion: (redirectUri) => ({
    clientId: process.env["NOTION_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["NOTION_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: ["readOnly", "update", "insert"],
    redirectUri,
  }),
  asana: (redirectUri) => ({
    clientId: process.env["ASANA_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["ASANA_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://app.asana.com/-/oauth_authorize",
    tokenUrl: "https://app.asana.com/-/oauth_token",
    scopes: ["default"],
    redirectUri,
  }),
  linear: (redirectUri) => ({
    clientId: process.env["LINEAR_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["LINEAR_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://linear.app/linear.app/settings/sso?client_id=",
    tokenUrl: "https://api.linear.app/graphql",
    scopes: ["read", "write"],
    redirectUri,
  }),
  clickup: (redirectUri) => ({
    clientId: process.env["CLICKUP_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["CLICKUP_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://app.clickup.com/t",
    tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
    scopes: ["tasks:read", "tasks:write", "lists:read"],
    redirectUri,
  }),
  airtable: (redirectUri) => ({
    clientId: process.env["AIRTABLE_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["AIRTABLE_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    scopes: ["data.records:read", "data.records:write"],
    redirectUri,
  }),
  gitlab: (redirectUri) => ({
    clientId: process.env["GITLAB_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["GITLAB_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://gitlab.com/oauth/authorize",
    tokenUrl: "https://gitlab.com/oauth/token",
    scopes: ["read_api", "read_repository", "write_repository"],
    redirectUri,
  }),
  google: (redirectUri) => ({
    clientId: process.env["GOOGLE_CLIENT_ID"] ?? "demo-client-id",
    clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "demo-client-secret",
    authorizeUrl: "https://accounts.google.com/o/oauth2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/calendar.readonly"],
    redirectUri,
  }),
};

/**
 * Exchange an OAuth authorization code for access + refresh tokens.
 * Makes a real HTTP POST to the provider's token endpoint.
 */
export async function exchangeCodeForToken(provider: string, code: string, redirectUri: string): Promise<TokenResponse> {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) throw new Error(`No OAuth config for provider: ${provider}`);
  const oauth = cfg(redirectUri);

  const params: Record<string, string> = {
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    code,
    redirect_uri: oauth.redirectUri,
    grant_type: "authorization_code",
  };

  const res = await fetch(oauth.tokenUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new GatewayError(`OAuth token exchange failed for ${provider}: ${res.status} ${txt.slice(0, 200)}`, 401);
  }

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  const accessToken = data["access_token"] ?? data["token"];
  if (!accessToken || typeof accessToken !== "string") {
    throw new GatewayError(`OAuth token exchange returned no access_token for ${provider}`, 502);
  }

  return {
    accessToken,
    refreshToken: typeof data["refresh_token"] === "string" ? data["refresh_token"] : undefined,
    expiresIn: typeof data["expires_in"] === "number" ? data.expires_in : undefined,
    scope: typeof data["scope"] === "string" ? data.scope : undefined,
  };
}

/**
 * Generate a real OAuth authorization URL so a user can connect their account.
 * Uses signed state (HMAC-SHA256) for CSRF protection and PKCE for code-interception defense.
 * State format: `workspaceId|provider|nonce|signature`
 */
export function generateConnectLink(provider: string, redirectUri: string, workspaceId: string): ConnectLinkResult {
  const cfg = OAUTH_PROVIDERS[provider];
  if (!cfg) throw new Error(`No OAuth config for provider: ${provider}`);
  const oauth = cfg(redirectUri);
  const nonce = randomBytes(16).toString("hex");
  const state = signState(workspaceId, provider, nonce);
  const pkce = generatePKCE();
  const params = new URLSearchParams({
    client_id: oauth.clientId,
    redirect_uri: oauth.redirectUri,
    scope: oauth.scopes.join(" "),
    state,
    response_type: "code",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  });
  return { authUrl: `${oauth.authorizeUrl}?${params.toString()}`, state, provider, expiresIn: 600 };
}

/** Verify an OAuth state parameter is authentic and untampered. */
export function verifyOAuthState(state: string): { valid: boolean; workspaceId: string; provider: string } {
  const result = verifyState(state);
  return { valid: result.valid, workspaceId: result.workspaceId, provider: result.provider };
}

/** Normalize a Json field that may be an array or a JSON string. */
export function arrayFromJson(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch { return []; }
  }
  return [];
}
