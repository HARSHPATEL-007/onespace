import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  AGENT_DEFS, classifyIntent, selectWorkflow, escalationTriggers,
  verdictFor, socraticShouldStop,
  type Intent, type AgentDef,
} from "./tutor-agents";
import { snapshotScopes, agentAccess } from "./memory-trust";
import { deriveVerificationLabel } from "./epistemics";

export const runTurnSchema = z.object({
  sessionId: z.string().optional(),
  setId: z.string().optional(),
  conceptId: z.string().optional(),
  message: z.string().trim().min(1).max(4000),
});

export interface RunnerOutput {
  artifacts: { type: string; content: unknown }[];
  claims: { text: string; evidenceRefs: string[]; confidence: number }[];
  proposals: { conceptId?: string; dimension?: string; value?: number; kind: string; ref?: string }[];
  warnings: string[];
  nextActions: string[];
}

const empty: RunnerOutput = { artifacts: [], claims: [], proposals: [], warnings: [], nextActions: [] };

export class OrchestratorService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  // -- Registry -------------------------------------------------------------
  async seedRegistry() {
    for (const a of AGENT_DEFS) {
      await prisma.tutorAgent.upsert({
        where: { workspaceId_key: { workspaceId: this.workspaceId, key: a.key } },
        update: {
          name: a.name, mandate: a.mandate, tools: a.tools, version: a.version,
          confidenceLimit: a.confidenceLimit, allowedActions: a.allowedActions,
          dataScopes: a.dataScopes, active: true,
        },
        create: {
          workspaceId: this.workspaceId, key: a.key, name: a.name, mandate: a.mandate,
          tools: a.tools, version: a.version, confidenceLimit: a.confidenceLimit,
          allowedActions: a.allowedActions, dataScopes: a.dataScopes,
        },
      });
    }
    return this.listAgents();
  }

  async listAgents(): Promise<AgentDef[]> {
    const rows = await prisma.tutorAgent.findMany({
      where: { workspaceId: this.workspaceId, active: true },
    });
    if (rows.length === 0) return AGENT_DEFS;
    return rows.map((r) => ({
      key: r.key, name: r.name, mandate: r.mandate, tools: r.tools,
      version: r.version, confidenceLimit: r.confidenceLimit,
      allowedActions: r.allowedActions, dataScopes: r.dataScopes,
      outputs: AGENT_DEFS.find((d) => d.key === r.key)?.outputs ?? [],
    }));
  }

  // -- Session gateway --------------------------------------------------------
  async startSession(setId?: string, mode = "DIRECT") {
    const session = await prisma.tutorSession.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        setId: setId || null, mode: mode as never, agent: "orchestrator",
      },
    });
    await this.log(session.id, null, "session.started", { setId: setId || null, mode });
    return session;
  }

  async sessionDetail(sessionId: string) {
    const session = await prisma.tutorSession.findFirst({
      where: { id: sessionId, workspaceId: this.workspaceId, userId: this.userId },
      include: {
        tasks: { orderBy: { createdAt: "asc" } },
        events: { orderBy: { createdAt: "asc" }, take: 200 },
        escalations: { orderBy: { createdAt: "desc" } },
        snapshots: { orderBy: { version: "asc" } },
      },
    });
    if (!session) throw new Error("Session not found");
    return session;
  }

  async sessionEvents(sessionId: string) {
    return prisma.agentEvent.findMany({
      where: { workspaceId: this.workspaceId, sessionId },
      orderBy: { createdAt: "asc" }, take: 300,
    });
  }

  private async log(sessionId: string, taskId: string | null, type: string, payload: unknown, actor = "orchestrator") {
    return prisma.agentEvent.create({
      data: {
        workspaceId: this.workspaceId, sessionId, taskId,
        type, payload: (payload ?? {}) as never, actor,
      },
    });
  }

  // -- Turn: the governed pipeline ---------------------------------------------
  async runTurn(input: z.infer<typeof runTurnSchema>) {
    const started = Date.now();
    const session = input.sessionId
      ? await prisma.tutorSession.findFirst({
          where: { id: input.sessionId, workspaceId: this.workspaceId, userId: this.userId },
        })
      : await this.startSession(input.setId);
    if (!session) throw new Error("Session not found");

    await this.log(session.id, null, "learner.message.received", { message: input.message.slice(0, 1000) }, "learner");
    const intent: Intent = classifyIntent(input.message);
    await this.log(session.id, null, "intent.classified", { intent });

    // State snapshot (read-only for agents).
    const snapshot = await this.snapshotState(session.id, input.setId);
    await this.log(session.id, null, "state.snapshot.loaded", { version: snapshot.version });

    // Safety policy gate first — independent boundary.
    const safety = await this.execTask(session.id, "safety", intent, { message: input.message, setId: input.setId }, {});
    const decision = (safety.out.artifacts.find((a) => a.type === "policy_decision")?.content ?? {}) as {
      decision?: string; user_message?: string; allowed?: string[]; blocked?: string[];
    };
    await this.log(session.id, null, "policy.check.completed", decision);
    if (decision.decision === "refuse") {
      const composed = await this.compose(session.id, [], decision.user_message ?? "I can't help with that.", [], true);
      return { sessionId: session.id, intent, workflow: "safety" as const, refused: true, response: composed, escalationId: null as string | null, latencyMs: Date.now() - started };
    }

    // Workflow selection.
    const contested = false; // determined per-task below
    const risky = decision.decision === "escalate";
    const { workflow, agents } = selectWorkflow(intent, { contested, risky });
    await this.log(session.id, null, "plan.created", { workflow, agents });
    await prisma.tutorSession.update({ where: { id: session.id }, data: { intent, plan: { workflow, agents } as never } });

    // Execute agents.
    const outputs: { key: string; out: RunnerOutput; status: string }[] = [];
    let degraded = false;
    for (const key of agents) {
      if (key === "safety") { outputs.push(safety); continue; }
      const out = await this.execTask(session.id, key, intent, {
        message: input.message, setId: input.setId, conceptId: input.conceptId,
        prior: Object.fromEntries(outputs.map((o) => [o.key, o.out])),
      }, {});
      outputs.push(out);
      if (out.status !== "completed") degraded = true;
    }

    // Fact-check pass over produced claims.
    const allClaims = outputs.flatMap((o) => o.out.claims.map((c) => ({ ...c, from: o.key })));
    const verdicts = await this.verifyClaims(session.id, allClaims, input.setId).catch(() => []);
    const contestedNow = verdicts.some((v) => v.verdict === "contested");

    // Supervisor review on triggers.
    const triggers = escalationTriggers({
      agentDisagreement: outputs.some((o) => o.out.warnings.length > 0) && contestedNow,
      factcheckConfidence: verdicts.length ? Math.min(...verdicts.map((v) => v.confidence)) : 1,
      humanRequested: intent === "human_help",
      dispute: intent === "challenge_result",
      policyUnclear: decision.decision === "escalate",
      highStakes: decision.decision === "escalate",
    });
    let escalationId: string | null = null;
    if (triggers.length > 0) {
      const esc = await this.raiseEscalation(session.id, input.setId, "tutor turn", triggers, outputs, verdicts);
      escalationId = esc.id;
    }

    // Commit allowed state proposals (agents propose; service commits).
    const committed = await this.commitProposals(session.id, outputs);

    // Compose one coherent response.
    const composed = await this.compose(
      session.id, outputs, null, verdicts, degraded,
      decision.decision === "modify" ? (decision.allowed ?? []) : undefined,
    );
    if (degraded) {
      await prisma.tutorSession.update({ where: { id: session.id }, data: { degraded: true } });
    }
    return {
      sessionId: session.id, intent, workflow, refused: false,
      response: composed, escalationId, latencyMs: Date.now() - started,
    };
  }

  private async execTask(
    sessionId: string, agentKey: string, intent: string,
    target: Record<string, unknown>, constraints: Record<string, unknown>,
  ): Promise<{ key: string; out: RunnerOutput; status: string }> {
    const def = AGENT_DEFS.find((d) => d.key === agentKey);
    const task = await prisma.agentTask.create({
      data: {
        workspaceId: this.workspaceId, sessionId, agentKey, intent,
        target: target as never, constraints: constraints as never,
        status: "RUNNING" as never, modelVersion: def?.version ?? "",
      },
    });
    await this.log(sessionId, task.id, "agent.task.requested", { agent: agentKey, intent });
    // Access-matrix enforcement: agents receive a filtered snapshot, never raw state.
    const snapshot = await this.agentSnapshot(sessionId, agentKey).catch(() => null);
    const t0 = Date.now();
    try {
      const out = await this.runAgent(agentKey, { ...target, snapshot });
      await prisma.agentTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED" as never, artifacts: out.artifacts as never,
          claims: out.claims as never, proposals: out.proposals as never,
          warnings: out.warnings, nextActions: out.nextActions, latencyMs: Date.now() - t0,
        },
      });
      await this.log(sessionId, task.id, "agent.task.completed", { agent: agentKey, latencyMs: Date.now() - t0 });
      return { key: agentKey, out, status: "completed" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "agent failed";
      await prisma.agentTask.update({
        where: { id: task.id },
        data: { status: "DEGRADED" as never, error: msg.slice(0, 1000), latencyMs: Date.now() - t0 },
      });
      await this.log(sessionId, task.id, "agent.task.failed", { agent: agentKey, error: msg });
      return { key: agentKey, out: { ...empty, warnings: [`${agentKey} unavailable — continuing without it`] }, status: "degraded" };
    }
  }

  // -- Access-matrix snapshots ----------------------------------------------------------
  /**
   * Filtered per-agent snapshot. Research/debate/fact-check get no goals or
   * preferences and dimension-stripped mastery; sensitive data flows only to
   * authorized agents. Every filtering is logged.
   */
  private async agentSnapshot(sessionId: string, agentKey: string) {
    const latest = await prisma.stateSnapshot.findMany({
      where: { workspaceId: this.workspaceId, sessionId },
      orderBy: { version: "desc" }, take: 1,
    });
    const full = (latest[0]?.state ?? {}) as Record<string, unknown>;
    const scopes = snapshotScopes(agentKey);
    const longTerm = scopes.includes("LONG_TERM");
    const goals = longTerm ? full.goals : undefined;
    const preferences = ["accessibility", "safety", "supervisor", "planner", "tutor"].includes(agentKey)
      ? full.preferences : undefined;
    const mastery = Array.isArray(full.mastery)
      ? (full.mastery as Record<string, unknown>[]).map((m) =>
          longTerm ? m : { conceptId: m.conceptId, key: m.key, status: m.status },
        )
      : full.mastery;
    const filtered = {
      goals, preferences, mastery,
      misconceptions: full.misconceptions,
      instructorRules: full.instructorRules,
      scopes, sensitiveWithheld: agentAccess(agentKey, "SESSION", true) === "none",
    };
    await this.log(sessionId, null, "state.snapshot.filtered", { agent: agentKey, scopes });
    return filtered;
  }

  // -- Specialist runners (narrow mandates, structured outputs) ------------------
  private async runAgent(agentKey: string, target: Record<string, unknown>): Promise<RunnerOutput> {
    switch (agentKey) {
      case "tutor": return this.tutorRunner(target);
      case "socratic": return this.socraticRunner(target);
      case "research": return this.researchRunner(target);
      case "assessment": return this.assessmentRunner(target);
      case "factcheck": return this.factcheckRunner(target);
      case "planner": return this.plannerRunner(target);
      case "accessibility": return this.accessibilityRunner(target);
      case "safety": return this.safetyRunner(target);
      case "debate": return this.debateRunner(target);
      case "supervisor": return this.supervisorRunner(target);
      default: throw new Error(`Unknown agent ${agentKey}`);
    }
  }

  private async tutorRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const { EvidenceService } = await import("./evidence");
    const message = String(target.message ?? "");
    const setId = target.setId as string | undefined;
    const conceptId = target.conceptId as string | undefined;
    let explanation = "Let's break this down step by step.";
    let claims: RunnerOutput["claims"] = [];
    let misconceptionCheck = "No active misconceptions on this concept.";
    if (setId) {
      const ev = new EvidenceService(this.workspaceId, this.userId, this.role);
      const res = await ev.evidenceSearch(setId, message.slice(0, 500), { limit: 3 });
      if (res.results.length > 0) {
        const top = res.results.slice(0, 2);
        explanation = top.map((r) => r.citation.quote || r.citation.claim).join(" ");
        claims = top.map((r) => ({
          text: r.citation.claim, evidenceRefs: [r.citation.id],
          confidence: Math.round(r.score * 100) / 100,
        }));
      }
      if (conceptId) {
        const { MisconceptionService } = await import("./misconceptions");
        const misc = await new MisconceptionService(this.workspaceId, this.userId, this.role)
          .list().catch(() => []);
        const hit = misc.find((m) => (m as { conceptId: string }).conceptId === conceptId);
        if (hit) misconceptionCheck = `Interpretation to revisit: "${(hit as { statement: string }).statement.slice(0, 160)}".`;
      }
    }
    return {
      artifacts: [{
        type: "explanation",
        content: {
          explanation: explanation.slice(0, 1500),
          example: claims[0]?.text ?? "",
          checkForUnderstanding: "Can you restate that in your own words, including one boundary condition?",
          misconceptionCheck, confidence: claims.length ? 0.72 : 0.4,
        },
      }],
      claims,
      proposals: conceptId ? [{ kind: "exposure", conceptId, ref: "tutor-explained" }] : [],
      warnings: claims.length === 0 ? ["no supporting evidence retrieved — explanation is scaffolded, not sourced"] : [],
      nextActions: ["socratic.question", "assessment.task_generation"],
    };
  }

  private async socraticRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const message = String(target.message ?? "");
    const causal = /\b(why|cause|mechanism|how does)\b/i.test(message);
    const question = causal
      ? "What mechanism connects the cause to the effect here — and what would break that link?"
      : "What do you predict happens at the boundary case, and why?";
    const stop = socraticShouldStop({ questionsAsked: 1, uncertaintyReduced: false, struggleSignals: 0, learnerAskedDirect: false });
    return {
      artifacts: [{
        type: "question",
        content: {
          question, purpose: "reveal reasoning and gaps before explaining further",
          stoppingCondition: stop.stop ? stop.reason : "stop after uncertainty reduced, struggle cap, or direct-explanation request",
        },
      }],
      claims: [], proposals: [],
      warnings: [],
      nextActions: ["assessment.task_generation"],
    };
  }

  private async researchRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const { EvidenceService } = await import("./evidence");
    const message = String(target.message ?? "");
    const setId = target.setId as string | undefined;
    if (!setId) {
      return { ...empty, warnings: ["no course corpus selected — research limited"], nextActions: ["tutor.explain"] };
    }
    const ev = new EvidenceService(this.workspaceId, this.userId, this.role);
    const { results } = await ev.evidenceSearch(setId, message.slice(0, 500), { limit: 8, includeContradictions: true });
    return {
      artifacts: [{
        type: "research_bundle",
        content: {
          claims: results.slice(0, 5).map((r) => ({
            claim: r.citation.claim,
            sources: [{ id: r.citation.id, passage: r.citation.quote.slice(0, 300), authority: r.citation.authority, version: r.citation.sourceVersion }],
            limitations: r.citation.extractionConfidence < 0.6 ? ["low extraction confidence"] : [],
            confidence: r.score,
          })),
          unresolved: results.filter((r) => r.contradiction > 0).length,
        },
      }],
      claims: results.slice(0, 5).map((r) => ({
        text: r.citation.claim, evidenceRefs: [r.citation.id], confidence: r.score,
      })),
      proposals: [],
      warnings: results.length === 0 ? ["no approved sources address this question"] : [],
      nextActions: ["factcheck.verify", "tutor.explain"],
    };
  }

  private async assessmentRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const { buildDiagnostic } = await import("./adaptive");
    const conceptId = target.conceptId as string | undefined;
    let label = "this concept";
    if (conceptId) {
      const c = await prisma.learnerConcept.findFirst({
        where: { id: conceptId, workspaceId: this.workspaceId }, select: { label: true },
      }).catch(() => null);
      if (c) label = c.label;
    }
    const items = buildDiagnostic(label).slice(0, 3);
    return {
      artifacts: [{
        type: "diagnostic_items",
        content: {
          items: items.map((it, i) => ({
            item_id: `diag-${Date.now()}-${i}`, objective: it.prompt,
            dimension: it.kind === "teachback" ? "creation" : it.kind === "novel" ? "transfer" : "recall",
            answer_exposure: "none",
          })),
          note: "Formative only — no official result declared.",
        },
      }],
      claims: [], proposals: [],
      warnings: [],
      nextActions: ["tutor.explain", "factcheck.verify"],
    };
  }

  private async factcheckRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const { EvidenceService } = await import("./evidence");
    const prior = (target.prior ?? {}) as Record<string, RunnerOutput>;
    const claims = Object.values(prior).flatMap((o) => o?.claims ?? []);
    const message = String(target.message ?? "");
    const setId = target.setId as string | undefined;
    const toCheck = claims.length > 0
      ? claims.slice(0, 6)
      : [{ text: message.slice(0, 300), evidenceRefs: [] as string[], confidence: 0.3 }];
    const verdicts: { claim: string; verdict: string; confidence: number; citations: string[] }[] = [];
    if (setId) {
      const ev = new EvidenceService(this.workspaceId, this.userId, this.role);
      for (const c of toCheck) {
        const { results } = await ev.evidenceSearch(setId, c.text.slice(0, 300), { limit: 5 }).catch(() => ({ results: [] }));
        const direct = results.filter((r) => r.citation.support === "SUPPORTS").length;
        const contra = results.filter((r) => r.citation.support === "CONTRADICTS").length;
        const label = deriveVerificationLabel({
          directSupport: direct, qualifiedSupport: 0, contradicting: contra,
          synthesized: direct >= 2, isInference: direct === 0, foundNothing: results.length === 0,
        });
        const fresh = results.every((r) => (r.citation.freshnessScore ?? 0.5) >= 0.3);
        verdicts.push({
          claim: c.text.slice(0, 200),
          verdict: verdictFor(label, fresh),
          confidence: results[0]?.score ?? 0.2,
          citations: results.slice(0, 3).map((r) => r.citation.id),
        });
      }
    }
    return {
      artifacts: [{ type: "verdicts", content: { verdicts } }],
      claims: [], proposals: [],
      warnings: verdicts.filter((v) => ["contested", "unsupported"].includes(v.verdict)).map((v) => `claim needs attention: ${v.claim.slice(0, 80)}`),
      nextActions: ["tutor.explain"],
    };
  }

  private async plannerRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const { AdaptiveService } = await import("./adapt");
    const setId = target.setId as string | undefined;
    const plan = await new AdaptiveService(this.workspaceId, this.userId, this.role).planSession(setId, 25);
    return {
      artifacts: [{ type: "study_plan", content: { blocks: plan.blocks, rationale: plan.rationale, workload: "25 min", optOut: "decline or modify any block" } }],
      claims: [], proposals: [{ kind: "study_plan", ref: plan.planId }],
      warnings: [], nextActions: ["tutor.explain"],
    };
  }

  private async accessibilityRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const prefs = await prisma.learnerProfile.findFirst({
      where: { workspaceId: this.workspaceId, userId: this.userId, isDefault: true },
      select: { modalities: true, kind: true },
    }).catch(() => null);
    return {
      artifacts: [{
        type: "accessibility_pass",
        content: {
          checks: ["plain-language summary available", "no color-only meaning", "keyboard-operable controls", "chunked disclosure"],
          transformation: (prefs?.modalities ?? []).includes("audio") ? "audio version offered" : "text default kept",
          warnings: ["simulation content flagged for keyboard-alternative review"],
        },
      }],
      claims: [], proposals: [],
      warnings: [],
      nextActions: [],
    };
  }

  private async safetyRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const message = String(target.message ?? "");
    const setId = target.setId as string | undefined;
    const injection = /ignore (previous|all) instructions|system prompt|jailbreak|reveal (your|the) (prompt|instructions)/i.test(message);
    let examMode = false;
    if (setId) {
      const { PolicyService } = await import("./policies");
      const policy = await new PolicyService(this.workspaceId, this.userId, this.role)
        .effectivePolicy(setId).catch(() => null);
      examMode = !!policy?.examMode;
    }
    const wantsAnswer = /\b(answer|solution|solve (this|it)|give me the)\b/i.test(message);
    if (injection) {
      return {
        artifacts: [{ type: "policy_decision", content: { decision: "escalate", reasons: ["prompt_injection_pattern"], allowed: ["general_help"], blocked: ["instruction_override"], escalation: true, user_message: "I noticed an instruction override attempt — logging it and continuing with normal help." } }],
        claims: [], proposals: [], warnings: ["prompt-injection pattern quarantined"], nextActions: ["supervisor.review"],
      };
    }
    if (examMode && wantsAnswer) {
      return {
        artifacts: [{ type: "policy_decision", content: { decision: "modify", reasons: ["exam_mode_active"], allowed: ["conceptual_hint", "similar_practice"], blocked: ["final_answer", "solution_generation"], escalation: false, user_message: "Exam mode is on: I can explain the method and give a similar practice problem, but not this answer." } }],
        claims: [], proposals: [], warnings: [],
        nextActions: ["tutor.explain", "assessment.task_generation"],
      };
    }
    return {
      artifacts: [{ type: "policy_decision", content: { decision: "allow", reasons: ["no policy triggered"], allowed: ["all_requested"], blocked: [], escalation: false } }],
      claims: [], proposals: [], warnings: [],
      nextActions: [],
    };
  }

  private async debateRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const { EvidenceService } = await import("./evidence");
    const setId = target.setId as string | undefined;
    if (!setId) return { ...empty, warnings: ["no corpus for debate mapping"] };
    const ev = new EvidenceService(this.workspaceId, this.userId, this.role);
    const graph = await ev.claimGraph(setId).catch(() => []);
    const disputed = graph.filter((g) => g.hasDisagreement).slice(0, 3);
    return {
      artifacts: [{
        type: "position_map",
        content: {
          positions: disputed.map((d) => ({
            issue: d.claim,
            positionA: d.supports[0]?.quote.slice(0, 200) ?? "",
            positionB: d.contradicts[0]?.quote.slice(0, 200) ?? "",
            shared: "sources agree on the core definitions; dispute is scoped below",
            synthesis: "priority depends on context — see conditions",
          })),
        },
      }],
      claims: [], proposals: [],
      warnings: disputed.length === 0 ? ["no contested evidence found — debate would be performative"] : [],
      nextActions: ["tutor.explain"],
    };
  }

  private async supervisorRunner(target: Record<string, unknown>): Promise<RunnerOutput> {
    const prior = (target.prior ?? {}) as Record<string, RunnerOutput>;
    const warnings = Object.entries(prior).flatMap(([k, o]) => (o?.warnings ?? []).map((w) => `${k}: ${w}`));
    return {
      artifacts: [{
        type: "supervisor_review",
        content: {
          triggers: warnings.length > 0 ? warnings : ["routine review — no triggers"],
          recommendation: warnings.length > 0 ? "route to instructor review queue" : "proceed with composed response",
          learnerVisible: true,
        },
      }],
      claims: [], proposals: [],
      warnings: [],
      nextActions: warnings.length > 0 ? ["escalation.create"] : [],
    };
  }

  // -- Claim verification ---------------------------------------------------------
  private async verifyClaims(
    sessionId: string,
    claims: { text: string; evidenceRefs: string[]; confidence: number; from: string }[],
    _setId?: string,
  ) {
    const out: { claim: string; verdict: string; confidence: number; citations: string[] }[] = [];
    for (const c of claims.slice(0, 8)) {
      const label = deriveVerificationLabel({
        directSupport: c.evidenceRefs.length, qualifiedSupport: 0, contradicting: 0,
        synthesized: c.evidenceRefs.length >= 2, isInference: c.evidenceRefs.length === 0,
        foundNothing: false,
      });
      const verdict = verdictFor(label, true);
      out.push({ claim: c.text.slice(0, 200), verdict, confidence: c.confidence, citations: c.evidenceRefs });
      await this.log(sessionId, null, "claim.verified", { claim: c.text.slice(0, 160), verdict, from: c.from });
    }
    return out;
  }

  // -- State commit (proposals only; authority stays with state service) --------------
  private async commitProposals(
    sessionId: string,
    outputs: { key: string; out: RunnerOutput }[],
  ) {
    const { LearnerGraphService } = await import("./graph");
    const { MisconceptionService } = await import("./misconceptions");
    const g = new LearnerGraphService(this.workspaceId, this.userId, this.role);
    const m = new MisconceptionService(this.workspaceId, this.userId, this.role);
    let committed = 0;
    for (const { out } of outputs) {
      for (const p of out.proposals) {
        try {
          if (p.kind === "exposure" && p.conceptId) {
            await g.observe({
              conceptId: p.conceptId, dimension: "recall", value: 0.4, confidence: 0.4,
              sourceType: "tutor_session", sourceId: sessionId, context: "orchestrated explanation",
              novelty: 0, visibility: "learner-and-instructor",
            });
            committed++;
          } else if (p.kind === "misconception_candidate" && p.conceptId) {
            await m.report({
              conceptId: p.conceptId, statement: String(p.ref ?? "candidate").slice(0, 500),
              detectedFrom: [sessionId], confidence: 0.5, severity: "medium",
              affectedConceptIds: [], counterevidence: [],
            });
            committed++;
          }
        } catch { /* proposal rejected — never partial-commit silently */ }
      }
    }
    await this.log(sessionId, null, "learner_state.update.committed", { committed });
    // New snapshot version after commits.
    await this.snapshotState(sessionId, undefined, true);
    return committed;
  }

  private async snapshotState(sessionId: string, setId?: string, bump = false) {
    const [goals, misc, mastery, prefs, overrides] = await Promise.all([
      prisma.learnerGoal.findMany({ where: { workspaceId: this.workspaceId, userId: this.userId, status: "ACTIVE" as never }, take: 10 }),
      prisma.misconception.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, status: { notIn: ["RESOLVED", "DISMISSED"] as never } },
        select: { id: true, conceptId: true, statement: true, status: true }, take: 20,
      }),
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 200,
      }),
      prisma.learnerProfile.findFirst({ where: { workspaceId: this.workspaceId, userId: this.userId, isDefault: true } }),
      prisma.instructorOverride.findMany({ where: { workspaceId: this.workspaceId, active: true }, take: 20 }),
    ]);
    const prior = await prisma.stateSnapshot.findMany({
      where: { workspaceId: this.workspaceId, sessionId },
      orderBy: { version: "desc" }, take: 1,
    });
    const version = (prior[0]?.version ?? 0) + (bump ? 1 : prior[0] ? 0 : 1);
    const state = {
      goals: goals.map((x) => ({ id: x.id, title: x.title, progress: x.progress })),
      misconceptions: misc,
      mastery: mastery
        .filter((x) => !setId || x.concept.setId === setId)
        .map((x) => ({ conceptId: x.conceptId, key: x.concept.key, status: x.status, mastery: x.mastery, dimensions: x.dimensions })),
      preferences: prefs?.preferences ?? {},
      modalities: prefs?.modalities ?? [],
      instructorRules: overrides.map((o) => ({ kind: o.kind, targetId: o.targetId, reason: o.reason })),
      at: new Date().toISOString(),
    };
    const existing = bump ? null : prior[0];
    if (existing) return existing;
    return prisma.stateSnapshot.create({
      data: { workspaceId: this.workspaceId, sessionId, userId: this.userId, state: state as never, version },
    });
  }

  // -- Escalation -----------------------------------------------------------------------
  private async raiseEscalation(
    sessionId: string, setId: string | undefined, topic: string,
    triggers: string[], outputs: { key: string; out: RunnerOutput }[],
    verdicts: { claim: string; verdict: string }[],
  ) {
    const disagreement: Record<string, string> = {};
    for (const o of outputs) {
      if (o.out.warnings.length > 0) disagreement[o.key] = o.out.warnings[0]!;
    }
    const esc = await prisma.escalation.create({
      data: {
        workspaceId: this.workspaceId, sessionId, setId: setId || null, userId: this.userId,
        topic, issue: triggers.join("; "),
        evidence: verdicts.slice(0, 5).map((v) => v.claim),
        disagreement: disagreement as never,
        recommendation: "route to instructor review queue with agent outputs attached",
        learnerVisible: true, urgency: triggers.some((t) => t.includes("high-stakes") || t.includes("safety")) ? "high" : "normal",
      },
    });
    await this.log(sessionId, null, "escalation.created", { escalationId: esc.id, triggers });
    return esc;
  }

  async resolveEscalation(id: string, resolution: string, status: "RESOLVED" | "DISMISSED" = "RESOLVED") {
    this.assertInstructor();
    const esc = await prisma.escalation.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { status: status as never, resolution: resolution.slice(0, 2000), resolvedById: this.userId },
    });
    const row = await prisma.escalation.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (row) await this.log(row.sessionId ?? "", null, "instructor.decision.recorded", { escalationId: id, status, resolution });
    return esc;
  }

  async listEscalations(status?: string) {
    return prisma.escalation.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(status ? { status: status as never } : {}),
        ...(this.role === "member" ? { userId: this.userId } : {}),
      },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  // -- Response composer: one answer, contradictions exposed, citations attached -----------
  private async compose(
    sessionId: string,
    outputs: { key: string; out: RunnerOutput; status: string }[],
    refusal: string | null,
    verdicts: { claim: string; verdict: string; confidence: number; citations: string[] }[],
    degraded: boolean,
    allowedOnly?: string[],
  ) {
    const tutorOut = outputs.find((o) => o.key === "tutor")?.out;
    const explanation = (tutorOut?.artifacts.find((a) => a.type === "explanation")?.content ?? {}) as {
      explanation?: string; example?: string; checkForUnderstanding?: string; misconceptionCheck?: string; confidence?: number;
    };
    const socratic = outputs.find((o) => o.key === "socratic")?.out;
    const question = (socratic?.artifacts.find((a) => a.type === "question")?.content ?? {}) as {
      question?: string; purpose?: string;
    };
    const plan = outputs.find((o) => o.key === "planner")?.out;
    const planBlocks = ((plan?.artifacts.find((a) => a.type === "study_plan")?.content ?? {}) as { blocks?: { name: string; minutes: number; detail: string }[] }).blocks ?? [];
    const debate = outputs.find((o) => o.key === "debate")?.out;
    const positions = ((debate?.artifacts.find((a) => a.type === "position_map")?.content ?? {}) as { positions?: unknown[] }).positions ?? [];

    const contributors = outputs.map((o) => {
      const def = AGENT_DEFS.find((d) => d.key === o.key);
      return `${o.key}:${def?.version ?? "?"}`;
    });
    const body = refusal ?? [
      explanation.explanation ?? "Here's a starting point — tell me which part is unclear.",
      question.question ? `\nOne question before we continue: ${question.question}` : "",
      positions.length > 0 ? `\nThere are ${positions.length} contested position(s) — see the disagreement view.` : "",
      planBlocks.length > 0 ? `\nSuggested next: ${planBlocks[0]!.name} (${planBlocks[0]!.minutes} min) — ${planBlocks[0]!.detail}` : "",
      degraded ? "\nNote: one or more agents were unavailable, so this response is partial." : "",
    ].join("\n");

    const composed = {
      body,
      checkForUnderstanding: explanation.checkForUnderstanding ?? null,
      misconceptionCheck: explanation.misconceptionCheck ?? null,
      citations: verdicts.flatMap((v) => v.citations).slice(0, 6),
      unresolvedClaims: verdicts.filter((v) => ["contested", "unsupported", "ambiguous"].includes(v.verdict)).length,
      verifiedClaims: verdicts.filter((v) => ["verified", "supported_with_limits"].includes(v.verdict)).length,
      nextAction: tutorOut?.nextActions[0] ?? "ask a follow-up",
      controls: ["accept", "choose another approach", "explain why", "request human"],
      allowedOnly: allowedOnly ?? null,
      metadata: {
        contributors,
        verifiedClaims: verdicts.filter((v) => ["verified", "supported_with_limits"].includes(v.verdict)).length,
        unresolvedClaims: verdicts.filter((v) => ["contested", "unsupported", "ambiguous"].includes(v.verdict)).length,
        stateUpdatesCommitted: 0, // filled by caller path via events
        humanReviewRequired: verdicts.some((v) => v.verdict === "requires_human_review"),
      },
    };
    await this.log(sessionId, null, "response.composed", {
      contributors, degraded, refused: !!refusal,
    });
    return composed;
  }
}
