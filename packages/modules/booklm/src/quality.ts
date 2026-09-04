import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  jaccard, textSimilarity, classifyDuplicate, detectContradiction,
  auditCitations, readingProfile, scanBias, scanCultural, auditAccessibility,
  rightsDecision, scanSafety, freshnessState, publicationDecision,
  type RightsStatus,
} from "./quality-checks";
import {
  auditArtifactCitations, assessFreshnessForRules, safetyDisposition,
  publicationDecisionForArtifact, readingAdaptPlan, decisionAuditEntry,
  approvalStateFromReviews, buildProvenanceRecord,
} from "./quality-deep";

export const rightsSchema = z.object({
  sourceKey: z.string().trim().min(1).max(300),
  license: z.string().max(200).default("unknown"),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  derivativeAllowed: z.boolean().default(false),
  attributionRequired: z.boolean().default(false),
  scope: z.string().max(200).default(""),
  evidence: z.string().max(1000).default(""),
});

export const freshnessRuleSchema = z.object({
  setId: z.string().optional(),
  claimType: z.string().max(80).default("general"),
  jurisdiction: z.string().max(80).default(""),
  validDays: z.number().int().min(1).max(3650).default(365),
  refreshDays: z.number().int().min(1).max(3650).default(90),
  requiredReviewer: z.string().max(120).default(""),
});

const RULE_VERSION = "qc-1.0";

export class QualityService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  // -- Multidimensional report (never one opaque score) ----------------------------------
  async reportArtifact(artifactId: string) {
    const a = await prisma.studyArtifact.findFirst({
      where: { id: artifactId, workspaceId: this.workspaceId },
    });
    if (!a) throw new Error("Artifact not found");
    const text = JSON.stringify(a.content ?? {}).slice(0, 30000);

    // Grounding: citations present + extraction confidence.
    const citeRefs = (text.match(/"citation"\s*:/g) ?? []).length;
    const grounding = a.extractionConfidence >= 0.7 && citeRefs > 0 ? "passed"
      : citeRefs === 0 ? "failed" : "warning";

    // Citation completeness: claim-ish sentences vs citation markers.
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20);
    const markers = (text.match(/doc_[\w-]*:v\d+|p\d+|chapter|slide_\d+|\[\d+:\d+-\d+:\d+\]/g) ?? []).length;
    const citationAudit = {
      claims: sentences.length,
      cited: Math.min(sentences.length, markers),
      status: markers === 0 && sentences.length > 3 ? "failed" : markers < sentences.length / 2 ? "warning" : "passed",
    };
    // Claim-level audit with severity: quantitative claims need date/units,
    // quotations need bounding cites, figure mentions need origin cites.
    const highStakesType = ["practice_test", "coding_assignment", "lab"].includes(a.type);
    const citationDetail = auditArtifactCitations(a.id, text.slice(0, 20000), {
      highStakes: highStakesType, answerKey: a.type === "practice_test",
    });

    // Consistency: contradiction scan across sentence pairs (capped).
    const contradictions: { a: string; b: string; kind: string }[] = [];
    const cand = sentences.slice(0, 40);
    for (let i = 0; i < cand.length && contradictions.length < 5; i++) {
      for (let j = i + 1; j < cand.length && contradictions.length < 5; j++) {
        const hit = detectContradiction(cand[i]!, cand[j]!);
        if (hit && jaccard(cand[i]!, cand[j]!) > 0.25) {
          contradictions.push({ a: cand[i]!.slice(0, 120), b: cand[j]!.slice(0, 120), kind: hit.kind });
        }
      }
    }

    // Duplicates vs sibling artifacts.
    const siblings = await prisma.studyArtifact.findMany({
      where: { workspaceId: this.workspaceId, setId: a.setId, id: { not: a.id } },
      select: { id: true, type: true, title: true, content: true, concepts: true },
      take: 30,
    });
    const myConcepts = new Set(a.concepts);
    const duplicates = siblings
      .map((s) => {
        const other = JSON.stringify(s.content ?? {}).slice(0, 30000);
        const sim = textSimilarity(text, other);
        const shared = s.concepts.filter((c) => myConcepts.has(c)).length;
        const cls = classifyDuplicate({
          hashEqual: createHash("sha256").update(text).digest("hex") === createHash("sha256").update(other).digest("hex"),
          similarity: sim, sameType: s.type === a.type, sharedConcepts: shared,
          gradedVsPractice: (a.type === "practice_test") !== (s.type === "practice_test") && sim >= 0.5,
        });
        return { id: s.id, title: s.title, type: s.type, similarity: sim, kind: cls.kind, action: cls.action };
      })
      .filter((d) => d.kind)
      .slice(0, 10);

    // Reading, bias, cultural, a11y, safety, rights, freshness.
    const reading = readingProfile(text.slice(0, 8000), "general");
    const bias = scanBias(text.slice(0, 20000));
    const cultural = scanCultural(text.slice(0, 20000), "");
    const a11y = auditAccessibility(text.slice(0, 20000));
    const safety = scanSafety(text.slice(0, 20000));
    // Proportionate safety behavior: block / transform / warn / escalate with
    // required reviewers, safe alternatives, and stricter child defaults.
    const disposition = safetyDisposition(safety);
    const rights = await this.rightsForSources(a.sourceDocs);
    const rightsWorst = rights.some((r) => ["unknown", "prohibited", "disputed"].includes(r.status)) ? "blocked"
      : rights.some((r) => r.status !== "cleared" && r.status !== "attribution") ? "restricted" : "cleared";
    const ageDays = (Date.now() - new Date(a.updatedAt).getTime()) / 86_400_000;
    const currency = freshnessState({ ageDays, validDays: 365, refreshDays: 90 });

    const dimensions = {
      grounding: { status: grounding, extractionConfidence: a.extractionConfidence, citations: citeRefs },
      citations: {
        total: citationAudit.claims, cited: citationAudit.cited, status: citationAudit.status,
        audit: {
          claims_total: citationDetail.claims_total, claims_cited: citationDetail.claims_cited,
          supported: citationDetail.supported_citations, weak: citationDetail.weak_citations,
          missing: citationDetail.missing_citations, by_severity: citationDetail.by_severity,
          status: citationDetail.status,
        },
      },
      consistency: {
        status: contradictions.length > 0 ? "warning" : "passed",
        contradictions,
      },
      currency: { status: currency === "unaffected" ? "current" : currency === "citation_only" ? "aging" : "stale", ageDays: Math.round(ageDays) },
      originality: {
        status: duplicates.some((d) => d.kind === "exact") ? "duplicate" : duplicates.length > 0 ? "similar" : "unique",
        matches: duplicates,
      },
      reading: { band: reading.band, actions: reading.actions, status: "measured" },
      fairness: {
        status: bias.some((b) => b.severity === "high") ? "review_required" : bias.length > 0 ? "review_required" : "passed",
        findings: bias,
      },
      cultural: { status: cultural.findings.length > 0 ? "review_required" : "passed", findings: cultural.findings },
      accessibility: {
        status: a11y.failures.some((f) => f.blocking) ? "remediation_required" : a11y.failures.length > 0 ? "warning" : "passed",
        passed: a11y.passed, warnings: a11y.warnings, failed: a11y.failed, failures: a11y.failures,
      },
      rights: { status: rightsWorst, sources: rights },
      safety: {
        status: safety.some((s) => s.severity === "high") ? "blocked" : safety.length > 0 ? "human_review" : "passed",
        findings: safety,
        disposition: {
          action: disposition.action, requiredReviewers: disposition.requiredReviewers,
          safeAlternative: disposition.safeAlternative, warnings: disposition.warnings,
        },
      },
      instructor: { status: a.reviewStatus, reviewer: a.reviewedById },
    };
    // Policy-driven release gate: artifact-type presets (a graded lab and a
    // glossary never share a release threshold).
    const pub = publicationDecisionForArtifact({
      artifactType: a.type,
      rights: (rightsWorst === "blocked" ? "unknown" : rightsWorst === "restricted" ? "unknown" : "cleared") as RightsStatus,
      safetyHigh: safety.some((s) => s.severity === "high"),
      criticalMissing: citationAudit.status === "failed" && highStakesType,
      contradictionCount: contradictions.length,
      a11yBlocking: a11y.failures.some((f) => f.blocking),
      a11yWarnings: a11y.warnings,
      biasHigh: bias.some((b) => b.severity === "high"),
      biasFindings: bias.length,
      culturalFindings: cultural.findings.length,
      instructorApproved: a.reviewStatus === "APPROVED" || a.reviewStatus === "PUBLISHED",
    });
    const report = await prisma.qualityReport.create({
      data: {
        workspaceId: this.workspaceId, setId: a.setId,
        subjectType: "artifact", subjectId: a.id,
        dimensions: dimensions as never,
        decision: pub.decision, ruleVersion: RULE_VERSION, createdById: this.userId,
      },
    });
    // Route review queues from findings.
    const queues: string[] = [];
    if (contradictions.length > 0 || citationDetail.by_severity.critical > 0) queues.push("SUBJECT_MATTER");
    if (bias.length > 0 || cultural.findings.length > 0) queues.push("CULTURAL");
    if (a11y.failures.length > 0) queues.push("ACCESSIBILITY");
    if (rightsWorst !== "cleared") queues.push("RIGHTS");
    if (safety.length > 0) queues.push("SAFETY");
    if (reading.actions.length > 2) queues.push("EDITORIAL");
    for (const q of [...new Set(queues)]) {
      await prisma.qualityReview.create({
        data: { workspaceId: this.workspaceId, reportId: report.id, queue: q as never },
      }).catch(() => null);
    }
    // Decision audit entry: rule/input versions, evidence, uncertainty,
    // disposition and downstream — the measurable control for this decision.
    const audit = decisionAuditEntry({
      ruleVersion: RULE_VERSION,
      artifactVersion: a.version,
      evidence: [
        `citations ${citationDetail.claims_cited}/${citationDetail.claims_total} (${citationDetail.status})`,
        `contradictions: ${contradictions.length}`,
        `a11y: ${a11y.passed} passed, ${a11y.failed} failed`,
        `rights: ${rightsWorst}`,
        `safety: ${disposition.action}`,
      ],
      confidence: a.extractionConfidence,
      uncertainty: [
        ...(citationDetail.status !== "passed" ? ["citation support incomplete"] : []),
        ...(contradictions.length > 0 ? ["unresolved contradictions"] : []),
      ],
      decision: pub.decision,
      disposition: pub.decision,
      downstream: [`artifact:${a.id}`],
    });
    return { report, publication: pub, audit };
  }

  async reportDocument(documentId: string) {
    const doc = await prisma.sourceDocument.findFirst({
      where: { id: documentId, workspaceId: this.workspaceId },
    });
    if (!doc) throw new Error("Document not found");
    const [blocks, corrections, citations] = await Promise.all([
      prisma.docBlock.count({ where: { workspaceId: this.workspaceId, documentId } }),
      prisma.docCorrection.count({ where: { workspaceId: this.workspaceId, documentId } }),
      prisma.docCitation.count({ where: { workspaceId: this.workspaceId, documentId } }),
    ]);
    const quality = (doc.quality ?? {}) as { confidence?: Record<string, number>; warnings?: unknown[] };
    const dimensions = {
      grounding: { status: doc.status === "VERIFIED" ? "passed" : "warning", blocks, corrections },
      citations: { total: citations, status: citations > 0 ? "passed" : "warning" },
      consistency: { status: "passed", contradictions: [] },
      currency: { status: "current" },
      originality: { status: "unique", matches: [] },
      reading: { status: "measured" },
      fairness: { status: "passed", findings: [] },
      cultural: { status: "passed", findings: [] },
      accessibility: { status: "warning", note: "source scans need human accessibility review" },
      rights: { status: "unknown", sources: [] },
      safety: { status: "passed", findings: [] },
      instructor: { status: doc.status },
      extraction: quality,
    };
    const report = await prisma.qualityReport.create({
      data: {
        workspaceId: this.workspaceId, setId: doc.setId,
        subjectType: "document", subjectId: doc.id,
        dimensions: dimensions as never, decision: "draft",
        ruleVersion: RULE_VERSION, createdById: this.userId,
      },
    });
    return { report };
  }

  async latestReport(subjectType: string, subjectId: string) {
    return prisma.qualityReport.findFirst({
      where: { workspaceId: this.workspaceId, subjectType, subjectId },
      orderBy: { createdAt: "desc" },
      include: { reviews: true },
    });
  }

  async setReports(setId?: string) {
    return prisma.qualityReport.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
      include: { reviews: true },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  // -- Review workflow ---------------------------------------------------------------------
  async reviewQueue(queue?: string) {
    return prisma.qualityReview.findMany({
      where: {
        workspaceId: this.workspaceId, status: "PENDING" as never,
        ...(queue ? { queue: queue as never } : {}),
      },
      orderBy: { createdAt: "asc" }, take: 100,
    });
  }

  async decideReview(id: string, status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "WAIVED", note = "") {
    this.assertInstructor();
    return prisma.qualityReview.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { status: status as never, reviewerId: this.userId, note: note.slice(0, 2000) },
    });
  }

  // -- Provenance registry (versioned audit records; lineage per span) -------------------------
  async registerProvenance(input: unknown) {
    const record = buildProvenanceRecord(input);
    const report = await prisma.qualityReport.create({
      data: {
        workspaceId: this.workspaceId, setId: null,
        subjectType: "provenance", subjectId: record.content_id,
        dimensions: { provenance: record } as never,
        decision: record.publication_state, ruleVersion: RULE_VERSION, createdById: this.userId,
      },
    });
    return { record, reportId: report.id };
  }

  async provenanceFor(contentId: string) {
    return prisma.qualityReport.findFirst({
      where: { workspaceId: this.workspaceId, subjectType: "provenance", subjectId: contentId },
      orderBy: { createdAt: "desc" },
    });
  }

  // -- Approval workflow (stateful, auditable, granular) -----------------------------------------
  private static readonly REVIEW_QUEUES = [
    "SUBJECT_MATTER", "PEDAGOGICAL", "ACCESSIBILITY", "CULTURAL", "RIGHTS", "SAFETY", "EDITORIAL",
  ];

  /** Request required queue reviews for a report. Idempotent: pending reviews are never duplicated. */
  async requestApproval(reportId: string, requiredQueues: string[], deadlineIso?: string) {
    this.assertInstructor();
    const report = await prisma.qualityReport.findFirst({
      where: { id: reportId, workspaceId: this.workspaceId },
    });
    if (!report) throw new Error("Report not found");
    const queues = [...new Set(requiredQueues)].filter((q) => QualityService.REVIEW_QUEUES.includes(q));
    if (queues.length === 0) throw new Error("No valid review queues requested");
    const existing = await prisma.qualityReview.findMany({
      where: { workspaceId: this.workspaceId, reportId },
    });
    const hasOpen = new Set(existing.filter((r) => r.status === "PENDING").map((r) => String(r.queue)));
    for (const q of queues) {
      if (hasOpen.has(q)) continue;
      await prisma.qualityReview.create({
        data: { workspaceId: this.workspaceId, reportId, queue: q as never },
      }).catch(() => null);
    }
    return this.approvalState(reportId, deadlineIso);
  }

  /** Derive workflow state from queue reviews: blocked / changes / approved / pending. */
  async approvalState(reportId: string, deadlineIso?: string) {
    const report = await prisma.qualityReport.findFirst({
      where: { id: reportId, workspaceId: this.workspaceId },
      include: { reviews: true },
    });
    if (!report) throw new Error("Report not found");
    const required = [...new Set(report.reviews.map((r) => String(r.queue)))];
    return {
      reportId: report.id, decision: report.decision,
      deadline: deadlineIso ?? null,
      ...approvalStateFromReviews(
        report.reviews.map((r) => ({ queue: String(r.queue), status: String(r.status) })),
        required, deadlineIso ?? null,
      ),
    };
  }

  /** Granular instructor decision per artifact (approve glossary, reject test). */
  async setArtifactReviewStatus(
    artifactId: string,
    status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "SUPERSEDED" | "REJECTED",
  ) {
    this.assertInstructor();
    await prisma.studyArtifact.updateMany({
      where: { id: artifactId, workspaceId: this.workspaceId },
      data: { reviewStatus: status as never, reviewedById: this.userId },
    });
    return { artifactId, status };
  }

  // -- Freshness assessment across a set (rule-based, approximate) ----------------------------------
  async freshnessAssessment(setId: string) {
    const [rules, artifacts] = await Promise.all([
      prisma.freshnessRule.findMany({
        where: { workspaceId: this.workspaceId, OR: [{ setId }, { setId: null }] }, take: 50,
      }),
      prisma.studyArtifact.findMany({
        where: { workspaceId: this.workspaceId, setId },
        select: { id: true, type: true, title: true, updatedAt: true }, take: 200,
      }),
    ]);
    if (rules.length === 0) {
      return { setId, rules: 0, blocked: 0, items: [], note: "No freshness rules configured for this set — add claim-type rules first." };
    }
    const now = Date.now();
    const items = artifacts.map((a) => {
      const ageDays = (now - new Date(a.updatedAt).getTime()) / 86_400_000;
      const { assessments, worst } = assessFreshnessForRules(ageDays, rules.map((r) => ({
        claimType: r.claimType, jurisdiction: r.jurisdiction, validDays: r.validDays,
        refreshDays: r.refreshDays, requiredReviewer: r.requiredReviewer,
      })));
      return {
        id: a.id, type: a.type, title: a.title, ageDays: Math.round(ageDays),
        worst, blocking: worst === "publication_blocked",
        assessments: assessments.filter((x) => x.mark !== "unaffected"),
      };
    });
    return {
      setId, rules: rules.length,
      blocked: items.filter((i) => i.blocking).length,
      items: items.filter((i) => i.worst !== "unaffected"),
      note: "Rule-based and approximate: rules apply by set, not per-claim. Exact-claim tracking needs claim-level validity fields.",
    };
  }

  /** Deterministic reading-adapt edit ops for instructor approval (no silent rewrite). */
  adaptReadingPlan(text: string, target: string) {
    return readingAdaptPlan(text.slice(0, 20000), target);
  }

  // -- Rights ledger --------------------------------------------------------------------------------
  async upsertRights(input: z.infer<typeof rightsSchema>) {
    this.assertInstructor();
    return prisma.rightsRecord.upsert({
      where: { workspaceId_sourceKey: { workspaceId: this.workspaceId, sourceKey: input.sourceKey } },
      update: {
        license: input.license, derivativeAllowed: input.derivativeAllowed,
        attributionRequired: input.attributionRequired, scope: input.scope,
        evidence: input.evidence,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
        createdById: this.userId,
      },
      create: {
        workspaceId: this.workspaceId, sourceKey: input.sourceKey,
        license: input.license, derivativeAllowed: input.derivativeAllowed,
        attributionRequired: input.attributionRequired, scope: input.scope,
        evidence: input.evidence,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
        createdById: this.userId,
      },
    });
  }

  async rightsLedger() {
    return prisma.rightsRecord.findMany({ where: { workspaceId: this.workspaceId }, take: 200 });
  }

  async rightsForSources(sourceDocs: string[]) {
    const out: { source: string; status: string; action: string }[] = [];
    for (const s of sourceDocs.slice(0, 20)) {
      const rec = await prisma.rightsRecord.findUnique({
        where: { workspaceId_sourceKey: { workspaceId: this.workspaceId, sourceKey: s } },
      }).catch(() => null);
      if (!rec) {
        out.push({ source: s, status: "unknown", action: "hold publication; request rights review" });
        continue;
      }
      const d = rightsDecision({
        license: rec.license, derivativeAllowed: rec.derivativeAllowed,
        attributionRequired: rec.attributionRequired,
        expiresAt: rec.expiresAt ? new Date(rec.expiresAt).getTime() : null,
      });
      out.push({ source: s, status: d.status, action: d.action });
    }
    return out;
  }

  // -- Freshness rules -----------------------------------------------------------------------------------
  async upsertFreshnessRule(input: z.infer<typeof freshnessRuleSchema>) {
    this.assertInstructor();
    return prisma.freshnessRule.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId || null,
        claimType: input.claimType, jurisdiction: input.jurisdiction,
        validDays: input.validDays, refreshDays: input.refreshDays,
        requiredReviewer: input.requiredReviewer, createdById: this.userId,
      },
    });
  }

  async listFreshnessRules(setId?: string) {
    return prisma.freshnessRule.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) }, take: 50,
    });
  }

  // -- Change impact (categorized, blocking items surfaced) ---------------------------------------------------------
  async impactAnalysis(setId: string, sourceKey: string, kind: string) {
    const rows = await prisma.studyArtifact.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 200 });
    const affected = rows.filter((a) =>
      a.sourceDocs.some((s) => s.toLowerCase().includes(sourceKey.toLowerCase()))
      || a.sourceVersions.some((v) => v.toLowerCase().includes(sourceKey.toLowerCase())),
    );
    const categorize = (type: string): string => {
      if (type === "practice_test") return "assessment-answer change";
      if (type === "lab") return "safety change";
      if (type.includes("translate") || type.includes("adapt")) return "translation change";
      if (type === "glossary" || type === "summary") return "wording change";
      if (type === "concept_map" || type === "prereq_map") return "concept-definition change";
      return `${kind || "source"} change`;
    };
    const items = affected.map((a) => ({
      id: a.id, type: a.type, title: a.title, reviewStatus: a.reviewStatus,
      category: categorize(a.type),
      blocking: (a.type === "practice_test" || a.type === "lab") && kind !== "citation-only",
      action: (a.type === "practice_test" || a.type === "lab") && kind !== "citation-only"
        ? "regeneration required — prior version preserved, no silent overwrite"
        : kind === "citation-only" ? "citation-only update" : "review recommended",
    }));
    return {
      changedSource: sourceKey,
      affectedClaims: affected.length,
      artifacts: {
        regenerateRequired: items.filter((i) => i.action.startsWith("regeneration")).length,
        reviewRequired: items.filter((i) => i.action === "review recommended").length,
        notificationOnly: items.filter((i) => i.action.startsWith("citation")).length,
      },
      blockingItems: items.filter((i) => i.blocking).map((i) => `${i.title} (${i.type})`),
      items,
      note: "Migrate immediately or preserve the old curriculum for a defined cohort — administrator choice.",
    };
  }

  // -- Operational metrics (computed; gaps declared) -----------------------------------------------------------------------
  async qualityMetrics(setId?: string) {
    const ws = { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) };
    const [reports, reviews, challenges, audits, grades] = await Promise.all([
      prisma.qualityReport.findMany({ where: ws, take: 500 }),
      prisma.qualityReview.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }),
      prisma.evidenceChallenge.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }),
      prisma.gradeAudit.findMany({ where: { workspaceId: this.workspaceId, action: { in: ["CRITERION_REVISED", "GRADE_SUBMITTED"] } }, take: 1000 }),
      prisma.grade.count({ where: { workspaceId: this.workspaceId } }),
    ]);
    const decided = challenges.filter((c) => c.status === "UPHELD" || c.status === "OVERTURNED");
    const resolvedMs = decided
      .filter((c) => c.resolvedAt)
      .map((c) => new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime());
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      reports: reports.length,
      decisions: {
        publish: reports.filter((r) => r.decision === "publish").length,
        blocked: reports.filter((r) => r.decision === "blocked").length,
        review: reports.filter((r) => !["publish", "blocked"].includes(r.decision)).length,
      },
      reviewsOpen: reviews.filter((r) => r.status === "PENDING").length,
      remediationHrs: (() => {
        const done = reviews.filter((r) => r.status !== "PENDING");
        if (!done.length) return 0;
        return r2(done.reduce((s, r) => s + (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 3_600_000, 0) / done.length);
      })(),
      contradictionResolutionHrs: resolvedMs.length
        ? r2(resolvedMs.reduce((s, v) => s + v, 0) / resolvedMs.length / 3_600_000) : 0,
      instructorOverrideRate: grades ? r2(audits.filter((a) => a.action === "CRITERION_REVISED").length / Math.max(1, grades)) : 0,
      needsInstrumentation: [
        "stale-claim detection recall (needs labeled stale-claim set)",
        "safety false-negative rate (needs red-team harness)",
        "translation consistency rate (needs parallel-corpus checks)",
        "reading-level target accuracy (needs leveled benchmark)",
      ],
    };
  }
}
