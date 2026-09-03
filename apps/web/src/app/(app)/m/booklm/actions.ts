"use server";

import { LearningService, learningSetSchema, learningItemSchema } from "@n0va/modules-booklm/server";
import { EvidenceService, citationSchema } from "@n0va/modules-booklm/evidence";
import { KnowledgeService } from "@n0va/modules-booklm/knowledge";
import { TutorService, sessionSchema, memorySchema, decisionSchema } from "@n0va/modules-booklm/tutor";
import { AssessmentService, assessmentSchema, gradeSchema, attemptSchema } from "@n0va/modules-booklm/assessment";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new LearningService(workspaceId, userId, role);
};
const evSvc = async () => {
  const { workspaceId, userId } = await actionContext();
  return new EvidenceService(workspaceId, userId);
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

export async function addCitationAction(formData: FormData) {
  const setId = String(formData.get("setId") ?? "") || undefined;
  const parsed = citationSchema.parse({
    setId,
    claim: String(formData.get("claim") ?? ""),
    quote: String(formData.get("quote") ?? ""),
    sourceKind: "NOTE",
    sourceTitle: String(formData.get("sourceTitle") ?? ""),
    locatorPage: formData.get("locatorPage") ? Number(formData.get("locatorPage")) : undefined,
    authority: formData.get("authority") ? Number(formData.get("authority")) : 50,
    support: String(formData.get("support") ?? "SUPPORTS"),
  });
  await (await evSvc()).addCitation(parsed);
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
  responses: { prompt: string; answer: string; picked: string; correct: boolean; responseTimeMs: number; confidence: number; conceptKey: string }[];
  durationSec: number;
}) {
  const parsed = attemptSchema.parse({ setId: input.setId, mode: input.mode ?? "PRACTICE", responses: input.responses, durationSec: input.durationSec });
  const attempt = await (await asSvc()).recordAttempt(parsed);
  // Feed spaced-repetition engine: map conceptKey -> concept -> retrieval outcome
  try {
    const kg = await kgSvc();
    const g = await kg.graph(input.setId);
    for (const r of input.responses) {
      const c = g.concepts.find((x) => x.key === r.conceptKey);
      if (c) await kg.recordRetrieval(c.id, r.correct, r.confidence, r.responseTimeMs);
    }
  } catch { /* adaptive update best-effort */ }
  await (await svc()).touchActivity(input.setId);
  return { score: attempt.score, total: attempt.total };
}
