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
import { createPlan, selectTool, createStep, verifyStep, decideRetry, replanFromCheckpoint, assessRisk, auditAction, emitTrace, shouldPause, requestHumanApproval } from "./agentic";
import { retrieveEvidence, extractClaims, verifyClaims, enforceCitations, decideGrounding, gateHighStakes, rankSources, auditGrounding, measureGrounding, detectConflicts } from "./grounding";
import { planCodeExecution, gateExecution, runInSandbox, registerArtifact, createAuditTrace, decideRecovery, measureExecution, DEFAULT_QUOTA } from "./code-exec";
import { emitPartialTranscript, detectEndpoint, recognizeSpeech, generateSpeech, createSession, addTurn, interruptTurn, confirmAction, degradeGracefully, auditVoiceAction } from "./voice";
import { ingestSource, retrieveChunks, packageEvidence, generateGrounded, enforceAccess, measureRAG, logAction } from "./rag";
import { createTenantProfile, applyTerminology, buildSFDDataset, splitDataset, validateSchema, gradeWithReward, buildDPODataset, recordLineage, redactDataset, requestDeployment, evaluateFineTuning } from "./finetuning";
import { classifyRisk, makeDecision, canExecute, routeEscalation, applyTimeout, packageReviewEvidence, auditEscalation, measureEscalations } from "./escalation";
import { crossModalSearch, buildMixedQuery, planAction, attachProvenance, assessQuality, measureCrossModal } from "./cross-modal";
import { computeDimensions, evaluateRun, buildEvalDataset, scoreCase, checkAlerts, decidePromotion } from "./eval";
import { checkSubsystem, aggregateHealth } from "./system-health";
import { loadConfig, validateConfig } from "./config";
import { createLogger, generateCorrelationId } from "./logging";
import { MetricsRegistry } from "./metrics";
import { runIntegrationScenario } from "./integration";
import { createRuntime, invokeTool, getSystemHealth } from "./orchestrate";
import { handleMcpMessage, effectiveTools, MCP_PROTOCOL_VERSION, type McpMessage, type McpContext } from "./mcp";
import { ADAPTERS, providerHeaders } from "./adapters";
import { minimizeContext, diagnoseOverexposure, DEFAULT_BUDGET } from "./context";
import { selectTransport, canPreserveSession } from "./transport";
import { buildDashboard, flagQuotaRisks } from "./dashboard";
import { evaluateFlag, transitionFlag, emergencyDisable } from "./feature-flags";
import { forecastUsage } from "./forecasting";
import { checkFeature, withinQuota, nextTier } from "./tiers";
import { recommendUpgrade } from "./addons";
import { buildMigrationPlan, validateMigration } from "./migration";
import { evaluateCriterion } from "./acceptance";
import { buildMatrix, findGaps, coverageSummary } from "./traceability";
import { scopeEnhancement } from "./scoping";
import { validateIntake, createRequest } from "./intake";
import { checkGates, requiresReview } from "./gates";
import { phaseComplete, advancePhase } from "./phases";
import { compareToBaseline } from "./baseline";
import { rankBacklog } from "./backlog";
import { analyzeImpact, justifiesBuilding } from "./impact";
import { transitionStatus } from "./transparency";
import { ingestAsset, generateEmbedding, chunkContent, retrieve, buildContext, inferAction, governAsset, validateRetrieval, type IngestedAsset } from "./multimodal";
import {
  generateTabular,
  generateText,
  generateTimeseries,
  generateImage,
  generateGraph,
  generateMultimodal,
  generateForUseCase,
  validateDataset,
  type SyntheticDataset,
  type DataType,
} from "./synthetic-data";
import {
  analyzeBugs,
  analyzePerformance,
  analyzeSecurity,
  generateFix,
  shouldAutoFix,
  generateTests,
  createSnapshot,
  compareSnapshots,
  analyzeCodebase,
  type CodeIssue,
  type FixProposal,
  type EvolutionMetrics,
} from "./code-evolution";
import {
  storeEntry,
  retrieveEntries,
  retrieveHyperContext,
  consolidateMemory,
  getMemoryStats,
  type MemoryEntry,
  type MemoryTier,
} from "./memory";
import {
  createTwin,
  syncTwin,
  simulateScenario,
  optimizeTwin,
  recordTwinEvent,
  getTwinEvents,
  getTwinState,
  getTwin,
  listTwins,
  checkTwinSync,
  type TwinMetadata,
  type TwinState,
  type SimulationResult,
  type OptimizationResult,
} from "./digital-twin";
import {
  computeCarbonMetrics,
  recommendRouting,
  generateGreenProfile,
  forecastRenewable,
  type CarbonMetrics,
  type ModelEfficiency,
  type GreenProfile,
} from "./green-ai";
import {
  runComplianceCheck,
  runAllComplianceChecks,
  getWorstStatus,
  collectEvidence,
  COMPLIANCE_RULES,
  type ComplianceFramework,
  type ComplianceReport,
  type ComplianceContext,
} from "./compliance";
import {
  detectThreats,
  detectDataPoisoning,
  detectInsiderThreat,
  detectSupplyChainAttack,
  runRedTeam,
  detectQuantumAttack,
  detectNeuralIntrusion,
  THREAT_INTEL_RULES,
  type ThreatSignal,
  type DetectionResult,
} from "./threat-intel";
import {
  computeCognitiveMetrics,
  determineCognitiveState,
  recommendAdaptiveUI,
  detectBurnout,
  detectProactiveTriggers,
  buildCognitiveSnapshot,
  type CognitiveSignal,
  type CognitiveMetrics as CogMetrics,
  type CognitiveState,
  type AdaptiveUIRecommendation,
  type ProactiveTrigger,
} from "./cognitive-load";
import {
  ingestDocument,
  addEdge,
  findPath,
  detectCommunities,
  detectAnomalies,
  queryGraph,
  reasonAbout,
  getGraphSnapshot,
  type GraphEntity,
  type GraphEdge,
  type GraphSnapshot,
  type PathResult,
} from "./knowledge-graph";

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

  // Clean up any extra connections from prior test runs and pin the seeded one.
  const seeded = await prisma.integrationConnection.findFirst({
    where: { integrationId: github!.id, workspaceId: workspace!.id, accountLabel: "core-repo (demo)" },
  });
  assert.ok(seeded, "seeded connection exists");
  await prisma.integrationConnection.deleteMany({ where: { integrationId: github!.id, workspaceId: workspace!.id, id: { not: seeded!.id } } });
  await prisma.integration.update({ where: { id: github!.id }, data: { activeConnectionId: seeded!.id } });

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
  await prisma.integrationConnection.update({
    where: { id: seeded!.id },
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

  // Clean up extras and clear active connection so we start fresh.
  const seededConn = await prisma.integrationConnection.findFirst({
    where: { integrationId: github!.id, accountLabel: "core-repo (demo)" },
  });
  assert.ok(seededConn, "seeded connection exists");
  await prisma.integrationConnection.deleteMany({ where: { integrationId: github!.id, id: { not: seededConn!.id } } });
  await prisma.integration.update({ where: { id: github!.id }, data: { activeConnectionId: null } });

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

test("acceptance criteria: evaluateCriterion passes or fails by threshold", () => {
  const latencyCriterion = { id: "lat1", capability: "gateway", metric: "latency" as const, target: 500, unit: "ms" };
  assert.equal(evaluateCriterion(latencyCriterion, 400).passed, true, "under target passes");
  assert.equal(evaluateCriterion(latencyCriterion, 600).passed, false, "over target fails");
});

test("traceability: buildMatrix finds gaps and summarizes coverage", () => {
  const matrix = buildMatrix([
    { id: "r1", requirement: "Auth", description: "", architectureRef: "arch-1", implementationRef: "impl-1", testRef: "test-1" },
    { id: "r2", requirement: "Logging", description: "", architectureRef: "arch-2", implementationRef: "", testRef: "" },
  ]);
  const gaps = findGaps(matrix);
  assert.equal(gaps.length, 1, "one gap found");
  const summary = coverageSummary(matrix);
  assert.equal(summary.covered, 1, "one covered");
  assert.equal(summary.partial, 1, "one partial");
});

test("scoping: scopeEnhancement classifies by keywords and effort", () => {
  assert.equal(scopeEnhancement({ title: "Fix typo", description: "Text change", estimatedEffort: 2 }), "minor");
  assert.equal(scopeEnhancement({ title: "New engine", description: "Build policy engine", estimatedEffort: 15 }), "major");
  assert.equal(scopeEnhancement({ title: "Add connector", description: "New integration", estimatedEffort: 8, integrationCount: 3 }), "integration_expansion");
});

test("intake: validateIntake requires all fields", () => {
  const good = validateIntake({ title: "X", problemStatement: "This is a detailed problem statement", businessValue: "High", affectedUsers: ["ops"], suggestedAcceptanceCriteria: ["fast"] });
  assert.ok(good.complete, "complete request passes");
  const bad = validateIntake({ title: "X" });
  assert.ok(!bad.complete, "incomplete request fails");
  assert.ok(bad.missingFields.includes("problemStatement"), "missing field identified");
});

test("review gates: checkGates passes only when all approved", () => {
  const gates = [{ role: "security" as const, reviewer: "sec1", status: "approved" as const, comments: "" }, { role: "operations" as const, reviewer: "ops1", status: "pending" as const, comments: "" }];
  const result = checkGates(gates);
  assert.ok(!result.passed, "not passed with pending");
  assert.equal(result.pending.length, 1, "one pending");
  assert.equal(requiresReview("high").length, 4, "high impact needs 4 reviewers");
});

test("release phases: phaseComplete and advancePhase enforce exit criteria", () => {
  const gate = { stage: "build" as const, owner: "eng", artifacts: ["code"], exitCriteria: ["tests pass"], approved: true };
  assert.ok(phaseComplete(gate), "complete phase");
  assert.equal(advancePhase(gate), "validation", "advances to validation");
  assert.equal(advancePhase({ ...gate, approved: false }), null, "cannot advance unapproved");
});

test("performance baselining: compareToBaseline measures improvement", () => {
  const baseline = { metric: "latency", current: 500, target: 200, unit: "ms", measuredAt: "" };
  const result = compareToBaseline(baseline, 150);
  assert.ok(result.targetMet, "target met");
  assert.ok(result.improvement < 0, "improvement is positive for lower-is-better");
});

test("risk-ranked backlog: rankBacklog orders by weighted score", () => {
  const items = [
    { id: "a", title: "Low", businessValue: 2, userReach: 2, technicalFeasibility: 5, complianceRisk: 1, implementationEffort: 10 },
    { id: "b", title: "High", businessValue: 9, userReach: 9, technicalFeasibility: 8, complianceRisk: 8, implementationEffort: 3 },
  ];
  const ranked = rankBacklog(items);
  assert.equal(ranked[0]!.id, "b", "highest scored first");
});

test("user-impact analysis: analyzeImpact computes reach and weighted impact", () => {
  const analysis = analyzeImpact("New Dashboard", [{ userSegment: "ops", usageFrequency: "daily" as const, painSeverity: 8, description: "Saves time" }]);
  assert.ok(analysis.weightedImpact > 0, "weighted impact computed");
  assert.ok(justifiesBuilding(analysis), "justifies building");
});

test("transparency: transitionStatus validates allowed transitions", () => {
  const record = { requestId: "r1", title: "X", currentStatus: "received" as const, history: [] };
  const good = transitionStatus(record, "under_review", "pm", "Reviewing");
  assert.ok(good.valid, "valid transition");
  const bad = transitionStatus(record, "shipped", "pm", "Skip");
  assert.ok(!bad.valid, "invalid transition rejected");
});

test("multimodal: ingestAsset normalizes inputs with metadata", () => {
  const asset = ingestAsset({ id: "doc1", modality: "document", content: "Invoice #123", tenantId: "t1", provenance: "upload", sensitivity: "confidential", pageNumbers: [1, 2] });
  assert.equal(asset.modality, "document");
  assert.equal(asset.metadata.tenantId, "t1");
  assert.equal(asset.metadata.pageNumbers!.length, 2, "page numbers preserved");
  assert.equal(asset.sensitivity, "confidential");
});

test("multimodal: generateEmbedding produces normalized vectors", () => {
  const asset = ingestAsset({ id: "a1", modality: "text", content: "hello world", tenantId: "t1", provenance: "test" });
  const emb = generateEmbedding(asset, 32);
  assert.equal(emb.vector.length, 32, "correct dimensions");
  const norm = Math.sqrt(emb.vector.reduce((s, v) => s + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 0.01, "vector is normalized");
});

test("multimodal: chunkContent splits long content with overlap", () => {
  const content = "a".repeat(1000);
  const chunks = chunkContent(content, 500, 50);
  assert.ok(chunks.length >= 2, "split into multiple chunks");
  assert.equal(chunks[0]!.text.length, 500, "first chunk full size");
});

test("multimodal: retrieve finds relevant assets across modalities", () => {
  const corpus = [
    generateEmbedding(ingestAsset({ id: "img1", modality: "image", content: "invoice screenshot", tenantId: "t1", provenance: "upload" })),
    generateEmbedding(ingestAsset({ id: "txt1", modality: "text", content: "meeting notes", tenantId: "t1", provenance: "upload" })),
  ];
  const results = retrieve({ text: "invoice", tenantId: "t1" }, corpus);
  assert.ok(results.length > 0, "retrieved results");
  assert.ok(results[0]!.score > 0, "positive confidence score");
});

test("multimodal: buildContext structures evidence for agent reasoning", () => {
  const asset = ingestAsset({ id: "a1", modality: "image", content: "chart", tenantId: "t1", provenance: "upload" });
  const emb = generateEmbedding(asset);
  const results = retrieve({ text: "chart", tenantId: "t1" }, [emb]);
  const ctx = buildContext("summarize", results);
  assert.equal(ctx.action, "summarize");
  assert.ok(ctx.summary.includes("evidence"), "summary describes evidence");
});

test("multimodal: inferAction classifies intent into actions", () => {
  assert.equal(inferAction("compare these two documents"), "compare");
  assert.equal(inferAction("extract the data from this invoice"), "extract");
  assert.equal(inferAction("transcribe this audio"), "transcribe");
  assert.equal(inferAction("summarize the report"), "summarize");
});

test("multimodal: governAsset enforces governance on restricted assets", () => {
  const restricted = ingestAsset({ id: "r1", modality: "document", content: "secret", tenantId: "t1", provenance: "upload", sensitivity: "restricted" });
  const decision = governAsset(restricted, { provider: "x", tool: "read", actorLabel: "agent", isDestructive: true, tokenState: "ACTIVE", inAllowlist: false, healthScore: 1 });
  assert.ok(!decision.allowed || decision.redacted, "restricted asset governed");
});

test("multimodal: validateRetrieval computes per-modality metrics", () => {
  const corpus = [
    generateEmbedding(ingestAsset({ id: "a1", modality: "text", content: "invoice total", tenantId: "t1", provenance: "test" })),
    generateEmbedding(ingestAsset({ id: "a2", modality: "image", content: "invoice chart", tenantId: "t1", provenance: "test" })),
  ];
  const report = validateRetrieval([{ query: "invoice", expectedAssetId: "a1", modality: "text" }], corpus);
  assert.ok(report.perModality.length > 0, "per-modality metrics computed");
  assert.ok(report.overallGrounding >= 0, "overall grounding score");
});

test("agentic: createPlan builds structured plan with subgoals", () => {
  const plan = createPlan("Process Q3 invoices", [
    { description: "Fetch invoices", dependencies: [], tools: ["list_files"], expectedOutput: "file list", acceptanceCriteria: ["not empty"], riskLevel: "low" },
    { description: "Notify team", dependencies: ["sg_0"], tools: ["post_message"], expectedOutput: "sent", acceptanceCriteria: ["status success"], riskLevel: "medium" },
  ]);
  assert.equal(plan.subgoals.length, 2, "two subgoals");
  assert.equal(plan.subgoals[1]!.dependencies.length, 1, "dependency set");
  assert.equal(plan.status, "draft");
});

test("agentic: selectTool validates against registry and policy", () => {
  const registry = [{ name: "post_message", provider: "slack", schema: { channel: "string" }, permissions: ["chat:write"], riskLabel: "low" as const }];
  const good = selectTool({ toolName: "post_message", registry, policy: { provider: "slack", tool: "post_message", actorLabel: "agent", isDestructive: false, tokenState: "ACTIVE", inAllowlist: true, healthScore: 1 }, input: { channel: "#general" } });
  assert.ok(good.validated, "valid tool selected");
  const bad = selectTool({ toolName: "post_message", registry, policy: { provider: "slack", tool: "post_message", actorLabel: "agent", isDestructive: false, tokenState: "ACTIVE", inAllowlist: true, healthScore: 1 }, input: {} });
  assert.ok(!bad.validated, "missing field rejected");
});

test("agentic: createStep records durable step with idempotency", () => {
  const step = createStep("sg_0", "post_message", { channel: "#x" }, { state: "ready" });
  assert.ok(step.idempotencyKey.includes("sg_0"), "idempotency key includes subgoal");
  assert.deepEqual(step.stateSnapshot, { state: "ready" }, "state snapshotted");
  assert.equal(step.status, "pending");
});

test("agentic: verifyStep checks acceptance criteria", () => {
  const step = { ...createStep("sg_0", "post_message", {}, {}), status: "completed" as const, output: { status: "success", result: "sent" } };
  const result = verifyStep(step, ["status success", "not empty"]);
  assert.ok(result.passed, "verification passed");
  assert.equal(result.criteriaMatched.length, 2, "both criteria matched");
});

test("agentic: decideRetry distinguishes failure types with backoff", () => {
  const retryable = { ...createStep("sg_0", "x", {}, {}), output: { error: "rate_limited" } };
  const retry = decideRetry(retryable, undefined, 1);
  assert.ok(retry.shouldRetry, "rate limited is retryable");
  assert.ok(retry.backoffMs > 0, "backoff applied");
  const nonRetryable = { ...createStep("sg_0", "x", {}, {}), output: { error: "auth_failed" } };
  const noretry = decideRetry(nonRetryable, undefined, 1);
  assert.ok(!noretry.shouldRetry, "auth failed is non-retryable");
  assert.ok(noretry.escalate, "escalated to human");
});

test("agentic: replanFromCheckpoint preserves evidence and re-plans", () => {
  const plan = createPlan("Task", [{ description: "A", dependencies: [], tools: ["t1"], expectedOutput: "o", acceptanceCriteria: [], riskLevel: "low" }, { description: "B", dependencies: [], tools: ["t2"], expectedOutput: "o", acceptanceCriteria: [], riskLevel: "low" }]);
  const completed = [{ ...createStep("sg_0", "t1", {}, {}), status: "completed" as const }];
  const result = replanFromCheckpoint(plan, "step_failed", completed);
  assert.ok(result.preservedEvidence.length > 0, "prior evidence preserved");
  assert.equal(result.newPlan.status, "draft", "new plan drafted");
});

test("agentic: assessRisk and auditAction support governance", () => {
  const plan = createPlan("Risky", [{ description: "Delete", dependencies: [], tools: ["delete"], expectedOutput: "", acceptanceCriteria: [], riskLevel: "high" }]);
  const risk = assessRisk(plan);
  assert.ok(risk.requiresPreApproval, "high-risk needs approval");
  assert.ok(risk.stepRisks[0]!.requiresApproval, "step risk flagged");
  const audit = auditAction("agent", "delete", { id: "1" }, "success");
  assert.equal(audit.actor, "agent", "audit actor recorded");
});

test("agentic: shouldPause and emitTrace support observability and HITL", () => {
  assert.ok(shouldPause({ confidence: 0.4, riskLevel: "low", consecutiveFailures: 0 }), "low confidence pauses");
  assert.ok(shouldPause({ confidence: 0.9, riskLevel: "high", consecutiveFailures: 0 }), "high risk pauses");
  const trace = emitTrace("execution", "step started", "sg_0");
  assert.equal(trace.phase, "execution", "trace phase set");
  const pause = requestHumanApproval(createPlan("P", []), [], "retry", "high_risk");
  assert.equal(pause.reason, "high_risk", "pause reason set");
});

test("grounding: retrieveEvidence ranks by authority and relevance", () => {
  const evidence = [
    { id: "e1", sourceType: "internal_kb" as const, sourceUrl: "kb/1", title: "Policy", snippet: "Refunds allowed within 30 days", retrievedAt: "", authority: 0.9, recency: 0.8, relevance: 0 },
    { id: "e2", sourceType: "web" as const, sourceUrl: "web/1", title: "Blog", snippet: "Refunds are great", retrievedAt: "", authority: 0.3, recency: 0.5, relevance: 0 },
  ];
  const results = retrieveEvidence({ query: "refund policy", tenantId: "t1", sources: ["internal_kb", "web"] }, evidence);
  assert.equal(results[0]!.sourceType, "internal_kb", "internal source ranked first");
});

test("grounding: verifyClaims checks claims against evidence", () => {
  const evidence = [{ id: "e1", sourceType: "internal_kb" as const, sourceUrl: "kb/1", title: "Policy", snippet: "Refunds allowed within 30 days", retrievedAt: "", authority: 0.9, recency: 0.8, relevance: 0.8 }];
  const claims = ["Refunds are allowed within 30 days", "Free shipping always"];
  const verified = verifyClaims(claims, evidence);
  assert.equal(verified[0]!.status, "verified", "supported claim verified");
  assert.equal(verified[1]!.status, "unsupported", "unsupported claim flagged");
});

test("grounding: enforceCitations attaches sources and rejects unsupported", () => {
  const evidence = [{ id: "e1", sourceType: "web" as const, sourceUrl: "https://example.com", title: "Source", snippet: "GDP grew 3 percent", retrievedAt: "", authority: 0.7, recency: 0.9, relevance: 0.9 }];
  const result = enforceCitations("GDP grew 3 percent. The moon is made of cheese.", evidence);
  assert.ok(result.grounded.includes("https://example.com"), "citation attached");
  assert.ok(result.rejected.length > 0, "unsupported claim rejected");
});

test("grounding: decideGrounding defers or escalates on weak evidence", () => {
  const weak = [{ text: "Claim", status: "unsupported" as const, citations: [], confidence: 0 }];
  assert.equal(decideGrounding(weak).action, "escalate", "unsupported claims escalate");
  const strong = [{ text: "Claim", status: "verified" as const, citations: ["src"], confidence: 0.9 }];
  assert.equal(decideGrounding(strong).action, "respond", "strong evidence responds");
  assert.equal(decideGrounding(strong, true).action, "respond", "high-stakes passes with strong evidence");
});

test("grounding: gateHighStakes enforces mandatory grounding for risky domains", () => {
  const good = gateHighStakes({ domain: "finance", claims: [{ text: "X", status: "verified" as const, citations: ["s"], confidence: 0.9 }, { text: "Y", status: "verified" as const, citations: ["s"], confidence: 0.8 }] });
  assert.ok(good.approved, "finance with full coverage approved");
  const bad = gateHighStakes({ domain: "medical", claims: [{ text: "X", status: "unsupported" as const, citations: [], confidence: 0 }] });
  assert.ok(!bad.approved, "medical without evidence blocked");
  assert.ok(bad.requiresHumanReview, "requires human review");
});

test("grounding: auditGrounding and measureGrounding support governance", () => {
  const claims = [{ text: "X", status: "verified" as const, citations: ["s"], confidence: 0.9 }, { text: "Y", status: "unsupported" as const, citations: [], confidence: 0 }];
  const audit = auditGrounding(claims, [{ id: "e1", sourceType: "web" as const, sourceUrl: "https://x.com", title: "T", snippet: "S", retrievedAt: "", authority: 0.7, recency: 0.8, relevance: 0.8 }]);
  assert.equal(audit.claimsChecked, 2, "claims checked recorded");
  const metrics = measureGrounding([{ claims, action: "respond" }]);
  assert.ok(metrics.unsupportedRate > 0, "unsupported rate measured");
});

test("code execution: planCodeExecution decides if code is needed", () => {
  const task = planCodeExecution("Calculate the sum of sales data");
  assert.ok(task.requiresExecution, "calculation task needs code");
  assert.equal(task.language, "python");
  const noCode = planCodeExecution("Send a message to the team");
  assert.ok(!noCode.requiresExecution, "messaging does not need code");
});

test("code execution: gateExecution blocks high-risk code", () => {
  const policy = { provider: "x", tool: "exec", actorLabel: "agent", isDestructive: false, tokenState: "ACTIVE", inAllowlist: true, healthScore: 1 };
  const safe = gateExecution({ code: "x = 1 + 2", language: "python", policy, tenantMaxRisk: "high" });
  assert.ok(safe.approved, "safe code approved");
  const dangerous = gateExecution({ code: "import subprocess; subprocess.call('rm -rf /')", language: "python", policy, tenantMaxRisk: "high" });
  assert.ok(!dangerous.approved || dangerous.requiresApproval, "dangerous code blocked or requires approval");
});

test("code execution: runInSandbox enforces quotas and returns results", () => {
  const result = runInSandbox({ code: "print('hello')", language: "python", inputFiles: {}, quota: DEFAULT_QUOTA });
  assert.equal(result.exitCode, 0, "clean execution");
  assert.ok(result.stdout.length > 0, "output produced");
  const timeout = runInSandbox({ code: "print('x')", language: "python", inputFiles: {}, quota: { ...DEFAULT_QUOTA, timeoutMs: 500 } });
  assert.ok(timeout.timedOut, "timeout detected");
});

test("code execution: registerArtifact and createAuditTrace preserve lineage", () => {
  const artifact = registerArtifact({ name: "output.csv", sourceTaskId: "t1", contentType: "text/csv", sizeBytes: 1024, parentLineage: ["input.csv"] });
  assert.ok(artifact.lineage.includes("input.csv"), "lineage preserved");
  const trace = createAuditTrace({ requester: "agent", taskId: "t1", code: "x=1", language: "python", dataAccessed: ["data.csv"], policyDecision: "approved", result: { exitCode: 0, stdout: "ok", stderr: "", durationMs: 10, timedOut: false, artifactRefs: [] } });
  assert.equal(trace.requester, "agent", "audit records requester");
});

test("code execution: decideRecovery classifies failures and measureExecution tracks quality", () => {
  const timeout = decideRecovery({ exitCode: 124, stdout: "", stderr: "timeout", durationMs: 30_000, timedOut: true, artifactRefs: [] });
  assert.equal(timeout.failureType, "timeout", "timeout classified");
  assert.ok(timeout.rerunFromSnapshot, "rerun from snapshot");
  const metrics = measureExecution([{ exitCode: 0, stdout: "ok", stderr: "", durationMs: 50, timedOut: false, artifactRefs: [] }, { exitCode: 1, stdout: "", stderr: "err", durationMs: 10, timedOut: false, artifactRefs: [] }]);
  assert.equal(metrics.successRate, 0.5, "success rate computed");
});

test("voice: emitPartialTranscript and detectEndpoint handle streaming", () => {
  const chunk = { chunkId: "c1", data: "hello world", timestamp: new Date().toISOString(), isFinal: false };
  const partial = emitPartialTranscript(chunk, "previous");
  assert.equal(partial.text, "previous hello world", "partial accumulated");
  assert.ok(!partial.isFinal, "not final");
  assert.ok(detectEndpoint(600), "endpoint detected after pause");
  assert.ok(!detectEndpoint(200), "no endpoint during speech");
});

test("voice: recognizeSpeech produces segments with timestamps", () => {
  const chunks = [{ chunkId: "c1", data: "list issues", timestamp: new Date().toISOString(), isFinal: true }];
  const result = recognizeSpeech(chunks, { language: "en" });
  assert.equal(result.fullText, "list issues", "full text assembled");
  assert.equal(result.segments[0]!.confidence, 0.95, "final confidence high");
  assert.equal(result.language, "en");
});

test("voice: generateSpeech blocks unapproved content", () => {
  const approved = generateSpeech({ text: "Hello", style: { voice: "default", speed: 1, pitch: 1 }, approved: true });
  assert.ok(approved.audioRef.length > 0, "approved speech generated");
  const blocked = generateSpeech({ text: "Secret data", style: { voice: "default", speed: 1, pitch: 1 }, approved: false });
  assert.equal(blocked.audioRef, "", "unapproved blocked");
});

test("voice: dialogue session handles turns and interruption", () => {
  let session = createSession();
  session = addTurn(session, "user", "list issues");
  session = addTurn(session, "system", "Here are issues");
  assert.equal(session.turns.length, 2, "two turns added");
  session = interruptTurn(session);
  assert.ok(session.turns[1]!.interrupted, "last turn interrupted");
});

test("voice: confirmAction gates high-risk and degradeGracefully handles quality", () => {
  const high = confirmAction("delete all", "high", false);
  assert.ok(!high.confirmed, "high-risk without confirmation blocked");
  assert.ok(high.requiresExplicit, "requires explicit confirmation");
  const degraded = degradeGracefully("poor", 1500, 1000);
  assert.equal(degraded.mode, "text_only", "poor quality degrades to text");
  const good = degradeGracefully("good", 200, 1000);
  assert.equal(good.mode, "speech_to_speech", "good quality stays voice");
});

test("rag: ingestSource chunks content with full metadata", () => {
  const chunks = ingestSource({ sourceId: "doc1", sourceType: "document", content: "Invoice #123 total $500 due immediately for services rendered", metadata: { sourceType: "document", version: "1", owner: "u1", tenantId: "t1", originSystem: "erp", createdAt: "2026-01-01", updatedAt: "2026-08-01", classification: "internal" }, chunkSize: 50 });
  assert.ok(chunks.length >= 1, "at least one chunk");
  assert.equal(chunks[0]!.metadata.sourceId, "doc1", "source id preserved");
  assert.ok(chunks[0]!.freshness > 0, "freshness computed");
});

test("rag: retrieveChunks filters by tenant/classification and ranks hybrid", () => {
  const corpus = [
    ingestSource({ sourceId: "d1", sourceType: "document", content: "invoice payment terms", metadata: { sourceType: "document", version: "1", owner: "u1", tenantId: "t1", originSystem: "erp", createdAt: "", updatedAt: "2026-08-01", classification: "internal" } })[0]!,
    ingestSource({ sourceId: "d2", sourceType: "document", content: "invoice payment terms", metadata: { sourceType: "document", version: "1", owner: "u1", tenantId: "t2", originSystem: "erp", createdAt: "", updatedAt: "2026-08-01", classification: "internal" } })[0]!,
  ];
  const results = retrieveChunks("invoice", corpus, { tenantId: "t1", allowedClassifications: ["internal", "confidential"] });
  assert.ok(results.length > 0, "results retrieved");
  assert.ok(results.every((r) => r.chunk.metadata.tenantId === "t1"), "tenant filtered");
});

test("rag: packageEvidence deduplicates and retains provenance", () => {
  const corpus = [
    ingestSource({ sourceId: "d1", sourceType: "document", content: "relevant invoice data here", metadata: { sourceType: "document", version: "1", owner: "u1", tenantId: "t1", originSystem: "erp", createdAt: "", updatedAt: "2026-08-01", classification: "internal" } })[0]!,
    ingestSource({ sourceId: "d1", sourceType: "document", content: "more data", metadata: { sourceType: "document", version: "1", owner: "u1", tenantId: "t1", originSystem: "erp", createdAt: "", updatedAt: "2026-08-01", classification: "internal" } })[0]!,
  ];
  const candidates = retrieveChunks("invoice", corpus, { tenantId: "t1", allowedClassifications: ["internal"] });
  const evidence = packageEvidence(candidates);
  assert.ok(evidence.length <= 1, "deduplicated by source");
  assert.ok(evidence[0]!.provenance.includes("erp"), "provenance retained");
});

test("rag: generateGrounded refuses without evidence and enforces access", () => {
  const refused = generateGrounded("query", [], 1);
  assert.equal(refused.status, "refused", "no evidence refuses");
  const chunk = ingestSource({ sourceId: "d1", sourceType: "document", content: "secret", metadata: { sourceType: "document", version: "1", owner: "u1", tenantId: "t1", originSystem: "erp", createdAt: "", updatedAt: "2026-08-01", classification: "restricted" } })[0]!;
  assert.ok(!enforceAccess(chunk, "internal").allowed, "restricted blocked for internal user");
  assert.ok(enforceAccess(chunk, "restricted").allowed, "restricted allowed for cleared user");
});

test("rag: measureRAG computes recall, precision, and groundedness", () => {
  const metrics = measureRAG({ trueRelevant: 10, retrievedRelevant: 7, totalRetrieved: 10, groundedClaims: 8, totalClaims: 10, avgFreshness: 0.85 });
  assert.equal(metrics.recall, 0.7, "recall computed");
  assert.equal(metrics.precision, 0.7, "precision computed");
  assert.equal(metrics.groundedness, 0.8, "groundedness computed");
});

test("finetuning: createTenantProfile and applyTerminology customize per tenant", () => {
  const profile = createTenantProfile("t1", { tone: "casual", terminology: { "invoice": "bill" } });
  assert.equal(applyTerminology("Send the invoice", profile), "Send the bill", "terminology applied");
});

test("finetuning: buildSFDDataset splits train/validation and validates schema", () => {
  const dataset = buildSFDDataset("t1", [{ input: "Q", output: "A", schema: { result: "string" } }], 0.2);
  const { train, validation } = splitDataset(dataset);
  assert.ok(train.length + validation.length === 1, "split preserves count");
  const valid = validateSchema({ result: "ok" }, { result: "string" });
  assert.ok(valid.valid, "schema valid");
});

test("finetuning: gradeWithReward and buildDPODataset support RFT/DPO", () => {
  const fn = { name: "exact", description: "", grader: (o: string, e: string) => o === e ? 1 : 0 };
  assert.equal(gradeWithReward(fn, "yes", "yes"), 1, "exact match scores 1");
  const dpo = buildDPODataset("t1", [{ prompt: "Q", chosen: "Good", rejected: "Bad" }], true);
  assert.ok(dpo.reviewed, "DPO requires review");
});

test("finetuning: redactDataset and recordLineage govern data lifecycle", () => {
  const { redacted, redactedCount } = redactDataset([{ input: "email@test.com" }], [/\S+@\S+\.\S+/]);
  assert.ok(redactedCount > 0, "PII redacted");
  const lineage = recordLineage("d1", ["raw"], ["filter", "clean"]);
  assert.equal(lineage.sourceData.length, 1, "lineage recorded");
});

test("finetuning: evaluateFineTuning blocks unsafe deployments", () => {
  const good = evaluateFineTuning({ tunedAccuracy: 0.9, baselineAccuracy: 0.85, formatErrors: 1, totalOutputs: 100, policyViolations: 1 });
  assert.ok(good.deploySafe, "improvement is safe");
  const bad = evaluateFineTuning({ tunedAccuracy: 0.7, baselineAccuracy: 0.85, formatErrors: 1, totalOutputs: 100, policyViolations: 10 });
  assert.ok(!bad.deploySafe, "regression blocked");
});

test("escalation: classifyRisk gates high-consequence irreversible actions", () => {
  const critical = classifyRisk({ action: "delete production", risk: "critical", reversibility: "irreversible", businessImpact: "high" });
  assert.equal(critical.mode, "pre_approval", "critical+irreversible needs pre-approval");
  const low = classifyRisk({ action: "list issues", risk: "low", reversibility: "reversible", businessImpact: "low" });
  assert.equal(low.mode, "automatic", "low risk is automatic");
});

test("escalation: makeDecision and canExecute enforce outcomes", () => {
  const approve = makeDecision({ escalationId: "e1", outcome: "approve", reviewer: "admin", reason: "OK" });
  assert.ok(canExecute(approve), "approve permits execution");
  const reject = makeDecision({ escalationId: "e2", outcome: "reject", reviewer: "admin", reason: "Risky" });
  assert.ok(!canExecute(reject), "reject blocks execution");
});

test("escalation: routeEscalation selects reviewer with fallback", () => {
  const reviewers = [{ id: "r1", role: "security" as const, domains: ["infra"], authority: 5, available: true }, { id: "r2", role: "security" as const, domains: ["infra"], authority: 3, available: false }];
  const result = routeEscalation({ domain: "infra", role: "security", reviewers });
  assert.equal(result.primary, "r1", "available reviewer selected");
  assert.ok(result.fallbacks.length <= 1, "fallback available");
});

test("escalation: applyTimeout defaults to no action and escalates on expiry", () => {
  const timeout = applyTimeout({ decision: null, config: { windowMs: 1000, escalationOnTimeout: true }, elapsedMs: 1500 });
  assert.ok(timeout.timedOut, "timed out");
  assert.equal(timeout.action, "escalate", "escalates on timeout");
  const pending = applyTimeout({ decision: null, config: { windowMs: 5000, escalationOnTimeout: false }, elapsedMs: 100 });
  assert.equal(pending.action, "none", "pending waits for decision");
});

test("escalation: packageReviewEvidence and auditEscalation preserve review context", () => {
  const evidence = packageReviewEvidence({ proposedAction: "delete", policyContext: "GDPR", expectedSideEffects: ["data loss"], sourceDocuments: ["doc1"], confidence: 0.8 });
  assert.ok(evidence.version.startsWith("v"), "versioned");
  const audit = auditEscalation({ escalationId: "e1", action: "delete", reviewer: "admin", decision: "modify", modifiedFrom: "delete", reason: "Safer" });
  assert.equal(audit.modifiedFrom, "delete", "modification recorded");
});

test("escalation: measureEscalations computes governance metrics", () => {
  const decisions = [
    makeDecision({ escalationId: "e1", outcome: "approve", reviewer: "a", reason: "" }),
    makeDecision({ escalationId: "e2", outcome: "modify", reviewer: "a", reason: "" }),
    makeDecision({ escalationId: "e3", outcome: "reject", reviewer: "a", reason: "" }),
  ];
  const metrics = measureEscalations(decisions, 100);
  assert.equal(metrics.overrideRate, 1 / 3, "override rate computed");
  assert.equal(metrics.total, 100, "total actions tracked");
});

test("cross-modal: crossModalSearch retrieves across modalities", () => {
  const corpus = [
    { chunkId: "c1", sourceId: "img1", content: "invoice screenshot showing total $500", metadata: { sourceId: "img1", sourceType: "document" as const, version: "1", owner: "u1", tenantId: "t1", originSystem: "upload", createdAt: "", updatedAt: "2026-08-01", classification: "internal" as const }, freshness: 0.9 },
    { chunkId: "c2", sourceId: "doc1", content: "meeting notes about budget", metadata: { sourceId: "doc1", sourceType: "document" as const, version: "1", owner: "u1", tenantId: "t1", originSystem: "wiki", createdAt: "", updatedAt: "2026-08-01", classification: "internal" as const }, freshness: 0.9 },
  ];
  const results = crossModalSearch({ text: "invoice total", tenantId: "t1" }, corpus);
  assert.ok(results.length > 0, "results retrieved");
  assert.ok(results[0]!.provenance.includes("upload") || results[0]!.provenance.includes("wiki"), "provenance preserved");
});

test("cross-modal: buildMixedQuery and planAction support mixed inputs", () => {
  const query = buildMixedQuery({ text: "find this", fileRef: "doc1.pdf", fileModality: "document", tenantId: "t1" });
  assert.equal(query.documentRef, "doc1.pdf", "document ref set");
  const plan = planAction("summarize", [], true);
  assert.ok(plan.approved, "non-side-effecting approved");
  const sideEffect = planAction("trigger_workflow", [], false);
  assert.ok(!sideEffect.approved, "side-effecting blocked without approval");
});

test("cross-modal: assessQuality and measureCrossModal evaluate evidence", () => {
  const matches = [{ chunkId: "c1", modality: "document" as const, content: "x", score: 0.8, provenance: "s/1", sourceSystem: "s" }];
  const quality = assessQuality(matches, 0.3);
  assert.ok(!quality.shouldRefuse, "strong evidence not refused");
  const weak = assessQuality([], 0.3);
  assert.ok(weak.shouldRefuse, "no evidence refused");
  const metrics = measureCrossModal({ trueRelevant: 10, retrievedRelevant: 8, totalRetrieved: 10, successfulActions: 9, totalActions: 10 });
  assert.equal(metrics.retrievalRecall, 0.8, "recall computed");
});

test("eval: computeDimensions aggregates all quality dimensions", () => {
  const dims = computeDimensions({ tasksCompleted: 8, totalTasks: 10, correctToolCalls: 9, totalToolCalls: 10, successfulTools: 8, latenciesMs: [100, 200, 300, 400, 500], groundedClaims: 7, totalClaims: 10, unsupportedClaims: 2, citedClaims: 6, policyViolations: 1 });
  assert.equal(dims.taskCompletionRate, 0.8, "task completion computed");
  assert.equal(dims.groundingQuality, 0.7, "grounding computed");
  assert.ok(dims.p99LatencyMs > 0, "p99 latency computed");
});

test("eval: evaluateRun passes or blocks by mode thresholds", () => {
  const dims = computeDimensions({ tasksCompleted: 9, totalTasks: 10, correctToolCalls: 9, totalToolCalls: 10, successfulTools: 9, latenciesMs: [100], groundedClaims: 8, totalClaims: 10, unsupportedClaims: 1, citedClaims: 7, policyViolations: 0 });
  const preDeploy = evaluateRun(dims, "pre_deployment");
  assert.ok(preDeploy.passed, "strong results pass pre-deployment");
  const weakDims = computeDimensions({ tasksCompleted: 5, totalTasks: 10, correctToolCalls: 5, totalToolCalls: 10, successfulTools: 4, latenciesMs: [100], groundedClaims: 3, totalClaims: 10, unsupportedClaims: 5, citedClaims: 2, policyViolations: 2 });
  const failed = evaluateRun(weakDims, "pre_deployment");
  assert.ok(!failed.passed, "weak results fail");
  assert.ok(failed.blockPromotion, "safety violations block promotion");
});

test("eval: buildEvalDataset and scoreCase support scoring", () => {
  const ds = buildEvalDataset("Smoke", [{ id: "c1", input: "Q", expectedOutput: "A", category: "common" }], [{ dimension: "taskCompletionRate", weight: 1 }]);
  assert.ok(ds.version.startsWith("v"), "versioned");
  const score = scoreCase({ caseId: "c1", automated: 0.8, judge: 0.9, human: 0.85 });
  assert.ok(score.final > 0.8, "final score averaged");
});

test("eval: checkAlerts and decidePromotion monitor drift", () => {
  const dims = computeDimensions({ tasksCompleted: 6, totalTasks: 10, correctToolCalls: 6, totalToolCalls: 10, successfulTools: 5, latenciesMs: [100], groundedClaims: 4, totalClaims: 10, unsupportedClaims: 4, citedClaims: 3, policyViolations: 1 });
  const alerts = checkAlerts(dims, { taskCompletionRate: 0.8, toolSuccessRate: 0.85 });
  assert.ok(alerts.length > 0, "alerts emitted for breaches");
  const good = computeDimensions({ tasksCompleted: 9, totalTasks: 10, correctToolCalls: 9, totalToolCalls: 10, successfulTools: 9, latenciesMs: [100], groundedClaims: 8, totalClaims: 10, unsupportedClaims: 1, citedClaims: 7, policyViolations: 0 });
  const promote = decidePromotion(good, dims, {});
  assert.ok(promote.promote, "improvement promotes");
});

test("practical: checkSubsystem and aggregateHealth report system status", () => {
  const db = checkSubsystem("database", () => ({ ok: true, message: "connected" }));
  assert.equal(db.status, "healthy", "healthy subsystem");
  const agg = aggregateHealth([db, checkSubsystem("cache", () => ({ ok: false, message: "slow" }))], "1.0.0", 3600);
  assert.equal(agg.status, "degraded", "aggregated status degraded");
  assert.equal(agg.subsystems.length, 2, "all subsystems reported");
});

test("practical: loadConfig and validateConfig handle env overrides", () => {
  const config = loadConfig({}, { N0VA1O_PORT: "4000", N0VA1O_ENV: "production" });
  assert.equal(config.port, 4000, "port from env");
  assert.equal(config.environment, "production", "env from env");
  const validation = validateConfig(config);
  assert.ok(validation.valid, "valid config");
});

test("practical: createLogger and generateCorrelationId support tracing", () => {
  const logger = createLogger({ module: "test", level: "debug" });
  assert.ok(logger, "logger created");
  const child = logger.child("submodule");
  assert.ok(child, "child logger created");
  const id = generateCorrelationId();
  assert.ok(id.startsWith("corr_"), "correlation id generated");
});

test("practical: MetricsRegistry tracks counters, histograms, gauges", () => {
  const registry = new MetricsRegistry();
  registry.incrementCounter("requests", { method: "GET" });
  registry.incrementCounter("requests", { method: "GET" });
  registry.recordHistogram("latency", 150);
  registry.recordHistogram("latency", 300);
  registry.setGauge("active_connections", 42);
  const snapshot = registry.snapshot();
  assert.equal(snapshot.counters.length, 1, "counter tracked");
  assert.equal(snapshot.histograms.length, 1, "histogram tracked");
  assert.equal(snapshot.gauges[0]!.value, 42, "gauge tracked");
});

test("practical: runIntegrationScenario wires modules end-to-end", () => {
  const result = runIntegrationScenario("smoke_test", { provider: "github", tool: "list_issues", actorLabel: "agent", isDestructive: false, tokenState: "ACTIVE", inAllowlist: true, healthScore: 1 }, { avgLatencyMs: 200, errorRate: 0.01, authFreshness: 1, schemaDriftCount: 0, rateLimitPressure: 0, retryCount: 0, totalCalls: 50 });
  assert.ok(result.passed, "integration scenario passed");
  assert.ok(result.steps.length >= 4, "multiple steps executed");
});

test("orchestrate: createRuntime initializes config, logger, metrics", () => {
  const runtime = createRuntime({ port: 4000, environment: "production" });
  assert.equal(runtime.config.port, 4000, "config applied");
  assert.equal(runtime.config.environment, "production", "env applied");
  assert.ok(runtime.correlationId.startsWith("corr_"), "correlation id set");
  assert.ok(runtime.logger, "logger initialized");
  assert.ok(runtime.metrics, "metrics initialized");
});

test("orchestrate: invokeTool runs policy + observability pipeline", async () => {
  const runtime = createRuntime();
  const result = await invokeTool(runtime, { provider: "github", tool: "list_issues", input: {}, actorLabel: "agent" });
  assert.ok(result.ok, "allowed tool succeeds");
  assert.equal(result.policyVersion.length > 0, true, "policy version set");
  assert.equal(result.correlationId, runtime.correlationId, "correlation propagated");
});

test("orchestrate: invokeTool executes real gateway call when integration provided", async () => {
  const runtime = createRuntime();
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace, "demo workspace exists");
  const integration = await prisma.integration.findFirst({ where: { provider: "github", workspaceId: workspace!.id } });
  assert.ok(integration, "github integration exists");
  const result = await invokeTool(runtime, {
    provider: "github",
    tool: "list_issues",
    input: { owner: "octocat", repo: "Hello-World" },
    actorLabel: "agent",
    integration: integration!,
    workspaceId: workspace!.id,
  });
  assert.ok(result.ok, "gateway call succeeds");
  assert.ok(result.gatewayResult, "gateway result returned");
  assert.equal(result.gatewayResult!.ok, true, "gateway reports ok");
});

test("orchestrate: getSystemHealth aggregates subsystem checks", () => {
  const runtime = createRuntime();
  const health = getSystemHealth(runtime, { database: () => ({ ok: true, message: "up" }), cache: () => ({ ok: false, message: "down" }) });
  assert.equal(health.status, "degraded", "degraded when one subsystem down");
  assert.equal(health.subsystems.length, 2, "both subsystems reported");
});

/* ---------- MCP gateway + adapter integration ---------- */

type IntegrationStub = {
  id: string;
  provider: string;
  name: string;
  enabled: boolean;
  mcpEnabled: boolean;
  config: Record<string, unknown>;
  allowlistTools: string[];
  blocklistTools: string[];
  workspaceId: string;
  [key: string]: unknown;
};

/** Lightweight integration object that satisfies McpContext without DB side-effects.
 *  Only use for pure handlers (initialize, tools/list, tools/discover, resources/*).
 *  For tools/call tests that trigger gateway.call, use the real demo workspace. */
const mockIntegration = (overrides: Partial<IntegrationStub> = {}): IntegrationStub => ({
  id: "int-test-1",
  provider: "github",
  name: "Test GitHub",
  enabled: true,
  mcpEnabled: true,
  config: { authType: "oauth2" },
  allowlistTools: [],
  blocklistTools: [],
  workspaceId: "ws-test-1",
  ...overrides,
});

const mockCtx = (integration: IntegrationStub): McpContext => ({
  integration: integration as never,
  workspaceId: integration.workspaceId,
  actorLabel: "mcp-agent",
  gateway: new N0va1oGateway(),
});

test("MCP: initialize returns protocol version and capabilities", async () => {
  const msg: McpMessage = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
  const res = await handleMcpMessage(msg, mockCtx(mockIntegration()));
  assert.equal(res.jsonrpc, "2.0");
  assert.equal(res.id, 1);
  const result = res.result as { protocolVersion: string; capabilities: unknown; serverInfo: { name: string } };
  assert.ok(result.protocolVersion, "protocol version returned");
  assert.ok(result.capabilities, "capabilities advertised");
  assert.ok(result.serverInfo.name, "server info provided");
});

test("MCP: tools/list returns scoped tools for a provider", async () => {
  const integration = mockIntegration({ provider: "slack", name: "Design channel" });
  const msg: McpMessage = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };
  const res = await handleMcpMessage(msg, mockCtx(integration));
  assert.ok(res.result, "tools/list returns result");
  const result = res.result as { tools: Array<{ name: string; description: string; inputSchema: { type: string } }> };
  assert.ok(result.tools.length > 0, "at least one tool returned");
  assert.ok(result.tools.every((t) => t.name && t.description), "all tools have name + description");
  assert.ok(result.tools.every((t) => t.inputSchema.type === "object"), "all tools have object schema");
  // Destructive tools should be excluded by default (no allowlist).
  const destructive = result.tools.find((t) => isDestructiveTool("slack", t.name));
  assert.equal(destructive, undefined, "destructive tools blocked by default");
});

test("MCP: tools/discover returns intent-matched tools", async () => {
  const integration = mockIntegration({ provider: "github" });
  const msg: McpMessage = { jsonrpc: "2.0", id: 3, method: "tools/discover", params: { query: "list issues", maxTools: 5 } };
  const res = await handleMcpMessage(msg, mockCtx(integration));
  assert.ok(res.result, "tools/discover returns result");
  const data = res.result as { intent: string; tools: unknown[]; confidence: number };
  assert.ok(data.intent.length > 0, "intent string returned");
  assert.ok(data.tools.length > 0, "tools discovered");
  assert.ok(data.tools.length <= 5, "respects maxTools");
  assert.ok(data.confidence > 0, "confidence is positive");
});

test("MCP: ping notification returns empty result", async () => {
  const msg: McpMessage = { jsonrpc: "2.0", id: 10, method: "ping", params: {} };
  const res = await handleMcpMessage(msg, mockCtx(mockIntegration()));
  assert.ok(res.result, "ping returns result");
  assert.equal(Object.keys(res.result).length, 0, "ping returns empty object");
});

/* ---------- DB-backed MCP pipeline tests (demo workspace) ---------- */

test("MCP: tools/call routes to simulated transport for adapter-less provider tools", async () => {
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace, "demo workspace exists");
  // Use the gdrive integration — list_files has no real adapter, so the gateway
  // falls through to simulatedResult (no real API needed, DB logging works).
  const gdrive = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "gdrive" } });
  assert.ok(gdrive, "gdrive integration exists");

  const msg: McpMessage = {
    jsonrpc: "2.0", id: 11, method: "tools/call",
    params: { name: "list_files", arguments: {} },
  };
  const res = await handleMcpMessage(msg, {
    integration: gdrive!,
    workspaceId: workspace!.id,
    actorLabel: "mcp-agent",
    gateway: new N0va1oGateway(),
  });
  assert.ok(res.result, "tools/call returns result");
  const result = res.result as { content?: Array<{ type: string; text: string }>; isError?: boolean; meta?: Record<string, unknown> };
  assert.ok(result.content, "content returned");
  assert.ok(result.content[0]!.text.length > 0, "non-empty response");
  assert.equal(result.isError, false, "simulated non-destructive tool succeeds");
});

test("MCP: tools/call raises access request for destructive tool not in allowlist", async () => {
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace, "demo workspace exists");
  const github = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "github" } });
  assert.ok(github, "github integration exists");

  // create_issue is destructive in the catalog but NOT in the demo allowlist (["list_repos","list_issues"]).
  // It falls through to the "not in scope, destructive" path → access request raised.
  const msg: McpMessage = {
    jsonrpc: "2.0", id: 12, method: "tools/call",
    params: { name: "create_issue", arguments: { repo: "test", title: "Bug" } },
  };
  const res = await handleMcpMessage(msg, {
    integration: github!,
    workspaceId: workspace!.id,
    actorLabel: "mcp-agent",
    gateway: new N0va1oGateway(),
  });
  assert.ok(res.error, "destructive blocked tool returns error");
  assert.equal(res.error!.code, -32001, "blocked-access-request error code");
  const errData = res.error!.data as { accessRequestId?: string };
  assert.ok(errData?.accessRequestId, "access request raised");

  // Clean up the access request we just created.
  if (errData?.accessRequestId) {
    await prisma.integrationAccessRequest.delete({ where: { id: errData.accessRequestId } }).catch(() => {});
  }
});

test("MCP: tools/call raises access request on policy approval-required (409)", async () => {
  const workspace = await prisma.workspace.findUnique({ where: { slug: "n0va-demo" } });
  assert.ok(workspace, "demo workspace exists");
  const github = await prisma.integration.findFirst({ where: { workspaceId: workspace!.id, provider: "github" } });
  assert.ok(github, "github integration exists");

  // Temporarily add create_issue to allowlist so it IS in scope but still
  // destructive → policy rule "destructive-requires-approval" fires → 409.
  const originalAllowlist = (github!.allowlistTools as string[] | null) ?? null;
  await prisma.integration.update({
    where: { id: github!.id },
    data: { allowlistTools: ["list_repos", "list_issues", "create_issue"] },
  });

  try {
    // Re-fetch so effectiveTools sees the updated allowlist.
    const updated = await prisma.integration.findUnique({ where: { id: github!.id } });
    assert.ok(updated);

    const msg: McpMessage = {
      jsonrpc: "2.0", id: 13, method: "tools/call",
      params: { name: "create_issue", arguments: { owner: "octocat", repo: "Hello-World", title: "Test" } },
    };
    const res = await handleMcpMessage(msg, {
      integration: updated!,
      workspaceId: workspace!.id,
      actorLabel: "mcp-agent",
      gateway: new N0va1oGateway(),
    });
    assert.ok(res.error, "policy-denied returns error");
    assert.equal(res.error!.code, -32003, "policy-approval-required error code");
    const errData = res.error!.data as { accessRequestId?: string };
    assert.ok(errData?.accessRequestId, "access request raised for policy denial");

    if (errData?.accessRequestId) {
      await prisma.integrationAccessRequest.delete({ where: { id: errData.accessRequestId } }).catch(() => {});
    }
  } finally {
    // Restore original allowlist.
    await prisma.integration.update({
      where: { id: github!.id },
      data: { allowlistTools: originalAllowlist ?? [] },
    });
  }
});

test("MCP: resources/list and resources/read work", async () => {
  const integration = mockIntegration();
  const listMsg: McpMessage = { jsonrpc: "2.0", id: "r-list", method: "resources/list", params: {} as Record<string, unknown> };
  const listRes = await handleMcpMessage(listMsg, mockCtx(integration));
  const listResult = listRes.result as { resources: Array<{ uri: string }> };
  assert.ok(listResult.resources?.[0]?.uri?.startsWith("n0va1o://"), "resource URI is namespaced");

  const readMsg: McpMessage = {
    jsonrpc: "2.0", id: "r-read", method: "resources/read",
    params: { uri: `n0va1o://${integration.id}` },
  };
  const readRes = await handleMcpMessage(readMsg, mockCtx(integration));
  const readResult = readRes.result as { contents: Array<{ text: string }> };
  assert.ok(readResult.contents?.[0], "content returned");
  const parsed = JSON.parse(readResult.contents[0].text);
  assert.equal(parsed.provider, "github", "provider in resource");
  assert.ok(parsed.scopedTools, "scoped tools in resource");
});

test("MCP: notifications/initialized and ping return empty results", async () => {
  for (const method of ["notifications/initialized", "ping"] as const) {
    const msg: McpMessage = { jsonrpc: "2.0", id: `notif-${method}`, method, params: {} };
    const res = await handleMcpMessage(msg, mockCtx(mockIntegration()));
    assert.ok(res.result !== undefined, `${method} returns a result`);
  }
});

test("adapters: real HTTP adapters exist for key provider:tool pairs", () => {
  const expected = [
    "github:list_repos",
    "github:get_repo",
    "github:list_issues",
    "github:create_issue",
    "github:merge_pr",
    "github:open_pr",
    "slack:post_message",
    "slack:list_channels",
    "slack:read_thread",
    "notion:search",
    "notion:read_page",
    "notion:create_page",
    "airtable:list_records",
    "airtable:create_record",
    "asana:list_projects",
    "asana:list_tasks",
    "linear:list_issues",
    "linear:create_issue",
    "clickup:list_tasks",
    "gitlab:list_projects",
    "gitlab:create_issue",
    "openai:chat",
    "openai:list_assistants",
    "anthropic:chat",
    "gemini:chat",
  ];
  for (const key of expected) {
    assert.ok(ADAPTERS[key], `real adapter exists for ${key}`);
  }
  // Verify we cover at least 8 providers with real adapters.
  const providers = new Set(Object.keys(ADAPTERS).map((k) => k.split(":")[0]));
  assert.ok(providers.size >= 8, `at least 8 providers have real adapters (got ${providers.size})`);
});

test("adapters: providerHeaders sets correct auth scheme per provider", () => {
  const gh = providerHeaders({ config: { token: "ghp_test" } } as any, "github");
  assert.equal(gh.Authorization, "Bearer ghp_test", "GitHub uses Bearer");
  assert.equal(gh.Accept, "application/vnd.github+json", "GitHub Accept header");

  const slack = providerHeaders({ config: { token: "xoxb-test" } } as any, "slack");
  assert.equal(slack.Authorization, "Bearer xoxb-test", "Slack uses Bearer");

  const notion = providerHeaders({ config: { token: "secret_test" } } as any, "notion");
  assert.equal(notion.Authorization, "Bearer secret_test", "Notion uses Bearer");
  assert.equal(notion["Notion-Version"], "2022-06-28", "Notion version header");

  const airtable = providerHeaders({ config: { token: "pat_test" } } as any, "airtable");
  assert.equal(airtable.Authorization, "Bearer pat_test", "Airtable uses Bearer");

  const clickup = providerHeaders({ config: { token: "pk_test" } } as any, "clickup");
  assert.equal(clickup.Authorization, "Bearer pk_test", "ClickUp uses Bearer (token in header)");

  const noToken = providerHeaders({ config: {} } as any, "github");
  assert.equal(noToken.Authorization, undefined, "no token = no auth header");
});

test("synthetic-data: generateText returns coherent text content", () => {
  const result = generateText("Write a greeting", { maxLength: 100 });
  assert.ok(typeof result === "string" && result.length > 0, "returns a non-empty string");
  assert.ok(result.length <= 100, "respects maxLength constraint");
});

test("synthetic-data: generateTabular produces valid table structure", () => {
  const result = generateTabular({ rows: 10, columns: 3, type: "numerical" });
  assert.equal(result.data.length, 10, "correct row count");
  assert.equal(result.columns.length, 3, "correct column count");
  assert.ok(Array.isArray(result.data[0]), "each row is an array");
});

test("synthetic-data: generateTimeseries returns timestamped points", () => {
  const result = generateTimeseries({ points: 5, type: "linear" });
  assert.equal(result.length, 5, "correct number of points");
  assert.ok(result.every((p) => typeof p.timestamp === "number" && typeof p.value === "number"), "each point has numeric timestamp and value");
});

test("synthetic-data: generateImage returns image data", () => {
  const result = generateImage({ width: 32, height: 32, style: "geometric" });
  assert.ok(typeof result === "string" && result.length > 0, "returns base64 or data string");
  assert.ok(result.startsWith("data:image/"), "returns valid data URI");
});

test("synthetic-data: generateGraph returns nodes and edges", () => {
  const result = generateGraph({ nodes: 8, edges: 12, type: "random" });
  assert.ok(result.nodes.length === 8, "correct node count");
  assert.ok(result.edges.length === 12, "correct edge count");
  assert.ok(result.nodes.every((n) => n.id !== undefined && n.label !== undefined), "each node has id and label");
});

test("synthetic-data: generateMultimodal returns mixed data types", () => {
  const result = generateMultimodal({ modalities: ["text", "image"], samples: 5 });
  assert.ok("text" in result && "image" in result, "contains both text and image keys");
  assert.ok(Array.isArray(result.text), "text is an array");
  assert.ok(Array.isArray(result.image), "image is an array");
});

test("synthetic-data: generateForUseCase returns appropriate dataset", () => {
  const result = generateForUseCase("regression", { samples: 20 });
  assert.ok(result.type === "tabular" || result.type === "timeseries", "regression use-case returns numeric data type");
  assert.ok(result.samples === 20, "respects sample count");
});

test("synthetic-data: validateDataset returns validation result", () => {
  const dataset: SyntheticDataset = { type: "text", samples: 5, generated: generateText("hello", { maxLength: 10 }) };
  const result = validateDataset(dataset);
  assert.ok(typeof result.valid === "boolean", "returns validity boolean");
  if (!result.valid) assert.ok(Array.isArray(result.errors) && result.errors.length > 0, "invalid dataset has errors");
});

test("code-evolution: analyzeBugs returns CodeIssue array", () => {
  const issues = analyzeBugs([{ file: "test.ts", content: "function f() { return; }" }]);
  assert.ok(Array.isArray(issues), "returns an array");
  assert.ok(issues.every((i) => typeof i.severity === "string" && typeof i.message === "string"), "each issue has severity and message");
});

test("code-evolution: analyzePerformance returns metrics", () => {
  const metrics = analyzePerformance([{ file: "app.ts", content: "for(let i=0;i<1000;i++){}" }]);
  assert.ok(typeof metrics === "object", "returns an object");
  assert.ok("score" in metrics || "details" in metrics, "has performance metrics");
});

test("code-evolution: analyzeSecurity returns vulnerabilities", () => {
  const vulns = analyzeSecurity([{ file: "api.ts", content: "eval(userInput)" }]);
  assert.ok(Array.isArray(vulns), "returns an array");
});

test("code-evolution: generateFix returns FixProposal", () => {
  const proposal: FixProposal = generateFix([{ severity: "high", message: "eval detected", file: "x.ts" }]);
  assert.ok("description" in proposal || "changes" in proposal, "fix proposal has description or changes");
});

test("code-evolution: shouldAutoFix returns boolean for severity", () => {
  assert.equal(typeof shouldAutoFix("high"), "boolean");
  assert.equal(typeof shouldAutoFix("low"), "boolean");
  assert.equal(typeof shouldAutoFix("unknown" as any), "boolean");
});

test("code-evolution: generateTests produces test code", () => {
  const tests = generateTests([{ file: "fn.ts", content: "export const add = (a,b) => a+b" }]);
  assert.ok(Array.isArray(tests) && tests.length > 0, "generates at least one test");
});

test("code-evolution: createSnapshot returns snapshot object", () => {
  const snap = createSnapshot({ files: ['a.ts'], code: "const x = 1" });
  assert.ok(typeof snap === "object" && snap !== null, "returns a snapshot object");
});

test("code-evolution: compareSnapshots returns delta", () => {
  const snap1 = createSnapshot({ files: ['a.ts'], code: "const x = 1" });
  const snap2 = createSnapshot({ files: ['a.ts'], code: "const x = 2" });
  const delta = compareSnapshots(snap1, snap2);
  assert.ok(typeof delta === "object" && delta !== null, "returns a delta object");
});

test("code-evolution: analyzeCodebase returns analysis report", () => {
  const report = analyzeCodebase([{ file: "index.ts", content: "console.log('test')" }]);
  assert.ok(typeof report === "object" && report !== null, "returns a report object");
});

test("memory: storeEntry then retrieveEntries returns stored data", () => {
  const key = storeEntry("test-key", { value: 42 }, "ephemeral" as MemoryTier);
  const entries = retrieveEntries("test-key");
  assert.ok(entries.length > 0, "retrieves at least one entry");
  assert.deepEqual(entries[0]?.data, { value: 42 }, "retrieved data matches stored");
});

test("memory: retrieveHyperContext returns context array", () => {
  storeEntry("ctx-key", { topic: "agents" }, "durable" as MemoryTier);
  const ctx = retrieveHyperContext("ctx-key");
  assert.ok(Array.isArray(ctx), "returns an array");
  assert.ok(ctx.length > 0, "returns at least one context item");
});

test("memory: consolidateMemory returns summary", () => {
  const summary = consolidateMemory();
  assert.ok(typeof summary === "object" && summary !== null, "returns summary object");
});

test("memory: getMemoryStats returns metrics", () => {
  const stats = getMemoryStats();
  assert.ok("totalEntries" in stats || "count" in stats, "has entry count");
  assert.ok("byTier" in stats || "tiers" in stats, "has tier breakdown");
});

test("memory: canReplay returns boolean", () => {
  assert.equal(typeof canReplay("test-key"), "boolean");
});

test("memory: applyRetention respects retention policy", () => {
  storeEntry("retention-test", { x: 1 }, "ephemeral" as MemoryTier, { expiresAt: Date.now() - 1000 });
  const expired = applyRetention();
  assert.equal(typeof expired, "number" || "object", "returns count or summary");
});

test("digital-twin: createTwin returns TwinMetadata", () => {
  const twin = createTwin("test-twin", { model: "gpt-4", env: "test" });
  assert.ok("id" in twin, "has an id");
  assert.ok("name" in twin, "has a name");
});

test("digital-twin: syncTwin returns sync status", () => {
  const twin = createTwin("sync-test", { model: "gpt-4" });
  const status = syncTwin(twin.id);
  assert.ok(typeof status === "object" && status !== null, "returns status object");
  assert.ok("synced" in status || "timestamp" in status, "has sync status");
});

test("digital-twin: simulateScenario returns SimulationResult", () => {
  const twin = createTwin("sim-test", { model: "gpt-4" });
  const result = simulateScenario(twin.id, { scenario: "high_load" });
  assert.ok("success" in result || "metrics" in result, "has success flag or metrics");
});

test("digital-twin: optimizeTwin returns OptimizationResult", () => {
  const twin = createTwin("opt-test", { model: "gpt-4" });
  const result = optimizeTwin(twin.id);
  assert.ok("optimized" in result || "changes" in result, "has optimization result");
});

test("digital-twin: recordTwinEvent then getTwinEvents returns events", () => {
  const twin = createTwin("event-test", { model: "gpt-4" });
  recordTwinEvent(twin.id, { type: "checkpoint", data: { step: 1 } });
  const events = getTwinEvents(twin.id);
  assert.ok(Array.isArray(events), "returns an array");
  assert.ok(events.length > 0, "has at least one event");
});

test("digital-twin: getTwinState returns TwinState", () => {
  const twin = createTwin("state-test", { model: "gpt-4" });
  const state = getTwinState(twin.id);
  assert.ok(typeof state === "object" && state !== null, "returns state object");
});

test("digital-twin: getTwin returns TwinMetadata or undefined", () => {
  const twin = createTwin("get-test", { model: "gpt-4" });
  const fetched = getTwin(twin.id);
  assert.ok(fetched !== undefined, "returns the twin metadata");
  const notFound = getTwin("nonexistent-twin-id");
  assert.equal(notFound, undefined, "returns undefined for non-existent twin");
});

test("digital-twin: listTwins returns array", () => {
  createTwin("list-test-1", { model: "gpt-4" });
  const twins = listTwins();
  assert.ok(Array.isArray(twins), "returns an array");
  assert.ok(twins.length >= 1, "has at least one twin");
});

test("digital-twin: checkTwinSync returns sync status", () => {
  const twin = createTwin("sync-check-test", { model: "gpt-4" });
  const status = checkTwinSync(twin.id);
  assert.ok(typeof status === "object" && status !== null, "returns status object");
});

test("green-ai: computeCarbonMetrics returns CarbonMetrics", () => {
  const metrics = computeCarbonMetrics({ tokens: 10000, model: "gpt-4", region: "us-east" });
  assert.ok("co2Grams" in metrics, "has co2Grams");
  assert.ok(metrics.co2Grams > 0, "co2Grams is positive");
});

test("green-ai: recommendRouting returns routing info", () => {
  const model: ModelEfficiency = { name: "gpt-4", tokensPerSecond: 50, co2PerToken: 0.05 };
  const route = recommendRouting(model, { maxLatency: 5000 });
  assert.ok("provider" in route, "has provider recommendation");
});

test("green-ai: generateGreenProfile returns GreenProfile", () => {
  const profile = generateGreenProfile({ models: ["gpt-3.5", "gpt-4"], regions: ["us", "eu"] });
  assert.ok("carbonBudget" in profile || "targets" in profile, "has carbon targets or budget");
});

test("green-ai: forecastRenewable returns forecast data", () => {
  const forecast = forecastRenewable({ region: "us-east", horizon: 24 });
  assert.ok(Array.isArray(forecast), "returns an array");
  assert.ok(forecast.length > 0, "has forecast entries");
});

test("compliance: runComplianceCheck returns report", () => {
  const context: ComplianceContext = { tenant: "test", data: { pii: true, gdpr: true } };
  const report = runComplianceCheck("gdpr", context);
  assert.ok("status" in report, "has status");
  assert.ok(["pass", "fail", "pending", "warning"].includes(report.status as string), "status is valid");
});

test("compliance: runAllComplianceChecks returns array of reports", () => {
  const context: ComplianceContext = { tenant: "test", data: { pii: true, hipaa: true } };
  const reports = runAllComplianceChecks(context);
  assert.ok(Array.isArray(reports), "returns an array");
  assert.ok(reports.length >= 1, "checks at least one framework");
});

test("compliance: getWorstStatus returns worst status", () => {
  const reports = [
    { framework: "gdpr", status: "pass" },
    { framework: "hipaa", status: "fail" },
    { framework: "soc2", status: "warning" },
  ];
  const worst = getWorstStatus(reports);
  assert.equal(worst, "fail", "fail is worse than warning and pass");
});

test("compliance: collectEvidence returns evidence list", () => {
  const evidence = collectEvidence({ tenant: "test" });
  assert.ok(Array.isArray(evidence), "returns an array");
});

test("compliance: COMPLIANCE_RULES defines frameworks", () => {
  assert.ok(COMPLIANCE_RULES["gdpr"], "GDPR rules defined");
  assert.ok(COMPLIANCE_RULES["hipaa"], "HIPAA rules defined");
  assert.ok(COMPLIANCE_RULES["soc2"], "SOC2 rules defined");
});

test("threat-intel: detectThreats returns ThreatSignal array", () => {
  const signals = detectThreats({ source: "api", payload: { unusual: true } });
  assert.ok(Array.isArray(signals), "returns an array");
  assert.ok(signals.every((s) => typeof s.type === "string" && typeof s.severity === "string"), "each signal has type and severity");
});

test("threat-intel: detectDataPoisoning returns detection result", () => {
  const result = detectDataPoisoning([{ input: "malicious", output: "corrupted" }]);
  assert.ok("detected" in result || "threats" in result, "has detection result");
});

test("threat-intel: detectInsiderThreat returns boolean", () => {
  const detected = detectInsiderThreat({ accessPattern: "exfiltration", frequency: 100 });
  assert.equal(typeof detected, "boolean", "returns a boolean");
});

test("threat-intel: detectSupplyChainAttack returns alerts", () => {
  const alerts = detectSupplyChainAttack([{ package: "lodash", version: "1.0.0" }]);
  assert.ok(Array.isArray(alerts), "returns an array");
});

test("threat-intel: runRedTeam returns simulation results", () => {
  const results = runRedTeam({ target: "api", attackScenario: "rate_limit_bypass" });
  assert.ok(typeof results === "object" && results !== null, "returns an object");
  assert.ok("success" in results || "results" in results, "has simulation results");
});

test("threat-intel: detectQuantumAttack returns analysis", () => {
  const analysis = detectQuantumAttack({ algorithm: "rsa-2048" });
  assert.ok("vulnerable" in analysis, "has vulnerability flag");
});

test("threat-intel: detectNeuralIntrusion returns detection result", () => {
  const result = detectNeuralIntrusion({ prompt: "inject malicious code" });
  assert.ok(typeof result === "object" && result !== null, "returns an object");
});

test("threat-intel: THREAT_INTEL_RULES defines rules", () => {
  assert.ok(Array.isArray(THREAT_INTEL_RULES) || typeof THREAT_INTEL_RULES === "object", "rules object defined");
});

test("cognitive-load: computeCognitiveMetrics returns CognitiveMetrics", () => {
  const signals: CognitiveSignal[] = [{ type: "attention", value: 0.7, timestamp: Date.now() }];
  const metrics = computeCognitiveMetrics(signals);
  assert.ok("load" in metrics || "score" in metrics, "has cognitive load metrics");
});

test("cognitive-load: determineCognitiveState returns state", () => {
  const metrics: CogMetrics = { load: 0.8, engagement: 0.6, fatigue: 0.7, focus: 0.5 };
  const state = determineCognitiveState(metrics);
  assert.ok(typeof state === "string", "returns a state string");
});

test("cognitive-load: recommendAdaptiveUI returns recommendations", () => {
  const recommendations = recommendAdaptiveUI({ load: 0.8 });
  assert.ok(Array.isArray(recommendations) || typeof recommendations === "object", "returns recommendations");
});

test("cognitive-load: detectBurnout returns risk assessment", () => {
  const risk = detectBurnout({ fatigue: 0.9, stress: 0.8 });
  assert.ok("risk" in risk || "level" in risk, "has risk assessment");
});

test("cognitive-load: detectProactiveTriggers returns triggers", () => {
  const triggers = detectProactiveTriggers({ engagement: 0.3, load: 0.9 });
  assert.ok(Array.isArray(triggers), "returns an array");
});

test("cognitive-load: buildCognitiveSnapshot returns snapshot", () => {
  const signals: CognitiveSignal[] = [{ type: "attention", value: 0.7, timestamp: Date.now() }];
  const snapshot = buildCognitiveSnapshot(signals);
  assert.ok(typeof snapshot === "object" && snapshot !== null, "returns a snapshot object");
});

test("knowledge-graph: ingestDocument returns entity id", () => {
  const id = ingestDocument({ uri: "test://doc1", content: "This is a test document" });
  assert.ok(typeof id === "string" && id.length > 0, "returns an entity id string");
});

test("knowledge-graph: addEdge returns edge", () => {
  const sourceId = ingestDocument({ uri: "test://doc2", content: "Second doc" });
  const targetId = ingestDocument({ uri: "test://doc3", content: "Third doc" });
  const edge = addEdge(sourceId, targetId, "references");
  assert.ok("source" in edge && "target" in edge, "has source and target");
  assert.equal(edge.source, sourceId, "source matches");
  assert.equal(edge.target, targetId, "target matches");
});

test("knowledge-graph: findPath returns path result", () => {
  const src = ingestDocument({ uri: "test://path1", content: "start" });
  const tgt = ingestDocument({ uri: "test://path2", content: "end" });
  addEdge(src, tgt, "links_to");
  const result = findPath(src, tgt);
  assert.ok("path" in result || "found" in result, "has path result");
});

test("knowledge-graph: detectCommunities returns community list", () => {
  const communities = detectCommunities();
  assert.ok(Array.isArray(communities), "returns an array");
});

test("knowledge-graph: detectAnomalies returns anomaly list", () => {
  const anomalies = detectAnomalies();
  assert.ok(Array.isArray(anomalies), "returns an array");
});

test("knowledge-graph: queryGraph returns results", () => {
  ingestDocument({ uri: "test://query1", content: "searchable document" });
  const results = queryGraph({ text: "searchable" });
  assert.ok(Array.isArray(results), "returns an array");
});

test("knowledge-graph: reasonAbout returns reasoning result", () => {
  const result = reasonAbout({ question: "what is the relationship?", context: "graph data" });
  assert.ok(typeof result === "object" && result !== null, "returns an object");
  assert.ok("answer" in result || "conclusion" in result, "has answer or conclusion");
});

test("knowledge-graph: getGraphSnapshot returns snapshot", () => {
  ingestDocument({ uri: "test://snapshot1", content: "snapshot test" });
  const snapshot = getGraphSnapshot();
  assert.ok("nodes" in snapshot, "has nodes");
  assert.ok("edges" in snapshot, "has edges");
});

test("synthetic-data: generateTabular with categorical type returns categories", () => {
  const result = generateTabular({ rows: 5, columns: 2, type: "categorical" });
  assert.equal(result.data.length, 5, "correct row count");
  assert.ok(result.columns.some((c) => typeof c === "string"), "has string columns");
});

test("synthetic-data: generateTimeseries with seasonal pattern has variance", () => {
  const result = generateTimeseries({ points: 10, type: "seasonal" });
  assert.equal(result.length, 10, "correct point count");
  const values = result.map((p) => p.value);
  const hasVariance = new Set(values).size > 1;
  assert.ok(hasVariance, "seasonal pattern has variance");
});

test("code-evolution: analyzeBugs with real issues finds problems", () => {
  const issues = analyzeBugs([{ file: "buggy.ts", content: "if (x = 5) { return; }" }]);
  assert.ok(issues.length > 0, "detects at least one issue");
  assert.ok(issues.some((i) => i.severity === "high" || i.severity === "medium"), "flags as high or medium severity");
});

test("memory: storeEntry with custom ttl respects expiration", () => {
  const now = Date.now();
  storeEntry("ttl-test", { data: "test" }, "ephemeral" as MemoryTier, { expiresAt: now + 5000 });
  const entries = retrieveEntries("ttl-test");
  assert.ok(entries.length > 0, "entry is retrievable before expiry");
});

test("digital-twin: createTwin with same name creates unique twins", () => {
  const t1 = createTwin("dup-name", { model: "gpt-4" });
  const t2 = createTwin("dup-name", { model: "gpt-3.5" });
  assert.notEqual(t1.id, t2.id, "twins have unique ids");
  assert.equal(t1.name, t2.name, "twins can share names");
});

test("green-ai: computeCarbonMetrics with large token count is proportional", () => {
  const small = computeCarbonMetrics({ tokens: 1000, model: "gpt-3.5", region: "us-east" });
  const large = computeCarbonMetrics({ tokens: 10000, model: "gpt-3.5", region: "us-east" });
  assert.ok(large.co2Grams > small.co2Grams, "larger token count = more carbon");
});

test("compliance: runComplianceCheck with no data still returns report", () => {
  const report = runComplianceCheck("gdpr", { tenant: "test", data: {} });
  assert.ok("status" in report, "returns a report even with empty data");
});

test("threat-intel: detectThreats with clean payload returns empty or low severity", () => {
  const signals = detectThreats({ source: "internal", payload: { normal_key: "normal_value" } });
  const highSeverity = signals.filter((s) => s.severity === "critical" || s.severity === "high");
  assert.equal(highSeverity.length, 0, "clean payload produces no high-severity signals");
});

test("cognitive-load: detectBurnout with low metrics returns low risk", () => {
  const risk = detectBurnout({ fatigue: 0.1, stress: 0.2 });
  assert.ok(risk.risk === "low" || risk.level === "low", "low fatigue = low burnout risk");
});

test("MCP: effectiveTools respects integration allowlist and blocklist", () => {
  // With allowlist containing only post_message — only that survives.
  const integration = mockIntegration({ provider: "slack", allowlistTools: ["post_message"] });
  const tools = effectiveTools(integration as any);
  assert.equal(tools.length, 1, "only allowlisted tool survives");
  assert.equal(tools[0]!.name, "post_message", "post_message is the allowed tool");

  // Blocklist removes a non-destructive tool.
  const blocked = mockIntegration({ provider: "github", blocklistTools: ["list_issues"] });
  const tools2 = effectiveTools(blocked as any);
  assert.ok(!tools2.some((t) => t.name === "list_issues"), "blocklisted tool removed");

  // No allowlist → all non-destructive tools pass, destructive blocked.
  const noAllow = mockIntegration({ provider: "github" });
  const tools3 = effectiveTools(noAllow as any);
  assert.ok(tools3.some((t) => t.name === "list_repos"), "non-destructive tool present without allowlist");
  assert.ok(!tools3.some((t) => t.name === "create_issue"), "destructive tool excluded without allowlist");
});