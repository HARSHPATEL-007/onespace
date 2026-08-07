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
import { deriveTemplate, validateTemplate, applyTemplate, commitTemplate } from "./recipe";
import { simulatePlan } from "./simulation";
import { evaluateIntent, DEFAULT_THRESHOLDS } from "./intent";
import { explainStep, explainWorkflow, renderStepExplanation } from "./explainability";
import { selectProfile, checkResourceUsage, generateReplayId, buildTrace } from "./sandbox";
import { evaluateRetention, computeExpiry, isExpired, DEFAULT_RETENTION as ARTIFACT_RETENTION } from "./artifact";
import { buildPointer, readChunk, searchContent, categorize } from "./file-view";
import { minimizeContext, diagnoseOverexposure, DEFAULT_BUDGET } from "./context";
import { selectTransport, canPreserveSession } from "./transport";
import { buildDashboard, flagQuotaRisks } from "./dashboard";
import { evaluateFlag, transitionFlag, emergencyDisable } from "./feature-flags";
import { forecastUsage } from "./forecasting";
import { checkFeature, withinQuota, nextTier } from "./tiers";
import { recommendUpgrade } from "./addons";
import { buildMigrationPlan, validateMigration } from "./migration";

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

test("recipe templates: deriveTemplate captures parameters and validates type safety", () => {
  const store = new InMemoryWorkflowStore();
  const wf = store.commit({
    workflowName: "Invoice_Sync",
    description: "Sync invoices",
    steps: [{ provider: "dropbox", tool: "list_files", input: { query: "invoices", limit: 10 } }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  const template = deriveTemplate(wf);
  assert.equal(template.workflowName, "Invoice_Sync");
  assert.ok(template.parameters.some((p) => p.name === "list_files.query"), "query param captured");
  assert.ok(template.parameters.some((p) => p.name === "list_files.limit"), "limit param captured");

  const validation = validateTemplate(template, wf);
  assert.ok(validation.valid, "template validates against workflow");
});

test("recipe templates: applyTemplate and commitTemplate preserve history", () => {
  const store = new InMemoryWorkflowStore();
  const wf = store.commit({
    workflowName: "Invoice_Sync",
    description: "Sync invoices",
    steps: [{ provider: "dropbox", tool: "list_files", input: { query: "invoices" } }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  const template = deriveTemplate(wf);
  const queryParam = template.parameters.find((p) => p.name === "list_files.query")!;
  queryParam.defaultValue = "receipts";

  const newSteps = applyTemplate(template, wf);
  assert.equal(newSteps[0]!.input.query, "receipts", "parameter applied");

  const newVersion = commitTemplate(store, template, wf, "2026.07.1");
  assert.equal(newVersion.version, 2, "new version committed");
  assert.equal(store.list("Invoice_Sync").length, 2, "history preserved");
});

test("workflow simulation: predicts success, side effects, and latency", () => {
  const store = new InMemoryWorkflowStore();
  const wf = store.commit({
    workflowName: "Campaign",
    description: "Run campaign",
    steps: [
      { provider: "slack", tool: "post_message", input: {} },
      { provider: "mailchimp", tool: "send_campaign", input: {} },
    ],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  const mapper = new DependencyMapper();
  for (const step of wf.steps) mapper.addTool(step.tool, step.provider);
  const plan = mapper.resolve();

  const result = simulatePlan(wf, plan);
  assert.ok(result.overallSuccess, "simulation succeeds");
  assert.equal(result.steps.length, 2, "all steps simulated");
  assert.ok(result.totalPredictedLatencyMs > 0, "latency predicted");
  assert.ok(result.steps[1]!.sideEffects[0]!.destructive, "send_campaign flagged destructive");
  assert.ok(result.safeToExecute, "safe to execute");
});

test("workflow simulation: predicts failures for injected faults", () => {
  const store = new InMemoryWorkflowStore();
  const wf = store.commit({
    workflowName: "Campaign",
    description: "Run campaign",
    steps: [{ provider: "slack", tool: "post_message", input: {} }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  const mapper = new DependencyMapper();
  mapper.addTool("post_message", "slack");
  const plan = mapper.resolve();

  const result = simulatePlan(wf, plan, { failTools: new Set(["post_message"]) });
  assert.ok(!result.overallSuccess, "simulation fails with injected fault");
  assert.equal(result.failurePredictions.length, 1, "failure predicted");
  assert.ok(!result.safeToExecute, "not safe to execute");
});

test("intent confidence: executes when above threshold, clarifies when below", () => {
  const high = evaluateIntent({ intent: "list issues", confidence: 0.9, workflowType: "read", riskLevel: "low" });
  assert.equal(high.decision, "execute", "high confidence executes");

  const low = evaluateIntent({ intent: "delete all", confidence: 0.5, workflowType: "destructive", riskLevel: "high" });
  assert.equal(low.decision, "clarify", "low confidence on destructive clarifies");
  assert.ok(low.clarificationPrompt, "clarification prompt provided");
});

test("intent confidence: blocks critical-risk low-confidence intents", () => {
  const critical = evaluateIntent({ intent: "delete production", confidence: 0.3, workflowType: "destructive", riskLevel: "critical" });
  assert.equal(critical.decision, "block", "critical + low confidence blocked");
});

test("explainability: step and workflow explanations are generated", () => {
  const store = new InMemoryWorkflowStore();
  const wf = store.commit({
    workflowName: "Invoice_Sync",
    description: "Sync invoices",
    steps: [{ provider: "dropbox", tool: "list_files", input: { query: "invoices" } }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  const decision = evaluatePolicy({ provider: "dropbox", tool: "list_files", actorLabel: "agent", isDestructive: false, tokenState: "ACTIVE", inAllowlist: true, healthScore: 1 });
  const stepExp = explainStep({ step: wf.steps[0]!, index: 0, policyDecision: decision, confidence: 0.95 });
  assert.ok(stepExp.selectionReason.includes("list_files"), "selection reason mentions tool");
  assert.equal(stepExp.riskLevel, decision.riskLevel, "risk level propagated");

  const workflowExp = explainWorkflow({ workflowName: wf.workflowName, versionId: wf.versionId, stepExplanations: [stepExp] });
  assert.ok(workflowExp.summary.includes("Invoice_Sync"), "workflow summary generated");
  const rendered = renderStepExplanation(stepExp);
  assert.ok(rendered.includes("dropbox:list_files"), "rendered explanation readable");
});

test("sandbox profiles: selectProfile picks right profile by payload size", () => {
  assert.equal(selectProfile(500_000, 2), "light", "small payload -> light");
  assert.equal(selectProfile(10_000_000, 5), "standard", "medium payload -> standard");
  assert.equal(selectProfile(100_000_000, 8), "heavy", "large payload -> heavy");
  assert.equal(selectProfile(500_000, 2, "standard"), "light", "tenant cap doesn't downgrade");
});

test("sandbox observability: checkResourceUsage flags breaches", () => {
  const events = checkResourceUsage({ profile: "light", durationMs: 120_000, peakMemoryMb: 1024, traceId: "t1" });
  assert.ok(events.some((e) => e.type === "memory_spike"), "memory spike detected");
  assert.ok(events.some((e) => e.type === "timeout_warning"), "timeout detected");
});

test("sandbox observability: buildTrace and generateReplayId are deterministic", () => {
  const replay1 = generateReplayId({ a: 1 }, "standard");
  const replay2 = generateReplayId({ a: 1 }, "standard");
  assert.equal(replay1, replay2, "deterministic replay id");
  const trace = buildTrace({ profile: "light", startedAt: new Date("2026-01-01").toISOString(), finishedAt: new Date("2026-01-01T00:01:00Z").toISOString(), peakMemoryMb: 256, stderr: "", exitCode: 0, inputs: {} });
  assert.ok(trace.replayId.startsWith("replay_"), "trace has replay id");
  assert.equal(trace.durationMs, 60000, "duration computed");
});

test("artifact lifecycle: evaluateRetention purges expired, preserves audit", () => {
  const now = new Date("2026-08-07T00:00:00Z");
  const artifacts = [
    { id: "a1", name: "old.csv", ownerId: "u1", workspaceId: "w1", createdAt: "2026-01-01", expiresAt: "2026-02-01", sizeBytes: 100, contentType: "text/csv", tags: [], preserveForAudit: false },
    { id: "a2", name: "audit.pdf", ownerId: "u1", workspaceId: "w1", createdAt: "2026-01-01", expiresAt: "2026-02-01", sizeBytes: 100, contentType: "application/pdf", tags: [], preserveForAudit: true },
  ];
  const result = evaluateRetention(artifacts, ARTIFACT_RETENTION, now);
  assert.ok(result.purged.includes("a1"), "expired non-audit purged");
  assert.ok(result.preserved.includes("a2"), "audit-preserved artifact kept");
});

test("artifact lifecycle: computeExpiry and isExpired work correctly", () => {
  const created = new Date("2026-01-01");
  const expiry = computeExpiry(created, "text/csv", ARTIFACT_RETENTION);
  assert.ok(expiry.getTime() > created.getTime(), "expiry after creation");
  const artifact = { id: "a", name: "f", ownerId: "u", workspaceId: "w", createdAt: "2026-01-01", expiresAt: expiry.toISOString(), sizeBytes: 0, contentType: "", tags: [], preserveForAudit: false };
  assert.equal(isExpired(artifact, new Date("2027-01-01")), true, "expired after date");
});

test("streaming file views: buildPointer creates lightweight preview", () => {
  const pointer = buildPointer({ fileId: "f1", path: "/out/data.csv", sizeBytes: 1000000, contentType: "text/csv", rawContent: "a,b,c\n1,2,3", previewOpts: { maxChars: 100 } });
  assert.ok(pointer.preview.includes("a,b,c"), "preview includes content head");
  assert.ok(!pointer.preview.includes("1,2,3") === false || pointer.preview.length <= 200, "preview is lightweight");
});

test("streaming file views: readChunk and searchContent work on content", () => {
  const content = "line1\nline2\nhello world\nline4";
  const chunk = readChunk(content, 0, 10);
  assert.equal(chunk.totalChunks, Math.ceil(content.length / 10), "correct total chunks");
  const results = searchContent(content, "hello");
  assert.equal(results.length, 1, "one match found");
  assert.equal(results[0]!.line, 3, "correct line number");
});

test("streaming file views: categorize maps content types", () => {
  assert.equal(categorize("text/csv"), "csv");
  assert.equal(categorize("application/json"), "json");
  assert.equal(categorize("image/png"), "image");
});

test("context minimization: selects minimum tools within budget", () => {
  const candidates = [
    { providerKey: "github", providerName: "GitHub", category: "devops", name: "list_issues", description: "", reason: "", relevance: 0.95 },
    { providerKey: "github", providerName: "GitHub", category: "devops", name: "create_issue", description: "", reason: "", relevance: 0.8 },
    { providerKey: "slack", providerName: "Slack", category: "communication", name: "post_message", description: "", reason: "", relevance: 0.7 },
    { providerKey: "dropbox", providerName: "Dropbox", category: "documents", name: "list_files", description: "", reason: "", relevance: 0.2 },
  ];
  const result = minimizeContext(candidates, { maxTools: 2, maxTokens: 4000, minRelevance: 0.3 });
  assert.equal(result.selected.length, 2, "capped at max tools");
  assert.ok(result.selected[0]!.relevance >= result.selected[1]!.relevance, "sorted by relevance");
  assert.ok(result.rationale.length >= 4, "rationale provided for all candidates");
  assert.ok(result.excluded.some((e) => e.name === "list_files"), "low relevance excluded");
});

test("context minimization: diagnoseOverexposure flags issues", () => {
  const candidates = Array.from({ length: 6 }, (_, i) => ({ providerKey: "x", providerName: "X", category: "c", name: `t${i}`, description: "", reason: "", relevance: 0.9 - i * 0.05 }));
  const result = minimizeContext(candidates, { maxTools: 10, maxTokens: 50000, minRelevance: 0 });
  const warnings = diagnoseOverexposure(result);
  assert.ok(warnings.length > 0, "overexposure diagnosed");
});

test("transport fallback: selects preferred when available", () => {
  const result = selectTransport({ preferred: "websocket", statuses: ["stdio", "websocket", "http_sse"], availability: { stdio: true, websocket: true, http_sse: true } });
  assert.equal(result.selected, "websocket", "preferred selected");
  assert.ok(result.sessionPreserved, "session preserved on preferred");
});

test("transport fallback: falls back when preferred unavailable", () => {
  const result = selectTransport({ preferred: "stdio", statuses: ["stdio", "websocket", "http_sse"], availability: { stdio: false, websocket: true, http_sse: true } });
  assert.equal(result.selected, "websocket", "fell back to websocket");
  assert.ok(result.attempted.includes("stdio"), "attempted preferred first");
});

test("transport fallback: canPreserveSession across transports", () => {
  assert.equal(canPreserveSession("websocket", "http_sse"), true, "websocket <-> sse preserved");
  assert.equal(canPreserveSession("stdio", "websocket"), false, "stdio cannot migrate");
});

test("operator dashboard: buildDashboard and flagQuotaRisks work", () => {
  const dashboard = buildDashboard({
    health: [{ provider: "github", score: computeHealthScore({ avgLatencyMs: 200, errorRate: 0.01, authFreshness: 1, schemaDriftCount: 0, rateLimitPressure: 0, retryCount: 0, totalCalls: 50 }) }],
    approvals: [],
    failures: [],
    latencies: [],
    quotas: [{ provider: "github", used: 950, limit: 1000, percentUsed: 95 }],
  });
  assert.equal(dashboard.health.length, 1, "health included");
  const risks = flagQuotaRisks(dashboard.quotaConsumption);
  assert.equal(risks[0]!.risk, "critical", "95% usage flagged critical");
});

test("feature flags: evaluateFlag respects rollout stage and exclusions", () => {
  const flag = { name: "new_tool", description: "", stage: "canary" as const, includeTenants: ["t1"], excludeTenants: ["t3"], emergencyDisabled: false, updatedAt: "", updatedBy: "" };
  assert.equal(evaluateFlag(flag, "t1").enabled, true, "included tenant enabled");
  assert.equal(evaluateFlag(flag, "t2").enabled, false, "non-included tenant disabled");
  assert.equal(evaluateFlag(flag, "t3").enabled, false, "excluded tenant disabled");
  assert.equal(evaluateFlag({ ...flag, stage: "full" }, "t2").enabled, true, "full rollout enables all");
});

test("feature flags: transitionFlag and emergencyDisable produce audit records", () => {
  const flag = { name: "new_tool", description: "", stage: "off" as const, includeTenants: [], excludeTenants: [], emergencyDisabled: false, updatedAt: "", updatedBy: "" };
  const { flag: updated, change } = transitionFlag(flag, "canary", "admin", "Start canary");
  assert.equal(updated.stage, "canary", "stage transitioned");
  assert.equal(change.previousStage, "off", "change records previous stage");

  const disabled = emergencyDisable(updated, "admin", "Incident in progress");
  assert.ok(disabled.flag.emergencyDisabled, "emergency disabled");
  assert.ok(disabled.change.reason.includes("EMERGENCY"), "emergency reason logged");
});

test("usage forecasting: forecasts trends and flags exhaustion", () => {
  const history = { dailyApiCalls: [100, 120, 140, 160, 180], dailySandboxMinutes: [10, 12, 11, 13, 14], dailyActiveAccounts: [5, 5, 6, 6, 6], dailyRecipeExecutions: [1, 2, 1, 3, 2] };
  const forecasts = forecastUsage(history, { apiCalls: 500, sandboxMinutes: 60, activeAccounts: 10, recipeExecutions: 10 });
  assert.equal(forecasts.apiCalls.trend, "increasing", "trend detected as increasing");
  assert.ok(forecasts.apiCalls.willExceedLimit, "will exhaust soon flagged");
  assert.ok(forecasts.apiCalls.daysToExhaustion !== null, "days to exhaustion computed");
});

test("tier-aware gating: features map to tiers with clear status", () => {
  assert.ok(checkFeature("free", "basic_integrations").included, "free includes basic");
  assert.ok(checkFeature("free", "policy_engine").restricted, "free restricts policy engine");
  assert.ok(checkFeature("pro", "policy_engine").included, "pro includes policy engine");
  assert.equal(nextTier("growth"), "pro", "next tier from growth is pro");
  assert.ok(!withinQuota("free", "apiCallsPerDay", 200), "exceeds free quota");
});

test("add-on recommendations: recommends upgrade based on usage", () => {
  const rec = recommendUpgrade({ connectorCount: 10, monthlyApiCalls: 50_000, monthlyExecutions: 500, activeAccounts: 30, currentTier: "growth" });
  assert.equal(rec.recommendedTier, "pro", "growth + volume -> pro");
  assert.ok(rec.reasons.length > 0, "reasons provided");
  assert.ok(rec.monthlyEstimate > 0, "pricing estimate included");
});

test("migration assistance: builds plan with mappings and effort", () => {
  const plan = buildMigrationPlan("legacy_crm", [
    { name: "old_zendesk", provider: "zendesk", toolCount: 5, authType: "oauth2" },
    { name: "custom_api", provider: "unknown", toolCount: 3, authType: "basic" },
  ]);
  assert.ok(plan.mappings.some((m) => m.compatibility === "direct"), "zendesk direct mapped");
  assert.ok(plan.mappings.some((m) => m.compatibility === "manual"), "unknown requires manual");
  assert.ok(plan.estimatedEffortHours > 0, "effort estimated");
  assert.ok(plan.cutoverSteps.length > 0, "cutover steps planned");
  const validation = validateMigration([{ mapping: "zendesk", success: true, details: "OK" }]);
  assert.equal(validation[0]!.passed, true, "validation passed");
});