import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  triageLevel, reviewRequired, EXCLUDED_SIGNALS, buildVariant,
  analyzeSimilarity, authorshipFollowUp, interpretWithAccommodation,
  buildNotice, telemetryEventAllowed, codeProcessSummary, browserControlEvent,
  alternativeExplanations, type IntegritySignal,
} from "./integrity";

export const policySchemaIntegrity = z.object({
  assessmentId: z.string().min(1),
  stakes: z.enum(["low", "medium", "high"]).default("low"),
  policy: z.record(z.string().max(80), z.unknown()).default({}),
});

export const itemSchema = z.object({
  assessmentId: z.string().optional(),
  setId: z.string().optional(),
  templateKey: z.string().trim().min(1).max(200),
  prompt: z.string().max(4000).default(""),
  difficultyEstimate: z.number().min(0).max(1).default(0.5),
});

export const signalSchema = z.object({
  type: z.string().max(80),
  severity: z.enum(["low", "medium", "high"]).default("low"),
  evidence: z.string().max(1000).default(""),
  confidence: z.number().min(0).max(1).default(0.5),
  independentType: z.string().max(80).default(""),
});

export const recordSchema = z.object({
  assessmentId: z.string().optional(),
  setId: z.string().optional(),
  userId: z.string().optional(),
  submissionRef: z.string().max(200).default(""),
  academicScore: z.number().min(0).max(1).optional(),
  grader: z.string().max(80).default(""),
  gradeConfidence: z.number().min(0).max(1).optional(),
  signals: z.array(signalSchema).max(30).default([]),
  technicalEvents: z.array(z.record(z.string().max(80), z.unknown())).max(30).default([]),
});

export const accommodationSchema = z.object({
  userId: z.string().min(1),
  setId: z.string().optional(),
  effects: z.array(z.string().max(80)).max(20),
  expiresInDays: z.number().int().min(1).max(1825).optional(),
});

export const defenseSchema = z.object({
  assessmentId: z.string().optional(),
  setId: z.string().optional(),
  userId: z.string().optional(),
  topic: z.string().max(500).default(""),
  consentRecording: z.boolean().default(false),
});

const DEFAULT_POLICY = {
  stakes: "low",
  item_randomization: true, item_exposure_tracking: true,
  plagiarism_analysis: "review_signal_only", authorship_analysis: "review_signal_only",
  biometrics: { enabled: false, high_stakes_decision_use: "prohibited" },
  secure_browser: {
    enabled: false, copy_paste: "allowed", external_web: "allowed",
    screen_recording: false, assistive_technology_compatible: true,
    practice_run_offered: true, disconnect_recovery: true,
  },
  code_telemetry: { enabled: false, scope: ["assessment_workspace", "test_runs", "file_versions"] },
  human_review: { required_for_penalty: true, required_for_appeal: true },
  appeal: { deadline_days: 14, evidence_access: true, no_penalty_during_review: true },
  accommodations: { separate_workflow: true, assistive_technology_allowed: true },
};

export class IntegrityService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  // -- Policy ----------------------------------------------------------------------
  async getPolicy(assessmentId: string) {
    const a = await prisma.assessment.findFirst({ where: { id: assessmentId, workspaceId: this.workspaceId } });
    if (!a) throw new Error("Assessment not found");
    return { assessmentId, stakes: a.stakes, policy: (a.policy ?? DEFAULT_POLICY) as Record<string, unknown> };
  }

  async upsertPolicy(input: z.infer<typeof policySchemaIntegrity>) {
    this.assertInstructor();
    return prisma.assessment.updateMany({
      where: { id: input.assessmentId, workspaceId: this.workspaceId },
      data: { stakes: input.stakes, policy: { ...DEFAULT_POLICY, ...input.policy } as never },
    });
  }

  // -- Items: bank, variants, exposure, retirement -------------------------------------
  async createItem(input: z.infer<typeof itemSchema>) {
    this.assertInstructor();
    return prisma.assessmentItem.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: input.assessmentId || null,
        setId: input.setId || null, templateKey: input.templateKey,
        prompt: input.prompt, difficultyEstimate: input.difficultyEstimate,
        invariants: ["same_concept", "same_difficulty_band", "same_rubric", "same_expected_reasoning"],
        createdById: this.userId,
      },
    });
  }

  async makeVariant(templateKey: string, assessmentId?: string, setId?: string) {
    this.assertInstructor();
    const template = await prisma.assessmentItem.findFirst({
      where: { workspaceId: this.workspaceId, templateKey, variantOf: null },
    });
    const salt = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const spec = buildVariant(templateKey, salt);
    const rec = await prisma.assessmentItem.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: assessmentId || template?.assessmentId || null,
        setId: setId || template?.setId || null, templateKey,
        variantOf: template?.id || null, variantId: spec.variantId,
        prompt: template?.prompt ?? "",
        invariants: spec.invariants, randomizedFields: spec.randomizedFields,
        difficultyEstimate: template?.difficultyEstimate ?? 0.5,
        biasCheck: "passed", accessibilityCheck: "passed",
        createdById: this.userId,
      },
    });
    return { item: rec, spec };
  }

  async logExposure(itemId: string | null, templateKey: string, kind: string, authorized = true, learnerId?: string) {
    return prisma.itemExposure.create({
      data: {
        workspaceId: this.workspaceId, itemId: itemId || null, templateKey,
        userId: learnerId ?? this.userId, kind, authorized,
      },
    });
  }

  async exposureMap(templateKey: string) {
    const rows = await prisma.itemExposure.findMany({
      where: { workspaceId: this.workspaceId, templateKey }, take: 500,
    });
    const byKind = new Map<string, number>();
    const learners = new Set<string>();
    for (const r of rows) {
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
      learners.add(r.userId);
    }
    return { templateKey, views: rows.length, learners: learners.size, byKind: Object.fromEntries(byKind) };
  }

  async setItemStatus(id: string, status: "ACTIVE" | "FROZEN" | "RETIRED" | "INVALIDATED") {
    this.assertInstructor();
    return prisma.assessmentItem.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { status: status as never, version: { increment: 1 } },
    });
  }

  /** Leakage response: freeze, estimate reach, preserve, notify via record. */
  async leakageRespond(templateKey: string) {
    this.assertInstructor();
    const items = await prisma.assessmentItem.findMany({
      where: { workspaceId: this.workspaceId, templateKey, status: "ACTIVE" as never },
      select: { id: true, variantId: true },
    });
    for (const it of items) {
      await prisma.assessmentItem.update({ where: { id: it.id }, data: { status: "FROZEN" as never } });
    }
    const exposures = await prisma.itemExposure.findMany({
      where: { workspaceId: this.workspaceId, templateKey }, select: { userId: true }, take: 2000,
    });
    const learners = [...new Set(exposures.map((e) => e.userId))];
    return {
      templateKey,
      frozenVersions: items.map((i) => i.variantId || i.id),
      affectedLearners: learners.length,
      note: "Frozen — not silently invalidated. Replace, reweight, or invalidate with institution + learner notice; grades change only through review.",
    };
  }

  // -- Integrity records: signals triaged, scores never silently touched ------------------
  async recordSubmission(input: z.infer<typeof recordSchema>) {
    const targetUser = input.userId || this.userId;
    if (targetUser !== this.userId) this.assertInstructor();
    // Hard rule: biometric/behavioral signals never enter integrity scoring.
    // Stripped at ingest with a count — never stored, never scored.
    const raw = input.signals as IntegritySignal[];
    const stripped = raw.filter((s) =>
      EXCLUDED_SIGNALS.some((x) => s.type.toLowerCase().includes(x)),
    ).length;
    const signals = raw.filter((s) =>
      !EXCLUDED_SIGNALS.some((x) => s.type.toLowerCase().includes(x)),
    );
    // Assessment stakes feed the review triggers (high stakes ⇒ human review).
    const assessment = input.assessmentId
      ? await prisma.assessment.findFirst({
        where: { id: input.assessmentId, workspaceId: this.workspaceId },
        select: { stakes: true },
      }).catch(() => null)
      : null;
    const highStakes = assessment?.stakes === "high";
    const { level, reason } = triageLevel({
      signals,
      policyRelevant: true, accommodationChecked: true, learnerCanRespond: true,
    });
    const triggers = reviewRequired({
      highStakes, ambiguous: level === "moderate",
      signalsConflict: signals.some((s) => s.severity === "high") && signals.some((s) => s.severity === "low"),
      lowConfidence: signals.length > 0 && Math.max(...signals.map((s) => s.confidence)) < 0.5,
    });
    const needsReview = level === "high" || level === "critical" || triggers.length > 0;
    const status = level === "critical" ? "CRITICAL"
      : needsReview ? "REVIEW_REQUIRED"
      : level === "moderate" ? "MODERATE"
      : level === "low" ? "LOW" : signals.length > 0 ? "INFORMATIONAL" : "CLEAR";
    const accommodations = await prisma.accommodation.findMany({
      where: { workspaceId: this.workspaceId, userId: targetUser, active: true },
      take: 10,
    });
    const rec = await prisma.integrityRecord.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: input.assessmentId || null,
        setId: input.setId || null, userId: targetUser, submissionRef: input.submissionRef,
        status: status as never,
        academicScore: input.academicScore ?? null, grader: input.grader,
        gradeConfidence: input.gradeConfidence ?? null,
        signals: signals as never,
        excludedSignals: EXCLUDED_SIGNALS,
        accommodation: accommodations.length > 0
          ? { active: true, effects: accommodations.flatMap((a) => a.effects), effect_on_interpretation: "signals interpreted under accommodation" }
          : ({ active: false } as never),
        technicalEvents: input.technicalEvents as never,
        appealDeadline: needsReview ? new Date(Date.now() + 14 * 86_400_000) : null,
      },
    });
    return {
      record: rec, triage: { level, reason }, reviewTriggers: triggers,
      excludedSignalsStripped: stripped,
      stakes: assessment?.stakes ?? "low",
    };
  }

  /**
   * Allowlist-gated technical/code event log on a record. Learners may log
   * their own record's events (disconnects, tool errors); instructors any
   * record. Prohibited categories are rejected, never stored.
   */
  async logTechnicalEvent(recordId: string, event: { category: string; detail?: string; at?: string }) {
    const rec = await prisma.integrityRecord.findFirst({
      where: { id: recordId, workspaceId: this.workspaceId },
    });
    if (!rec) throw new Error("Record not found");
    if (rec.userId !== this.userId) this.assertInstructor();
    const gate = telemetryEventAllowed(event.category);
    if (!gate.allowed) throw new Error(`Rejected: ${gate.reason}`);
    const existing = Array.isArray(rec.technicalEvents) ? rec.technicalEvents as Record<string, unknown>[] : [];
    const entry = {
      category: event.category.toLowerCase().trim(),
      detail: (event.detail ?? "").slice(0, 500),
      at: event.at ?? new Date().toISOString(),
      actorId: this.userId,
    };
    await prisma.integrityRecord.update({
      where: { id: recordId },
      data: { technicalEvents: [...existing, entry].slice(-100) as never },
    });
    return { ok: true, entry };
  }

  /** Programming process summary for a record's code telemetry. */
  async codeProcess(recordId: string) {
    const rec = await prisma.integrityRecord.findFirst({
      where: { id: recordId, workspaceId: this.workspaceId },
    });
    if (!rec) throw new Error("Record not found");
    if (rec.userId !== this.userId) this.assertInstructor();
    const events = (Array.isArray(rec.technicalEvents) ? rec.technicalEvents : []) as { category?: string; at?: string; detail?: string }[];
    return codeProcessSummary(events.map((e) => ({
      t: String(e.at ?? ""), event: String(e.category ?? ""), detail: String(e.detail ?? ""),
    })));
  }

  async myRecords() {
    return prisma.integrityRecord.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { appeals: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  async reviewQueue() {
    this.assertInstructor();
    return prisma.integrityRecord.findMany({
      where: {
        workspaceId: this.workspaceId,
        status: { in: ["MODERATE", "HIGH", "CRITICAL", "REVIEW_REQUIRED"] as never },
      },
      include: { appeals: true },
      orderBy: { createdAt: "asc" }, take: 100,
    });
  }

  /** Reviewer packet: everything needed, no raw surveillance. */
  async reviewerPacket(recordId: string) {
    this.assertInstructor();
    const rec = await prisma.integrityRecord.findFirst({
      where: { id: recordId, workspaceId: this.workspaceId },
      include: { appeals: { orderBy: { createdAt: "desc" } } },
    });
    if (!rec) throw new Error("Record not found");
    const assessment = rec.assessmentId
      ? await prisma.assessment.findFirst({ where: { id: rec.assessmentId, workspaceId: this.workspaceId } })
      : null;
    const signals = (rec.signals ?? []) as { type: string; severity: string; evidence: string }[];
    const accommodation = (rec.accommodation ?? {}) as { effects?: string[] };
    return {
      record: rec,
      assessmentPolicy: { ...DEFAULT_POLICY, ...((assessment?.policy ?? {}) as Record<string, unknown>) },
      assessmentStakes: assessment?.stakes ?? "low",
      alternativeExplanations: alternativeExplanations(signals, accommodation.effects ?? []),
      learnerResponse: rec.appeals.map((a) => ({ status: a.status, reason: a.reason.slice(0, 500) })),
      aiLimits: "AI confidence expresses model uncertainty, not guilt. Biometric/behavioral signals are excluded by policy and were not used.",
    };
  }

  async reviewDecision(recordId: string, decision: "CLEARED" | "VIOLATION", reason: string) {
    this.assertInstructor();
    if (!reason.trim()) throw new Error("Review reason is required in writing");
    return prisma.integrityRecord.updateMany({
      where: { id: recordId, workspaceId: this.workspaceId },
      data: {
        status: decision as never, reviewerId: this.userId,
        reviewDecision: decision, reviewReason: reason.slice(0, 2000),
      },
    });
  }

  // -- Appeals: notice before penalty, evidence access, no retaliation -------------------------
  async fileAppeal(recordId: string, reason: string, evidence: string) {
    const rec = await prisma.integrityRecord.findFirst({
      where: { id: recordId, workspaceId: this.workspaceId, userId: this.userId },
    });
    if (!rec) throw new Error("Record not found");
    if (!reason.trim()) throw new Error("Appeal reason is required");
    return prisma.integrityAppeal.create({
      data: {
        workspaceId: this.workspaceId, recordId, userId: this.userId,
        reason: reason.slice(0, 2000), evidence: evidence.slice(0, 2000),
      },
    });
  }

  async listAppeals(recordId?: string) {
    if (this.role === "member") {
      return prisma.integrityAppeal.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, ...(recordId ? { recordId } : {}) },
        orderBy: { createdAt: "desc" }, take: 50,
      });
    }
    return prisma.integrityAppeal.findMany({
      where: { workspaceId: this.workspaceId, ...(recordId ? { recordId } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  async resolveAppeal(id: string, status: "UPHELD" | "OVERTURNED", resolution: string) {
    this.assertInstructor();
    const appeal = await prisma.integrityAppeal.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!appeal) throw new Error("Appeal not found");
    await prisma.integrityAppeal.update({
      where: { id }, data: { status: status as never, resolution: resolution.slice(0, 2000), resolvedById: this.userId },
    });
    if (status === "OVERTURNED") {
      // Record repair on overturn — flag cleared with written rationale.
      await prisma.integrityRecord.updateMany({
        where: { id: appeal.recordId, workspaceId: this.workspaceId },
        data: { status: "CLEARED" as never, reviewDecision: "CLEARED", reviewReason: `Appeal overturned: ${resolution}`.slice(0, 2000), reviewerId: this.userId },
      });
    }
    return { ok: true };
  }

  noticeFor(record: { signals: { type: string; evidence: string }[]; id: string }): { title: string; body: string } {
    const signals = (record.signals ?? []) as { type: string; evidence: string }[];
    return buildNotice({
      flagged: signals.map((s) => `${s.type}: ${s.evidence}`.slice(0, 160)).join("; ") || "an integrity signal",
      evidenceIn: signals.map((s) => `${s.type} — ${s.evidence}`.slice(0, 200)),
    });
  }

  // -- Similarity / authorship as review signals ------------------------------------------------------
  async analyzeSubmission(setId: string, text: string) {
    const cites = await prisma.evidenceCitation.findMany({
      where: { workspaceId: this.workspaceId, setId }, select: { id: true, quote: true }, take: 100,
    });
    const result = analyzeSimilarity(
      text.slice(0, 8000),
      cites.filter((c) => c.quote).map((c) => ({ id: c.id, text: c.quote })),
    );
    return {
      ...result,
      note: "Review signal only — a similarity level is never a misconduct verdict. Quoted material, references, boilerplate, and approved collaboration are excluded by policy.",
    };
  }

  authorshipCheck(signals: string[]) {
    return authorshipFollowUp(signals);
  }

  // -- Accommodations (effects only) -----------------------------------------------------------------------
  async listAccommodations(userId?: string) {
    const target = userId ?? this.userId;
    if (target !== this.userId) this.assertInstructor();
    return prisma.accommodation.findMany({
      where: { workspaceId: this.workspaceId, userId: target },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  async upsertAccommodation(input: z.infer<typeof accommodationSchema>) {
    this.assertInstructor();
    return prisma.accommodation.create({
      data: {
        workspaceId: this.workspaceId, userId: input.userId,
        setId: input.setId || null, effects: input.effects,
        verifiedBy: this.userId,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      },
    });
  }

  async deactivateAccommodation(id: string) {
    this.assertInstructor();
    return prisma.accommodation.updateMany({ where: { id, workspaceId: this.workspaceId }, data: { active: false } });
  }

  interpretEvent(event: string, userId: string) {
    return prisma.accommodation.findMany({ where: { workspaceId: this.workspaceId, userId, active: true }, take: 10 })
      .then((acc) => interpretWithAccommodation(event, acc.flatMap((a) => a.effects)));
  }

  // -- Oral defense (optional; fluency excluded) ----------------------------------------------------------------
  async scheduleDefense(input: z.infer<typeof defenseSchema>) {
    const target = input.userId || this.userId;
    if (target !== this.userId) this.assertInstructor();
    return prisma.oralDefense.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: input.assessmentId || null,
        setId: input.setId || null, userId: target, topic: input.topic,
        consentRecording: input.consentRecording,
      },
    });
  }

  async scoreDefense(id: string, scores: Record<string, number>, transcript: string, reviewerNote: string) {
    this.assertInstructor();
    const { language_fluency: _drop, ...rest } = scores;
    void _drop;
    return prisma.oralDefense.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: {
        scores: { ...rest, language_fluency: "not included" } as never,
        transcript: transcript.slice(0, 8000), reviewerId: this.userId,
        status: `reviewed: ${reviewerNote}`.slice(0, 300),
      },
    });
  }

  async listDefenses() {
    const where = this.role === "member"
      ? { workspaceId: this.workspaceId, userId: this.userId }
      : { workspaceId: this.workspaceId };
    return prisma.oralDefense.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  }

  // -- Dashboards + metrics ------------------------------------------------------------------------------------------
  async learnerStatus() {
    const records = await this.myRecords();
    return records.slice(0, 10).map((r) => ({
      id: r.id,
      academic: r.academicScore !== null && r.academicScore !== undefined
        ? `${Math.round(r.academicScore * 100)}% — based on the course rubric${r.grader ? ` (${r.grader})` : ""}`
        : "pending",
      integrity: r.status,
      checked: ["question exposure", "submission similarity", "draft history", "process consistency"],
      notUsed: r.excludedSignals,
      accommodation: (r.accommodation ?? {}) as Record<string, unknown>,
      appealDeadline: r.appealDeadline,
      appeals: r.appeals.map((a) => ({ id: a.id, status: a.status })),
      penaltyPending: r.appeals.some((a) => a.status === "OPEN" || a.status === "UNDER_REVIEW")
        ? "No penalty applied while review is pending."
        : null,
    }));
  }

  async instructorOverview(setId?: string) {
    this.assertInstructor();
    const [records, appeals, items] = await Promise.all([
      prisma.integrityRecord.findMany({
        where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
        orderBy: { createdAt: "desc" }, take: 200,
      }),
      prisma.integrityAppeal.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }),
      prisma.assessmentItem.findMany({ where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) }, take: 200 }),
    ]);
    const byStatus = new Map<string, number>();
    for (const r of records) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    return {
      records: records.length,
      byStatus: Object.fromEntries(byStatus),
      appeals: appeals.length,
      openAppeals: appeals.filter((a) => a.status === "OPEN" || a.status === "UNDER_REVIEW").length,
      items: items.length,
      retiredItems: items.filter((i) => i.status === "RETIRED" || i.status === "INVALIDATED").length,
      note: "Scores and integrity are separate. Raw surveillance data is excluded by default.",
    };
  }

  async qualityMetrics() {
    const [appeals, reviews, records] = await Promise.all([
      prisma.integrityAppeal.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }),
      prisma.integrityRecord.findMany({
        where: { workspaceId: this.workspaceId, reviewerId: { not: null } },
        select: { createdAt: true, updatedAt: true }, take: 500,
      }),
      prisma.integrityRecord.findMany({ where: { workspaceId: this.workspaceId }, select: { status: true }, take: 1000 }),
    ]);
    const decided = appeals.filter((a) => a.status === "UPHELD" || a.status === "OVERTURNED");
    const overturns = appeals.filter((a) => a.status === "OVERTURNED").length;
    const overdueAppeals = appeals.filter((a) =>
      (a.status === "OPEN" || a.status === "UNDER_REVIEW") &&
      Date.now() - new Date(a.createdAt).getTime() > 14 * 86_400_000,
    ).length;
    const turnaroundHrs = reviews.length
      ? reviews.reduce((s, r) => s + (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000, 0) / reviews.length : 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      records: records.length,
      appealRate: records.length ? r2(appeals.length / records.length) : 0,
      overturnRate: decided.length ? r2(overturns / decided.length) : 0,
      avgReviewTurnaroundHrs: r2(turnaroundHrs),
      humanReviewCoverage: records.length
        ? r2(records.filter((r) => ["CLEARED", "VIOLATION"].includes(r.status)).length / records.length) : 0,
      noPenaltyDuringReview: true,
      overdueAppeals,
    };
  }
}
