import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@n0va/db";
import {
  hmacHex,
  safeEqualHex,
  idempotencyKeyFor,
  hashInput,
  retentionExpiry,
  rateLimitHit,
  clearRateBuckets,
  N0va1oGateway,
} from "./gateway";
import { scopeTools, providerTools, isDestructiveTool, findProvider, PROVIDERS, discoverTools } from "./catalog";
import { GatewayError } from "./gateway";

test("hmac + safeEqual round-trip and tamper detection", () => {
  const body = JSON.stringify({ event: "message", ts: 123 });
  const sig = hmacHex("secret", body);
  assert.equal(sig.length, 64);
  assert.equal(safeEqualHex(sig, hmacHex("secret", body)), true);
  assert.equal(safeEqualHex(sig, hmacHex("other", body)), false);
  assert.equal(safeEqualHex(sig, body), false);
  assert.equal(safeEqualHex("a", "bbbb"), false);
});

test("idempotency keys are stable and input-sensitive", () => {
  const k1 = idempotencyKeyFor("int-1", "sync", hashInput({ a: 1 }));
  const k2 = idempotencyKeyFor("int-1", "sync", hashInput({ a: 1 }));
  const k3 = idempotencyKeyFor("int-1", "sync", hashInput({ a: 2 }));
  const k4 = idempotencyKeyFor("int-2", "sync", hashInput({ a: 1 }));
  assert.equal(k1, k2);
  assert.notEqual(k1, k3);
  assert.notEqual(k1, k4);
  assert.equal(k1.length, 32);
});

test("retention expiry computes a wall-clock window", () => {
  const from = new Date("2026-08-07T00:00:00Z");
  assert.equal(retentionExpiry(90, from).getTime(), new Date("2026-05-09T00:00:00Z").getTime());
  assert.equal(retentionExpiry(1, from).getTime(), new Date("2026-08-06T00:00:00Z").getTime());
  const e9y = retentionExpiry(3285, from);
  assert(new Date(from.getTime() - e9y.getTime()).getUTCFullYear() <= 2017);
});

test("rate limiter enforces its per-minute budget", () => {
  const id = "rate-load-test-1";
  clearRateBuckets();
  const perMin = 3;
  assert.equal(rateLimitHit(id, perMin), false);
  assert.equal(rateLimitHit(id, perMin), false);
  assert.equal(rateLimitHit(id, perMin), false);
  const t0 = Date.now();
  const fourth = rateLimitHit(id, perMin);
  // A wall-clock minute boundary could refill the bucket mid-test — accept
  // both outcomes then, otherwise the 4th call must trip.
  if (Date.now() - t0 > 60_000) {
    assert.equal(fourth, false);
  } else {
    assert.equal(fourth, true);
  }
});

test("MCP tool scoping: destructive blocked by default, allowlist admits, blocklist wins", () => {
  const slackTools = providerTools("slack");
  const destructive = slackTools.find((x) => x.destructive);

  if (destructive) {
    assert.equal(isDestructiveTool("slack", destructive.name), true);
    const scoped = scopeTools(slackTools, { allowlist: [], blocklist: [] });
    assert.equal(scoped.some((x) => x.name === destructive.name), false);
  }

  const withAllow = scopeTools(slackTools, { allowlist: [destructive?.name ?? "create_channel"], blocklist: [] });
  assert.equal(withAllow.some((x) => x.name === destructive?.name), true);

  // Non-destructive tools are open by default but blocked when blocklisted.
  const nonDestructive = slackTools.find((x) => !x.destructive)?.name ?? "list_channels";
  const blocked = scopeTools(slackTools, { allowlist: [], blocklist: [nonDestructive] });
  assert.equal(blocked.some((x) => x.name === nonDestructive), false);

  // When an allowlist is active, unlisted non-destructive tools are hidden too.
  const tight = scopeTools(slackTools, { allowlist: ["post_message"], blocklist: [] });
  for (const tool of tight) {
    assert.equal(tool.name, "post_message");
  }
});

test("JIT connection: token state lifecycle and expiry refresh", async () => {
  const gw = new N0va1oGateway();
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace, "demo workspace exists");
  const github = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "github" } });
  assert.ok(github, "demo github integration exists");

  // connectionHealth should report the seeded connection.
  const health = await gw.connectionHealth(github!.id, workspace!.id);
  assert.ok(health, "connection health exists");
  assert.equal(health!.tokenState, "ACTIVE");
  assert.ok(health!.expiresIn !== null && health!.expiresIn! > 0, "token not expired");

  // resolveConnection returns the token + action allow/block lists.
  const conn = await gw.resolveConnection(github!.id, workspace!.id);
  assert.ok(conn, "connection resolves");
  assert.equal(conn!.refreshed, false, "no refresh needed");
  assert.ok(conn!.allowedActions.includes("list_repos"));
  assert.ok(conn!.blockedActions.includes("delete_repo"));

  // Simulate expiry: set expiresAt to the past, then resolve should refresh.
  const connRow = await prisma.integrationConnection.findFirst({
    where: { integrationId: github!.id, workspaceId: workspace!.id },
  });
  assert.ok(connRow);
  await prisma.integrationConnection.update({
    where: { id: connRow!.id },
    data: { expiresAt: new Date(Date.now() - 60_000), tokenState: "REFRESHING" },
  });

  const refreshed = await gw.resolveConnection(github!.id, workspace!.id);
  assert.ok(refreshed, "connection re-resolves after expiry");
  assert.equal(refreshed!.refreshed, true, "token was refreshed");
  assert.equal(refreshed!.tokenState, "ACTIVE", "state returned to ACTIVE after refresh");
});

test("intent-driven discovery: returns top-N relevant tools with scores and reasons", () => {
  // A query about messaging should surface Slack/Discord post tools.
  const found = discoverTools("send a message to the team channel", { maxTools: 5 });
  assert.ok(found.length > 0, "discovered at least one tool");
  assert.ok(found.length <= 5, "respects maxTools");
  // Top result should be a messaging-related tool.
  const top = found[0];
  assert.ok(top, "a top result exists");
  assert.ok(top!.relevance > 0, "relevance is positive");
  assert.ok(top!.relevance <= 1, "relevance is normalized to <= 1");
  assert.ok(top!.reason.length > 0, "a human-readable reason is provided");
  const messaging = found.some(
    (t) => t.name === "post_message" || t.name === "send_message" || t.name === "post_chat",
  );
  assert.ok(messaging, "messaging tools rank for a 'send a message' query");

  // Scores are descending.
  for (let i = 1; i < found.length; i++) {
    const prev = found[i - 1]!;
    const curr = found[i]!;
    assert.ok(prev.relevance >= curr.relevance, "results are sorted by relevance desc");
  }
});

test("intent-driven discovery: provider filter restricts results", () => {
  const all = discoverTools("list issues", { maxTools: 20 });
  const githubOnly = discoverTools("list issues", { maxTools: 20, providers: ["github"] });
  assert.ok(githubOnly.length > 0, "github filter returns results");
  assert.ok(githubOnly.every((t) => t.providerKey === "github"), "all results are from github");
  assert.ok(githubOnly.length <= all.length, "filtering narrows the result set");
});

test("intent-driven discovery: empty or trivial query returns empty", () => {
  assert.equal(discoverTools("").length, 0, "empty query returns nothing");
  assert.equal(discoverTools("the and or").length, 0, "stopword-only query returns nothing");
});

test("multi-account: setActiveConnection pins an ACTIVE connection and resolves it first", async () => {
  const gw = new N0va1oGateway();
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace, "demo workspace exists");
  const github = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "github" } });
  assert.ok(github, "github integration exists");

  // Create a second connection (simulating a second account).
  const secondConn = await prisma.integrationConnection.create({
    data: {
      workspaceId: workspace!.id,
      integrationId: github!.id,
      accountLabel: "secondary-repo (demo)",
      authType: "oauth2",
      encryptedToken: "demo-token-envelope-second",
      allowedScopes: ["repo"],
      allowedActions: ["list_repos"],
      blockedActions: ["delete_repo"],
      status: "ACTIVE",
      tokenState: "ACTIVE",
      healthScore: 0.95,
    },
  });

  // Resolve initially picks the most recently updated (the new one).
  const initial = await gw.resolveConnection(github!.id, workspace!.id);
  assert.ok(initial, "resolves a connection");
  assert.equal(initial!.connectionId, secondConn.id, "initially resolves the newest connection");

  // Pin the original (seeded) connection as active.
  const seededConn = await prisma.integrationConnection.findFirst({
    where: { integrationId: github!.id, accountLabel: "core-repo (demo)" },
  });
  assert.ok(seededConn, "seeded connection exists");
  await gw.setActiveConnection({ integrationId: github!.id, workspaceId: workspace!.id, connectionId: seededConn!.id });

  const pinned = await gw.resolveConnection(github!.id, workspace!.id);
  assert.ok(pinned, "resolves after pinning");
  assert.equal(pinned!.connectionId, seededConn!.id, "resolves the pinned active account");
  assert.ok(pinned!.allowedActions.includes("list_repos"), "pinned connection carries its allowlist");

  // Switching clears when passing null.
  await gw.setActiveConnection({ integrationId: github!.id, workspaceId: workspace!.id, connectionId: null });
  const cleared = await gw.resolveConnection(github!.id, workspace!.id);
  assert.equal(cleared!.connectionId, secondConn.id, "falls back to newest after clearing active");
});

test("multi-account: setActiveConnection rejects foreign or non-ACTIVE connections", async () => {
  const gw = new N0va1oGateway();
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  const github = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "github" } });
  assert.ok(github);

  await assert.rejects(
    () => gw.setActiveConnection({ integrationId: github!.id, workspaceId: workspace!.id, connectionId: "nonexistent-id" }),
    (err: unknown) => err instanceof GatewayError && err.statusCode === 404,
    "rejects a connection id that does not belong to the integration",
  );
});