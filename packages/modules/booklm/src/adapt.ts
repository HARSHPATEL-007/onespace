import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  nextDifficulty, dimensionToMove, classifyError, REMEDIATION,
  sequenceModality, planInterleave, estimateGain, buildDiagnostic,
  scoreElaboration, assembleSession, remediationPath, repairPathOptions,
  LADDER, type ErrorType,
} from "./adaptive";

export const loopPlanSchema = z.object({
  conceptId: z.string().min(1),
  setId: z.string().optional(),
  minutes: z.number().int().min(5).max(180).default(25),
});

export const loopRespondSchema = z.object({
  loopId: z.string().min(1),
  correct: z.boolean(),
  answer: z.string().max(2000).default(""),
  reasoning: z.string().max(2000).default(""),
  responseTimeMs: z.number().int().min(0).default(0),
  hintsUsed: z.number().int().min(0).default(0),
  confidence: z.number().min(0).max(1).default(0.5),
  novelty: z.number().min(0).max(1).default(0),
  overridden: z.boolean().default(false),
  overrideReason: z.string().max(500).default(""),
});

export const policySchemaAdaptive = z.object({
  setId: z.string().min(1),
  difficultyMin: z.number().int().min(0).max(9).default(0),
  difficultyMax: z.number().int().min(0).max(9).default(9),
  prereqThreshold: z.number().min(0).max(1).default(0.4),
  hintLimit: z.number().int().min(0).max(20).default(3),
  transferRequired: z.boolean().default(true),
  minIntervalHours: z.number().int().min(1).max(168).default(12),
  escalationThreshold: z.number().int().min(1).max(20).default(3),
  externalAllowed: z.boolean().default(true),
  highStakesReview: z.boolean().default(false),
  targetBand: z.number().min(0.3).max(0.95).default(0.75),
});

export const overrideSchema = z.object({
  setId: z.string().optional(),
  targetType: z.string().max(40).default("concept"),
  targetId: z.string().min(1),
  kind: z.enum(["SET_LEVEL", "LOCK_DIFFICULTY", "ASSIGN_REPAIR_PATH", "EXEMPT_CONCEPT", "FORCE_MODALITY", "CUSTOM_MISCONCEPTION_RULE", "MARK_VERIFIED", "PAUSE_PERSONALIZATION", "RESTORE_STATE"]),
  payload: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().trim().min(1).max(1000),
  scope: z.enum(["CONCEPT", "COURSE", "PROFILE", "GLOBAL"]).default("CONCEPT"),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const DEFAULT_WEIGHTS = { eta: 0.4, mu: 0.3, nu: 0.2 };

export class AdaptiveService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  // -- State vector (estimates with uncertainty, never verdicts) ---------------
  async stateVector(conceptId: string) {
    const [mastery, attempts, prefs, loops] = await Promise.all([
      prisma.learnerMastery.findUnique({
        where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
      }),
      prisma.quizAttempt.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { responses: { select: { correct: true, confidence: true, responseTimeMs: true } } },
        orderBy: { startedAt: "desc" }, take: 5,
      }),
      prisma.learnerProfile.findFirst({
        where: { workspaceId: this.workspaceId, userId: this.userId, isDefault: true },
      }),
      // Hint channel: recent loop responses carry hintsUsed per concept.
      prisma.adaptiveLoop.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, conceptId },
        select: { response: true },
        orderBy: { createdAt: "desc" }, take: 10,
      }),
    ]);
    const dims = ((mastery?.dimensions ?? {}) as Record<string, number>);
    const resp = attempts.flatMap((a) => a.responses);
    const recentAccuracy = resp.length ? resp.filter((r) => r.correct).length / resp.length : 0.5;
    const times = resp.map((r) => r.responseTimeMs).filter((t) => t > 0).sort((a, b) => a - b);
    const medianTime = times.length ? times[Math.floor(times.length / 2)]! : 0;
    const avgTime = resp.length ? resp.reduce((s, r) => s + r.responseTimeMs, 0) / resp.length : 0;
    const conf = resp.length ? resp.reduce((s, r) => s + r.confidence, 0) / resp.length : 0.5;
    const calibration = Math.abs(conf - recentAccuracy);
    // Hint dependence from instrumented loop responses (null when unmeasured).
    const hintUses = loops
      .map((l) => (l.response ?? {}) as { hintsUsed?: unknown })
      .filter((r) => typeof r.hintsUsed === "number")
      .map((r) => r.hintsUsed as number);
    const hintDependence = hintUses.length > 0
      ? Math.round((hintUses.filter((h) => h > 0).length / hintUses.length) * 100) / 100
      : null;
    const preferences = ((prefs?.preferences ?? {}) as Record<string, unknown>);
    return {
      conceptId,
      knowledge: {
        recall: dims.recall ?? 0, conceptual: dims.conceptual ?? 0,
        procedural: dims.procedural ?? 0, application: dims.application ?? 0,
        transfer: dims.transfer ?? 0, metacognition: dims.metacognition ?? 0,
      },
      behavior: {
        recentAccuracy: Math.round(recentAccuracy * 100) / 100,
        responseTimeMedianMs: medianTime, responseTimeAvgMs: Math.round(avgTime),
        hintDependence,
        confidenceCalibrationError: Math.round(calibration * 100) / 100,
        evidenceResponses: resp.length,
        hintEvidenceResponses: hintUses.length,
      },
      context: {
        availableMinutes: (preferences.timeCapMin as number | undefined) ?? (prefs?.timeCapMin ?? 25),
        preferredModalities: prefs?.modalities ?? [],
        controls: preferences,
      },
      status: mastery?.status ?? "UNKNOWN",
      uncertainty: Math.round((1 - (mastery?.confidence ?? 0.5)) * 100) / 100,
      note: "Estimates with uncertainty — not judgments about ability.",
    };
  }

  // -- Diagnosis (observable evidence first) -----------------------------------
  async diagnose(conceptId: string, last?: { answer: string; reasoning: string; correct: boolean }) {
    const [concept, activeMisc, mastery] = await Promise.all([
      prisma.learnerConcept.findFirst({ where: { id: conceptId, workspaceId: this.workspaceId } }),
      prisma.misconception.findMany({
        where: {
          workspaceId: this.workspaceId, userId: this.userId, conceptId,
          status: { notIn: ["RESOLVED", "DISMISSED"] as never },
        },
        take: 5,
      }),
      prisma.learnerMastery.findUnique({
        where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
      }),
    ]);
    if (!concept) throw new Error("Concept not found");
    const policy = await this.effectivePolicy(undefined);
    const hardDeps = await prisma.conceptDependency.findMany({
      where: { workspaceId: this.workspaceId, toId: conceptId, kind: "HARD" as never },
      include: { from: { select: { id: true, label: true, key: true } } },
    });
    const blocking: { id: string; label: string; mastery: number }[] = [];
    for (const d of hardDeps) {
      const pm = await prisma.learnerMastery.findUnique({
        where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId: d.fromId, userId: this.userId } },
      });
      const v = pm?.mastery ?? 0;
      if (v < policy.prereqThreshold) blocking.push({ id: d.fromId, label: d.from.label, mastery: v });
    }
    let errorType: ErrorType | null = null;
    if (last && !last.correct) errorType = classifyError(last.answer, last.reasoning, last.correct);
    const dims = ((mastery?.dimensions ?? {}) as Record<string, number>);
    const familiar = (dims.application ?? 0) >= 0.6;
    const novelWeak = (dims.transfer ?? 0) < 0.5;
    return {
      concept: { id: concept.id, label: concept.label, key: concept.key },
      status: mastery?.status ?? "UNKNOWN",
      errorType,
      remediation: errorType ? REMEDIATION[errorType] : null,
      misconceptions: activeMisc.map((m) => ({ id: m.id, statement: m.statement, status: m.status })),
      blockingPrerequisites: blocking,
      transferGap: familiar && novelWeak,
      calibrationIssue: null as string | null,
    };
  }

  // -- Intervention selection ---------------------------------------------------
  async planLoop(input: z.infer<typeof loopPlanSchema>) {
    const [state, diagnosis, difficulty, overrides, policy] = await Promise.all([
      this.stateVector(input.conceptId),
      this.diagnose(input.conceptId),
      this.difficultyState(input.conceptId),
      this.activeOverrides(input.conceptId),
      this.effectivePolicy(input.setId),
    ]);
    if (overrides.some((o) => o.kind === "PAUSE_PERSONALIZATION")) {
      throw new Error("Personalization paused by instructor for this target");
    }
    const lock = overrides.find((o) => o.kind === "LOCK_DIFFICULTY");
    const forcedMod = overrides.find((o) => o.kind === "FORCE_MODALITY");
    const repair = overrides.find((o) => o.kind === "ASSIGN_REPAIR_PATH");

    let strategy: string;
    const alternatives: string[] = [];
    let contentRef = "";
    if (diagnosis.blockingPrerequisites.length > 0 && !repair) {
      strategy = `prerequisite repair: ${diagnosis.blockingPrerequisites[0]!.label}`;
      alternatives.push("just-in-time repair inside the target lesson", "foundational rebuild of the cluster");
      contentRef = `repair:${diagnosis.blockingPrerequisites[0]!.id}`;
    } else if (repair) {
      strategy = `instructor-assigned repair path`;
      contentRef = `repair:${(repair.payload as { path?: string })?.path ?? repair.targetId}`;
      alternatives.push("learner-chosen repair mode");
    } else if (diagnosis.errorType) {
      strategy = diagnosis.remediation!.first;
      alternatives.push("repeat routine practice", "review the concept", "try a worked example");
      contentRef = `remediation:${diagnosis.errorType}`;
    } else if (diagnosis.transferGap) {
      strategy = "novel case for transfer";
      alternatives.push("repeat routine practice", "worked example");
      contentRef = "transfer:novel-case";
    } else {
      strategy = "guided practice at current level";
      alternatives.push("worked example", "novel case");
      contentRef = "practice:guided";
    }

    const triedModalities: string[] = [];
    const modality = (forcedMod?.payload as { modality?: string })?.modality
      ?? sequenceModality(diagnosis.errorType === "causal" ? "misconception" : "application", triedModalities);

    const loop = await prisma.adaptiveLoop.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId || null, conceptId: input.conceptId,
        userId: this.userId, stateBefore: state as never,
        evidence: [
          `status:${diagnosis.status}`,
          ...(diagnosis.errorType ? [`error:${diagnosis.errorType}`] : []),
          ...diagnosis.blockingPrerequisites.map((b) => `prereq-gap:${b.id}`),
          ...(diagnosis.misconceptions.map((m) => `misconception:${m.id}`)),
        ],
        strategy, alternatives, contentRef,
        difficulty: { level: difficulty.level, dims: difficulty.dims } as never,
        modelVersion: "adaptive-1.0", policyVersion: `adaptive-policy-v${policy.version}`,
        curriculumVersion: input.setId ?? "",
      },
    });
    // Explainable decision record: issue, evidence, scored strategy, alternatives.
    const { DecisionService } = await import("./decisions");
    const decisions = new DecisionService(this.workspaceId, this.userId, this.role);
    const issueType = diagnosis.blockingPrerequisites.length > 0 ? "missing_prerequisite"
      : diagnosis.errorType === "causal" ? "misconception"
      : diagnosis.errorType === "calibration" ? "confidence_miscalibration"
      : diagnosis.errorType === "vocabulary" ? "definition_confusion"
      : diagnosis.transferGap ? "transfer_gap"
      : diagnosis.errorType ? "execution_error" : "insufficient_evidence";
    const decision = await decisions.create({
      setId: input.setId, conceptId: input.conceptId, trigger: "adaptive_loop_planned",
      issueType,
      issueDescription: this.explainDecision(diagnosis, strategy, alternatives).slice(0, 2).join(" "),
      severity: diagnosis.misconceptions.length > 0 ? "high" : "moderate",
      evidence: [
        ...diagnosis.blockingPrerequisites.map((b) => ({ type: "prerequisite_mastery", ref: b.id, result: `${Math.round(b.mastery * 100)}%`, context: "course", at: new Date().toISOString() })),
        ...(diagnosis.errorType ? [{ type: "error_pattern", ref: diagnosis.errorType, result: diagnosis.remediation?.first ?? "", context: "recent", at: new Date().toISOString() }] : []),
        ...diagnosis.misconceptions.slice(0, 3).map((m) => ({ type: "misconception_flag", ref: m.id, result: m.status, context: "course", at: new Date().toISOString() })),
      ],
      chosenMode: "PRACTICE", chosenAction: `${strategy} (${modality}; level ${difficulty.level})`,
      alternatives: alternatives.map((a) => ({ strategy: a, reasonNotSelected: "", risks: [] as string[] })),
      expectedTarget: `measurable progress on ${input.conceptId}`,
      successMeasure: "one independent response at the new difficulty without added hints",
      confIssue: 0.72, confStrategy: 0.66, confOutcome: 0.6,
      agents: ["adaptive:1.0"], stateSnapshot: "", policySnapshot: `adaptive-policy-v${policy.version}`,
    }).catch(() => null);
    const card = decision ? await decisions.card(decision.id).catch(() => null) : null;
    const conceptLabel = diagnosis.concept.label;
    return {
      loopId: loop.id,
      decision: strategy,
      modality,
      difficultyLevel: lock ? difficulty.level : difficulty.level,
      difficultyLocked: !!lock,
      ladder: LADDER[difficulty.level] ?? "practice",
      // Misconception-first remediation path + costed repair options ride
      // with the plan so the learner sees stages and speed/depth tradeoffs.
      remediation: diagnosis.errorType ? remediationPath(diagnosis.errorType, conceptLabel) : null,
      repairOptions: diagnosis.blockingPrerequisites.length > 0
        ? repairPathOptions(diagnosis.blockingPrerequisites)
        : null,
      evidence: loop.evidence,
      alternatives,
      explanation: this.explainDecision(diagnosis, strategy, alternatives),
      decisionId: decision?.id ?? null,
      decisionCard: card,
    };
  }

  private explainDecision(
    diagnosis: Awaited<ReturnType<AdaptiveService["diagnose"]>>,
    strategy: string, alternatives: string[],
  ): string[] {
    const lines = [`Decision: ${strategy}.`];
    if (diagnosis.blockingPrerequisites.length > 0) {
      lines.push(`Evidence: ${diagnosis.blockingPrerequisites.map((b) => `${b.label} at ${Math.round(b.mastery * 100)}%`).join("; ")}.`);
    }
    if (diagnosis.errorType) lines.push(`Error pattern: ${diagnosis.errorType} → ${diagnosis.remediation!.first}.`);
    if (diagnosis.transferGap) lines.push(`Routine work is reliable but novel-context transfer is developing.`);
    if (diagnosis.misconceptions.length > 0) lines.push(`${diagnosis.misconceptions.length} interpretation(s) to revisit first.`);
    lines.push(`Alternatives considered: ${alternatives.join("; ") || "none"}. You can override this decision.`);
    return lines;
  }

  /** Measure the response: gain estimate, observation, difficulty update, schedule. */
  async respondLoop(input: z.infer<typeof loopRespondSchema>) {
    const loop = await prisma.adaptiveLoop.findFirst({
      where: { id: input.loopId, workspaceId: this.workspaceId, userId: this.userId },
    });
    if (!loop) throw new Error("Loop not found");
    const before = (loop.stateBefore ?? {}) as { knowledge?: Record<string, number> };
    const beforeVal = before.knowledge?.recall ?? 0.5;

    // Gain: correct fast response ≈ +0.08, scaled by hints/confidence honesty.
    const after = beforeVal + (input.correct ? 0.08 * (1 - input.hintsUsed * 0.15) : -0.05);
    const { gain, confidence } = estimateGain(beforeVal, Math.max(0, Math.min(1, after)), 3);

    const conceptId = loop.conceptId ?? "";
    if (conceptId) {
      const { LearnerGraphService } = await import("./graph");
      const g = new LearnerGraphService(this.workspaceId, this.userId, this.role);
      await g.observe({
        conceptId, dimension: "recall", value: input.correct ? 0.75 : 0.3,
        confidence: input.confidence, sourceType: "adaptive_loop", sourceId: loop.id,
        context: input.answer.slice(0, 200), novelty: input.novelty,
        visibility: "learner-and-instructor",
      }).catch(() => undefined);
      // Bottleneck signals for dimension tracking: novelty-miss → transfer
      // distance; hint use → scaffolding; very slow response → time pressure.
      // The 60s slow bar is a documented heuristic, not a norm — it only
      // records which dimension moved, never judges pace as ability.
      await this.updateDifficulty(
        conceptId, input.correct ? 1 : 0, input.hintsUsed > 0 ? 0.6 : 0, input.novelty,
        {
          slowResponse: input.responseTimeMs > 60000,
          highHintUse: input.hintsUsed > 2,
          novelFailure: input.novelty >= 0.5 && !input.correct,
        },
      ).catch(() => undefined);
      // Misconception-first: low accuracy + high confidence → candidate.
      if (!input.correct && input.confidence >= 0.7 && input.responseTimeMs < 8000) {
        const { MisconceptionService } = await import("./misconceptions");
        const m = new MisconceptionService(this.workspaceId, this.userId, this.role);
        await m.report({
          conceptId, statement: input.answer.slice(0, 300) || "incorrect high-confidence response",
          detectedFrom: [loop.id], confidence: 0.6, severity: "medium",
          affectedConceptIds: [], counterevidence: [],
        }).catch(() => undefined);
      }
    }

    const updated = await prisma.adaptiveLoop.update({
      where: { id: loop.id },
      data: {
        response: {
          correct: input.correct, responseTimeMs: input.responseTimeMs,
          hintsUsed: input.hintsUsed, confidence: input.confidence, novelty: input.novelty,
        } as never,
        learningGain: gain, gainConfidence: confidence,
        overriddenById: input.overridden ? this.userId : null,
        overrideReason: input.overrideReason,
      },
    });
    // Self-monitoring: mark linked decision measured + append immutable review.
    try {
      const { DecisionService } = await import("./decisions");
      const decisions = new DecisionService(this.workspaceId, this.userId, this.role);
      const linked = await prisma.decisionRecord.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, conceptId: conceptId || undefined, trigger: "adaptive_loop_planned" },
        orderBy: { createdAt: "desc" }, take: 1,
      });
      const d = linked[0];
      if (d) {
        await decisions.mark(d.id, "DELIVERED").catch(() => null);
        await decisions.mark(d.id, "MEASURED").catch(() => null);
        const effectiveness = Math.max(0, Math.min(1, 0.5 + gain * 2.5));
        await decisions.review(d.id, {
          predictedOutcome: d.expectedTarget,
          observedOutcome: `learning gain ${gain} (confidence ${confidence})`,
          predictionError: gain < 0 ? "outcome declined — hypothesis needs revision, not learner blame" : "",
          effectiveness, nextAction: gain < 0 ? "reassess issue; do not repeat automatically" : "continue plan",
          confIssue: undefined, confStrategy: undefined,
        }).catch(() => null);
      }
    } catch { /* self-monitoring best-effort */ }
    return {
      loopId: updated.id, gain, gainConfidence: confidence,
      scheduled: conceptId ? "review scheduled via spaced-repetition state" : "no concept — no schedule",
    };
  }

  // -- Difficulty state ---------------------------------------------------------
  async difficultyState(conceptId: string) {
    const existing = await prisma.difficultyState.findUnique({
      where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
    });
    const base = existing ?? await prisma.difficultyState.create({
      data: { workspaceId: this.workspaceId, conceptId, userId: this.userId },
    });
    // Instructor locks/levels apply on read (reason, author, expiry on the override row).
    const overrides = await this.activeOverrides(conceptId);
    const lock = overrides.find((o) => o.kind === "LOCK_DIFFICULTY");
    const setLevel = overrides.find((o) => o.kind === "SET_LEVEL");
    const payload = (setLevel?.payload ?? {}) as { level?: number };
    if ((lock || (setLevel && typeof payload.level === "number")) && (!base.locked || (payload.level !== undefined && base.level !== payload.level))) {
      return prisma.difficultyState.update({
        where: { id: base.id },
        data: {
          locked: !!lock || base.locked,
          ...(payload.level !== undefined ? { level: Math.max(0, Math.min(9, Math.round(payload.level))) } : {}),
        },
      });
    }
    return base;
  }

  async updateDifficulty(
    conceptId: string, success: number, hintDependence: number, transfer: number,
    bottleneck?: { slowResponse?: boolean; highHintUse?: boolean; novelFailure?: boolean; ambiguityFailure?: boolean; timePressureFailure?: boolean; modalityFailure?: boolean },
  ) {
    const st = await this.difficultyState(conceptId);
    if (st.locked) return st;
    const level = nextDifficulty(st.level, success, st.targetBand, hintDependence, transfer, st.eta, st.mu, st.nu);
    // Track which single dimension moved and why — difficulty is decomposed,
    // never one opaque number sliding silently.
    const dims = ((st.dims ?? {}) as Record<string, unknown>);
    if (bottleneck && (bottleneck.slowResponse || bottleneck.highHintUse || bottleneck.novelFailure || bottleneck.ambiguityFailure || bottleneck.timePressureFailure || bottleneck.modalityFailure)) {
      const dim = dimensionToMove({
        slowResponse: !!bottleneck.slowResponse, highHintUse: !!bottleneck.highHintUse,
        novelFailure: !!bottleneck.novelFailure, ambiguityFailure: !!bottleneck.ambiguityFailure,
        timePressureFailure: !!bottleneck.timePressureFailure, modalityFailure: !!bottleneck.modalityFailure,
      });
      dims.movedDim = dim;
      dims.movedAt = new Date().toISOString();
      dims.levelAtMove = Math.round(level);
    }
    return prisma.difficultyState.update({
      where: { id: st.id },
      data: { level: Math.round(level), dims: dims as never },
    });
  }

  /** "Reset my level": clear the adaptive estimate so diagnosis restarts clean. */
  async resetDifficulty(conceptId: string) {
    await prisma.difficultyState.deleteMany({
      where: { workspaceId: this.workspaceId, conceptId, userId: this.userId },
    });
    return { conceptId, reset: true as const, note: "Adaptive estimate cleared — next diagnostic re-establishes the level." };
  }

  async calibrateDiagnostic(conceptId: string) {
    const concept = await prisma.learnerConcept.findFirst({
      where: { id: conceptId, workspaceId: this.workspaceId }, select: { label: true },
    });
    return buildDiagnostic(concept?.label ?? "this concept");
  }

  // -- Retrieval scheduler (item-level stability/retrievability) -----------------
  async ensureRetrievalItems(conceptId: string, setId: string | undefined, items: { key: string; format?: string }[]) {
    for (const it of items.slice(0, 50)) {
      await prisma.retrievalItem.upsert({
        where: { workspaceId_conceptId_userId_itemKey: { workspaceId: this.workspaceId, conceptId, userId: this.userId, itemKey: it.key } },
        update: {},
        create: {
          workspaceId: this.workspaceId, setId: setId || null, conceptId, userId: this.userId,
          itemKey: it.key, format: it.format ?? "recall",
        },
      });
    }
  }

  async retrievalDue(limit = 10) {
    return prisma.retrievalItem.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, nextDue: { lte: new Date() } },
      orderBy: { nextDue: "asc" }, take: Math.min(limit, 30),
    });
  }

  async answerRetrieval(itemKey: string, conceptId: string, correct: boolean, latencyMs: number, novelty = 0) {
    const item = await prisma.retrievalItem.findUnique({
      where: { workspaceId_conceptId_userId_itemKey: { workspaceId: this.workspaceId, conceptId, userId: this.userId, itemKey } },
    });
    if (!item) throw new Error("Retrieval item not found");
    const stability = correct
      ? Math.min(180, item.stabilityDays * (1.5 + item.retrievability))
      : 1;
    const retrievability = correct
      ? Math.min(0.95, item.retrievability + 0.1)
      : Math.max(0.1, item.retrievability - 0.2);
    const difficulty = Math.max(0.05, Math.min(0.95,
      item.difficulty + (correct ? -0.03 : 0.05) + (latencyMs > 15000 ? 0.03 : 0)));
    const nextDue = new Date(Date.now() + stability * 86_400_000);
    const updated = await prisma.retrievalItem.update({
      where: { id: item.id },
      data: {
        stabilityDays: Math.round(stability * 10) / 10, retrievability, difficulty,
        lastAttempt: new Date(), nextDue,
        contextCount: { increment: 1 },
        transferCount: novelty >= 0.5 ? { increment: 1 } : undefined,
        successes: correct ? { increment: 1 } : undefined,
        attempts: { increment: 1 },
      },
    });
    return updated;
  }

  // -- Session planner ------------------------------------------------------------
  async planSession(setId: string | undefined, minutes: number) {
    const { LearnerGraphService: GS } = await import("./graph");
    const graph = new GS(this.workspaceId, this.userId, this.role);
    const [due, changed] = await Promise.all([
      this.retrievalDue(6),
      graph.whatChanged(14).catch((): { label: string; direction: string }[] => []),
    ]);
    const weak = changed.filter((c) => c.direction === "declining").slice(0, 2);
    const target = weak[0]?.label ?? "current focus concept";
    const blocks = assembleSession(minutes, {
      warmup: due.slice(0, 3).map((d) => d.itemKey),
      lesson: `Visual explanation of ${target}`,
      lessonWhy: weak.length > 0 ? "recent evidence shows decline here" : "next concept on the recommended path",
      practice: "one worked example, then one independent example",
      transfer: `select an approach for a new ${target} problem`,
      reflection: `explain why the chosen approach fits ${target}`,
    });
    const rationale = [
      `Procedural evidence: ${due.length} retrieval item(s) due.`,
      weak.length > 0 ? `Declining: ${weak.map((w) => w.label).join(", ")}.` : "No declining concepts in the last 14 days.",
      "Retrieval scheduled before re-explanation.",
    ];
    const plan = await prisma.sessionPlan.create({
      data: {
        workspaceId: this.workspaceId, setId: setId || null, userId: this.userId,
        plan: blocks as never, rationale,
      },
    });
    return { planId: plan.id, blocks, rationale };
  }

  async acceptSessionPlan(planId: string, accepted: boolean, modification = "") {
    return prisma.sessionPlan.updateMany({
      where: { id: planId, workspaceId: this.workspaceId, userId: this.userId },
      data: { accepted, modification: modification.slice(0, 1000) },
    });
  }

  // -- Interleaving -----------------------------------------------------------------
  async interleaveSet(setId: string, level: "low" | "moderate" | "high" = "moderate") {
    const [mastery, concepts] = await Promise.all([
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 300,
      }),
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 100 }),
    ]);
    const ids = new Set(concepts.map((c) => c.id));
    const weak = mastery.filter((m) => ids.has(m.conceptId) && m.mastery < 0.7).slice(0, 2);
    const confusables = await prisma.conceptDependency.findMany({
      where: { workspaceId: this.workspaceId, relation: "COMMONLY_CONFUSED_WITH" as never },
      include: {
        from: { select: { key: true, label: true } },
        to: { select: { key: true, label: true } },
      },
      take: 20,
    });
    const old = mastery.filter((m) => ["DURABLE", "INDEPENDENT"].includes(m.status)).slice(0, 2);
    const novel = mastery.filter((m) => ids.has(m.conceptId) && m.status === "RELIABLE").slice(0, 1);
    return planInterleave({
      target: weak.map((m) => ({ conceptKey: m.concept.key, label: m.concept.label })),
      confusables: confusables.slice(0, 2).map((d) => ({ conceptKey: d.to.key, label: d.to.label })),
      oldMaterial: old.map((m) => ({ conceptKey: m.concept.key, label: m.concept.label })),
      novel: novel.map((m) => ({ conceptKey: m.concept.key, label: m.concept.label })),
      level,
    });
  }

  // -- Elaboration + teach-back -------------------------------------------------------
  async scoreElaboration(conceptId: string, text: string, keyTerms: string[]) {
    const scores = scoreElaboration(text, keyTerms);
    const { LearnerGraphService } = await import("./graph");
    const g = new LearnerGraphService(this.workspaceId, this.userId, this.role);
    await g.observe({
      conceptId, dimension: "analysis", value: scores.total,
      confidence: 0.6, sourceType: "self_explanation", sourceId: "elaboration",
      context: text.slice(0, 300), novelty: 0.2, visibility: "learner-and-instructor",
    }).catch(() => undefined);
    return scores;
  }

  // -- Modality effects -----------------------------------------------------------------
  async recordModality(conceptId: string | null, modality: string, gain: number) {
    await prisma.modalityEffect.upsert({
      where: { workspaceId_conceptId_userId_modality: { workspaceId: this.workspaceId, conceptId: conceptId ?? null as never, userId: this.userId, modality } },
      update: { gainSum: { increment: gain }, trials: { increment: 1 } },
      create: {
        workspaceId: this.workspaceId, conceptId, userId: this.userId,
        modality, gainSum: gain, trials: 1,
      },
    });
  }

  async bestModality(conceptId: string | null) {
    const rows = await prisma.modalityEffect.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, conceptId: conceptId ?? null },
      take: 20,
    });
    const ranked = rows
      .filter((r) => r.trials >= 2)
      .map((r) => ({ modality: r.modality, gainPerMin: r.gainSum / r.trials, trials: r.trials }))
      .sort((a, b) => b.gainPerMin - a.gainPerMin);
    return ranked[0] ?? null;
  }

  // -- Learner controls (preferences on the default profile) ------------------------------
  async getControls() {
    const p = await prisma.learnerProfile.findFirst({
      where: { workspaceId: this.workspaceId, userId: this.userId, isDefault: true },
    });
    return ((p?.preferences ?? {}) as Record<string, unknown>);
  }

  async setControl(control: string, value: unknown) {
    const allowed = [
      "challenge", "explainSimply", "expertVersion", "tryFirst", "noHints",
      "oneHintAtATime", "slowDown", "examFocus", "masteryFocus", "modality", "surprise",
    ];
    if (!allowed.includes(control)) throw new Error(`Unknown control ${control}`);
    let p = await prisma.learnerProfile.findFirst({
      where: { workspaceId: this.workspaceId, userId: this.userId, isDefault: true },
    });
    if (!p) {
      p = await prisma.learnerProfile.create({
        data: { workspaceId: this.workspaceId, userId: this.userId, name: "Default", isDefault: true },
      });
    }
    const prefs = ((p.preferences ?? {}) as Record<string, unknown>);
    prefs[control] = value;
    return prisma.learnerProfile.update({ where: { id: p.id }, data: { preferences: prefs as never } });
  }

  // -- Instructor policy + overrides ---------------------------------------------------------
  async effectivePolicy(setId: string | undefined) {
    if (!setId) {
      return {
        difficultyMin: 0, difficultyMax: 9, prereqThreshold: 0.4, hintLimit: 3,
        transferRequired: true, minIntervalHours: 12, escalationThreshold: 3,
        externalAllowed: true, highStakesReview: false, targetBand: 0.75,
        weights: DEFAULT_WEIGHTS, version: 0,
      };
    }
    const p = await prisma.adaptivePolicy.findUnique({
      where: { workspaceId_setId: { workspaceId: this.workspaceId, setId } },
    });
    if (!p) {
      return {
        difficultyMin: 0, difficultyMax: 9, prereqThreshold: 0.4, hintLimit: 3,
        transferRequired: true, minIntervalHours: 12, escalationThreshold: 3,
        externalAllowed: true, highStakesReview: false, targetBand: 0.75,
        weights: DEFAULT_WEIGHTS, version: 0,
      };
    }
    return {
      difficultyMin: p.difficultyMin, difficultyMax: p.difficultyMax,
      prereqThreshold: p.prereqThreshold, hintLimit: p.hintLimit,
      transferRequired: p.transferRequired, minIntervalHours: p.minIntervalHours,
      escalationThreshold: p.escalationThreshold, externalAllowed: p.externalAllowed,
      highStakesReview: p.highStakesReview, targetBand: 0.75,
      weights: ((p.weights ?? {}) as Partial<typeof DEFAULT_WEIGHTS>),
      version: p.version,
    };
  }

  async upsertPolicy(input: z.infer<typeof policySchemaAdaptive>) {
    this.assertInstructor();
    const existing = await prisma.adaptivePolicy.findUnique({
      where: { workspaceId_setId: { workspaceId: this.workspaceId, setId: input.setId } },
    });
    return prisma.adaptivePolicy.upsert({
      where: { workspaceId_setId: { workspaceId: this.workspaceId, setId: input.setId } },
      update: {
        difficultyMin: input.difficultyMin, difficultyMax: input.difficultyMax,
        prereqThreshold: input.prereqThreshold, hintLimit: input.hintLimit,
        transferRequired: input.transferRequired, minIntervalHours: input.minIntervalHours,
        escalationThreshold: input.escalationThreshold, externalAllowed: input.externalAllowed,
        highStakesReview: input.highStakesReview,
        weights: { eta: 0.4, mu: 0.3, nu: 0.2, target: input.targetBand } as never,
        version: (existing?.version ?? 0) + 1, updatedById: this.userId,
      },
      create: {
        workspaceId: this.workspaceId, setId: input.setId,
        difficultyMin: input.difficultyMin, difficultyMax: input.difficultyMax,
        prereqThreshold: input.prereqThreshold, hintLimit: input.hintLimit,
        transferRequired: input.transferRequired, minIntervalHours: input.minIntervalHours,
        escalationThreshold: input.escalationThreshold, externalAllowed: input.externalAllowed,
        highStakesReview: input.highStakesReview,
        weights: { eta: 0.4, mu: 0.3, nu: 0.2, target: input.targetBand } as never,
        updatedById: this.userId,
      },
    });
  }

  async createOverride(input: z.infer<typeof overrideSchema>) {
    this.assertInstructor();
    return prisma.instructorOverride.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId || null,
        targetType: input.targetType, targetId: input.targetId,
        kind: input.kind as never, payload: (input.payload ?? {}) as never,
        reason: input.reason, authorId: this.userId, scope: input.scope as never,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      },
    });
  }

  async activeOverrides(targetId?: string) {
    await prisma.instructorOverride.updateMany({
      where: { workspaceId: this.workspaceId, active: true, expiresAt: { lt: new Date() } },
      data: { active: false },
    });
    return prisma.instructorOverride.findMany({
      where: {
        workspaceId: this.workspaceId, active: true,
        ...(targetId ? { targetId } : {}),
      },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  async deactivateOverride(id: string) {
    this.assertInstructor();
    return prisma.instructorOverride.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { active: false },
    });
  }

  async loopHistory(conceptId: string, limit = 10) {
    return prisma.adaptiveLoop.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, conceptId },
      orderBy: { createdAt: "desc" }, take: Math.min(limit, 30),
    });
  }
}
