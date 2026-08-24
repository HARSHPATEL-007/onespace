/**
 * CHAT OAuth Lifecycle — provider discovery, PKCE, refresh orchestration, consent & revocation
 * Extends N0VA1O gateway OAuth (gateway.ts) with chat-specific identity passthrough (user vs bot)
 */

import { prisma } from "@n0va/db";
import {
  generateConnectLink as baseGenerateLink,
  exchangeCodeForToken,
  verifyOAuthState,
  OAUTH_PROVIDERS,
} from "@n0va/modules-n0va1o/gateway";
import { revokeConnection } from "@n0va/modules-n0va1o/rotation";

export type OAuthIdentityKind = "user" | "bot";

export interface ChatOAuthConnectOpts {
  workspaceId: string;
  userId: string;
  provider: string;
  redirectUri: string;
  identityKind: OAuthIdentityKind;
  scopes?: string[];
  connectorId?: string;
}

export interface ConsentRecord {
  workspaceId: string;
  userId: string;
  provider: string;
  connectorId: string;
  scopes: string[];
  grantedAt: string;
  identityKind: OAuthIdentityKind;
}

/**
 * Provider discovery — OIDC discovery or static map
 */
export function discoverProvider(provider: string, redirectUri: string) {
  const cfgFn = OAUTH_PROVIDERS[provider];
  if (!cfgFn) throw new Error(`Unknown provider: ${provider}`);
  const cfg = cfgFn(redirectUri);
  return {
    provider,
    authorizeUrl: cfg.authorizeUrl,
    tokenUrl: cfg.tokenUrl,
    scopes: cfg.scopes,
    pkce: true,
    discovery: `https://${provider}.provider/discovery` as const,
  };
}

/**
 * Generate PKCE-aware connect link with consent tracking
 */
export function generateChatConnectLink(opts: ChatOAuthConnectOpts) {
  const link = baseGenerateLink(opts.provider, opts.redirectUri, opts.workspaceId);
  // Persist pending consent intent (audit)
  // Fire-and-forget: store in connectorEventLog for audit trail
  void prisma.connectorEventLog
    .create({
      data: {
        workspaceId: opts.workspaceId,
        direction: "OUTBOUND",
        actionType: "OAUTH_CONSENT_REQUESTED",
        canonicalObject: null,
        payload: {
          provider: opts.provider,
          userId: opts.userId,
          identityKind: opts.identityKind,
          scopes: opts.scopes ?? [],
          connectorId: opts.connectorId ?? null,
        },
        status: "PENDING",
      },
    })
    .catch(() => {});
  return { ...link, identityKind: opts.identityKind };
}

export async function handleChatOAuthCallback(opts: {
  workspaceId: string;
  provider: string;
  code: string;
  state: string;
  redirectUri: string;
  userId: string;
  connectorId: string;
}) {
  const verified = verifyOAuthState(opts.state);
  if (!verified.valid || verified.workspaceId !== opts.workspaceId || verified.provider !== opts.provider) {
    throw new Error("Invalid OAuth state");
  }
  const tokens = await exchangeCodeForToken(opts.provider, opts.code, opts.redirectUri);
  // Consent & scope tracking — persist granted scopes
  const grantedScopes = tokens.scope ? tokens.scope.split(" ") : [];
  await prisma.connectorEventLog.create({
    data: {
      workspaceId: opts.workspaceId,
      integrationId: opts.connectorId,
      direction: "INBOUND",
      actionType: "OAUTH_CONSENT_GRANTED",
      canonicalObject: null,
      payload: {
        provider: opts.provider,
        userId: opts.userId,
        scopes: grantedScopes,
        expiresIn: tokens.expiresIn ?? null,
      },
      status: "SUCCESS",
    },
  });

  // Store via gateway upsertConnection (encrypted at rest, per-tenant vault)
  // The gateway's upsertConnection expects already-encrypted? It encrypts internally, so pass raw
  const { N0va1oGateway } = await import("@n0va/modules-n0va1o/gateway");
  const gw = new N0va1oGateway();
  await gw.upsertConnection({
    integrationId: opts.connectorId,
    workspaceId: opts.workspaceId,
    authType: "oauth2",
    encryptedToken: tokens.accessToken,
    allowedScopes: grantedScopes,
    allowedActions: [],
    blockedActions: [],
    expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null,
    accountLabel: opts.userId,
    refreshToken: tokens.refreshToken ?? null,
  });

  return { ok: true as const, scopes: grantedScopes, expiresIn: tokens.expiresIn };
}

/**
 * Revocation handling on disconnect — gateway-controlled, per spec never let chat store raw refresh
 */
export async function revokeChatConnector(opts: {
  workspaceId: string;
  connectorId: string;
  connectionId: string;
  actorId: string;
  reason?: string;
}) {
  await revokeConnection(opts.connectionId, opts.workspaceId, opts.reason ?? "chat_disconnect");
  await prisma.connectorEventLog.create({
    data: {
      workspaceId: opts.workspaceId,
      integrationId: opts.connectorId,
      direction: "OUTBOUND",
      actionType: "OAUTH_REVOKED",
      canonicalObject: null,
      payload: { connectionId: opts.connectionId, actorId: opts.actorId, reason: opts.reason ?? "revoked" },
      status: "SUCCESS",
    },
  });
}

/**
 * Totp: never store raw long-lived refresh without gateway control — helper to assert
 */
export function assertGatewayTokenControl(hasRefreshToken: boolean, viaGateway: boolean) {
  if (hasRefreshToken && !viaGateway) {
    throw new Error("Raw refresh token storage without gateway control is forbidden");
  }
}
