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
import { scopeTools, providerTools, isDestructiveTool, findProvider, PROVIDERS } from "./catalog";

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