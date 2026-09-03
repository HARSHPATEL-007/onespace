import { notFound } from "next/navigation";
import { LearningService } from "@n0va/modules-booklm/server";
import { EvidenceService } from "@n0va/modules-booklm/evidence";
import { KnowledgeService } from "@n0va/modules-booklm/knowledge";
import { TutorService, TUTOR_MODES } from "@n0va/modules-booklm/tutor";
import { AssessmentService } from "@n0va/modules-booklm/assessment";
import { LearningAnalyticsService } from "@n0va/modules-booklm/analytics";
import { LearningSetView } from "@n0va/modules-booklm/components";
import { BooklmEnhancements } from "@n0va/modules-booklm/enhanced";
import { requireWorkspace } from "@/lib/context";
import { updateLearningSetAction, addLearningItemAction, removeLearningItemAction, moveLearningItemAction, askGroundedAction, addCitationAction, seedConceptsAction, recordRetrievalAction, startTutorSessionAction, rememberMemoryAction, forgetMemoryAction, logDecisionAction, createAssessmentAction, submitGradeAction, appealGradeAction, recordQuizAttemptAction, getMaterialsAction } from "../actions";

export default async function LearningSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new LearningService(workspaceId, userId, role);

  let set;
  try {
    set = await svc.get(id);
  } catch {
    notFound();
  }
  if (!set) notFound();

  const ev = new EvidenceService(workspaceId, userId);
  const kg = new KnowledgeService(workspaceId, userId);
  const tu = new TutorService(workspaceId, userId, role);
  const as = new AssessmentService(workspaceId, userId, role);
  const an = new LearningAnalyticsService(workspaceId);
  const isInstructor = ["admin", "owner", "teacher"].includes(role);

  const [docPicks, videoPicks, coverage, claims, graph, mastery, nextAction, sessions, memories, assessments, myGrades, cockpit] = await Promise.all([
    svc.pickDocs(),
    svc.pickVideos(),
    ev.coverage(id).catch(() => null),
    ev.claimGraph(id).catch(() => []),
    kg.graph(id).catch(() => ({ concepts: [], edges: [] })),
    kg.masteryForUser(id).catch(() => []),
    kg.nextAction(id).catch(() => null),
    tu.listSessions().catch(() => []),
    tu.memories().catch(() => []),
    as.listAssessments(id).catch(() => []),
    as.myGrades().catch(() => []),
    an.learnerCockpit(id, userId).catch(() => null),
  ]);
  const dashboard = isInstructor ? await an.instructorDashboard(id).catch(() => null) : null;

  const masteryByConcept = new Map(mastery.map((m) => [m.conceptId, m]));
  const concepts = graph.concepts.map((c) => ({
    id: c.id, key: c.key, label: c.label, kind: c.kind,
    mastery: masteryByConcept.get(c.id)?.mastery,
    misconceptionFlag: masteryByConcept.get(c.id)?.misconceptionFlag,
    nextReviewAt: masteryByConcept.get(c.id)?.nextReviewAt?.toISOString(),
  }));

  return (
    <>
      <LearningSetView
        set={set}
        docPicks={docPicks}
        videoPicks={videoPicks}
        actions={{
          updateMeta: updateLearningSetAction,
          addItem: addLearningItemAction,
          removeItem: removeLearningItemAction,
          moveItem: moveLearningItemAction,
          recordAttempt: recordQuizAttemptAction,
        }}
      />
      <BooklmEnhancements
        setId={id}
        cockpit={cockpit}
        nextAction={nextAction}
        coverage={coverage}
        claims={claims}
        concepts={concepts}
        modes={[...TUTOR_MODES]}
        sessions={sessions.map((s) => ({ id: s.id, mode: s.mode, agent: s.agent, status: s.status, summary: s.summary, decisions: s.decisions }))}
        memories={memories.map((m) => ({ id: m.id, scope: m.scope, key: m.key, value: m.value, confidence: m.confidence, provenance: m.provenance }))}
        assessments={assessments.map((a) => ({ id: a.id, title: a.title, description: a.description, criteria: a.criteria }))}
        myGrades={myGrades.map((g) => ({ id: g.id, totalPoints: g.totalPoints, maxPoints: g.maxPoints, explanation: g.explanation, approved: g.approved, assessment: g.assessment ? { title: g.assessment.title } : undefined }))}
        isInstructor={isInstructor}
        dashboard={dashboard}
        actions={{
          ask: askGroundedAction,
          addCitation: addCitationAction,
          seed: seedConceptsAction,
          record: recordRetrievalAction,
          start: startTutorSessionAction,
          remember: rememberMemoryAction,
          forget: forgetMemoryAction,
          decide: logDecisionAction,
          createAssessment: createAssessmentAction,
          grade: submitGradeAction,
          appeal: appealGradeAction,
          materials: getMaterialsAction,
        }}
      />
    </>
  );
}
