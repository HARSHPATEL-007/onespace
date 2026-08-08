import { AniService } from "./src/server";
import { prisma } from "@n0va/db";
import { createSwarmOrchestrator } from "./src/swarm";
import { hydrateContext, formatContextForPrompt } from "./src/context-hydration";
import { evaluateHITL } from "./src/hitl";
import { TwinManager } from "./src/twins";
import { CausalReasoningEngine } from "./src/causal";
import { HyperdimensionalComputer } from "./src/hyperdimensional";
import { TwinSimulationEngine } from "./src/v5-twin";
import { CompileEngine } from "./src/v5-compile";

async function smoke() {
  console.log("=== N0VA ANI Smoke Test ===\n");

  const workspace = await prisma.workspace.findFirst({ where: { slug: "n0va-demo" } });
  if (!workspace) {
    console.error("ERROR: No demo workspace found. Run: pnpm db:seed");
    process.exit(1);
  }

  const user = await prisma.workspaceMember.findFirst({ where: { workspaceId: workspace.id, role: "OWNER" } });
  if (!user) {
    console.error("ERROR: No owner member found.");
    process.exit(1);
  }

  const svc = new AniService(workspace.id, user.userId, "OWNER");

  process.stdout.write("1. Creating conversation... ");
  const conv = await svc.create("Smoke test conversation");
  console.log(`✓ (${conv.id})`);

  process.stdout.write("2. Sending message (RAG + fallback)... ");
  const result = await svc.send(conv.id, "What is the product strategy?");
  console.log(`✓ (${result.assistantMessage.content.slice(0, 60)}...)`);
  if (result.citations) {
    const citations = JSON.parse(result.citations);
    console.log(`    Found ${citations.length} workspace document(s) via RAG`);
  }

  process.stdout.write("3. Checking memory stats... ");
  await new Promise((r) => setTimeout(r, 200));
  const memStats = await svc.getMemoryStats();
  console.log(`✓ total=${memStats.total} working=${memStats.working} semantic=${memStats.semantic}`);

  process.stdout.write("4. Opening conversation... ");
  const opened = await svc.open(conv.id);
  console.log(`✓ (${opened.messages.length} messages)`);

  process.stdout.write("5. Classifying intent... ");
  const intent = await svc.classify("Schedule a meeting with the team");
  console.log(`✓ (${intent.classification}, risk=${intent.riskLevel})`);

  process.stdout.write("6. Getting consciousness metrics... ");
  const metrics = await svc.getConsciousnessMetrics();
  console.log(`✓ (${metrics ? "available" : "null"})`);

  process.stdout.write("7. Getting system health... ");
  const health = await svc.getSystemHealth();
  console.log(`✓ (${health.status}, ${health.degradedFeatures.length} degraded)`);

  process.stdout.write("8. Processing with engine... ");
  const engineResult = await svc.processWithEngine("Summarize the workspace activity");
  console.log(`✓ (${engineResult.content.slice(0, 50)}...)`);

  process.stdout.write("9. Swarm orchestration... ");
  const swarm = createSwarmOrchestrator();
  const plan = await swarm.decomposeGoal("Research the workspace and create a summary", { workspaceId: workspace.id, activeModule: "ani", userId: user.userId, sessionId: "test", tenantId: workspace.id, tenantTier: "enterprise", language: "en", timezone: "UTC", locale: "en-US" });
  const swarmResult = await swarm.executePlan(plan, { workspaceId: workspace.id, activeModule: "ani", userId: user.userId, sessionId: "test", tenantId: workspace.id, tenantTier: "enterprise", language: "en", timezone: "UTC", locale: "en-US" });
  console.log(`✓ (${swarmResult.results.length} agents, consensus: ${swarmResult.consensus.toFixed(2)})`);

  process.stdout.write("10. Context hydration... ");
  const hydrated = await hydrateContext({ workspaceId: workspace.id, activeModule: "ani", userId: user.userId, sessionId: "test", tenantId: workspace.id, tenantTier: "enterprise", language: "en", timezone: "UTC", locale: "en-US" });
  const contextPrompt = formatContextForPrompt(hydrated);
  console.log(`✓ (${hydrated.dimensions.projectMilestones.length} milestones, ${hydrated.tokenEstimate} tokens)`);

  process.stdout.write("11. HITL evaluation... ");
  const hitlResult = evaluateHITL("Delete all customer data", { financialImpactUsd: 10000, recipientCount: 0, isDestructive: true, isCrossTenant: false, isPrivilegeEscalation: false, isPHI: false, tier: "enterprise" });
  console.log(`✓ (requiresHuman: ${hitlResult.requiresHuman}, level: ${hitlResult.level})`);

  process.stdout.write("12. Digital Twin creation... ");
  const twinMgr = new TwinManager();
  const twin = twinMgr.createTwin({ type: "enterprise", workspaceId: workspace.id, name: "Enterprise Twin", state: {}, telemetrySources: ["erp", "crm"], updateFrequencyMs: 1000 });
  const sim = twinMgr.simulate(twin.id, "What if we increase ad spend by 50%?", 20);
  console.log(`✓ (${sim.branches} branches, outcome: sim.results[0].outcome.slice(0, 30)}...)`);

  process.stdout.write("13. Causal reasoning... ");
  const causal = new CausalReasoningEngine();
  causal.addCausalLink("ad_spend", "lead_velocity", 0.7, "More ads → more leads");
  causal.addCausalLink("lead_velocity", "server_load", 0.5, "More leads → more users → more load");
  const counterfactual = causal.predictIntervention("ad_spend", "server_load");
  console.log(`✓ (effect: ${counterfactual.causalEffect.toFixed(3)}, confidence: ${counterfactual.confidence.toFixed(2)})`);

  process.stdout.write("14. Hyperdimensional computing... ");
  const hdc = new HyperdimensionalComputer();
  const vecA = hdc.createRandomVector("concept_A");
  const vecB = hdc.createRandomVector("concept_B");
  const bundled = hdc.bundle(vecA, vecB);
  const bound = hdc.bind(vecA, vecB);
  const sim_score = hdc.similarity(vecA, vecB);
  console.log(`✓ (bundle: ${bundled.label}, bind: ${bound.label}, similarity: ${sim_score.toFixed(3)})`);

  process.stdout.write("15. v5 Causal Simulation... ");
  const twinEngine = new TwinSimulationEngine();
  const simResult = twinEngine.runSimulation("revenue_and_churn_q4", [
    { variable: "engineering_headcount", deltaPercentage: 15 },
    { variable: "marketing_spend", deltaPercentage: -8 },
  ], 100000, 0.95);
  console.log(`✓ (mean: ${simResult.meanOutcome.toFixed(1)}, P positive: ${(simResult.probabilityPositive * 100).toFixed(0)}%)`);

  process.stdout.write("16. v5 Wasm Compilation... ");
  const compiler = new CompileEngine();
  const compiled = compiler.compileWorkflow("When an invoice in NetSuite exceeds $50,000, cross-check compliance status in Salesforce, verify bank details via Plaid API, and require CFO biometric approval.");
  console.log(`✓ (${compiled.generatedCode.split("\n").length} lines generated, arch: ${compiled.targetArchitecture})`);

  console.log("\n=== All smoke tests passed ===");
}

smoke()
  .catch((e) => { console.error("\nFAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
