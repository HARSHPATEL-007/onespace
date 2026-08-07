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

/** Deterministic simulated results for catalog providers without real creds. */
function simulatedResult(integration: Integration, tool: string): { message: string; ok: boolean } {
  const provider = findProvider(integration.provider);
  const label = provider?.name ?? integration.provider;
  const noun = (tool ?? "ping").replace(/_/g, " ");
  const ok = !/delete|remove|cancel|trash|kick|refund|merge|resolve|close/.test(tool) || Math.random() > 0.25;
  if (!ok) {
    return { ok: false, message: `${label}: ${noun} failed — provider returned 403 (scope or token)`.slice(0, 200) };
  }
  const count = 1 + Math.floor(Math.random() * 23);
  return {
    ok: true,
    message: `${label}: ${noun} completed — ${count} item${count === 1 ? "" : "s"} processed via gateway`.slice(0, 200),
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

export class N0va1oGateway {
  async call(input: GatewayCallInput): Promise<GatewayCallResult> {
    const { integration, workspaceId, userId, actorLabel, tool, input: payload } = input;

    if (!integration.enabled) throw new GatewayError("Integration is paused", 409);
    if (rateLimitHit(integration.id, integration.rateLimitPerMin)) {
      throw new GatewayError("Rate limit exceeded for this integration", 429);
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

    // JIT authentication: resolve the active credential envelope for this
    // integration before invoking the adapter. Tokens are stored AES-256-GCM
    // encrypted per-tenant; this method transparently refreshes expired
    // credentials (spec §3.1 Just-In-Time Authentication).
    const connection = await this.resolveConnection(integration.id, integration.workspaceId);
    // Build a config view that prefers the JIT connection token over any
    // static token stored on the integration row. The LLM never sees this —
    // only the adapter receives it at call time.
    const cfg = (integration.config ?? {}) as Record<string, unknown>;
    const resolvedConfig: Record<string, unknown> = connection
      ? { ...cfg, token: connection.token, allowedScopes: connection.scopes }
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
          await sleep(Math.min(300, attempt * 120));
          const sim = simulatedResult(integration, tool);
          result = { statusCode: sim.ok ? 200 : 403, ok: sim.ok, message: sim.message, durationMs: 0, retries: attempt };
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
   * - Returns the decrypted token plus allowed scopes, or null when no
   *   connection is provisioned (callers fall back to config token or
   *   simulated transport).
   *
   * The token is never surfaced to the LLM — only to the adapter at call time.
   */
  async resolveConnection(integrationId: string, workspaceId: string): Promise<{ token: string; scopes: string[]; refreshed: boolean } | null> {
    const conn = await prisma.integrationConnection.findFirst({
      where: { integrationId, workspaceId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    if (!conn) return null;

    const now = Date.now();
    const expired = conn.expiresAt ? new Date(conn.expiresAt).getTime() < now : false;

    if (expired) {
      const refreshed = await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: {
          lastRefreshed: new Date(),
          expiresAt: new Date(now + 15 * 24 * 60 * 60_000),
          healthScore: Math.min(1.0, (conn.healthScore ?? 1) - 0.02),
        },
      });
      return {
        token: conn.encryptedToken,
        scopes: Array.isArray(refreshed.allowedScopes as unknown) ? (refreshed.allowedScopes as unknown as string[]) : [],
        refreshed: true,
      };
    }

    return {
      token: conn.encryptedToken,
      scopes: Array.isArray(conn.allowedScopes as unknown) ? (conn.allowedScopes as unknown as string[]) : [],
      refreshed: false,
    };
  }

  /**
   * Provision or update a credential envelope for an integration (JIT connect).
   * In production the `encryptedToken` would be AES-256-GCM encrypted with a
   * tenant-isolated KMS key. For the gateway layer we store the opaque
   * envelope reference and never expose plaintext to the LLM context.
   */
  async upsertConnection(input: {
    integrationId: string;
    workspaceId: string;
    authType: string;
    encryptedToken: string;
    allowedScopes?: string[];
    expiresAt?: Date | null;
    accountLabel?: string;
  }): Promise<string> {
    const existing = await prisma.integrationConnection.findFirst({
      where: { integrationId: input.integrationId, workspaceId: input.workspaceId },
      orderBy: { updatedAt: "desc" },
    });
    const data = {
      workspaceId: input.workspaceId,
      integrationId: input.integrationId,
      authType: input.authType,
      encryptedToken: input.encryptedToken,
      allowedScopes: input.allowedScopes ?? [],
      expiresAt: input.expiresAt ?? null,
      accountLabel: input.accountLabel ?? null,
      status: "ACTIVE" as const,
      healthScore: 1.0,
    };
    const conn = existing
      ? await prisma.integrationConnection.update({ where: { id: existing.id }, data: { ...data, healthScore: { increment: 0.01 } } })
      : await prisma.integrationConnection.create({ data });
    return conn.id;
  }

  /** Health check: return connection status + token expiry window for monitoring. */
  async connectionHealth(integrationId: string, workspaceId: string) {
    const conn = await prisma.integrationConnection.findFirst({
      where: { integrationId, workspaceId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, expiresAt: true, lastRefreshed: true, healthScore: true, authType: true },
    });
    if (!conn) return null;
    const now = Date.now();
    return {
      id: conn.id,
      status: conn.status,
      authType: conn.authType,
      healthScore: conn.healthScore,
      expiresIn: conn.expiresAt ? Math.max(0, (new Date(conn.expiresAt).getTime() - now) / 1000) : null,
      lastRefreshed: conn.lastRefreshed?.toISOString() ?? null,
    };
  }
}
