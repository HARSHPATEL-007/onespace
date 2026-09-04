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
import { updateLearningSetAction, addLearningItemAction, removeLearningItemAction, moveLearningItemAction, askGroundedAction, askGroundedActionV2, addCitationAction, challengeEvidenceAction, resolveChallengeAction, upsertPolicyAction, getEvalAction, seedConceptsAction, recordRetrievalAction, startTutorSessionAction, rememberMemoryAction, forgetMemoryAction, logDecisionAction, createAssessmentAction, submitGradeAction, appealGradeAction, recordQuizAttemptAction, getMaterialsAction, graphObserveAction, graphGoalAction, graphProfileAction, graphCorrectionAction, graphUndoAction, recGenerateAction, recStatusAction, misReportAction, misAdvanceAction, misAcknowledgeAction, getGraphDataAction, getConceptDetailAction, getGraphExportAction, adaptPlanAction, adaptRespondAction, adaptStateAction, adaptSessionAction, adaptSessionAcceptAction, adaptDueAction, adaptAnswerRetrievalAction, adaptElaborateAction, adaptControlAction, adaptControlsAction, adaptOverrideAction, adaptInterleaveAction, tutorAgentsAction, tutorTurnAction, tutorSessionDetailAction, tutorEscalationsAction, tutorResolveEscalationAction, tutorProgressAction, tutorModePolicyAction, tutorModeQualityAction, memoryListAction, memoryCreateAction, memoryConfirmAction, memoryCorrectAction, memoryDeleteAction, memoryPauseAction, memoryScopeAction, memoryForgetAction, memoryDoNotInferAction, memoryClassroomAction, memoryClassroomProposeAction, memoryClassroomApproveAction, memoryExportAction, memoryScanAction, decisionListAction, decisionCardAction, decisionControlAction, decisionDetailAction, decisionEducatorAction, decisionMetricsAction, assessProfileAction, assessLogEvidenceAction, assessReportsAction, assessBlueprintAction, assessBlueprintsAction, assessBlueprintCheckAction, integrityStatusAction, integrityAppealAction, integrityAppealsAction, integrityQueueAction, integrityReviewAction, integrityAppealResolveAction, integrityOverviewAction, integrityMetricsAction, integritySimilarityAction, integrityItemAction, integrityVariantAction, integrityItemStatusAction, integrityExposureAction, integrityAccommodationsAction, integrityAccommodationAction, integrityDefenseAction, integrityDefensesAction, integrityDefenseScoreAction } from "../actions";
import { PolicyService } from "@n0va/modules-booklm/policies";
import {
  gradeSubmitV2Action, gradeApproveCriterionAction, gradesForAssessmentAction,
  gradeHistoryAction, gradeExplainAction, gradeFreezeAction, gradeBumpVersionAction,
  gradeShadowAction, gradeApplyRegradeAction, gradeCalibrationSaveAction,
  gradeCalibrationAction, gradeBlindQueueAction, gradeDashboardAction,
  gradeFairnessListAction, gradeFairnessSaveAction, gradeFairnessMetricsAction, gradeFairnessResolveAction,
  insightsItemsAction, insightsClustersAction, insightsGainsAction,
  insightsMasteryAction, insightsCalibrationAction, insightsDropoffAction,
  insightsQualityAction, insightsWarningsAction, insightsOutcomesAction,
  insightsMapAction, insightsCohortAction, insightsDismissAction, insightsDefsAction,
  docDocumentsAction, docRegisterAction, docExtractAction, docQualityAction,
  docLayoutAction, docTablesAction, docFormulasAction, docFiguresAction,
  docCitationsAction, docTranscriptAction, docSegmentsAction, docCorrectAction,
  docCorrectionsAction, docCiteAction,
} from "../actions";

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

  const ev = new EvidenceService(workspaceId, userId, role);
  const pol = new PolicyService(workspaceId, userId, role);
  const kg = new KnowledgeService(workspaceId, userId);
  const tu = new TutorService(workspaceId, userId, role);
  const as = new AssessmentService(workspaceId, userId, role);
  const an = new LearningAnalyticsService(workspaceId);
  const isInstructor = ["admin", "owner", "teacher"].includes(role);

  const [docPicks, videoPicks, coverage, claims, graph, mastery, nextAction, sessions, memories, assessments, myGrades, cockpit, policy, challenges, graphData, decisions, decisionMetrics] = await Promise.all([
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
    pol.effectivePolicy(id).catch(() => null),
    ev.listChallenges(id).catch(() => []),
    getGraphDataAction(id).catch(() => null),
    decisionListAction(id).catch(() => []),
    decisionMetricsAction(id).catch(() => null),
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
        assessments={assessments.map((a) => ({
          id: a.id, title: a.title, description: a.description,
          criteria: a.criteria.map((c) => ({
            id: c.id, label: c.label, maxPoints: c.maxPoints, weight: c.weight,
            levels: (c.levels ?? null) as Record<string, string> | null,
            mustHave: c.mustHave ?? [], acceptableVariants: c.acceptableVariants ?? [],
            nonEvidence: c.nonEvidence ?? [],
          })),
        }))}
        myGrades={myGrades.map((g) => ({ id: g.id, totalPoints: g.totalPoints, maxPoints: g.maxPoints, explanation: g.explanation, approved: g.approved, assessment: g.assessment ? { title: g.assessment.title } : undefined }))}
        isInstructor={isInstructor}
        dashboard={dashboard}
        policy={policy}
        challenges={challenges.map((ch) => ({
          id: ch.id, evidenceId: ch.evidenceId, category: ch.category,
          reason: ch.reason, learnerNote: ch.learnerNote, status: ch.status,
          evidence: ch.evidence,
        }))}
        graphConcepts={graph.concepts.map((c) => ({ id: c.id, key: c.key, label: c.label }))}
        graphData={graphData}
        decisions={decisions}
        decisionMetrics={decisionMetrics}
        actions={{
          ask: askGroundedAction,
          askV2: askGroundedActionV2,
          addCitation: addCitationAction,
          challenge: challengeEvidenceAction,
          resolveChallenge: resolveChallengeAction,
          upsertPolicy: upsertPolicyAction,
          getEval: getEvalAction,
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
          graph: {
            generate: recGenerateAction,
            recStatus: recStatusAction,
            reportMisconception: misReportAction,
            acknowledge: misAcknowledgeAction,
            addGoal: graphGoalAction,
            observe: graphObserveAction,
            correct: graphCorrectionAction,
            undo: graphUndoAction,
            conceptDetail: getConceptDetailAction,
            exportGraph: getGraphExportAction,
          },
          adapt: {
            plan: adaptPlanAction,
            respond: adaptRespondAction,
            state: adaptStateAction,
            session: adaptSessionAction,
            sessionAccept: adaptSessionAcceptAction,
            due: adaptDueAction,
            answerRetrieval: adaptAnswerRetrievalAction,
            elaborate: adaptElaborateAction,
            controls: adaptControlsAction,
            setControl: adaptControlAction,
            interleave: adaptInterleaveAction,
            override: adaptOverrideAction,
            decisionControl: decisionControlAction,
          },
          tutorAgents: {
            turn: tutorTurnAction,
            detail: tutorSessionDetailAction,
            escalations: tutorEscalationsAction,
            resolveEscalation: tutorResolveEscalationAction,
            agents: tutorAgentsAction,
            progress: tutorProgressAction,
            modeQuality: tutorModeQualityAction,
            setModePolicy: tutorModePolicyAction,
            decisionControl: decisionControlAction,
          },
          memory: {
            list: memoryListAction,
            create: memoryCreateAction,
            confirm: memoryConfirmAction,
            correct: memoryCorrectAction,
            remove: memoryDeleteAction,
            pause: memoryPauseAction,
            setScope: memoryScopeAction,
            forget: memoryForgetAction,
            doNotInfer: memoryDoNotInferAction,
            classroom: memoryClassroomAction,
            classroomPropose: memoryClassroomProposeAction,
            classroomApprove: memoryClassroomApproveAction,
            exportAll: memoryExportAction,
            scan: memoryScanAction,
          },
          assess: {
            profile: assessProfileAction,
            logEvidence: assessLogEvidenceAction,
            reports: assessReportsAction,
            saveBlueprint: assessBlueprintAction,
            blueprints: assessBlueprintsAction,
            blueprintCheck: assessBlueprintCheckAction,
          },
          integrity: {
            status: integrityStatusAction,
            appeal: integrityAppealAction,
            appeals: integrityAppealsAction,
            queue: integrityQueueAction,
            review: integrityReviewAction,
            appealResolve: integrityAppealResolveAction,
            overview: integrityOverviewAction,
            metrics: integrityMetricsAction,
            similarity: integritySimilarityAction,
            createItem: integrityItemAction,
            makeVariant: integrityVariantAction,
            itemStatus: integrityItemStatusAction,
            exposure: integrityExposureAction,
            accommodations: integrityAccommodationsAction,
            addAccommodation: integrityAccommodationAction,
            scheduleDefense: integrityDefenseAction,
            defenses: integrityDefensesAction,
            scoreDefense: integrityDefenseScoreAction,
          },
          grading: {
            submit: gradeSubmitV2Action,
            approveCriterion: gradeApproveCriterionAction,
            grades: gradesForAssessmentAction,
            history: gradeHistoryAction,
            explain: gradeExplainAction,
            freeze: gradeFreezeAction,
            bumpVersion: gradeBumpVersionAction,
            shadow: gradeShadowAction,
            applyRegrade: gradeApplyRegradeAction,
            calibration: gradeCalibrationAction,
            saveCalibration: gradeCalibrationSaveAction,
            blindQueue: gradeBlindQueueAction,
            dashboard: gradeDashboardAction,
            fairnessList: gradeFairnessListAction,
            fairnessSave: gradeFairnessSaveAction,
            fairnessMetrics: gradeFairnessMetricsAction,
            fairnessResolve: gradeFairnessResolveAction,
          },
          insights: {
            items: insightsItemsAction,
            clusters: insightsClustersAction,
            gains: insightsGainsAction,
            mastery: insightsMasteryAction,
            calibration: insightsCalibrationAction,
            dropoff: insightsDropoffAction,
            quality: insightsQualityAction,
            warnings: insightsWarningsAction,
            outcomes: insightsOutcomesAction,
            map: insightsMapAction,
            cohort: insightsCohortAction,
            dismiss: insightsDismissAction,
            defs: insightsDefsAction,
          },
          sources: {
            list: docDocumentsAction,
            register: docRegisterAction,
            extract: docExtractAction,
            quality: docQualityAction,
            layout: docLayoutAction,
            tables: docTablesAction,
            formulas: docFormulasAction,
            figures: docFiguresAction,
            citations: docCitationsAction,
            transcript: docTranscriptAction,
            segments: docSegmentsAction,
            correct: docCorrectAction,
            corrections: docCorrectionsAction,
            cite: docCiteAction,
          },
          decisionDetail: decisionDetailAction,
          decisionEducator: decisionEducatorAction,
        }}
      />
    </>
  );
}
