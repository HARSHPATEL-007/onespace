export { LearningService } from "./server";
export {
  EvidenceService, citationSchema, challengeSchema, evidenceContentHash,
  EPISTEMIC_STATES, VERIFICATION_LABELS, EVIDENCE_TYPES, ANSWER_MODES, CHALLENGE_CATEGORIES,
  type CitationInput, type GroundedClaim,
} from "./evidence";
export { PolicyService, policySchema, type PolicyInput, type EffectivePolicy } from "./policies";
export { EvalService } from "./eval";
export { LearningAnalyticsService } from "./analytics";
export { SourcesPanel, type SourcesActions } from "./sources-ui";
export { DocIngestService, registerSchema, ingestSchema, docCorrectionSchema, sha256 } from "./doc-ingest";
export { AnalyticsPanel, type InsightsActions } from "./insights-ui";
export { AssessInsightsService, windowSchema } from "./assess-insights";
export { GradingPanel, type GradingActions } from "./grading-ui";
export { GradingService, richEvidenceSchema, gradeV2Schema, calibrationSchema, fairnessSchema } from "./grading";
export { IntegrityPanel, type IntegrityActions } from "./integrity-ui";
export { IntegrityService, policySchemaIntegrity, itemSchema, signalSchema, recordSchema, accommodationSchema, defenseSchema } from "./integrity-service";
export { AssessmentProfilePanel, type AssessActions } from "./assess-ui";
export { AssessProfileService, evidenceSchema, blueprintSchema } from "./assess-profile";
export { ExplanationCard, DecisionQueue, EducatorDecisionPanel, DecisionMetricsView, DecisionGovernance, type DecisionCardData } from "./pedagogy-ui";
export { DecisionService, pedagogyDecisionSchema, reviewSchema, evidenceItemSchema, alternativeSchema } from "./decisions";
export { MemoryCenterPanel, type MemoryActions, type MemoryCard } from "./memory-ui";
export { MemoryService, memoryRecordSchema, classroomSchema } from "./memories";
export { TutorAgentsPanel, type TutorAgentActions } from "./tutor-ui";
export { OrchestratorService, runTurnSchema, modePolicySchema } from "./orchestrate";
export { AdaptivePanel, type AdaptActions } from "./adapt-ui";
export {
  AGENT_DEFS, classifyIntent, selectWorkflow, AUTHORITY_HIERARCHY,
  resolveConflictRank, escalationTriggers, verdictFor, socraticShouldStop,
  type AgentDef, type Intent, type Workflow, type FactVerdict,
} from "./tutor-agents";
export {
  MODE_CONTRACTS, ALL_MODES, selectMode, evaluateExit, transitionMessage,
  MODE_SAFETY_RULES, MODE_MEMORY, socraticHint,
  type TeachingMode, type ModeContract,
} from "./tutor-modes";
export {
  ISSUES, EVIDENCE_RELIABILITY, strategyScore, confidenceBand,
  mustShowAlternatives, adaptationRecord, governanceChecks, outcomeQuality,
  type IssueType, type EvidenceKind, type StrategyFit, type ConfidenceBand,
} from "./pedagogy";
export {
  ASSESS_DIMS, DIM_QUESTIONS, scoreDimension, PROJECT_WEIGHTS, scoreProject,
  calibrationError, aggregateDimension, conditionSplit, decisionRule,
  ASSESS_SEQUENCE, validateBlueprint, compositeGrade,
  type AssessDim,
} from "./assess-dims";
export {
  triageLevel, reviewRequired, EXCLUDED_SIGNALS, buildVariant,
  analyzeSimilarity, authorshipFollowUp, interpretWithAccommodation, buildNotice,
  type TriageLevel, type IntegritySignal, type VariantSpec,
} from "./integrity";
export {
  gradeUncertainty, classifyPartialCredit, approvalGate, explainGrade,
  disparity, disparityOfMeans, applyRegradeRule,
  type ErrorKind as GradeErrorKind,
} from "./assess-grading";
export {
  envelope, wilson, meanCI, difficulty, difficultyBand, discrimination,
  pointBiserial, discriminationDiagnosis, absoluteGain, normalizedGain,
  meanCalibrationError, calibrationPattern, funnel, ABANDON_REASONS,
  suppressible, meetsMastery, evaluateWarnings, warningDisclaimer,
  METRIC_DEFS, COHORT_MIN_CELL,
  type MetricEnvelope, type WarningKind,
} from "./assess-analytics";
export {
  parseMarkdownTables, parseCodeFences, detectCodeLanguage, parseLatex,
  parseCitations, matchBibliography, detectLanguage, detectMixedBlocks,
  detectSequenceGaps, detectTruncation, figureNumberGaps,
  aggregateQuality, parseTranscriptTimestamps,
} from "./doc-parse";
export {
  classifyDocSpan, trustRank, injectionScan, confidenceLevelFor,
  canTransition, scopeRank, mayPromoteScope, retrievalOrder, rankMemories,
  resolveContradiction, agentAccess, snapshotScopes,
  type DocSpanLabel, type ConfidenceLevel, type MemoryLifecycle, type Access,
} from "./memory-trust";
export { AdaptiveService, loopPlanSchema, loopRespondSchema, policySchemaAdaptive, overrideSchema } from "./adapt";
export {
  nextDifficulty, dimensionToMove, classifyError, REMEDIATION,
  sequenceModality, planInterleave, estimateGain, buildDiagnostic,
  scoreElaboration, assembleSession, LADDER, DIFFICULTY_DIMS,
  type ErrorType, type DifficultyDim,
} from "./adaptive";
export {
  decomposeClaims, detectQualifiers, detectCausalOverreach, freshnessScore, FRESHNESS_LAMBDAS,
  compositeRerank, DEFAULT_WEIGHTS, detectQueryType, policyForQueryType,
  deriveVerificationLabel, epistemicStateFor, scoreEvidenceQuality,
  classifyContradiction, MODE_RULES, examHints,
  type EpistemicState, type VerificationLabel, type AnswerMode, type QueryType,
  type ContradictionKind, type AtomicClaim, type EvidenceQualityScores,
} from "./epistemics";
export { KnowledgeService, conceptSchema, edgeSchema } from "./knowledge";
export { TutorService, sessionSchema, memorySchema, decisionSchema, TUTOR_MODES } from "./tutor";
export { AssessmentService, assessmentSchema, gradeSchema, attemptSchema } from "./assessment";
export { MaterialsService, materialsToMarkdown, type MaterialsKind } from "./materials";
export { buildAttemptResponses, type QuizAnswerEntry, type QuizQuestionLite } from "./pure";
export { LearnerGraphPanel, type GraphData, type GraphActions, type GraphConcept } from "./graph-ui";
export { MisconceptionService, misconceptionSchema, learnerStageLabel } from "./misconceptions";
export { RecommendationService } from "./recommend";
export {
  DIMENSIONS, decayRich, estimateInterval, transitionRequires, inferStatus,
  learnerStatusLabel, cohortBand, cohortSafe, COHORT_MIN_N,
  assemblePath, strategySummary,
  type Dimension, type MasteryState,
} from "./learner";
export { LearningSets, LearningSetView } from "./components";
export { LearningCockpit, EvidencePanel, ConceptsPanel, TutorPanel, GradesPanel, BooklmEnhancements, MaterialsPanel, GovernancePanel, type V2Answer, type V2Claim, type PolicyData, type ChallengeRow } from "./enhanced";
