export { LearningService } from "./server";
export {
  EvidenceService, citationSchema, challengeSchema, evidenceContentHash,
  EPISTEMIC_STATES, VERIFICATION_LABELS, EVIDENCE_TYPES, ANSWER_MODES, CHALLENGE_CATEGORIES,
  type CitationInput, type GroundedClaim,
} from "./evidence";
export { PolicyService, policySchema, type PolicyInput, type EffectivePolicy } from "./policies";
export { EvalService } from "./eval";
export { LearningAnalyticsService } from "./analytics";
export { QualityPanel, type QualityActions } from "./quality-ui";
export { QualityService, rightsSchema, freshnessRuleSchema } from "./quality";
export {
  provenanceSchema, provenanceSourceSchema, buildProvenanceRecord, lineageLink,
  auditArtifactCitations, assessFreshnessForRules, safetyDisposition,
  publicationDecisionForArtifact, ARTIFACT_POLICIES, DEFAULT_ARTIFACT_POLICY,
  readingAdaptPlan, decisionAuditEntry, approvalStateFromReviews,
  type ProvenanceRecord, type ProvenanceSource, type CitationSeverity,
  type ClaimCitationFinding, type ArtifactCitationAudit, type FreshnessRuleInput,
  type FreshnessMark, type FreshnessAssessment, type SafetyAction,
  type SafetyDisposition, type StakeLevel, type ArtifactPolicy,
  type ArtifactDecisionInput, type ReadingAdaptOp, type DecisionAuditEntry,
  type ApprovalState, type ApprovalStateResult,
} from "./quality-deep";
export { FactoryPanel, type FactoryActions } from "./factory-ui";
export {
  artifactEnvelope, assessmentLeakageCheck, translationTermCheck, genGapSheet, genEvidenceGraph,
  morphologyHint, blueprintConformance, verbalizeFormula,
  type ArtifactEnvelope, type LeakageFinding, type TermCheck,
  type BlueprintGap, type LabModality, type CodingTask, type RevisionVariant,
  type EvidenceActivity,
} from "./study-factory";
export { StudyFactoryService, generateSchema } from "./factory";
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
export { MemoryCenterPanel, ClassroomConflict, type MemoryActions, type MemoryCard } from "./memory-ui";
export { MemoryService, memoryRecordSchema, classroomSchema } from "./memories";
export {
  explainUsage, promotionEligibility, enforceScopes, classroomConflictNote,
  type PromotionEvidence, type ScopeCheckRow, type ScopeCheckResult,
} from "./memory-trust";
export { TutorAgentsPanel, ModeContractView, type TutorAgentActions } from "./tutor-ui";
export { OrchestratorService, runTurnSchema, modePolicySchema } from "./orchestrate";
export { AdaptivePanel, type AdaptActions } from "./adapt-ui";
export {
  AGENT_DEFS, classifyIntent, selectWorkflow, AUTHORITY_HIERARCHY,
  resolveConflictRank, escalationTriggers, verdictFor, socraticShouldStop,
  AGENT_TIMEOUT_MS, withAgentTimeout, resolveClaimConflict, foldSessionEvents,
  type AgentDef, type Intent, type Workflow, type FactVerdict,
  type ClaimResolution, type SessionFold,
} from "./tutor-agents";
export {
  MODE_CONTRACTS, ALL_MODES, selectMode, evaluateExit, transitionMessage,
  MODE_SAFETY_RULES, MODE_MEMORY, socraticHint, FADING_STAGES,
  fadingSupportCredit, practiceFeedback, ERROR_LABELS, classifyErrorLabel,
  debuggingReport, researchArtifact, peerReviewFeedback, ORAL_PROGRESSION,
  ORAL_FAIRNESS, oralExamPlan, DEFAULT_EXAM_POLICY, examSessionTransition,
  examGuard, ACCESSIBILITY_CONTROLS, adaptationEquivalenceCheck,
  errorPatternReport, transitionTrigger, detectMisconceptionFromReasoning,
  type TeachingMode, type ModeContract, type FadingStage, type ErrorLabel,
  type DebuggingReport, type ResearchArtifact, type PeerFeedback,
  type ExamPolicy, type ExamSessionState, type AccessibilityControl,
  type ErrorPatternReport, type TransitionTrigger,
} from "./tutor-modes";
export {
  ISSUES, EVIDENCE_RELIABILITY, strategyScore, confidenceBand,
  mustShowAlternatives, adaptationRecord, governanceChecks, outcomeQuality,
  detectIssue, selectStrategy, aggregateConfidence, scoreEvidence,
  checkOutcome, decisionTransition,
  type IssueType, type EvidenceKind, type StrategyFit, type ConfidenceBand,
  type RankedStrategy, type OutcomeResult, type DecisionState, type DecisionEvent,
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
  TELEMETRY_ALLOWLIST, telemetryEventAllowed, codeProcessSummary,
  browserControlEvent, alternativeExplanations,
  type TriageLevel, type IntegritySignal, type VariantSpec,
  type CodeProcessSummary,
} from "./integrity";
export {
  gradeUncertainty, classifyPartialCredit, approvalGate, explainGrade,
  disparity, disparityOfMeans, applyRegradeRule, validateRubricContract,
  doublePenaltyCheck, nonEvidenceCheck, scoreReasoningPath,
  calibrationDeploymentGate, gradingSourceCheck, DEFAULT_DEPLOYMENT_THRESHOLDS,
  type ErrorKind as GradeErrorKind, type RubricContractCriterion,
  type RubricContractInput, type ReasoningStage, type DeploymentThresholds,
  type SourceCheckInput,
} from "./assess-grading";
export {
  envelope, wilson, meanCI, difficulty, difficultyBand, discrimination,
  pointBiserial, discriminationDiagnosis, absoluteGain, normalizedGain,
  meanCalibrationError, calibrationPattern, funnel, ABANDON_REASONS,
  suppressible, meetsMastery, evaluateWarnings, warningDisclaimer,
  raschAbility, itemInformation, guessingFloor, stratify, stratifiedRate,
  classifyClusterType, assignIntervention, distractorAnalysis, timeVariance,
  readingBurden,
  METRIC_DEFS, COHORT_MIN_CELL,
  type MetricEnvelope, type WarningKind, type MisconceptionClusterType,
  type AssignedIntervention, type DistractorAnalysis,
} from "./assess-analytics";
export {
  parseMarkdownTables, parseCodeFences, detectCodeLanguage, parseLatex,
  parseCitations, matchBibliography, detectLanguage, detectMixedBlocks,
  detectSequenceGaps, detectTruncation, figureNumberGaps,
  aggregateQuality, parseTranscriptTimestamps,
} from "./doc-parse";
export {
  detectOcrConfusions, assessHandwritingBlock, validateFormulaRecord,
  figureRecord, chartValueWording, auditTableCells, repeatedHeaders,
  citationStage, assessDocumentIntegrity, chunkProvenance,
  lowConfidenceDisclosure, alignTranscriptToSlides, checkCodeExtraction,
  type OcrConfusion, type HandwritingAssessment, type FormulaValidation,
  type ChartValueKind, type FigureRecord, type TableCellIssue,
  type TableCellAudit, type CitationStage, type CitationStageResult,
  type DocumentStatus, type IntegrityWarning, type IntegrityAssessment,
  type ChunkProvenance, type AlignedSegment, type CodeExtractionCheck,
} from "./doc-understanding";
export {
  jaccard, textSimilarity, classifyDuplicate, extractPropositions,
  detectContradiction, auditCitations, readingProfile, scanBias, scanCultural,
  auditAccessibility, rightsDecision, scanSafety, freshnessState,
  publicationDecision,
  type DuplicateKind, type ContradictionKind as QcContradictionKind, type RightsStatus,
} from "./quality-checks";
export {
  buildStudyModel, genSummary, genGlossary, genConceptMap, genPrereqMap,
  genFlashcards, genPracticeTest, genCaseStudy, genDebate, genLab, genCoding,
  genViva, genRevision, genAudioScript, genDeck, genTeachingNotes,
  adaptAccessibility, adaptAge, adaptLanguage,
  validateArtifact, consistencyCheck, reviewPolicy,
  type ModelNode, type Audience, type TestBlueprint, type SummaryDepth,
} from "./study-factory";
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
  scoreElaboration, assembleSession, remediationPath, repairPathOptions,
  LADDER, DIFFICULTY_DIMS,
  type ErrorType, type DifficultyDim, type RemediationStage, type RepairOption,
} from "./adaptive";
export {
  decomposeClaims, detectQualifiers, detectCausalOverreach, freshnessScore, FRESHNESS_LAMBDAS,
  compositeRerank, DEFAULT_WEIGHTS, detectQueryType, policyForQueryType,
  deriveVerificationLabel, epistemicStateFor, scoreEvidenceQuality,
  classifyContradiction, MODE_RULES, examHints,
  auditQualifierDrift, detectSourceGaps, buildEvidenceCredential,
  type EpistemicState, type VerificationLabel, type AnswerMode, type QueryType,
  type ContradictionKind, type AtomicClaim, type EvidenceQualityScores,
  type QualifierDrift, type SourceGap, type SourceGapInput,
  type CredentialClaim, type EvidenceCredential,
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
export { QueryPlanView, EvidenceCardView, EvidenceResultsList, ValidityBadge, PersonalizationControls, type RetrievalUiActions } from "./retrieval-ui";
export { RetrievalWorkbench, type WorkbenchActions, type WorkbenchQueryResult } from "./retrieval-workbench";
export {
  HybridRetrievalService, classifyHybridIntent, extractEntities, detectAmbiguity,
  keywordScore, vectorProxyScore, descendToSpan, traverseGraph, graphRelevance,
  temporalLabel, temporalFit, tableCellScore, normalizeFormula, formulaScore,
  imageScore, mediaScore, codeScore, fusionScore, rrfFuse, diversify, explainResult,
  passesAcl, sanitizeForRender, personalizationBoost, federatedSearch,
  validateEvidencePackage, evaluateRetrieval, applyDeepFilterGate, extractFigureLabels,
  jointRerankScore, definitionalBonus, buildStudyPath,
  DEFAULT_FUSION_WEIGHTS, RETRIEVAL_ROUTES, RETRIEVAL_BENCHMARKS,
  EVIDENCE_ACTIONS, NO_EVIDENCE_MESSAGE,
  indexedUnitSchema, retrievalRequestSchema, metadataFilterSchema,
  temporalQuerySchema, personalizationSchema,
  type IndexedUnit, type RetrievalRequest, type QueryPlan, type EvidenceCard,
  type FusionSignals, type FusionWeights, type GraphPath, type FederatedHit,
  type DeepFilterReport, type StudyPath, type StudyPathNode,
} from "./hybrid-retrieval";
export { LearningCockpit, EvidencePanel, ConceptsPanel, TutorPanel, GradesPanel, BooklmEnhancements, MaterialsPanel, GovernancePanel, type V2Answer, type V2Claim, type PolicyData, type ChallengeRow } from "./enhanced";
export {
  deepFilterSchema, applyMetadataFilters, metadataFitScore, geoScore,
  compareTemporalVersions, tableYearMax, tablePercentCells, tableYearDelta,
  codeSafetyCheck, mediaCitation, figureRole, rightsFor,
  buildCitationGroundedAnswer, FederatedRegistry, RetrievalQueryStore, globalQueryStore,
  evaluateRetrievalDeep, runBenchmarkSuite, validateIndexedUnit, fusionExplainDeep,
  dedupeFederatedHits, tuneWeightsFromFeedback, translateQueryFor,
  federatedRankScore, rankFederated, personalizationImpact, mediaChapters,
  RETRIEVAL_BENCHMARK_SETS, NO_EVIDENCE_MESSAGE_DEEP,
  type DeepFilters, type FilterableMeta, type FilterVerdict, type GeoPoint,
  type TemporalDoc, type TemporalComparison, type StructuredCell, type CodeSafetyVerdict,
  type FigureRole, type RightsInfo, type RetrievalGroundedClaim, type GroundedAnswer,
  type ConnectorCaps, type RegistryConnector, type FederatedAuditEntry,
  type DeepEvalInput, type DeepEvalResult, type BenchmarkSet, type BenchmarkCase,
  type BenchmarkReport, type StoredQuery, type DedupedFederatedHit, type FeedbackTally,
  type FederatedRankSignals, type PersonalizationImpact, type MediaChapter,
} from "./retrieval-deep";
