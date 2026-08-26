export { AniService } from "./server";
export { AniChat } from "./components";
export type { AniActions } from "./components";
export {
  N0VA_ANI,
  createANI,
  classifyIntent,
  createWorkspaceContext,
  buildWorkspaceContext,
  parseAniMentions,
  detectThreatsInInput,
  INJECTION_PATTERNS,
} from "./engine";
export type {
  ANIConfig,
  ANIResponse,
  ANISnapshot,
  WorkspaceContext,
  UserIntent,
  ConsciousnessState,
  IntentClass,
  InterfaceMode,
  ConsciousnessTier,
} from "./engine";
export {
  ConsciousnessStack,
  PerceptualAwareness,
  WorkingMemory,
  LongTermMemory,
  Metacognition,
  ConsciousnessIntegration,
} from "./consciousness";
export type {
  ConsciousnessMetrics,
  ConsciousnessThresholds,
  PerceptualSignal,
  WorkingMemoryItem,
  LongTermMemoryEntry,
} from "./consciousness";
export {
  PentAudienceManager,
  ExternalInterface,
  InternalInterface,
  AutonomousInterface,
  NeuralInterface,
  AmbientInterface,
} from "./interfaces";
export type {
  PentAudienceState,
  ExternalInterfaceConfig,
  InternalInterfaceConfig,
  AutonomousInterfaceConfig,
  NeuralInterfaceConfig,
  AmbientInterfaceConfig,
} from "./interfaces";
export {
  callLlm,
  callOpenaiLike,
  callAnthropic,
  callGemini,
  DEFAULT_SYSTEM_PROMPT,
  composeFallbackReply,
  getTypingDelay,
} from "./providers";
export type {
  LlmCallResult,
  ToolCallRequest,
  ToolExecutionResult,
} from "./providers";
export { retrieveRagContext, buildRagPrompt, rankRagResults } from "./rag";
export type { RagContext, RagDocument } from "./rag";
export { PersistentMemorySystem, createMemorySystem } from "./memory";
export type {
  MemoryEntry,
  MemoryStats,
  ConsolidationResult,
  RetrievalQuery,
  RetrievalResult,
} from "./memory";
export { XAIFramework, createXAI } from "./xai";
export type {
  ExplanationRequest,
  ExplanationResult,
  CitationDetail,
} from "./xai";
export { AdaptiveLearningEngine, createAdaptiveEngine } from "./adaptive";
export type {
  UserProfile,
  CommunicationStyle,
  DecisionPreferences,
  CognitiveProfile,
  TemporalPatterns,
  FeedbackEntry,
  AdaptationResult,
} from "./adaptive";
export {
  CircuitBreaker,
  withRetry,
  GracefulDegradation,
  ProductionMonitor,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_CONFIG,
} from "./resilience";
export type {
  RetryConfig,
  CircuitBreakerConfig,
  ResilienceResult,
} from "./resilience";
export { KnowledgeGraphEngine, createKnowledgeGraph } from "./knowledge-graph";
export type {
  KnowledgeEntity,
  Relationship,
  GraphPath,
  GraphQueryResult,
} from "./knowledge-graph";
export {
  PredictiveIntelligenceEngine,
  createPredictiveEngine,
} from "./predictive";
export type {
  ProactiveTrigger,
  BehavioralPrediction,
  AnomalyPrediction,
} from "./predictive";
export { DEFAULT_ANI_SETTINGS } from "./types";
export type {
  AniSettings,
  ToolCallRecord,
  Sensitivity,
  MemoryTier,
} from "./types";
export { TwinManager } from "./twins";
export type { DigitalTwin, TwinType, TwinSimulation } from "./twins";
export { CausalReasoningEngine } from "./causal";
export type {
  CausalNode,
  CausalEdge,
  CounterfactualResult,
  CausalLevel,
} from "./causal";
export { HyperdimensionalComputer } from "./hyperdimensional";
export type { HyperVector, HDC_DIMENSION } from "./hyperdimensional";
export { TwinSimulationEngine } from "./v5-twin";
export type { SimulationResult, SimulationIntervention } from "./v5-twin";
export { CompileEngine } from "./v5-compile";
export type { CompiledWorkflow } from "./v5-compile";
export { MultiAgentSwarmOrchestrator, createSwarmOrchestrator } from "./swarm";
export type { AgentRole, AgentTask, SwarmPlan, SwarmResult } from "./swarm";
export { hydrateContext, formatContextForPrompt } from "./context-hydration";
export type { ContextDimensions, HydratedContext } from "./context-hydration";
export { evaluateHITL, createHITLChecker } from "./hitl";
export type { HITLLevel, HITLCheck, ActionContext } from "./hitl";
export { CognitiveControlPlane } from "./cognitive-plane";
export type { CognitiveAction, ControlPlaneDecision } from "./cognitive-plane";
export { GoalStack } from "./goal-stack";
export type { Goal, GoalStatus } from "./goal-stack";
export { ReasoningTraceLogger } from "./reasoning-traces";
export type { ReasoningStep, ReasoningTrace } from "./reasoning-traces";
export { ContextFusionLayer } from "./context-fusion";
export type { FusedContextItem, FusedWorkspaceModel } from "./context-fusion";
export { ModeSystem } from "./mode-system";
export type { ANIMode, ModeConfig } from "./mode-system";
export { PlannerExecutorObserverLoop } from "./loop";
export type { LoopPhase, LoopStep, LoopState } from "./loop";
export { ToolSelectionScorer } from "./tool-scoring";
export type { ToolScore } from "./tool-scoring";
export { SelfHealingWorkflow } from "./self-healing";
export type { WorkflowStatus, WorkflowStep } from "./self-healing";
export { EvidenceGraph } from "./evidence-graph";
export type { Evidence, SourceTier } from "./evidence-graph";
export { ContextDecayModel } from "./context-decay";
export type { MemoryItem } from "./context-decay";
export { SessionIntentionPredictor } from "./intention-predictor";
export type { IntentionPrediction } from "./intention-predictor";
export { AuditLogger } from "./audit-logger";
export type { AuditEntry } from "./audit-logger";
export { RiskAdaptiveRedaction } from "./risk-redaction";
export type { SensitivityLevel, RedactionRule } from "./risk-redaction";
export { PreferenceEvolutionEngine } from "./preference-evolution";
export type { TaskCategoryPreference } from "./preference-evolution";
export { AutonomousCodeEvolution } from "./code-evolution";
export type {
  CodeIssue,
  PatchResult,
  CodeIssueSeverity,
} from "./code-evolution";
export { MultiModalMemory } from "./multimodal-memory";
export type { ExperienceNode, ModalityType } from "./multimodal-memory";
export { CollaborationIntelligence } from "./collaboration-intel";
export type {
  CollaborationState,
  ParticipantSignal,
} from "./collaboration-intel";
export { SelfOptimizationGovernor } from "./self-optimization";
export type { PerformanceSnapshot } from "./self-optimization";
export { FailureTaxonomy } from "./failure-taxonomy";
export type {
  FailureType,
  FailureEvent as TaxonomyFailureEvent,
} from "./failure-taxonomy";
export { BehavioralDriftDetector } from "./drift-detector";
export type { DriftSignal } from "./drift-detector";
export { ContinuousQAHarness } from "./qa-harness";
export type { QAScore } from "./qa-harness";
export { CrisisAutopilot } from "./crisis-autopilot";
export type {
  CrisisLevel,
  FallbackMode,
  CrisisState,
} from "./crisis-autopilot";
export { MarketplaceRanker } from "./marketplace-ranker";
export type { MarketplaceItem } from "./marketplace-ranker";
export { TokenEconomyManager } from "./token-economy";
export type { TokenBudget } from "./token-economy";
export { ModelPortfolioStrategy } from "./model-portfolio";
export type { ModelTier, ModelRoute } from "./model-portfolio";
export { ConversationStateMachine } from "./conversation-fsm";
export type { ConversationPhase, PhaseTransition } from "./conversation-fsm";
export { MicroConfirmationUX } from "./micro-confirm";
export type { ConfirmationRequest, RiskTier } from "./micro-confirm";
export { SituationalToneEngine } from "./tone-engine";
export type { SituationType, ToneProfile } from "./tone-engine";
export { HyperContextEngine } from "./hyper-context";
export type { WorkspaceState } from "./hyper-context";
export { CrossModuleTransaction } from "./cross-module-tx";
export type { TransactionStep, TransactionStatus } from "./cross-module-tx";
export { TemporalReasoningEngine } from "./temporal-reasoning";
export type { SnapshotComparison } from "./temporal-reasoning";
export { NeuralCoherenceMonitor } from "./neural-coherence";
export type { CoherenceMetrics } from "./neural-coherence";
export { PolicyCompiler } from "./policy-compiler";
export type { PolicyRule } from "./policy-compiler";
export {
  CrossTenantVerifier,
  FederatedLearningLoop,
  DeploymentTopologyOptimizer,
} from "./governance-platform";
export type { FederatedUpdate, Topology } from "./governance-platform";
export {
  assessComplexity,
  getDepthSettings,
  buildReasoningSteps,
  needsClarification,
  generateMemoryMarks,
  buildFeedbackPanel,
} from "./deep-think";
export type {
  ReasoningDepth,
  ExplanationLevel,
  ComplexityAssessment,
  TraceableThought,
  DeepThinkResult,
  AutonomousAction,
  MemoryMark,
  FeedbackPanel,
} from "./deep-think";
export {
  buildMultiPassAnswer,
  digestContext,
  buildAutonomousWorkflow,
} from "./context-engine";
export type {
  MultiPassResult,
  CritiqueRound,
  ContextDigestionResult,
  AutonomousWorkflow,
  AutonomousWorkflowStep,
} from "./context-engine";
export {
  getEligibleWalkthroughs,
  classifyUserSegment,
  buildSegmentProfile,
  generateRecommendations,
  getFeaturePriorityVotes,
} from "./education";
export type {
  UserSegment,
  Walkthrough,
  ContextualGuide,
  GuideCard,
  ProactiveRecommendation,
  UserSegmentProfile,
  FeatureRequestVote,
} from "./education";
export {
  createDefaultVoiceState,
  matchVoiceCommand,
  transformContent,
  getClutterConfig,
  createCrossSessionMemory,
  runCheckpoint,
  STANDARD_CHECKPOINTS,
  detectInjectionRisk,
  detectDeepfakeIndicators,
  enrichCitations,
  VOICE_COMMANDS,
} from "./remaining-features";
export type {
  VoiceState,
  VoiceCommand,
  ContentTransformResult,
  ContentTransformType,
  ClutterConfig,
  CrossSessionMemory,
  DecidedFact,
  ActionItem,
  CheckpointResult,
  OutcomeMetric,
  EnrichedCitation,
} from "./remaining-features";
export {
  createDefaultTtsState,
  speakText,
  pauseSpeech,
  resumeSpeech,
  stopSpeech,
  VOICE_PROFILES,
  createLearningModule,
  evaluateLearningAnswer,
  constrainResearch,
  createTaskProgress,
  updateTaskStep,
  recordOutcome,
  summarizeOutcomes,
  recallMemories,
  buildContextGraph,
} from "./remaining-capabilities";
export type {
  VoiceTtsState,
  VoiceProfile,
  TtsQueueItem,
  LearningModule,
  LearningStep,
  LearningProgress,
  SourceConstraint,
  ConstrainedResearchResult,
  ResearchSource,
  TaskProgress,
  ProgressStep,
  OutcomeRecord,
  OutcomeSummary,
  PersistentMemoryEntry,
  MemoryRecallQuery,
  ContextNode3D,
  ContextEdge3D,
  ContextGraph3D,
} from "./remaining-capabilities";
export {
  layoutForceDirected3D,
  project3Dto2D,
  initializeMeetingIntelligence,
  updateMeetingWithTranscript,
  selectOptimalModel,
  buildCausalChain,
  monitorToolHealth,
  adaptToneForContext,
  runSelfOptimizationCheck,
} from "./ani-integration";
export type {
  MeetingIntelligenceState,
  ParticipantInsight,
  AgendaItem,
  MeetingDecision,
  MeetingActionItem,
  GraphLayout3D,
} from "./ani-integration";
export {
  DeepReasoningEngine,
  DeepSelfReflection,
  DeepContextCompressor,
  DeepAdaptiveLearning,
  DeepAutonomyEngine,
  DeepSelfImprovement,
} from "./deep-intelligence";
export type {
  ReasoningChain,
  ReflectionResult,
  SemanticChunk,
  CompressedContext,
  AdaptiveLearningState,
  AutonomousDecision,
  SelfImprovementLog,
} from "./deep-intelligence";
export { CrossAppSchemaMapper } from "./schema-mapper";
export type { SchemaMapping } from "./schema-mapper";
export {
  EnhancedStreamController,
  InteractiveGraphController,
  RealTimeMeetingProcessor,
  AdaptiveLearningEngine as AdaptiveLearningPathEngine,
} from "./deep-enhanced";
export type {
  StreamEvent,
  EnhancedStreamState,
  InteractiveGraphState,
  RealTimeMeetingUpdate,
  AdaptiveLearningPath,
  AdaptiveModule,
  AdaptiveConcept,
  AdaptiveExercise,
} from "./deep-enhanced";
export { MultiResolutionRenderer, NeuralEthicsBoard } from "./multi-resolution";
export type {
  ResolutionLevel,
  RenderedResponse,
  EthicsReview,
} from "./multi-resolution";
export { ToolHealthSentinel } from "./tool-sentinel";
export type { IntegrationHealth } from "./tool-sentinel";
export { DecisionJustificationChain } from "./tool-sentinel";
export type { DecisionJustification } from "./tool-sentinel";
export { CognitionLedger } from "./cognition-ledger";
export type { CognitionLedgerEntry } from "./cognition-ledger";
export { DeceptionDetector, SelfModel } from "./deception-self-model";
export type {
  DeceptionIndicator,
  SelfModelState,
} from "./deception-self-model";
export {
  createMemoryFabric,
  ContextBroker,
  MemoryPolicyEngine,
  FreshnessEngine,
  ConflictResolver,
  ContextCompiler,
  RetrievalOrchestrator,
  MemoryFormationPipeline,
  MemoryEventBus,
  TenantGovernance,
} from "./memory-fabric";
export type {
  CanonicalMemoryObject,
  MemoryDomain,
  MemoryType,
  ContextManifest,
  BrokerRequest,
  MemoryEvent,
  MemoryEventType,
  FreshnessState,
  ConflictObject,
  RankingWeights,
  GovernanceLevel,
  GovernancePolicy,
} from "./memory-fabric";
export { AgentLeaseManager, createAgentLeaseManager } from "./agent-lease";
export type { AgentLease } from "./agent-lease";
export { ProvenanceGraphBuilder, createProvenanceBuilder } from "./provenance-graph";
export type { ProvenanceNode, ProvenanceEdge, AnswerProvenanceGraph } from "./provenance-graph";
export { QualityMetricsStore, globalQualityMetrics } from "./quality-metrics";
export type { RetrievalMetrics, GovernanceMetrics, MemoryQualityMetrics, OperationalSLO } from "./quality-metrics";
export * from "./authorization-retrieval";
export { ResearchOrchestrator, globalResearchOrchestrator, DOMAIN_MODE_CONFIG } from "./research-orchestrator";
export { MemoryConsolidator, globalMemoryConsolidator, normalizeEvent, groupCandidates } from "./memory-consolidator";
export type { NormalizedEvent, ClaimCluster, CanonicalClaim, EpisodeSummary, ConsolidationJob, ReviewItem, DriftSignal as ConsolidatorDriftSignal } from "./memory-consolidator";
export type {
  ResearchPlan,
  ResearchMode,
  Subquestion,
  SourcePolicy,
  SourceRegistryEntry,
  EvidenceNormalized,
  ClaimLedgerEntry,
  ClaimType,
  ClaimStatus,
  ResearchSnapshot,
  ResearchJob,
} from "./research-orchestrator";
export { AgentExecutionKernel, globalAgentKernel, ToolRegistry, RiskEngine, ApprovalPolicyEngine, CredentialBroker, CapabilityFirewall, Verifier, AgentMemoryBoundaries, MultiAgentGovernor, RuntimeObservability, globalAgentObservability } from "./agent-runtime";
export type {
  ToolContract,
  AgentPlan,
  PlanStep,
  PlanAssumption,
  WorkflowExecution,
  WorkflowState,
  SimulationResult as AgentSimulationResult,
  RiskDimensions,
  ApprovalPolicy,
  CredentialLease,
  Postcondition,
  ErrorCode,
} from "./agent-runtime";
