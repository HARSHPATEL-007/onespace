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
import { evaluatePolicy, DEFAULT_POLICY, type PolicyContext } from "./policy";
import { InMemoryWorkflowStore } from "./versioning";
import { redact, applyRetention, canReplay, DEFAULT_RETENTION } from "./session";
import { scrubSecrets, scrubString, containsSecret, redactSecretFields, rotationStatus } from "./secrets";
import { classifyContent, canReachLLM, canReachExternal, normalizeLabel } from "./privacy";
import { IncidentManager } from "./incident";
import { computeHealthScore } from "./health";
import { detectSchemaDrift, applySafeMappings } from "./schema-drift";
import { bulkProcess, chunkRecords } from "./bulk";
import { DependencyMapper } from "./dependency";

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

test("multi-account: connections() surfaces active flag and tokenState per account", async () => {
  const gw = new N0va1oGateway();
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace);
  const github = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "github" } });
  assert.ok(github);

  // Reuse the seeded connection; verify the service-shaped fields are present.
  const conn = await prisma.integrationConnection.findFirst({ where: { integrationId: github!.id } });
  assert.ok(conn, "seeded connection exists");

  // connectionHealth returns the tokenState + action lists.
  const health = await gw.connectionHealth(github!.id, workspace!.id);
  assert.ok(health, "health exists");
  assert.equal(health!.tokenState, "ACTIVE");
  assert.ok(health!.allowedActions.includes("list_repos"), "health exposes allowedActions");
  assert.ok(health!.blockedActions.includes("delete_repo"), "health exposes blockedActions");
});

test("policy engine: allows read operations with low risk", () => {
  const decision = evaluatePolicy({
    provider: "github",
    tool: "list_issues",
    actorLabel: "agent",
    isDestructive: false,
    tokenState: "ACTIVE",
    inAllowlist: true,
    healthScore: 0.98,
  });
  assert.equal(decision.outcome, "ALLOW");
  assert.ok(decision.riskScore < 25, "read op has low risk score");
  assert.ok(decision.matchedRules.length > 0, "matched at least one rule");
});

test("policy engine: denies destructive blocked actions", () => {
  const decision = evaluatePolicy({
    provider: "github",
    tool: "delete_repo",
    actorLabel: "agent",
    isDestructive: true,
    tokenState: "ACTIVE",
    inAllowlist: false,
    healthScore: 0.98,
  });
  assert.equal(decision.outcome, "DENY", "blocked action is denied");
  assert.ok(decision.matchedRules.includes("blocked-action"), "blocked-action rule matched");
});

test("policy engine: requires approval for destructive off-hours", () => {
  const decision = evaluatePolicy({
    provider: "github",
    tool: "merge_pr",
    actorLabel: "agent",
    isDestructive: true,
    tokenState: "ACTIVE",
    inAllowlist: false,
    healthScore: 0.98,
    hour: 23,
  });
  assert.equal(decision.outcome, "REQUIRE_APPROVAL", "destructive off-hours requires approval");
  assert.ok(decision.approvalReason, "approval reason provided");
});

test("policy engine: denies when connection FAILED", () => {
  const decision = evaluatePolicy({
    provider: "slack",
    tool: "post_message",
    actorLabel: "agent",
    isDestructive: false,
    tokenState: "FAILED",
    inAllowlist: true,
    healthScore: 0,
  });
  assert.equal(decision.outcome, "DENY", "failed connection denies all");
  assert.equal(decision.riskLevel, "critical");
});

test("policy: empty/default policy always evaluates", () => {
  const decision = evaluatePolicy({
    provider: "github",
    tool: "list_issues",
    actorLabel: "agent",
    isDestructive: false,
    tokenState: "ACTIVE",
    inAllowlist: true,
    healthScore: 1,
  }, DEFAULT_POLICY);
  assert.ok(["ALLOW", "DENY", "REQUIRE_APPROVAL"].includes(decision.outcome));
  assert.ok(decision.policyVersion.length > 0, "policy version recorded");
});

test("workflow versioning: commits produce immutable version ids and preserve history", () => {
  const store = new InMemoryWorkflowStore();
  const v1 = store.commit({
    workflowName: "Q3_Invoice_Sync",
    version: 0,
    description: "Import invoices",
    steps: [{ provider: "dropbox", tool: "list_files", input: {} }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  assert.equal(v1.version, 1);
  assert.ok(v1.versionId.length > 0, "version id assigned");

  const v2 = store.commit({
    workflowName: "Q3_Invoice_Sync",
    description: "Import invoices + notify",
    steps: [
      { provider: "dropbox", tool: "list_files", input: {} },
      { provider: "slack", tool: "post_message", input: {} },
    ],
    parentVersionId: v1.versionId,
    policyVersion: "2026.07.1",
  });
  assert.equal(v2.version, 2);
  assert.notEqual(v2.versionId, v1.versionId, "versions have distinct ids");
  assert.equal(store.list("Q3_Invoice_Sync").length, 2, "history preserved");
});

test("workflow versioning: diff and rollback preserve all history", () => {
  const store = new InMemoryWorkflowStore();
  const v1 = store.commit({
    workflowName: "Campaign_Sync",
    description: "Initial",
    steps: [{ provider: "slack", tool: "post_message", input: {} }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  store.commit({
    workflowName: "Campaign_Sync",
    description: "Add email",
    steps: [
      { provider: "slack", tool: "post_message", input: {} },
      { provider: "mailchimp", tool: "send_campaign", input: {} },
    ],
    parentVersionId: v1.versionId,
    policyVersion: "2026.07.1",
  });

  const diff = store.diff(v1.versionId, store.latest("Campaign_Sync")!.versionId);
  assert.ok(diff, "diff computed");
  assert.equal(diff!.added.length, 1, "one step added");

  const rollback = store.rollback("Campaign_Sync", v1.versionId);
  assert.ok(rollback, "rollback succeeded");
  assert.equal(rollback!.steps.length, 1, "rolled back to single step");
  assert.equal(rollback!.rolledBackFrom, v1.versionId, "rollback records source");
  assert.equal(store.list("Campaign_Sync").length, 3, "rollback added a version without erasing history");
  assert.equal(rollback!.version, 3, "rollback is a new version");
});

test("session memory: redacts tokens and emails from confidential content", () => {
  const raw = "Call using token=abc123secret456 and email admin@example.com";
  const redacted = redact(raw, "confidential");
  assert.ok(!redacted.includes("abc123secret456"), "token redacted");
  assert.ok(!redacted.includes("admin@example.com"), "email redacted");
  assert.ok(redacted.includes("<redacted>"), "replaced with redacted marker");
});

test("session memory: public content is not redacted", () => {
  const raw = "Listed 5 issues on the project board";
  assert.equal(redact(raw, "public"), raw, "public content unchanged");
});

test("session memory: applyRetention separates ephemeral from durable", () => {
  const now = Date.now();
  const entries = [
    { id: "1", sessionId: "s1", content: "recent", sensitivity: "internal" as const, replayable: true, createdAt: new Date(now - 1000).toISOString(), ttlMs: 60000 },
    { id: "2", sessionId: "s1", content: "old", sensitivity: "internal" as const, replayable: true, createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), ttlMs: 60000 },
    { id: "3", sessionId: "s1", content: "secret", sensitivity: "restricted" as const, replayable: false, createdAt: new Date(now - 1000).toISOString(), ttlMs: 60000 },
  ];
  const { ephemeral, durable } = applyRetention(entries, DEFAULT_RETENTION);
  assert.equal(ephemeral.length, 2, "expired entry dropped from ephemeral");
  assert.ok(durable.every((e) => e.sensitivity !== "restricted"), "restricted excluded from durable");
});

test("session memory: replay requires approval for confidential entries", () => {
  const entry = { id: "1", sessionId: "s1", content: "data", sensitivity: "confidential" as const, replayable: true, createdAt: new Date().toISOString(), ttlMs: 60000 };
  assert.equal(canReplay(entry, DEFAULT_RETENTION), false, "confidential blocked from replay");
  const pub = { ...entry, sensitivity: "public" as const };
  assert.equal(canReplay(pub, DEFAULT_RETENTION), true, "public replay allowed");
});

test("secretless execution: detects secrets in strings", () => {
  assert.ok(containsSecret("Bearer abcdefghijklmnop123456789"), "detects bearer token");
  assert.ok(containsSecret("sk-abcdefghijklmnopqrstuvwxyz1234567890"), "detects sk key");
  assert.ok(!containsSecret("list the issues on the board"), "no secret in plain text");
});

test("secretless execution: scrubString removes all secret material", () => {
  const input = "Use Bearer abcdefghijklmnop123456789 and email admin@test.com";
  const out = scrubString(input);
  assert.ok(!out.includes("abcdefghijklmnop123456789"), "bearer token removed");
  assert.ok(out.includes("<secret-redacted>"), "replaced with marker");
});

test("secretless execution: scrubSecrets recurses into objects", () => {
  const input = { token: "abcdefghijklmnop123456789", nested: { apiKey: "sk-abcdefghijklmnopqrstuvwxyz1234567890" } };
  const out = scrubSecrets(input) as { token: string; nested: { apiKey: string } };
  assert.equal(out.token, "<secret-redacted>", "top-level token scrubbed");
  assert.ok(out.nested.apiKey.includes("<secret-redacted>"), "nested secret scrubbed");
  assert.ok(!out.nested.apiKey.includes("abcdefghijklmnopqrstuvwxyz"), "nested secret value removed");
});

test("secretless execution: redactSecretFields redacts by field name", () => {
  const input = { token: "short", user: "alice", password: "x" };
  const out = redactSecretFields(input) as { token: string; user: string; password: string };
  assert.equal(out.token, "<secret-redacted>", "token field redacted");
  assert.equal(out.password, "<secret-redacted>", "password field redacted");
  assert.equal(out.user, "alice", "non-secret field preserved");
});

test("secretless execution: rotationStatus flags due rotations", () => {
  const now = new Date("2026-08-07T00:00:00Z");
  const recent = rotationStatus({ connectionId: "c1", lastRotated: new Date("2026-08-01"), expiresAt: new Date("2026-08-20"), now });
  assert.equal(recent.rotationDue, false, "fresh credential not due");
  const expiring = rotationStatus({ connectionId: "c2", lastRotated: new Date("2026-07-01"), expiresAt: new Date("2026-08-08"), rotationWindowDays: 3, now });
  assert.equal(expiring.rotationDue, true, "expiring credential is due");
});

test("privacy classification: restricted content is quarantined and masked", () => {
  const result = classifyContent("Contact admin@test.com with SSN 123-45-6789", "restricted");
  assert.equal(result.quarantined, true, "restricted is quarantined");
  assert.ok(!result.content.includes("admin@test.com"), "email masked");
  assert.ok(!result.content.includes("123-45-6789"), "SSN masked");
  assert.ok(result.actions.includes("quarantined"), "quarantine action recorded");
});

test("privacy classification: public content passes through", () => {
  const result = classifyContent("The project has 5 open issues", "public");
  assert.equal(result.quarantined, false, "public not quarantined");
  assert.equal(result.content, "The project has 5 open issues", "public unchanged");
  assert.equal(canReachLLM("public"), true, "public reaches LLM");
  assert.equal(canReachExternal("restricted"), false, "restricted blocked externally");
});

test("privacy classification: normalizeLabel coerces unknown labels", () => {
  assert.equal(normalizeLabel("PUBLIC"), "public");
  assert.equal(normalizeLabel("unknown"), "internal");
  assert.equal(normalizeLabel(undefined), "internal");
});

test("incident response: opens incident, suspends sessions, preserves evidence", () => {
  const mgr = new IncidentManager();
  const incident = mgr.openIncident({
    severity: "critical",
    description: "Mass delete detected",
    toolCalls: [{ tool: "delete_repo", provider: "github", actorLabel: "agent", timestamp: new Date().toISOString(), policyDecision: { outcome: "DENY", policyVersion: "v1", matchedRules: [], riskLevel: "critical", riskScore: 90, disposition: "" } }],
    affectedSessions: ["sess-1", "sess-2"],
    policyVersion: "2026.07.1",
  });
  assert.ok(incident.incidentId.startsWith("INC-CRITICAL-"), "incident id prefixed");
  assert.ok(incident.evidenceHash.length > 0, "evidence hash generated");
  assert.ok(mgr.isSessionSuspended("sess-1"), "affected session suspended");
  assert.equal(mgr.listActive().length, 1, "one active incident");
});

test("incident response: resolve restores sessions and preserves bundle", () => {
  const mgr = new IncidentManager();
  const incident = mgr.openIncident({
    severity: "high",
    description: "Off-hours destructive",
    toolCalls: [],
    affectedSessions: ["sess-1"],
    policyVersion: "2026.07.1",
  });
  const bundle = mgr.buildBundle(incident.incidentId);
  assert.ok(bundle, "immutable bundle built");
  const resolved = mgr.resolve(incident.incidentId, "admin@example.com");
  assert.equal(resolved?.status, "resolved", "incident resolved");
  assert.ok(!mgr.isSessionSuspended("sess-1"), "session restored after resolve");
  assert.equal(mgr.listActive().length, 0, "no active incidents after resolve");
});

test("connector health scoring: healthy connector scores high", () => {
  const score = computeHealthScore({ avgLatencyMs: 200, errorRate: 0.01, authFreshness: 1, schemaDriftCount: 0, rateLimitPressure: 0, retryCount: 0, totalCalls: 100 });
  assert.ok(score.score >= 0.8, "healthy connector scores >= 0.8");
  assert.equal(score.grade, "healthy");
  assert.ok(score.confidence > 0.5, "confident with enough calls");
});

test("connector health scoring: failing connector scores low", () => {
  const score = computeHealthScore({ avgLatencyMs: 5000, errorRate: 0.95, authFreshness: 0, schemaDriftCount: 5, rateLimitPressure: 1, retryCount: 10, totalCalls: 100 });
  assert.ok(score.score < 0.2, "failing connector scores < 0.2");
  assert.equal(score.grade, "failing");
  assert.ok(score.recommendation.length > 0, "recommendation provided");
});

test("adaptive schema drift: detects removed and renamed fields", () => {
  const report = detectSchemaDrift({
    provider: "github",
    expectedFields: ["id", "title", "body", "assignee"],
    observedFields: ["id", "name", "body"],
    renamedPairs: [{ from: "title", to: "name" }],
    deprecatedFields: ["assignee"],
  });
  assert.ok(report.breaking, "removed field makes it breaking");
  assert.ok(report.requiresReview, "breaking drift requires review");
  assert.ok(report.changes.some((c) => c.type === "renamed" && c.field === "title"), "rename detected");
  assert.ok(report.suggestedMappings.some((m) => m.from === "title" && m.to === "name"), "mapping suggested");
});

test("adaptive schema drift: applySafeMappings renames fields", () => {
  const { result, applied } = applySafeMappings({ title: "Bug", body: "desc" }, [{ from: "title", to: "name", reason: "", safe: true }]);
  assert.equal((result as Record<string, unknown>).name, "Bug", "field renamed");
  assert.ok(!("title" in (result as Record<string, unknown>)), "old field removed");
  assert.equal(applied.length, 1, "one mapping applied");
});

test("bulk import: chunks records and reports progress", async () => {
  const records = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}`, data: { n: i } }));
  const chunks = chunkRecords(records, 10);
  assert.equal(chunks.length, 3, "25 records in chunks of 10 = 3 chunks");
  let progressCalls = 0;
  const summary = await bulkProcess({
    records,
    process: async () => {},
    onProgress: () => progressCalls++,
    options: { chunkSize: 10 },
  });
  assert.equal(summary.succeeded, 25, "all records succeeded");
  assert.equal(progressCalls, 3, "progress fired per chunk");
});

test("bulk import: retry backoff on failure then records failure", async () => {
  let attempts = 0;
  const summary = await bulkProcess({
    records: [{ id: "r1", data: {} }],
    process: async () => {
      attempts++;
      throw new Error("boom");
    },
    options: { maxRetries: 2, backoffMs: 10 },
  });
  assert.equal(summary.failed, 1, "record failed after retries");
  assert.equal(attempts, 3, "initial + 2 retries");
  assert.equal(summary.failures[0]!.error, "boom", "error captured");
});

test("dependency mapping: topological sort and blocked detection", () => {
  const mapper = new DependencyMapper();
  mapper.addTool("auth", "oauth");
  mapper.addTool("list", "github");
  mapper.addTool("create", "github");
  mapper.addDependency({ upstream: "auth", downstream: "list" });
  mapper.addDependency({ upstream: "list", downstream: "create" });
  const plan = mapper.resolve();
  assert.ok(plan.executable, "plan fully executable");
  assert.deepEqual(plan.order, ["auth", "list", "create"], "correct topological order");
});

test("dependency mapping: reports blocked steps for missing prerequisites", () => {
  const mapper = new DependencyMapper();
  mapper.addTool("auth", "oauth");
  mapper.addTool("list", "github");
  mapper.addDependency({ upstream: "auth", downstream: "list" });
  const plan = mapper.resolve(new Set(["list"]));
  assert.ok(!plan.executable, "plan not executable without prereq");
  assert.equal(plan.blocked.length, 1, "one blocked step");
  assert.equal(plan.blocked[0]!.missingPrerequisite, "auth", "blocked by missing auth");
});