"use server";

import { LearningService, learningSetSchema, learningItemSchema } from "@n0va/modules-booklm/server";
import { EvidenceService, citationSchema, challengeSchema, ANSWER_MODES } from "@n0va/modules-booklm/evidence";
import { PolicyService, policySchema } from "@n0va/modules-booklm/policies";
import { EvalService } from "@n0va/modules-booklm/eval";
import { LearnerGraphService, profileSchema, goalSchema, observeSchema, correctionSchema } from "@n0va/modules-booklm/graph";
import { MisconceptionService, misconceptionSchema } from "@n0va/modules-booklm/misconceptions";
import { RecommendationService } from "@n0va/modules-booklm/recommend";
import { KnowledgeService } from "@n0va/modules-booklm/knowledge";
import { TutorService, sessionSchema, memorySchema, decisionSchema } from "@n0va/modules-booklm/tutor";
import { AssessmentService, assessmentSchema, gradeSchema, attemptSchema } from "@n0va/modules-booklm/assessment";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new LearningService(workspaceId, userId, role);
};
const evSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new EvidenceService(workspaceId, userId, role);
};
const kgSvc = async () => {
  const { workspaceId, userId } = await actionContext();
  return new KnowledgeService(workspaceId, userId);
};
const tuSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new TutorService(workspaceId, userId, role);
};
const asSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AssessmentService(workspaceId, userId, role);
};

export async function createLearningSetAction(formData: FormData) {
  const { title, description } = learningSetSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  return (await svc()).create(title, description);
}

export async function updateLearningSetAction(formData: FormData) {
  const setId = String(formData.get("setId") ?? "");
  const { title, description } = learningSetSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await (await svc()).updateMeta(setId, title, description);
}

export async function removeLearningSetAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("setId") ?? ""));
}

export async function addLearningItemAction(formData: FormData) {
  const setId = String(formData.get("setId") ?? "");
  const parsed = learningItemSchema.parse({
    kind: String(formData.get("kind") ?? "LINK"),
    title: String(formData.get("title") ?? ""),
    source: String(formData.get("source") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    refId: String(formData.get("refId") ?? "") || undefined,
  });
  await (await svc()).addItem(setId, parsed);
}

export async function removeLearningItemAction(formData: FormData) {
  await (await svc()).removeItem(String(formData.get("setId") ?? ""), String(formData.get("itemId") ?? ""));
}

export async function moveLearningItemAction(formData: FormData) {
  await (await svc()).moveItem(
    String(formData.get("setId") ?? ""),
    String(formData.get("itemId") ?? ""),
    formData.get("dir") === "up" ? "up" : "down",
  );
}

// --- Phase 1+2 enhancements ---

export async function askGroundedAction(setId: string, question: string) {
  return (await evSvc()).groundedAnswer(setId, question.slice(0, 500));
}

export async function askGroundedActionV2(setId: string, question: string, mode?: string) {
  const m = ANSWER_MODES.includes(mode as never) ? (mode as "STRICT" | "GUIDED" | "EXPLORATORY" | "EXAM") : undefined;
  return (await evSvc()).groundedAnswerV2(setId, question.slice(0, 2000), m ? { mode: m } : undefined);
}

export async function addCitationAction(formData: FormData) {
  const setId = String(formData.get("setId") ?? "") || undefined;
  const parsed = citationSchema.parse({
    setId,
    claim: String(formData.get("claim") ?? ""),
    quote: String(formData.get("quote") ?? ""),
    sourceKind: "NOTE",
    sourceTitle: String(formData.get("sourceTitle") ?? ""),
    locatorPage: formData.get("locatorPage") ? Number(formData.get("locatorPage")) : undefined,
    locatorHeading: String(formData.get("locatorHeading") ?? ""),
    sourceType: String(formData.get("sourceType") ?? "note"),
    evidenceType: String(formData.get("evidenceType") ?? "CLAIM"),
    extractionConfidence: formData.get("extractionConfidence") ? Number(formData.get("extractionConfidence")) : 0.5,
    epistemicState: String(formData.get("epistemicState") ?? "SOURCE_FACT"),
    authority: formData.get("authority") ? Number(formData.get("authority")) : 50,
    support: String(formData.get("support") ?? "SUPPORTS"),
  });
  await (await evSvc()).addCitation(parsed);
}

export async function challengeEvidenceAction(formData: FormData) {
  const parsed = challengeSchema.parse({
    evidenceId: String(formData.get("evidenceId") ?? ""),
    setId: String(formData.get("setId") ?? "") || undefined,
    category: String(formData.get("category") ?? "OTHER"),
    reason: String(formData.get("reason") ?? ""),
    learnerNote: String(formData.get("learnerNote") ?? ""),
  });
  await (await evSvc()).challengeEvidence(parsed);
}

export async function resolveChallengeAction(formData: FormData) {
  const status = String(formData.get("status") ?? "UPHELD");
  await (await evSvc()).resolveChallenge(
    String(formData.get("challengeId") ?? ""),
    status === "OVERTURNED" ? "OVERTURNED" : "UPHELD",
  );
}

export async function upsertPolicyAction(formData: FormData) {
  const { workspaceId, userId, role } = await actionContext();
  const svc = new PolicyService(workspaceId, userId, role);
  const list = (v: FormDataEntryValue | null) =>
    String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = policySchema.parse({
    setId: String(formData.get("setId") ?? ""),
    approvedSources: list(formData.get("approvedSources")),
    restrictedSources: list(formData.get("restrictedSources")),
    requireTwoSources: formData.get("requireTwoSources") === "on",
    requireCurrentVersion: formData.get("requireCurrentVersion") === "on",
    requireHumanReview: formData.get("requireHumanReview") === "on",
    examMode: formData.get("examMode") === "on",
    examExternalSources: false,
    allowedInferenceLevel: String(formData.get("allowedInferenceLevel") ?? "marked"),
    minCoverage: formData.get("minCoverage") ? Number(formData.get("minCoverage")) : 0.5,
    minIndependentSources: formData.get("minIndependentSources") ? Number(formData.get("minIndependentSources")) : 1,
  });
  await svc.upsertPolicy(parsed);
}

export async function getEvalAction(setId: string) {
  const { workspaceId } = await actionContext();
  return new EvalService(workspaceId).workspaceEval(setId);
}

// --- Personal knowledge graph ---

const graphSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new LearnerGraphService(workspaceId, userId, role);
};
const misSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new MisconceptionService(workspaceId, userId, role);
};
const recSvc = async () => {
  const { workspaceId, userId } = await actionContext();
  return new RecommendationService(workspaceId, userId);
};

export async function graphObserveAction(input: {
  conceptId: string; dimension?: string; value: number; confidence?: number;
  sourceType?: string; sourceId?: string; context?: string; novelty?: number;
}) {
  const parsed = observeSchema.parse({
    conceptId: input.conceptId, dimension: input.dimension ?? "recall",
    value: input.value, confidence: input.confidence ?? 0.5,
    sourceType: input.sourceType ?? "assessment", sourceId: input.sourceId ?? "",
    context: input.context ?? "", novelty: input.novelty ?? 0,
  });
  return (await graphSvc()).observe(parsed);
}

export async function graphGoalAction(formData: FormData) {
  const parsed = goalSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    competencyKeys: String(formData.get("competencyKeys") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    deadline: String(formData.get("deadline") ?? "") || undefined,
  });
  await (await graphSvc()).createGoal(parsed);
}

export async function graphProfileAction(formData: FormData) {
  const parsed = profileSchema.parse({
    name: String(formData.get("name") ?? ""),
    kind: String(formData.get("kind") ?? "academic"),
  });
  await (await graphSvc()).createProfile(parsed);
}

export async function graphCorrectionAction(formData: FormData) {
  const parsed = correctionSchema.parse({
    targetType: String(formData.get("targetType") ?? "mastery"),
    targetId: String(formData.get("targetId") ?? ""),
    field: String(formData.get("field") ?? ""),
    newValue: String(formData.get("newValue") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    scope: String(formData.get("scope") ?? "profile"),
  });
  await (await graphSvc()).applyCorrection(parsed);
}

export async function graphUndoAction(formData: FormData) {
  await (await graphSvc()).undoCorrection(String(formData.get("id") ?? ""));
}

export async function recGenerateAction(setId: string) {
  return (await recSvc()).generate(setId);
}

export async function recStatusAction(id: string, status: "ACCEPTED" | "REJECTED" | "DISMISSED") {
  await (await recSvc()).setStatus(id, status);
}

export async function misReportAction(input: { conceptId: string; statement: string; detectedFrom?: string[] }) {
  const parsed = misconceptionSchema.parse({
    conceptId: input.conceptId, statement: input.statement,
    detectedFrom: input.detectedFrom ?? ["learner-report"],
  });
  return (await misSvc()).report(parsed);
}

export async function misAdvanceAction(id: string, to: string) {
  return (await misSvc()).advance(id, to);
}

export async function misAcknowledgeAction(id: string, acknowledged: boolean) {
  await (await misSvc()).acknowledge(id, acknowledged);
}

export async function getGraphDataAction(setId: string) {
  const g = await graphSvc();
  const r = await recSvc();
  const m = await misSvc();
  const [recommendations, paths, strategies, misconceptions, goals, changed, decaying] = await Promise.all([
    r.list(setId).catch(() => []),
    r.planPaths(setId).catch(() => []),
    r.strategyEffectiveness().catch(() => null),
    m.list().catch(() => []),
    g.listGoals().catch(() => []),
    g.whatChanged(30).catch(() => []),
    g.decayedSkills(10).catch(() => []),
  ]);
  return { recommendations, paths, strategies, misconceptions, goals, changed, decaying };
}

export async function getConceptDetailAction(conceptId: string) {
  const g = await graphSvc();
  const [history, cohort] = await Promise.all([
    g.conceptHistory(conceptId).catch(() => null),
    g.cohortComparison(conceptId).catch(() => null),
  ]);
  return { history, cohort };
}

export async function getGraphExportAction(level: string) {
  const g = await graphSvc();
  return g.exportGraph({ level });
}

export async function seedConceptsAction(formData: FormData) {
  await (await kgSvc()).seedFromSet(String(formData.get("setId") ?? ""));
}

export async function recordRetrievalAction(formData: FormData) {
  const conceptId = String(formData.get("conceptId") ?? "");
  const correct = String(formData.get("correct") ?? "true") === "true";
  await (await kgSvc()).recordRetrieval(conceptId, correct, correct ? 0.8 : 0.7, 3000);
}

export async function updateGoalAction(formData: FormData) {
  await (await svc()).updateGoal(
    String(formData.get("setId") ?? ""),
    String(formData.get("goal") ?? ""),
    String(formData.get("difficulty") ?? "NOVICE"),
  );
}

export async function startTutorSessionAction(formData: FormData) {
  const parsed = sessionSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    mode: String(formData.get("mode") ?? "DIRECT"),
  });
  await (await tuSvc()).startSession(parsed);
}

export async function rememberMemoryAction(formData: FormData) {
  const parsed = memorySchema.parse({
    key: String(formData.get("key") ?? ""),
    value: String(formData.get("value") ?? ""),
  });
  await (await tuSvc()).remember(parsed);
}

export async function forgetMemoryAction(formData: FormData) {
  await (await tuSvc()).forgetMemory(String(formData.get("id") ?? ""));
}

export async function logDecisionAction(formData: FormData) {
  const parsed = decisionSchema.parse({
    sessionId: String(formData.get("sessionId") ?? ""),
    detectedIssue: String(formData.get("detectedIssue") ?? ""),
    evidenceUsed: "",
    chosenStrategy: String(formData.get("chosenStrategy") ?? ""),
    alternatives: String(formData.get("alternatives") ?? ""),
  });
  await (await tuSvc()).logDecision(parsed);
}

export async function createAssessmentAction(formData: FormData) {
  const rawCriteria = String(formData.get("criteria") ?? "");
  const criteria = rawCriteria.split(",").map((chunk) => {
    const [label, max] = chunk.split(":").map((s) => s.trim());
    return { label: label || "Criterion", description: "", weight: 1, maxPoints: Number(max) || 10 };
  });
  const parsed = assessmentSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    title: String(formData.get("title") ?? ""),
    description: "",
    criteria,
  });
  await (await asSvc()).createAssessment(parsed);
}

export async function submitGradeAction(formData: FormData) {
  const parsed = gradeSchema.parse({
    assessmentId: String(formData.get("assessmentId") ?? ""),
    userId: String(formData.get("studentId") ?? ""),
    evidence: [{
      criterionId: String(formData.get("criterionId") ?? ""),
      points: Number(formData.get("points") ?? 0),
      evidenceQuote: "",
      reasoning: String(formData.get("reasoning") ?? ""),
    }],
    explanation: String(formData.get("reasoning") ?? ""),
  });
  await (await asSvc()).submitGrade(parsed);
}

export async function appealGradeAction(formData: FormData) {
  await (await asSvc()).appealGrade(String(formData.get("gradeId") ?? ""), String(formData.get("reason") ?? ""));
}

export async function recordQuizAttemptAction(input: {
  setId: string; mode?: "PRACTICE" | "EXAM" | "OPEN_BOOK" | "CLOSED_BOOK" | "ORAL";
  responses: { prompt: string; answer: string; picked: string; correct: boolean; responseTimeMs: number; confidence: number; conceptKey: string; itemId?: string }[];
  durationSec: number;
}) {
  const parsed = attemptSchema.parse({ setId: input.setId, mode: input.mode ?? "PRACTICE", responses: input.responses.map(({ itemId: _itemId, ...r }) => r), durationSec: input.durationSec });
  const attempt = await (await asSvc()).recordAttempt(parsed);
  // Feed spaced-repetition engine: map each response to a concept (fuzzy match
  // on conceptKey, item title, or label overlap) and record the retrieval outcome.
  try {
    const kg = await kgSvc();
    const g = await kg.graph(input.setId);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    for (const r of input.responses) {
      const hay = norm(`${r.prompt} ${r.conceptKey}`);
      const c = g.concepts.find((x) => x.key === r.conceptKey)
        ?? g.concepts.find((x) => { const l = norm(x.label); return l.length > 3 && hay.includes(l); })
        ?? g.concepts.find((x) => { const l = norm(x.label); return l.length > 3 && norm(r.prompt).includes(l); });
      if (c) await kg.recordRetrieval(c.id, r.correct, r.confidence, r.responseTimeMs);
    }
  } catch { /* adaptive update best-effort */ }
  await (await svc()).touchActivity(input.setId);
  return { score: attempt.score, total: attempt.total };
}

export async function getMaterialsAction(setId: string, kind: "summary" | "glossary" | "flashcards" | "practice-test" | "revision-sheet" | "viva") {
  const { workspaceId } = await actionContext();
  const { MaterialsService } = await import("@n0va/modules-booklm/materials");
  const svc = new MaterialsService(workspaceId);
  switch (kind) {
    case "summary": return svc.summary(setId);
    case "glossary": return svc.glossary(setId);
    case "flashcards": return svc.flashcards(setId);
    case "practice-test": return svc.practiceTest(setId);
    case "revision-sheet": return svc.revisionSheet(setId);
    case "viva": return svc.vivaQuestions(setId);
  }
}
