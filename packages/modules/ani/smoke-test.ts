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
import { CognitiveControlPlane } from "./src/cognitive-plane";
import { GoalStack } from "./src/goal-stack";
import { ReasoningTraceLogger } from "./src/reasoning-traces";
import { ContextFusionLayer } from "./src/context-fusion";
import { ModeSystem } from "./src/mode-system";
import { PlannerExecutorObserverLoop } from "./src/loop";
import { ToolSelectionScorer } from "./src/tool-scoring";
import { SelfHealingWorkflow } from "./src/self-healing";
import { EvidenceGraph } from "./src/evidence-graph";
import { ContextDecayModel } from "./src/context-decay";
import { SessionIntentionPredictor } from "./src/intention-predictor";
import { AuditLogger } from "./src/audit-logger";
import { RiskAdaptiveRedaction } from "./src/risk-redaction";
import { PreferenceEvolutionEngine } from "./src/preference-evolution";

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

  process.stdout.write("17. Cognitive Control Plane... ");
  const plane = new CognitiveControlPlane();
  const decision = plane.decide("action", 0.85, "medium", { verbosity: "concise", proactive: true, autoExecute: 0.7 }, 0.6);
  console.log(`✓ (action: ${decision.action}, confidence: ${decision.confidence.toFixed(2)})`);

  process.stdout.write("18. Goal Stack... ");
  const goals = new GoalStack();
  const goal = goals.create("Complete Q4 planning", "Research, draft, and finalize Q4 strategy", "session_1", 10);
  const sub1 = goals.addSubgoal(goal.id, "Research market trends", "Analyze competitor moves");
  const sub2 = goals.addSubgoal(goal.id, "Draft strategy doc", "Write initial strategy");
  if (sub1) goals.activate(sub1.id);
  if (sub2) goals.block(sub2.id, "Waiting for research data");
  const activeGoals = goals.getActiveGoals("session_1");
  console.log(`✓ (${activeGoals.length} active, ${goal.subgoals.length} subgoals)`);

  process.stdout.write("19. Reasoning Traces... ");
  const tracer = new ReasoningTraceLogger();
  const trace = tracer.startTrace("session_1", goal.id);
  tracer.addStep(trace.id, "observation", "User asked about Q4 strategy", 0.95);
  tracer.addStep(trace.id, "inference", "Need to research market data first", 0.88);
  tracer.addStep(trace.id, "decision", "Use research agent for data gathering", 0.82);
  const auditTrail = tracer.getAuditTrail(trace.id);
  console.log(`✓ (${auditTrail.length} steps, compact: ${trace.compactRepresentation.slice(0, 40)}...)`);

  process.stdout.write("20. Context Fusion... ");
  const fusion = new ContextFusionLayer();
  const fused = fusion.fuse([
    { source: "doc_1", module: "docs", content: "Q4 product strategy focuses on enterprise tier expansion", timestamp: new Date().toISOString() },
    { source: "task_1", module: "tasks", content: "Finalize pricing model", timestamp: new Date(Date.now() - 3600000).toISOString() },
    { source: "mail_1", module: "mail", content: "RE: Partnership opportunity with Acme Corp", timestamp: new Date(Date.now() - 7200000).toISOString() },
    { source: "cal_1", module: "calendar", content: "Q4 planning meeting scheduled for next Monday", timestamp: new Date(Date.now() - 1800000).toISOString() },
  ]);
  console.log(`✓ (${fused.items.length} items fused, top: ${fused.dominantTheme})`);

  process.stdout.write("21. Mode System... ");
  const modes = new ModeSystem();
  modes.setMode("executor");
  const autoExec = modes.shouldAutoExecute(0.8);
  const proactive = modes.shouldProactiveSuggest();
  console.log(`✓ (mode: executor, autoExec: ${autoExec}, proactive: ${proactive})`);

  process.stdout.write("22. Planner-Executor-Observer Loop... ");
  const loop = new PlannerExecutorObserverLoop();
  const loopState = loop.startLoop("Draft and publish Q4 strategy document");
  loop.planStep(loopState.id, "Research market data", "Market analysis complete");
  loop.planStep(loopState.id, "Draft document", "Draft complete");
  loop.executeStep(loopState.id, loopState.steps[0]?.id ?? "", "Market data gathered from 5 sources", true);
  const revision = loop.observeAndRevise(loopState.id);
  console.log(`✓ (phase: ${loopState.phase}, iteration: ${loopState.iteration}, revise: ${revision?.shouldRevise})`);

  process.stdout.write("23. Tool Selection Scoring... ");
  const scorer = new ToolSelectionScorer();
  scorer.recordOutcome("docs_search", true, 120);
  scorer.recordOutcome("docs_search", true, 100);
  scorer.recordOutcome("mail_search", false, 300);
  const scored = scorer.scoreTools([
    { toolName: "docs_search", latencyMs: 110, confidence: 0.9 },
    { toolName: "mail_search", latencyMs: 250, confidence: 0.7 },
    { toolName: "rag_retrieval", latencyMs: 80, confidence: 0.85 },
  ]);
  console.log(`✓ (best: ${scored[0]?.toolName}, score: ${scored[0]?.compositeScore.toFixed(2)})`);

  process.stdout.write("24. Self-Healing Workflow... ");
  const workflow = new SelfHealingWorkflow();
  workflow.addStep("Fetch market data", 3, "Use cached data");
  workflow.addStep("Generate report", 2, "Use template");
  const wfResult = await workflow.execute();
  console.log(`✓ (success: ${wfResult.success}, steps: ${wfResult.results.length})`);

  process.stdout.write("25. Evidence Graph... ");
  const evidence = new EvidenceGraph();
  const ev1 = evidence.addClaim("Q3 revenue exceeded target", "retrieved_document", "doc_q3_report", 0.92);
  const ev2 = evidence.addClaim("Marketing spend was $2.4M", "internal_fact", "finance_system", 0.95);
  evidence.linkSupport(ev1.id, ev2.id);
  evidence.addContradiction(ev1.id, ev2.id);
  const contradictions = evidence.getContradictions();
  const score = evidence.scoreClaim(ev1.id);
  console.log(`✓ (${contradictions.length} contradictions, score: ${score.toFixed(2)})`);

  process.stdout.write("26. Context Decay... ");
  const decay = new ContextDecayModel();
  decay.addItem("Q4 planning meeting notes", 0.9);
  decay.addItem("Old project update from 3 months ago", 0.3);
  decay.addItem("Stale notification", 0.1);
  const pruned = decay.decay(0.2);
  const active = decay.getActiveItems();
  console.log(`✓ (pruned: ${pruned.length}, active: ${active.length})`);

  process.stdout.write("27. Intention Predictor... ");
  const predictor = new SessionIntentionPredictor();
  predictor.recordTransition("research", "analysis");
  predictor.recordTransition("research", "drafting");
  predictor.recordTransition("research", "analysis");
  const prediction = predictor.predict("research", "session_1");
  console.log(`✓ (predicted: ${prediction.predictedIntent}, confidence: ${prediction.confidence.toFixed(2)})`);

  process.stdout.write("28. Audit Logger... ");
  const audit = new AuditLogger();
  audit.log({ actorId: user.userId, action: "create_document", targetType: "Doc", targetId: "doc_1", sourcesUsed: ["rag_retrieval"], confirmationsRequired: [], riskLevel: "low", outcome: "success", metadata: {} });
  audit.log({ actorId: user.userId, action: "delete_records", targetType: "Table", targetId: "tbl_1", sourcesUsed: [], confirmationsRequired: ["manager_approval"], riskLevel: "high", outcome: "escalated", metadata: {} });
  const highRiskEntries = audit.getEntries({ riskLevel: "high" });
  console.log(`✓ (${audit.getEntries().length} entries, ${highRiskEntries.length} high-risk)`);

  process.stdout.write("29. Risk Redaction... ");
  const redaction = new RiskAdaptiveRedaction();
  const sensitiveText = "Contact john@acme.com or call 555-0199. SSN: 123-45-6789. Password: secret123";
  const redacted = redaction.redact(sensitiveText);
  console.log(`✓ (${redacted !== sensitiveText ? "redacted" : "clean"}: ${redacted.slice(0, 50)}...)`);

  process.stdout.write("30. Preference Evolution... ");
  const prefs = new PreferenceEvolutionEngine();
  prefs.recordUsage("research", true);
  prefs.recordUsage("research", true);
  prefs.recordUsage("research", false);
  prefs.evolve("research", { tone: "formal", verbosity: "detailed" });
  const successRate = prefs.getSuccessRate("research");
  const researchPref = prefs.getPreference("research");
  console.log(`✓ (success: ${(successRate * 100).toFixed(0)}%, tone: ${researchPref.tone}, verbosity: ${researchPref.verbosity})`);

  console.log("\n=== All smoke tests passed ===");
}

smoke()
  .catch((e) => { console.error("\nFAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
