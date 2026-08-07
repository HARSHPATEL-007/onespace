/**
 * N0VA1O Demo CLI — exercises the orchestration layer and key modules.
 * Run: pnpm --filter @n0va/db exec tsx demo.ts
 */

import { createRuntime, invokeTool, getSystemHealth } from "../modules/n0va1o/src/orchestrate.ts";
import { discoverTools } from "../modules/n0va1o/src/catalog.ts";
import { computeHealthScore } from "../modules/n0va1o/src/health.ts";
import { createSession, addTurn } from "../modules/n0va1o/src/voice.ts";
import { evaluateFineTuning } from "../modules/n0va1o/src/finetuning.ts";
import { classifyRisk } from "../modules/n0va1o/src/escalation.ts";
import { deriveTemplate, commitTemplate } from "../modules/n0va1o/src/recipe.ts";
import { InMemoryWorkflowStore } from "../modules/n0va1o/src/versioning.ts";
import { evaluateRetention } from "../modules/n0va1o/src/artifact.ts";

function header(title: string): void {
  console.log("");
  console.log("============================================================");
  console.log("  " + title);
  console.log("============================================================");
}

function section(title: string): void {
  console.log("");
  console.log("--- " + title + " ---");
}

async function main(): Promise<void> {
  header("N0VA1O — Integration Gateway Demo");
  console.log("Transcendent Edition v2026.07");

  // 1. Runtime
  section("1. Runtime Initialization");
  const runtime = createRuntime({ environment: "demo", logLevel: "warn" });
  console.log("  Environment: " + runtime.config.environment);
  console.log("  Correlation ID: " + runtime.correlationId);
  console.log("  Policy enabled: " + runtime.config.enablePolicy);
  runtime.logger.info("Demo session started");

  // 2. Tool invocation through policy pipeline
  section("2. Tool Invocation (Policy Pipeline)");
  const tools = [
    { provider: "github", tool: "list_issues", actorLabel: "demo-agent" },
    { provider: "slack", tool: "post_message", actorLabel: "demo-agent" },
    { provider: "github", tool: "delete_repo", actorLabel: "demo-agent" },
  ];
  for (const t of tools) {
    const result = invokeTool(runtime, { provider: t.provider, tool: t.tool, input: { count: 10 }, actorLabel: t.actorLabel });
    console.log("  " + t.provider + ":" + t.tool + " -> " + result.policyOutcome + " (" + result.durationMs + "ms)");
    runtime.metrics.incrementCounter("demo_tools_total", { provider: t.provider });
  }

  // 3. Intent-driven discovery
  section("3. Intent-Driven Tool Discovery");
  const query = "I need to find all Q3 invoices in Dropbox and notify the team on Slack";
  const discovered = discoverTools(query, { maxTools: 4 });
  console.log("  Query: \"" + query + "\"");
  for (const tool of discovered) {
    console.log("  -> " + tool.providerKey + ":" + tool.name + " (relevance: " + tool.relevance.toFixed(2) + ")");
  }

  // 4. Health scoring
  section("4. Connector Health Scoring");
  const healthy = computeHealthScore({ avgLatencyMs: 150, errorRate: 0.01, authFreshness: 1, schemaDriftCount: 0, rateLimitPressure: 0, retryCount: 0, totalCalls: 100 });
  console.log("  Healthy GitHub: " + healthy.score + " (" + healthy.grade + ")");
  const degraded = computeHealthScore({ avgLatencyMs: 3000, errorRate: 0.15, authFreshness: 0.5, schemaDriftCount: 2, rateLimitPressure: 0.6, retryCount: 4, totalCalls: 100 });
  console.log("  Degraded Slack: " + degraded.score + " (" + degraded.grade + ") — " + degraded.recommendation);

  // 5. Voice dialogue
  section("5. Voice-First Dialogue Session");
  let session = createSession();
  session = addTurn(session, "user", "List all open issues on the project");
  session = addTurn(session, "system", "Found 12 open issues");
  console.log("  Session ID: " + session.sessionId);
  console.log("  Turns: " + session.turns.length);
  for (const turn of session.turns) {
    console.log("    [" + turn.role + "] " + turn.text);
  }

  // 6. Workflow planning & recipe templates
  section("6. Workflow Planning & Recipe Templates");
  const store = new InMemoryWorkflowStore();
  const wf = store.commit({
    workflowName: "Invoice_Sync",
    description: "Sync invoices",
    steps: [{ provider: "dropbox", tool: "list_files", input: {} }, { provider: "slack", tool: "post_message", input: {} }],
    parentVersionId: null,
    policyVersion: "2026.07.1",
  });
  const template = deriveTemplate(wf);
  console.log("  Workflow: " + wf.workflowName + " v" + wf.version);
  console.log("  Template params: " + template.parameters.length);
  console.log("  Store versions: " + store.list("Invoice_Sync").length);

  // 7. Risk classification
  section("7. Risk Classification & Escalation");
  const low = classifyRisk({ action: "list issues", risk: "low", reversibility: "reversible", businessImpact: "low" });
  const critical = classifyRisk({ action: "delete production", risk: "critical", reversibility: "irreversible", businessImpact: "high" });
  console.log("  list issues: " + low.mode);
  console.log("  delete production: " + critical.mode);

  // 8. Fine-tuning evaluation
  section("8. Fine-Tuning Evaluation");
  const tuned = evaluateFineTuning({ tunedAccuracy: 0.92, baselineAccuracy: 0.85, formatErrors: 2, totalOutputs: 100, policyViolations: 1 });
  console.log("  Task accuracy: " + tuned.taskAccuracy);
  console.log("  Format compliance: " + (tuned.formatCompliance * 100).toFixed(0) + "%");
  console.log("  Deploy safe: " + tuned.deploySafe);

  // 9. System health aggregation
  section("9. System Health Aggregation");
  const systemHealth = getSystemHealth(runtime, {
    database: () => ({ ok: true, message: "connected" }),
    cache: () => ({ ok: true, message: "healthy" }),
  });
  console.log("  Overall: " + systemHealth.status);
  for (const sub of systemHealth.subsystems) {
    console.log("    " + sub.name + ": " + sub.status + " (" + sub.latencyMs + "ms)");
  }

  // 10. Metrics snapshot
  section("10. Metrics Snapshot");
  const snapshot = runtime.metrics.snapshot();
  console.log("  Counters: " + snapshot.counters.length);
  console.log("  Histograms: " + snapshot.histograms.length);
  for (const counter of snapshot.counters) {
    console.log("    " + counter.name + ": " + counter.value + " " + JSON.stringify(counter.labels));
  }

  header("Demo Complete");
  console.log("  N0VA1O orchestration + modules exercised successfully.");
  console.log("  Runtime: " + runtime.config.environment + " | Correlation: " + runtime.correlationId);
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
