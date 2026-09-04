"use server";

import { LearningService, learningSetSchema, learningItemSchema } from "@n0va/modules-booklm/server";
import { EvidenceService, citationSchema, challengeSchema, ANSWER_MODES } from "@n0va/modules-booklm/evidence";
import { PolicyService, policySchema } from "@n0va/modules-booklm/policies";
import { EvalService } from "@n0va/modules-booklm/eval";
import { LearnerGraphService, profileSchema, goalSchema, observeSchema, correctionSchema } from "@n0va/modules-booklm/graph";
import { MisconceptionService, misconceptionSchema } from "@n0va/modules-booklm/misconceptions";
import { RecommendationService } from "@n0va/modules-booklm/recommend";
import { AdaptiveService } from "@n0va/modules-booklm/adapt";
import { OrchestratorService, runTurnSchema, modePolicySchema } from "@n0va/modules-booklm/orchestrate";
import { MemoryService } from "@n0va/modules-booklm/memories";
import { DecisionService } from "@n0va/modules-booklm/decisions";
import { AssessProfileService } from "@n0va/modules-booklm/assess-profile";
import { IntegrityService } from "@n0va/modules-booklm/integrity-service";
import { GradingService } from "@n0va/modules-booklm/grading";
import { AssessInsightsService } from "@n0va/modules-booklm/assess-insights";
import { DocIngestService } from "@n0va/modules-booklm/doc-ingest";
import { StudyFactoryService } from "@n0va/modules-booklm/factory";
import { QualityService } from "@n0va/modules-booklm/quality";
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

// --- Adaptive loop ---

const adaptSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AdaptiveService(workspaceId, userId, role);
};

export async function adaptPlanAction(conceptId: string, setId: string, minutes = 25) {
  return (await adaptSvc()).planLoop({ conceptId, setId, minutes });
}

export async function adaptRespondAction(input: {
  loopId: string; correct: boolean; answer?: string; responseTimeMs?: number;
  hintsUsed?: number; confidence?: number; novelty?: number;
  overridden?: boolean; overrideReason?: string;
}) {
  return (await adaptSvc()).respondLoop({
    loopId: input.loopId, correct: input.correct,
    answer: input.answer ?? "", reasoning: "",
    responseTimeMs: input.responseTimeMs ?? 0, hintsUsed: input.hintsUsed ?? 0,
    confidence: input.confidence ?? 0.5, novelty: input.novelty ?? 0,
    overridden: input.overridden ?? false, overrideReason: input.overrideReason ?? "",
  });
}

export async function adaptStateAction(conceptId: string) {
  return (await adaptSvc()).stateVector(conceptId);
}

export async function adaptSessionAction(setId: string, minutes: number) {
  return (await adaptSvc()).planSession(setId, minutes);
}

export async function adaptSessionAcceptAction(planId: string, accepted: boolean, modification: string) {
  await (await adaptSvc()).acceptSessionPlan(planId, accepted, modification);
}

export async function adaptDueAction() {
  const due = await (await adaptSvc()).retrievalDue(10);
  return due.map((d) => ({
    itemKey: d.itemKey, conceptId: d.conceptId, format: d.format,
    stabilityDays: d.stabilityDays, retrievability: d.retrievability,
    nextDue: d.nextDue.toISOString(),
  }));
}

export async function adaptAnswerRetrievalAction(itemKey: string, conceptId: string, correct: boolean) {
  return (await adaptSvc()).answerRetrieval(itemKey, conceptId, correct, 3000, 0);
}

export async function adaptElaborateAction(conceptId: string, text: string) {
  return (await adaptSvc()).scoreElaboration(conceptId, text, []);
}

export async function adaptControlAction(control: string, value: unknown) {
  return (await adaptSvc()).setControl(control, value);
}

export async function adaptControlsAction() {
  return (await adaptSvc()).getControls();
}

export async function adaptOverrideAction(formData: FormData) {
  const { overrideSchema } = await import("@n0va/modules-booklm/adapt");
  const parsed = overrideSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    targetType: String(formData.get("targetType") ?? "concept"),
    targetId: String(formData.get("targetId") ?? ""),
    kind: String(formData.get("kind") ?? "SET_LEVEL"),
    reason: String(formData.get("reason") ?? ""),
    scope: String(formData.get("scope") ?? "CONCEPT"),
    expiresInDays: formData.get("expiresInDays") ? Number(formData.get("expiresInDays")) : undefined,
  });
  await (await adaptSvc()).createOverride(parsed);
}

export async function adaptInterleaveAction(setId: string, level: "low" | "moderate" | "high") {
  return (await adaptSvc()).interleaveSet(setId, level);
}

// --- Multi-agent tutor ---

const orchSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new OrchestratorService(workspaceId, userId, role);
};

export async function tutorAgentsAction() {
  const agents = await (await orchSvc()).listAgents();
  if (agents.length === 0) return (await orchSvc()).seedRegistry();
  return agents;
}

export async function tutorTurnAction(input: { sessionId?: string; setId: string; conceptId?: string; message: string; mode?: string }) {
  const { ALL_MODES } = await import("@n0va/modules-booklm/tutor-modes");
  const parsed = runTurnSchema.parse({
    sessionId: input.sessionId || undefined,
    setId: input.setId || undefined,
    conceptId: input.conceptId || undefined,
    message: input.message,
    mode: input.mode && (ALL_MODES as string[]).includes(input.mode) ? input.mode : undefined,
  });
  return (await orchSvc()).runTurn(parsed);
}

export async function tutorProgressAction(sessionId: string, signals: Record<string, boolean>) {
  return (await orchSvc()).reportProgress(sessionId, signals);
}

export async function tutorModePolicyAction(formData: FormData) {
  const parsed = modePolicySchema.parse({
    setId: String(formData.get("setId") ?? ""),
    mode: String(formData.get("mode") ?? "DIRECT"),
    enabled: formData.get("enabled") !== "off",
    isDefault: formData.get("isDefault") === "on",
  });
  await (await orchSvc()).setModePolicy(parsed);
}

export async function tutorModeQualityAction(setId: string) {
  return (await orchSvc()).modeQuality(setId);
}

export async function tutorSessionDetailAction(sessionId: string) {
  const d = await (await orchSvc()).sessionDetail(sessionId);
  return {
    degraded: d.degraded, intent: d.intent,
    tasks: d.tasks.map((t) => ({
      id: t.id, agentKey: t.agentKey, intent: t.intent, status: t.status,
      warnings: t.warnings, nextActions: t.nextActions,
      modelVersion: t.modelVersion, latencyMs: t.latencyMs, error: t.error,
    })),
    events: d.events.map((e) => ({
      id: e.id, type: e.type, actor: e.actor, createdAt: e.createdAt.toISOString(), payload: e.payload,
    })),
    escalations: d.escalations.map((e) => ({ id: e.id, status: e.status })),
  };
}

export async function tutorEscalationsAction() {
  const rows = await (await orchSvc()).listEscalations();
  return rows.map((e) => ({
    id: e.id, topic: e.topic, issue: e.issue, status: e.status,
    urgency: e.urgency, recommendation: e.recommendation,
    learnerVisible: e.learnerVisible, createdAt: e.createdAt.toISOString(),
  }));
}

export async function tutorResolveEscalationAction(formData: FormData) {
  await (await orchSvc()).resolveEscalation(
    String(formData.get("id") ?? ""),
    String(formData.get("resolution") ?? ""),
    String(formData.get("status") ?? "RESOLVED") === "DISMISSED" ? "DISMISSED" : "RESOLVED",
  );
}

// --- Tutor memory center ---

const memSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new MemoryService(workspaceId, userId, role);
};

export async function memoryListAction(scope?: string, search?: string) {
  const rows = await (await memSvc()).list({ scope, search });
  return rows.map((r) => ({
    id: r.id, key: r.key, value: r.value, scope: r.scope, status: r.status,
    confidence: r.confidence, confidenceLevel: r.confidenceLevel,
    classification: r.classification, provenance: r.provenance as { kind?: string; sourceRef?: string; createdBy?: string; model?: string } | null,
    evidenceRefs: r.evidenceRefs, visibility: r.visibility,
    lastVerifiedAt: r.lastVerifiedAt?.toISOString() ?? null,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    paused: r.paused, sensitive: r.sensitive, courseId: r.courseId,
    dependentRecommendations: r.dependentRecommendations,
  }));
}

export async function memoryCreateAction(input: {
  key: string; value: string; scope?: string; classification?: string;
  courseId?: string; confirmed?: boolean; expiresInDays?: number;
}) {
  const { memoryRecordSchema } = await import("@n0va/modules-booklm/memories");
  const parsed = memoryRecordSchema.parse({
    key: input.key, value: input.value,
    scope: input.scope ?? "SESSION",
    classification: input.classification ?? "LEARNER_DECLARED",
    courseId: input.courseId, confirmed: input.confirmed ?? true,
    expiresInDays: input.expiresInDays,
  });
  return (await memSvc()).create(parsed);
}

export async function memoryConfirmAction(id: string, scope?: string) {
  return (await memSvc()).confirm(id, scope);
}

export async function memoryCorrectAction(id: string, correction: string, newValue: string, reason: string) {
  return (await memSvc()).correct(id, correction, newValue, reason);
}

export async function memoryDeleteAction(id: string) {
  return (await memSvc()).remove(id);
}

export async function memoryPauseAction(id: string, paused: boolean) {
  await (await memSvc()).setPaused(id, paused);
}

export async function memoryScopeAction(id: string, scope: string, confirmed: boolean) {
  return (await memSvc()).setScope(id, scope, confirmed);
}

export async function memoryForgetAction() {
  return (await memSvc()).forgetConversation("");
}

export async function memoryDoNotInferAction(key: string, on: boolean) {
  return (await memSvc()).setDoNotInfer(key, on);
}

export async function memoryClassroomAction(setId: string) {
  const rows = await (await memSvc()).listClassroom(setId, "default", true);
  return rows.map((r) => ({
    id: r.id, key: r.key, value: r.value, status: r.status,
    version: r.version, section: r.section,
    expiresAt: r.expiresAt?.toISOString() ?? null,
  }));
}

export async function memoryClassroomProposeAction(formData: FormData) {
  const { classroomSchema } = await import("@n0va/modules-booklm/memories");
  const parsed = classroomSchema.parse({
    setId: String(formData.get("setId") ?? ""),
    key: String(formData.get("key") ?? ""),
    value: String(formData.get("value") ?? ""),
  });
  await (await memSvc()).proposeClassroom(parsed);
}

export async function memoryClassroomApproveAction(id: string, approve: boolean) {
  await (await memSvc()).approveClassroom(id, approve);
}

export async function memoryExportAction() {
  return (await memSvc()).exportAll();
}

export async function memoryScanAction(text: string) {
  return (await memSvc()).scanDocument(text.slice(0, 20000));
}

// --- Explainable pedagogy ---

const decSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new DecisionService(workspaceId, userId, role);
};

export async function decisionListAction(setId: string) {
  const rows = await (await decSvc()).list(setId);
  return rows.map((r) => ({
    id: r.id, trigger: r.trigger, issueType: r.issueType,
    issueDescription: r.issueDescription, severity: r.severity,
    chosenMode: r.chosenMode, chosenAction: r.chosenAction,
    confOverall: r.confOverall, status: r.status,
    createdAt: r.createdAt.toISOString(),
    reviews: r.reviews.map((v) => ({
      predictedOutcome: v.predictedOutcome, observedOutcome: v.observedOutcome,
      predictionError: v.predictionError, effectiveness: v.effectiveness,
      nextAction: v.nextAction,
    })),
  }));
}

export async function decisionCardAction(id: string) {
  return (await decSvc()).card(id);
}

export async function decisionControlAction(id: string, control: string, note: string, modifiedAction = "") {
  return (await decSvc()).control(id, control, note, modifiedAction);
}

export async function decisionEducatorAction(formData: FormData) {
  return (await decSvc()).educator(
    String(formData.get("id") ?? ""),
    String(formData.get("control") ?? "approve"),
    String(formData.get("note") ?? ""),
    { mode: String(formData.get("mode") ?? ""), action: String(formData.get("action") ?? "") },
  );
}

export async function decisionMetricsAction(setId: string) {
  return (await decSvc()).metrics(setId);
}

// --- Deep assessment profile ---

const assessSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AssessProfileService(workspaceId, userId, role);
};

export async function assessProfileAction(setId: string, conceptKey?: string) {
  return (await assessSvc()).profile(setId, conceptKey);
}

export async function assessLogEvidenceAction(input: {
  setId: string; conceptKey: string; conceptId?: string; dimension: string;
  score: number; correct?: boolean; supportLevel?: string; condition?: string;
  transferLevel?: number; prompt?: string; answer?: string; confidence?: number;
  reasonableMethod?: boolean;
}) {
  const { evidenceSchema } = await import("@n0va/modules-booklm/assess-profile");
  const parsed = evidenceSchema.parse({
    setId: input.setId, conceptKey: input.conceptKey, conceptId: input.conceptId,
    dimension: input.dimension, score: input.score, correct: input.correct ?? input.score >= 0.6,
    supportLevel: input.supportLevel ?? "independent", condition: input.condition ?? "unspecified",
    transferLevel: input.transferLevel, prompt: input.prompt ?? "", answer: input.answer ?? "",
    confidence: input.confidence ?? 0.5, reasonableMethod: input.reasonableMethod ?? true,
  });
  return (await assessSvc()).recordEvidence(parsed);
}

export async function assessReportsAction(setId: string, conceptKey: string, conceptLabel: string) {
  const s = await assessSvc();
  const [learner, educator, sequence] = await Promise.all([
    s.learnerReport(setId, conceptKey, conceptLabel),
    s.educatorReport(setId, conceptKey, conceptLabel),
    s.sequence(setId, conceptKey),
  ]);
  return { learner, educator, sequence };
}

export async function assessBlueprintAction(formData: FormData) {
  const { blueprintSchema } = await import("@n0va/modules-booklm/assess-profile");
  const weights: Record<string, number> = {};
  const minimums: Record<string, number> = {};
  for (const [k, v] of formData.entries()) {
    const key = String(k);
    if (key.startsWith("w_")) weights[key.slice(2)] = Number(v) || 0;
    if (key.startsWith("m_")) minimums[key.slice(2)] = Math.max(0, parseInt(String(v), 10) || 0);
  }
  const parsed = blueprintSchema.parse({
    setId: String(formData.get("setId") ?? ""),
    objective: String(formData.get("objective") ?? ""),
    weights, minimums,
  });
  await (await assessSvc()).upsertBlueprint(parsed);
}

export async function assessBlueprintsAction(setId: string) {
  const rows = await (await assessSvc()).listBlueprints(setId);
  return rows.map((r) => ({
    id: r.id, objective: r.objective,
    weights: (r.weights ?? {}) as Record<string, number>,
    minimums: (r.minimums ?? {}) as Record<string, number>,
  }));
}

export async function assessBlueprintCheckAction(setId: string, objective: string) {
  return (await assessSvc()).blueprintCheck(setId, objective);
}

// --- Assessment integrity ---

const integSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new IntegrityService(workspaceId, userId, role);
};

export async function integrityStatusAction() {
  const rows = await (await integSvc()).learnerStatus();
  return rows.map((r) => ({
    id: r.id, academic: r.academic, integrity: r.integrity,
    checked: r.checked, notUsed: r.notUsed,
    accommodation: r.accommodation as Record<string, unknown>,
    appealDeadline: r.appealDeadline?.toISOString() ?? null,
    appeals: r.appeals.map((a) => ({ id: a.id, status: a.status })),
    penaltyPending: r.penaltyPending,
  }));
}

export async function integrityAppealAction(recordId: string, reason: string, evidence: string) {
  return (await integSvc()).fileAppeal(recordId, reason, evidence);
}

export async function integrityAppealsAction() {
  const rows = await (await integSvc()).listAppeals();
  return rows.map((a) => ({
    id: a.id, recordId: a.recordId, reason: a.reason, evidence: a.evidence,
    status: a.status, resolution: a.resolution,
    createdAt: a.createdAt.toISOString(),
  }));
}

export async function integrityQueueAction() {
  const rows = await (await integSvc()).reviewQueue();
  return rows.map((r) => ({
    id: r.id, userId: r.userId, status: r.status,
    academicScore: r.academicScore, grader: r.grader,
    signals: (r.signals ?? []) as { type: string; severity: string; evidence: string; confidence: number }[],
    excludedSignals: r.excludedSignals,
    accommodation: r.accommodation as Record<string, unknown> | null,
    technicalEvents: (r.technicalEvents ?? []) as unknown[],
    appealDeadline: r.appealDeadline?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function integrityReviewAction(recordId: string, decision: "CLEARED" | "VIOLATION", reason: string) {
  await (await integSvc()).reviewDecision(recordId, decision, reason);
}

export async function integrityAppealResolveAction(appealId: string, status: "UPHELD" | "OVERTURNED", resolution: string) {
  await (await integSvc()).resolveAppeal(appealId, status, resolution);
}

export async function integrityOverviewAction(setId: string) {
  return (await integSvc()).instructorOverview(setId);
}

export async function integrityMetricsAction() {
  return (await integSvc()).qualityMetrics();
}

export async function integritySimilarityAction(setId: string, text: string) {
  return (await integSvc()).analyzeSubmission(setId, text.slice(0, 8000));
}

export async function integrityItemAction(formData: FormData) {
  const { itemSchema } = await import("@n0va/modules-booklm/integrity-service");
  const parsed = itemSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    templateKey: String(formData.get("templateKey") ?? ""),
    prompt: String(formData.get("prompt") ?? ""),
  });
  await (await integSvc()).createItem(parsed);
}

export async function integrityVariantAction(templateKey: string, setId: string) {
  return (await integSvc()).makeVariant(templateKey, undefined, setId);
}

export async function integrityItemStatusAction(id: string, status: "ACTIVE" | "FROZEN" | "RETIRED" | "INVALIDATED") {
  await (await integSvc()).setItemStatus(id, status);
}

export async function integrityExposureAction(templateKey: string) {
  return (await integSvc()).exposureMap(templateKey);
}

export async function integrityAccommodationsAction() {
  const rows = await (await integSvc()).listAccommodations();
  return rows.map((a) => ({
    id: a.id, userId: a.userId, effects: a.effects, active: a.active,
    expiresAt: a.expiresAt?.toISOString() ?? null,
  }));
}

export async function integrityAccommodationAction(formData: FormData) {
  const { accommodationSchema } = await import("@n0va/modules-booklm/integrity-service");
  const parsed = accommodationSchema.parse({
    userId: String(formData.get("userId") ?? ""),
    setId: String(formData.get("setId") ?? "") || undefined,
    effects: String(formData.get("effects") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  await (await integSvc()).upsertAccommodation(parsed);
}

export async function integrityDefenseAction(formData: FormData) {
  const { defenseSchema } = await import("@n0va/modules-booklm/integrity-service");
  const parsed = defenseSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    topic: String(formData.get("topic") ?? ""),
    consentRecording: formData.get("consentRecording") === "on",
  });
  await (await integSvc()).scheduleDefense(parsed);
}

export async function integrityDefensesAction() {
  const rows = await (await integSvc()).listDefenses();
  return rows.map((d) => ({
    id: d.id, topic: d.topic, status: d.status, userId: d.userId,
    scores: (d.scores ?? {}) as Record<string, number | string>,
    consentRecording: d.consentRecording,
  }));
}

export async function integrityDefenseScoreAction(id: string, formData: FormData) {
  const scores: Record<string, number> = {};
  for (const k of ["conceptual_accuracy", "decision_justification", "adaptation_to_counterexample", "uncertainty_awareness", "communication_clarity"]) {
    const v = formData.get(k);
    if (v !== null && v !== "") scores[k] = Number(v);
  }
  await (await integSvc()).scoreDefense(id, scores, String(formData.get("transcript") ?? ""), String(formData.get("note") ?? ""));
}

// --- Evidence-based grading ---

const gradeSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new GradingService(workspaceId, userId, role);
};

export async function gradeSubmitV2Action(input: {
  assessmentId: string; userId: string; explanation?: string;
  evidence: { criterionId: string; points: number; evidenceQuote?: string; reasoning?: string; location?: string; supports?: string; strength?: number; confidence?: number; subscores?: Record<string, number>; errorKind?: string; diagnosis?: string }[];
}) {
  const { gradeV2Schema } = await import("@n0va/modules-booklm/grading");
  const parsed = gradeV2Schema.parse({
    assessmentId: input.assessmentId, userId: input.userId,
    explanation: input.explanation ?? "", evidence: input.evidence,
  });
  return (await gradeSvc()).submitGradeV2(parsed);
}

export async function gradeApproveCriterionAction(gradeId: string, criterionId: string, approved: boolean, points: string, note: string) {
  return (await gradeSvc()).approveCriterion(
    gradeId, criterionId, approved,
    points === "" ? undefined : Number(points), note,
  );
}

export async function gradeHistoryAction(gradeId: string) {
  const g = await (await gradeSvc()).gradeHistory(gradeId);
  return {
    total: g.totalPoints, max: g.maxPoints, approved: g.approved,
    uncertainty: g.uncertainty, reviewStatus: g.reviewStatus,
    assessment: g.assessment.title,
    evidence: g.evidence.map((e) => ({
      criterionId: e.criterionId, label: e.criterion.label, points: e.points,
      max: e.criterion.maxPoints, quote: e.evidenceQuote, reasoning: e.reasoning,
      location: e.location, supports: e.supports, reviewStatus: e.reviewStatus,
    })),
    audits: g.audits.map((a) => ({
      action: a.action, detail: a.detail, previousScore: a.previousScore,
      newScore: a.newScore, reason: a.reason, learnerNotified: a.learnerNotified,
      actorId: a.actorId, at: a.createdAt.toISOString(),
    })),
  };
}

export async function gradeExplainAction(gradeId: string) {
  return (await gradeSvc()).explainGrade(gradeId);
}

export async function gradePartialCreditAction(input: { finalCorrect: boolean; structureSound: boolean }) {
  return (await gradeSvc()).partialCredit({ ...input, earlyError: false, wrongModel: false, sufficientEvidence: true, alternativeValid: false });
}

export async function gradeFreezeAction(assessmentId: string, frozen: boolean) {
  await (await gradeSvc()).freezeRubric(assessmentId, frozen);
}

export async function gradeBumpVersionAction(assessmentId: string) {
  await (await gradeSvc()).bumpRubricVersion(assessmentId);
}

export async function gradeShadowAction(assessmentId: string) {
  return (await gradeSvc()).shadowRegrade(assessmentId);
}

export async function gradeApplyRegradeAction(assessmentId: string, gradeIds: string[]) {
  return (await gradeSvc()).applyRegrade(assessmentId, gradeIds, true, "instructor-approved regrade");
}

export async function gradeCalibrationSaveAction(formData: FormData) {
  const { calibrationSchema } = await import("@n0va/modules-booklm/grading");
  const scores: Record<string, number> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("s_") && v !== "") scores[k.slice(2)] = Number(v);
  }
  const parsed = calibrationSchema.parse({
    assessmentId: String(formData.get("assessmentId") ?? ""),
    response: String(formData.get("response") ?? ""),
    instructorScores: scores,
  });
  await (await gradeSvc()).saveCalibration(parsed);
}

export async function gradeCalibrationAction(assessmentId: string) {
  const [examples, metrics] = await Promise.all([
    (await gradeSvc()).listCalibration(assessmentId),
    (await gradeSvc()).calibrationMetrics(assessmentId),
  ]);
  return {
    examples: examples.map((e) => ({
      id: e.id, response: e.response.slice(0, 300),
      instructorScores: e.instructorScores, aiScores: e.aiScores, status: e.status,
    })),
    metrics,
  };
}

export async function gradeBlindQueueAction() {
  return (await gradeSvc()).blindQueue();
}

export async function gradeDashboardAction(assessmentId: string) {
  return (await gradeSvc()).dashboard(assessmentId);
}

export async function gradeFairnessListAction(setId: string) {
  const rows = await (await gradeSvc()).listFairness(setId);
  return rows.map((r) => ({
    id: r.id, scope: r.scope, dimension: r.dimension,
    groups: (r.groups ?? []) as { name: string; mean: number; sd: number; n: number }[],
    finding: r.finding, action: r.action, status: r.status,
  }));
}

export async function gradeFairnessSaveAction(formData: FormData) {
  const { fairnessSchema } = await import("@n0va/modules-booklm/grading");
  let groups: { name: string; mean: number; sd: number; n: number }[] = [];
  try {
    groups = JSON.parse(String(formData.get("groups") ?? "[]"));
  } catch { /* invalid groups rejected by schema */ }
  const parsed = fairnessSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    scope: String(formData.get("scope") ?? ""),
    dimension: String(formData.get("dimension") ?? ""),
    groups, finding: String(formData.get("finding") ?? ""), action: "",
  });
  await (await gradeSvc()).saveFairness(parsed);
}

export async function gradeFairnessMetricsAction(groups: { name: string; mean: number; sd: number; n: number }[]) {
  return (await gradeSvc()).fairnessMetrics(groups);
}

export async function gradeFairnessResolveAction(id: string, status: string, action: string) {
  await (await gradeSvc()).resolveFairness(id, status, action);
}

export async function gradesForAssessmentAction(assessmentId: string) {
  const { AssessmentService } = await import("@n0va/modules-booklm/assessment");
  const { workspaceId, userId, role } = await actionContext();
  const rows = await new AssessmentService(workspaceId, userId, role).gradesForAssessment(assessmentId);
  return rows.map((g) => ({
    id: g.id, totalPoints: g.totalPoints, maxPoints: g.maxPoints,
    explanation: g.explanation, approved: g.approved,
    uncertainty: (g as { uncertainty?: number }).uncertainty ?? 0.5,
    reviewStatus: (g as { reviewStatus?: string }).reviewStatus ?? "",
    learner: `${(g.user.email ?? "").slice(0, 3)}***`,
    criteria: g.evidence.map((e) => ({
      criterionId: e.criterionId, label: e.criterion.label,
      points: e.points, max: e.criterion.maxPoints,
    })),
  }));
}

// --- Assessment analytics ---

const insightSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AssessInsightsService(workspaceId, userId, role);
};

export async function insightsItemsAction(setId: string) {
  return (await insightSvc()).itemAnalysis(setId, 90);
}

export async function insightsClustersAction(setId: string) {
  return (await insightSvc()).misconceptionClusters(setId);
}

export async function insightsGainsAction(setId: string) {
  return (await insightSvc()).gainByConcept(setId, 90);
}

export async function insightsMasteryAction(setId: string, conceptKey?: string) {
  return (await insightSvc()).timeToMastery(setId, conceptKey);
}

export async function insightsCalibrationAction(setId: string, conceptKey?: string) {
  return (await insightSvc()).calibration(setId, conceptKey);
}

export async function insightsDropoffAction(setId: string) {
  return (await insightSvc()).dropoff(setId, 90);
}

export async function insightsQualityAction(setId: string) {
  return (await insightSvc()).questionQuality(setId, 90);
}

export async function insightsWarningsAction(setId: string) {
  const rows = await (await insightSvc()).earlyWarnings(setId);
  return rows.map((r) => ({
    userId: r.userId, warnings: r.warnings.map((w) => ({
      kind: w.kind, evidence: w.evidence, severity: w.severity,
      disclaimer: w.disclaimer, suggestion: w.suggestion, dismissHint: w.dismissHint,
    })),
  }));
}

export async function insightsOutcomesAction(setId: string) {
  return (await insightSvc()).interventionOutcomes(setId);
}

export async function insightsMapAction(setId: string) {
  return (await insightSvc()).learnerMap(setId);
}

export async function insightsCohortAction(setA: string, setB: string, conceptKey: string) {
  return (await insightSvc()).cohortReport(setA, setB, conceptKey, 90);
}

export async function insightsDismissAction(conceptKey: string, reason: string) {
  await (await insightSvc()).dismissWarning(conceptKey, reason);
}

export async function insightsDefsAction() {
  return (await insightSvc()).metricDefinitions();
}

// --- Document understanding ---

const docSvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new DocIngestService(workspaceId, userId, role);
};

export async function docRegisterAction(input: { setId: string; title: string; format?: string; pageCount?: number; content?: string }) {
  const { registerSchema } = await import("@n0va/modules-booklm/doc-ingest");
  const parsed = registerSchema.parse({
    setId: input.setId || undefined, title: input.title,
    format: input.format ?? "txt", pageCount: input.pageCount,
    content: (input.content ?? "").slice(0, 200000),
  });
  return (await docSvc()).register(parsed);
}

export async function docDocumentsAction(setId: string) {
  const rows = await (await docSvc()).documents(setId);
  return rows.map((d) => ({
    id: d.id, title: d.title, format: d.format, status: d.status,
    version: d.version, pageCount: d.pageCount, language: d.language,
    quality: (d.quality ?? {}) as { confidence?: Record<string, number>; overallStatus?: string; warnings?: { type: string; locations: string[]; reason: string }[] },
  }));
}

export async function docExtractAction(documentId: string, text: string) {
  return (await docSvc()).ingestText(documentId, { text: text.slice(0, 500000) });
}

export async function docQualityAction(documentId: string) {
  const r = await (await docSvc()).qualityReport(documentId);
  return {
    document: r.document,
    quality: (r.quality ?? null) as {
      confidence?: Record<string, number>; overallStatus?: string;
      warnings?: { type: string; locations: string[]; reason: string }[];
    } | null,
    counts: r.counts,
    reviewItems: r.reviewItems,
  };
}

export async function docLayoutAction(documentId: string) {
  const rows = await (await docSvc()).layout(documentId);
  return rows.map((b) => ({
    blockKey: b.blockKey, kind: b.kind, page: b.page, readingOrder: b.readingOrder,
    sectionPath: b.sectionPath, text: b.text.slice(0, 600),
    language: b.language, confidence: b.confidence, corrected: b.corrected,
  }));
}

export async function docTablesAction(documentId: string) {
  const rows = await (await docSvc()).tables(documentId);
  return rows.map((t) => ({
    tableKey: t.tableKey, caption: t.caption, headers: t.headers,
    cells: (t.cells ?? []) as { row: number; column: number; text: string; confidence?: number }[][],
    footnotes: t.footnotes, units: t.units, page: t.page,
    confidence: t.confidence, needsReview: t.needsReview,
  }));
}

export async function docFormulasAction(documentId: string) {
  const rows = await (await docSvc()).formulas(documentId);
  return rows.map((f) => ({
    formulaKey: f.formulaKey, latex: f.latex, plain: f.plain,
    variables: f.variables, page: f.page, confidence: f.confidence,
    validation: (f.validation ?? null) as { confusions?: string[] } | null,
    needsReview: f.needsReview,
  }));
}

export async function docFiguresAction(documentId: string) {
  const rows = await (await docSvc()).figures(documentId);
  return rows.map((f) => ({
    figureKey: f.figureKey, kind: f.kind, caption: f.caption,
    page: f.page, confidence: f.confidence,
  }));
}

export async function docCitationsAction(documentId: string) {
  const rows = await (await docSvc()).citations(documentId);
  return rows.map((c) => ({
    citationKey: c.citationKey, rawText: c.rawText,
    normalized: (c.normalized ?? null) as { authors?: string[]; year?: string; doi?: string } | null,
    citationType: c.citationType, resolution: c.resolution,
    page: c.page, confidence: c.confidence,
  }));
}

export async function docTranscriptAction(documentId: string, text: string, format: "srt" | "vtt" | "plain") {
  return (await docSvc()).uploadTranscript(documentId, text.slice(0, 200000), format);
}

export async function docSegmentsAction(documentId: string) {
  const rows = await (await docSvc()).transcript(documentId);
  return rows.map((s) => ({
    segmentKey: s.segmentKey, start: s.startSec, end: s.endSec,
    speaker: s.speaker, text: s.text.slice(0, 500),
    confidence: s.confidence, linkedSlide: s.linkedSlide,
  }));
}

export async function docCorrectAction(documentId: string, input: { location?: string; targetType: string; targetId: string; after: string; reason?: string }) {
  const { docCorrectionSchema } = await import("@n0va/modules-booklm/doc-ingest");
  const parsed = docCorrectionSchema.parse({
    location: input.location ?? "", targetType: input.targetType,
    targetId: input.targetId, after: input.after, reason: input.reason ?? "",
  });
  return (await docSvc()).correct(documentId, parsed);
}

export async function docCorrectionsAction(documentId: string) {
  return (await docSvc()).corrections(documentId);
}

export async function docCiteAction(documentId: string, blockKey: string, claim: string, setId: string) {
  return (await docSvc()).citeBlock(documentId, blockKey, claim, setId);
}

// --- Study-material factory ---

const factorySvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new StudyFactoryService(workspaceId, userId, role);
};

export async function factoryBuildAction(setId: string) {
  const { model, prereqs } = await (await factorySvc()).buildModel(setId);
  return { modelId: model.id, nodes: (model.nodes as unknown[]).length, prereqs: prereqs.length };
}

export async function factoryGenerateAction(input: {
  setId: string; type: string; title?: string; depth?: string; topic?: string;
  language?: string; objectives?: string[]; gaps?: string[]; highStakes?: boolean;
}) {
  const { generateSchema } = await import("@n0va/modules-booklm/factory");
  const parsed = generateSchema.parse({
    setId: input.setId, type: input.type, title: input.title ?? "",
    depth: input.depth ?? "standard", topic: input.topic ?? "",
    language: input.language ?? "python", objectives: input.objectives ?? [],
    gaps: input.gaps ?? [],
    highStakes: input.highStakes ?? false,
  });
  const res = await (await factorySvc()).generate(parsed);
  return {
    artifact: {
      id: res.artifact.id, type: res.artifact.type, title: res.artifact.title,
      reviewStatus: String(res.artifact.reviewStatus), version: res.artifact.version,
      extractionConfidence: res.artifact.extractionConfidence,
      sourceVersions: res.artifact.sourceVersions, concepts: res.artifact.concepts.slice(0, 8),
      updatedAt: new Date().toISOString(),
    },
    content: res.artifact.content as Record<string, unknown>,
    validation: res.validation, route: res.route, autoPublished: res.autoPublished,
    envelope: res.envelope,
  };
}

export async function factoryEnvelopeAction(id: string) {
  return (await factorySvc()).envelope(id);
}

export async function factoryLeakageAction(setId: string) {
  return (await factorySvc()).leakage(setId);
}

export async function factoryPackAction(setId: string, gaps: string[] = [], title?: string) {
  return (await factorySvc()).pack(setId, gaps.slice(0, 20), title);
}

export async function factoryListAction(setId: string) {
  const rows = await (await factorySvc()).list(setId);
  return rows.map((a) => ({
    id: a.id, type: a.type, title: a.title,
    reviewStatus: String(a.reviewStatus), version: a.version,
    extractionConfidence: a.extractionConfidence,
    sourceVersions: a.sourceVersions, concepts: a.concepts.slice(0, 8),
    updatedAt: a.updatedAt.toISOString(),
  }));
}

export async function factoryGetAction(id: string) {
  const a = await (await factorySvc()).get(id);
  return {
    id: a.id, type: a.type, title: a.title,
    content: (a.content ?? {}) as Record<string, unknown>,
    sourceDocs: a.sourceDocs, sourceVersions: a.sourceVersions,
    concepts: a.concepts, objectives: a.objectives,
    extractionConfidence: a.extractionConfidence,
    reviewStatus: String(a.reviewStatus), version: a.version,
  };
}

export async function factoryValidateAction(id: string) {
  return (await factorySvc()).validate(id);
}

export async function factoryReviewAction(id: string, approve: boolean) {
  await (await factorySvc()).review(id, approve);
}

export async function factoryPublishAction(id: string) {
  await (await factorySvc()).publish(id);
}

export async function factoryTransformAction(id: string, kind: "translate" | "adapt" | "accessibility", opts: Record<string, unknown>) {
  return (await factorySvc()).transform(id, kind, opts);
}

export async function factoryRegenerateAction(id: string) {
  return (await factorySvc()).regenerate(id);
}

export async function factoryProvenanceAction(id: string) {
  return (await factorySvc()).provenance(id);
}

export async function factoryImpactAction(documentKey: string) {
  return (await factorySvc()).impact(documentKey);
}

export async function factoryConsistencyAction(setId: string) {
  return (await factorySvc()).consistency(setId);
}

// --- Quality control ---

const qualitySvc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new QualityService(workspaceId, userId, role);
};

export async function qualityReportArtifactAction(artifactId: string) {
  const { report, publication } = await (await qualitySvc()).reportArtifact(artifactId);
  return {
    reportId: report.id, decision: report.decision,
    dimensions: report.dimensions as Record<string, { status: string }>,
    publication,
  };
}

export async function qualityReportDocumentAction(documentId: string) {
  const { report } = await (await qualitySvc()).reportDocument(documentId);
  return { reportId: report.id, decision: report.decision };
}

export async function qualityReportsAction(setId: string) {
  const rows = await (await qualitySvc()).setReports(setId);
  return rows.map((r) => ({
    id: r.id, subjectType: r.subjectType, subjectId: r.subjectId,
    decision: r.decision,
    dimensions: (r.dimensions ?? {}) as Record<string, { status: string }>,
    createdAt: r.createdAt.toISOString(),
    reviews: r.reviews.map((v) => ({ queue: v.queue, status: v.status })),
  }));
}

export async function qualityQueueAction() {
  const rows = await (await qualitySvc()).reviewQueue();
  return rows.map((r) => ({
    id: r.id, reportId: r.reportId, queue: r.queue, status: r.status,
    note: r.note, createdAt: r.createdAt.toISOString(),
  }));
}

export async function qualityDecideAction(id: string, status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "WAIVED", note: string) {
  await (await qualitySvc()).decideReview(id, status, note);
}

export async function qualityRightsAction() {
  const rows = await (await qualitySvc()).rightsLedger();
  return rows.map((r) => ({
    id: r.id, sourceKey: r.sourceKey, license: r.license,
    derivativeAllowed: r.derivativeAllowed, attributionRequired: r.attributionRequired,
    scope: r.scope, expiresAt: r.expiresAt?.toISOString() ?? null,
  }));
}

export async function qualityRightsSaveAction(formData: FormData) {
  const { rightsSchema } = await import("@n0va/modules-booklm/quality");
  const parsed = rightsSchema.parse({
    sourceKey: String(formData.get("sourceKey") ?? ""),
    license: String(formData.get("license") ?? "unknown"),
    derivativeAllowed: formData.get("derivativeAllowed") === "on",
    attributionRequired: formData.get("attributionRequired") === "on",
    scope: String(formData.get("scope") ?? ""),
    evidence: String(formData.get("evidence") ?? ""),
  });
  await (await qualitySvc()).upsertRights(parsed);
}

export async function qualityFreshnessAction(setId: string) {
  return (await qualitySvc()).listFreshnessRules(setId);
}

export async function qualityFreshnessSaveAction(formData: FormData) {
  const { freshnessRuleSchema } = await import("@n0va/modules-booklm/quality");
  const parsed = freshnessRuleSchema.parse({
    setId: String(formData.get("setId") ?? "") || undefined,
    claimType: String(formData.get("claimType") ?? "general"),
    jurisdiction: String(formData.get("jurisdiction") ?? ""),
    validDays: Number(formData.get("validDays")) || 365,
    refreshDays: Number(formData.get("refreshDays")) || 90,
    requiredReviewer: String(formData.get("requiredReviewer") ?? ""),
  });
  await (await qualitySvc()).upsertFreshnessRule(parsed);
}

export async function qualityImpactAction(setId: string, source: string, kind: string) {
  return (await qualitySvc()).impactAnalysis(setId, source, kind);
}

export async function qualityMetricsAction(setId: string) {
  return (await qualitySvc()).qualityMetrics(setId);
}

export async function qualityProvenanceAction(input: unknown) {
  return (await qualitySvc()).registerProvenance(input);
}

export async function qualityProvenanceGetAction(contentId: string) {
  const r = await (await qualitySvc()).provenanceFor(contentId);
  if (!r) return null;
  return { id: r.id, subjectId: r.subjectId, decision: r.decision, dimensions: r.dimensions, createdAt: r.createdAt.toISOString() };
}

export async function qualityApprovalRequestAction(reportId: string, queues: string[], deadline?: string) {
  return (await qualitySvc()).requestApproval(reportId, queues, deadline);
}

export async function qualityApprovalStateAction(reportId: string, deadline?: string) {
  return (await qualitySvc()).approvalState(reportId, deadline);
}

const ARTIFACT_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "SUPERSEDED", "REJECTED"] as const;

export async function qualityArtifactStatusAction(artifactId: string, status: string) {
  if (!(ARTIFACT_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid artifact status");
  return (await qualitySvc()).setArtifactReviewStatus(artifactId, status as (typeof ARTIFACT_STATUSES)[number]);
}

export async function qualityFreshnessAssessAction(setId: string) {
  return (await qualitySvc()).freshnessAssessment(setId);
}

export async function qualityReadingAdaptAction(text: string, target: string) {
  return (await qualitySvc()).adaptReadingPlan(text, target);
}

export async function decisionDetailAction(id: string) {
  const r = await (await decSvc()).get(id);
  return {
    trigger: r.trigger, issueType: r.issueType, issueDescription: r.issueDescription,
    severity: r.severity,
    evidence: ((r.evidence ?? []) as { type: string; ref: string; result: string; context: string; at: string; invalid?: boolean }[]),
    chosenMode: r.chosenMode, chosenAction: r.chosenAction,
    alternatives: ((r.alternatives ?? []) as { strategy: string; reasonNotSelected: string; risks: string[]; score?: number; factors?: { name: string; value: number }[] }[]),
    expectedTarget: r.expectedTarget, successMeasure: r.successMeasure,
    confOverall: r.confOverall, confIssue: r.confIssue, confStrategy: r.confStrategy, confOutcome: r.confOutcome,
    status: r.status, controlBy: r.controlBy, controlNote: r.controlNote, version: r.version,
    provenance: r.provenance as { agents?: string[]; stateSnapshot?: string; policySnapshot?: string } | null,
    reviews: r.reviews.map((v) => ({
      predictedOutcome: v.predictedOutcome, observedOutcome: v.observedOutcome,
      predictionError: v.predictionError, effectiveness: v.effectiveness, nextAction: v.nextAction,
    })),
  };
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
