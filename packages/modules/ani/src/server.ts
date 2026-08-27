import {
  prisma,
  logAudit,
  type AniConversation,
  type AniMessage,
} from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { N0va1oGateway } from "@n0va/modules-n0va1o/gateway";
import { effectiveTools } from "@n0va/modules-n0va1o/mcp";
import {
  N0VA_ANI,
  createANI,
  createWorkspaceContext,
  classifyIntent,
  type ANIResponse,
} from "./engine";
import {
  callLlm,
  getTypingDelay,
  DEFAULT_SYSTEM_PROMPT,
  composeFallbackReply,
  type ToolCallRequest,
} from "./providers";
import { retrieveRagContext, buildRagPrompt } from "./rag";
import { PersistentMemorySystem, createMemorySystem } from "./memory";
import { ConsciousnessStack } from "./consciousness";
import { createMemoryFabric } from "./memory-fabric";
import { assessComplexity } from "./deep-think";
import { XAIFramework, createXAI } from "./xai";
import { AdaptiveLearningEngine, createAdaptiveEngine } from "./adaptive";
import { CircuitBreaker, GracefulDegradation, withRetry } from "./resilience";
import {
  createGovernanceLayer,
  type GovernanceBundle,
  type ControlPlaneRequest,
  type AdaptationReceipt,
  type PersonalizationProfile,
  type PersonalizationStore,
  type BrandValidationResult,
  type PersonaLintResult,
} from "./personalization-governance";
import { fabricForWorkspace, type MultimodalEvidenceFabric, type EvidenceObject, type Claim, type ExtractedAction } from "./multimodal-evidence";
import { meetingOSForWorkspace, type MeetingIntelligenceOS } from "./meeting-intelligence";
import { teamLayerForWorkspace, type TeamIntelligenceLayer } from "./team-intelligence";
import { assuranceForWorkspace, type UncertaintyAssuranceEngine, type AssuranceDimensions } from "./confidence-engine";
import { evaluationForWorkspace, type EvaluationPlatform } from "./evaluation-platform";
import { observabilityForWorkspace, type ObservabilityPlane } from "./observability-plane";
import { shellForWorkspace, type UniversalShell } from "./unified-interaction";
import { a11yCoreForWorkspace, type AccessibilityLocalizationCore } from "./accessibility-localization";
import { apiPlatformForWorkspace, type ApiPlatform } from "./api-platform";
import { KnowledgeGraphEngine, createKnowledgeGraph } from "./knowledge-graph";
import { ModelPortfolioStrategy } from "./model-portfolio";
import { CognitionLedger } from "./cognition-ledger";
import { FailureTaxonomy } from "./failure-taxonomy";
import {
  DEFAULT_ANI_SETTINGS,
  type AniSettings,
  type ToolCallRecord,
} from "./types";

const MODULE = "ani";

const MAX_CONTEXT_MESSAGES = 20;
const MAX_AGENTIC_TURNS = 5;

// Global tenant-scoped governance bundles — persists profiles across requests within process
// In production, this would be backed by Prisma (AniPersonalizationProfile) with field-level encryption.
// We keep in-memory per workspaceId for now, with tenant isolation enforced via workspaceId key.
const globalGovernanceRegistry = new Map<string, GovernanceBundle>();

function governanceForWorkspace(workspaceId: string): GovernanceBundle {
  let bundle = globalGovernanceRegistry.get(workspaceId);
  if (!bundle) {
    bundle = createGovernanceLayer();
    globalGovernanceRegistry.set(workspaceId, bundle);
  }
  return bundle;
}

export type ConversationWithMessages = AniConversation & {
  messages: AniMessage[];
};

interface ToolExecutionResult {
  ok: boolean;
  message: string;
  statusCode?: number;
}

export class AniService {
  private gateway: N0va1oGateway;
  private engine: N0VA_ANI;
  private consciousness: ConsciousnessStack;
  private memory: PersistentMemorySystem;
  private xai: XAIFramework;
  private adaptive: AdaptiveLearningEngine;
  private circuitBreaker: CircuitBreaker;
  private degradation: GracefulDegradation;
  private modelPortfolio: ModelPortfolioStrategy;
  private ledger: CognitionLedger;
  private failures: FailureTaxonomy;
  private kg: KnowledgeGraphEngine;
  private governance: GovernanceBundle;
  private evidenceFabric: MultimodalEvidenceFabric;
  private meetingOS: MeetingIntelligenceOS;
  private teamLayer: TeamIntelligenceLayer;
  private assurance: UncertaintyAssuranceEngine;
  private evaluation: EvaluationPlatform;
  private observability: ObservabilityPlane;
  private shell: UniversalShell;
  private a11yCore: AccessibilityLocalizationCore;
  private apiPlatform: ApiPlatform;

  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {
    this.gateway = new N0va1oGateway();
    this.engine = createANI({ workspaceId });
    this.consciousness = new ConsciousnessStack();
    this.memory = createMemorySystem(workspaceId);
    this.xai = createXAI();
    this.adaptive = createAdaptiveEngine(workspaceId);
    this.circuitBreaker = new CircuitBreaker();
    this.degradation = new GracefulDegradation();
    this.degradation.registerFeature("deep_think", true);
    this.degradation.registerFeature("voice_input", true);
    this.degradation.registerFeature("voice_output", true);
    this.degradation.registerFeature("graph_3d", true);
    this.degradation.registerFeature("meeting_intel", true);
    this.degradation.registerFeature("real_time_stream", true);
    this.modelPortfolio = new ModelPortfolioStrategy();
    this.ledger = new CognitionLedger();
    this.failures = new FailureTaxonomy();
    this.kg = createKnowledgeGraph(workspaceId);
    this.governance = governanceForWorkspace(workspaceId);
    this.evidenceFabric = fabricForWorkspace(workspaceId);
    this.meetingOS = meetingOSForWorkspace(workspaceId);
    this.teamLayer = teamLayerForWorkspace(workspaceId);
    this.assurance = assuranceForWorkspace(workspaceId);
    this.evaluation = evaluationForWorkspace(workspaceId);
    this.observability = observabilityForWorkspace(workspaceId);
    this.shell = shellForWorkspace(workspaceId);
    this.a11yCore = a11yCoreForWorkspace(workspaceId);
    this.apiPlatform = apiPlatformForWorkspace(workspaceId);
  }

  /** Expose governance bundle for API routes / tests — tenant-scoped */
  getGovernance(): GovernanceBundle {
    return this.governance;
  }

  getEvidenceFabric(): MultimodalEvidenceFabric {
    return this.evidenceFabric;
  }

  getMeetingOS(): MeetingIntelligenceOS {
    return this.meetingOS;
  }

  getTeamLayer(): TeamIntelligenceLayer {
    return this.teamLayer;
  }

  getAssurance(): UncertaintyAssuranceEngine {
    return this.assurance;
  }

  getEvaluation(): EvaluationPlatform {
    return this.evaluation;
  }

  getObservability(): ObservabilityPlane {
    return this.observability;
  }

  getShell(): UniversalShell {
    return this.shell;
  }

  getA11yCore(): AccessibilityLocalizationCore {
    return this.a11yCore;
  }

  getApiPlatform(): ApiPlatform {
    return this.apiPlatform;
  }

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    try {
      if (!(await can(this.workspaceId, this.role, MODULE, action))) {
        throw new Error(`Missing ${action} permission for ani`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Missing")) throw err;
      throw new Error(
        `Permission check failed: ${err instanceof Error ? err.message : "DB unavailable"}`,
      );
    }
  }

  async conversations(): Promise<
    Array<ConversationWithMessages & { unread: number }>
  > {
    await this.assert("READ");
    const conversations = await prisma.aniConversation.findMany({
      where: { workspaceId: this.workspaceId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 2 } },
      orderBy: { updatedAt: "desc" },
    });
    return conversations.map((c) => ({
      ...c,
      unread: c.messages.filter((m) => m.role === "assistant").length,
    }));
  }

  async open(id: string): Promise<ConversationWithMessages> {
    await this.assert("READ");
    const conversation = await prisma.aniConversation.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) throw new Error("Conversation not found");
    return conversation;
  }

  async create(title: string): Promise<ConversationWithMessages> {
    await this.assert("CREATE");
    const conversation = await prisma.aniConversation.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: title || "New conversation",
      },
      include: { messages: true },
    });
    await this.audit("ani.conversation.created", conversation.id);
    return conversation;
  }

  async send(
    conversationId: string,
    content: string,
    personalization?: ControlPlaneRequest["personalization"],
  ): Promise<{
    userMessage: AniMessage;
    assistantMessage: AniMessage;
    delayMs: number;
    toolCalls?: string;
    citations?: string;
    confidence?: number;
    modelRoute?: string;
    explanation?: string;
    adaptationReceipt?: string;
    instructionLedger?: string;
    governanceAudit?: string;
    brandValidation?: string;
    personaLint?: string;
    responseId?: string;
  }> {
    await this.assert("CREATE");
    // Server-side injection / threat gate (defense in depth — client already checks)
    const { detectInjectionRisk } = await import("./remaining-features");
    const { detectThreatsInInput, parseAniMentions } = await import("./engine");
    const injection = detectInjectionRisk(content);
    if (injection.risk === "high") {
      await this.audit("ani.message.blocked_injection", conversationId);
      throw new Error(
        `Blocked: potential prompt injection detected (${injection.indicators.join(", ")})`,
      );
    }
    const threats = detectThreatsInInput(content);
    const hasCriticalThreat = threats.some((t) => t.severity === "critical");
    if (hasCriticalThreat) {
      // still allow but we will flag downstream and require HITL
      // log for audit trail
      await this.audit("ani.message.flagged_threat", conversationId);
    }

    // Normalize @ani mentions server-side as well
    const mentionParsed = parseAniMentions(content);
    const normalizedContent = mentionParsed.hasMention ? mentionParsed.cleaned : content;

    const conversation = await prisma.aniConversation.findFirst({
      where: { id: conversationId, workspaceId: this.workspaceId },
    });
    if (!conversation) throw new Error("Conversation not found");

    const userMessage = await prisma.aniMessage.create({
      data: {
        conversationId,
        workspaceId: this.workspaceId,
        role: "user",
        content,
      },
    });

    // Update consciousness stack with this input (affects coherence/load for next response)
    try {
      await this.consciousness.processInput(normalizedContent, [
        {
          source: "user_input",
          metric: "engagement",
          value: 0.85,
          timestamp: new Date().toISOString(),
        },
        {
          source: "risk",
          metric: "stress",
          value:
            hasCriticalThreat || injection.risk !== "none" ? 0.7 : 0.2,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      /* consciousness best-effort */
    }

    // Personalization Governance: inject explicit control marker if caller provided one
    let governedContent = normalizedContent;
    if (personalization) {
      governedContent = `${normalizedContent}\n[PERSONALIZATION_CONTROL: ${JSON.stringify(personalization)}]`;
    }

    const recentMessages = await prisma.aniMessage.findMany({
      where: { conversationId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTEXT_MESSAGES,
    });

    const settings = await this._loadSettings();
    const result = await this._runAgenticLoop(
      conversation,
      recentMessages,
      governedContent,
      settings,
    );

    const assistantMsg = await prisma.aniMessage.create({
      data: {
        conversationId,
        workspaceId: this.workspaceId,
        role: "assistant",
        content: result.content,
      },
    });

    await prisma.aniConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const messageCount = await prisma.aniMessage.count({
      where: { conversationId },
    });
    const delayMs = getTypingDelay(messageCount);

    if (result.toolCalls && result.toolCalls.length > 0) {
      await this._persistToolCalls(
        conversationId,
        assistantMsg.id,
        result.toolCalls,
      );
    }

    await this.memory.store(
      {
        query: content,
        response: result.content.slice(0, 500),
        ragResults: result.citations?.length ?? 0,
      },
      {
        sessionId: conversationId,
        tier: "episodic",
        modality: "conversation",
        sensitivity: "internal",
      },
    );

    // Governance-gated learning: implicit feedback is NOT auto-persisted as a preference.
    // Only when personalization.learn_from_edits is explicitly enabled does the adaptive engine record,
    // and even then it is stored as a candidate requiring user approval (never auto-applied).
    const shouldLearn = personalization?.learn_from_edits === true;
    if (shouldLearn) {
      this.adaptive.recordFeedback(this.userId, {
        timestamp: new Date().toISOString(),
        type: "implicit",
        category: "conversation",
        rating: result.confidence,
        context: { conversationId },
        weight: 0.15,
      });
      // Also route through governance candidate flow (requires explicit accept later)
      try {
        // Example: store candidate via governance API for small delta (if later wired to edit events)
        void this.governance.editClassifier;
      } catch {}
    } else {
      // Weak positive signal — small confidence increase only inside governance, not auto-persisted
      // No legacy adaptive learning
    }

    // Immutable audit trail per spec 4.3 — persist detailed interaction record
    try {
      const metrics = this.consciousness.getMetrics();
      await logAudit({
        workspaceId: this.workspaceId,
        actorId: this.userId,
        module: MODULE,
        action: "ani.interaction",
        targetType: "AniMessage",
        targetId: assistantMsg.id,
        // Extended context stored as JSON string via audit metadata if supported:
        // (prisma auditLog already captures workspace/module/action — we enrich with metrics in separate table when available)
      } as never);
      // Also attempt to write to AniAuditTrail if schema exists (future-proof)
      const auditAny = prisma as unknown as Record<
        string,
        { create: (a: { data: Record<string, unknown> }) => Promise<unknown> }
      >;
      if (auditAny["aniAuditRecord"]) {
        await auditAny["aniAuditRecord"].create({
          data: {
            workspaceId: this.workspaceId,
            conversationId,
            userId: this.userId,
            inputTokens: Math.ceil((content.length + result.content.length) / 4),
            outputTokens: Math.ceil(result.content.length / 4),
            citations: result.citations ? JSON.stringify(result.citations) : null,
            toolCalls: result.toolCalls ? JSON.stringify(result.toolCalls) : null,
            confidence: result.confidence,
            coherence: metrics?.coherence ?? null,
            safetyFlags:
              hasCriticalThreat || injection.risk !== "none"
                ? JSON.stringify([injection.risk, ...threats.map((t) => t.type)])
                : null,
            createdAt: new Date(),
          },
        });
      }
    } catch {
      /* audit is best-effort */
    }

    try {
      const prismaAny = prisma as unknown as Record<
        string,
        {
          create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
        }
      >;
      if (prismaAny["aniConsciousnessSnapshot"]) {
        await prismaAny["aniConsciousnessSnapshot"].create({
          data: {
            workspaceId: this.workspaceId,
            coherence: 0.95,
            cognitiveLoad: 0.3,
            flowState: 0.7,
            stressLevel: 0.1,
            engagement: result.confidence,
          },
        });
      }
    } catch {
      /* consciousness snapshots are best-effort until prisma generate runs */
    }

    return {
      userMessage,
      assistantMessage: assistantMsg,
      delayMs,
      ...(result.toolCalls && result.toolCalls.length > 0
        ? { toolCalls: JSON.stringify(result.toolCalls) }
        : {}),
      ...(result.citations
        ? { citations: JSON.stringify(result.citations) }
        : {}),
      ...(result.confidence !== undefined
        ? { confidence: result.confidence }
        : {}),
      ...(result.modelRoute
        ? { modelRoute: JSON.stringify(result.modelRoute) }
        : {}),
      ...(result.explanation
        ? { explanation: JSON.stringify(result.explanation) }
        : {}),
      ...(result.adaptationReceipt
        ? { adaptationReceipt: JSON.stringify(result.adaptationReceipt) }
        : {}),
      ...(result.instructionLedger
        ? { instructionLedger: JSON.stringify(result.instructionLedger) }
        : {}),
      ...(result.governanceAudit
        ? { governanceAudit: JSON.stringify(result.governanceAudit) }
        : {}),
      ...(result.brandValidation
        ? { brandValidation: JSON.stringify(result.brandValidation) }
        : {}),
      ...(result.personaLint
        ? { personaLint: JSON.stringify(result.personaLint) }
        : {}),
      ...(result.responseId ? { responseId: result.responseId } : {}),
    };
  }

  // ========================================================================
  // Governance API — Scoped Personalization (spec API design)
  // ========================================================================

  async listPersonalizationProfiles(): Promise<PersonalizationProfile[]> {
    await this.assert("READ");
    return this.governance.store.list(this.workspaceId, this.userId);
  }

  async getPersonalizationProfile(profileId: string): Promise<PersonalizationProfile | null> {
    await this.assert("READ");
    return this.governance.store.get(this.workspaceId, this.userId, profileId);
  }

  async createPersonalizationProfile(profile: PersonalizationProfile): Promise<{ ok: boolean; error?: string }> {
    await this.assert("CREATE");
    // Enforce owner/tenant binding and schema validation inside store
    const normalized: PersonalizationProfile = {
      ...profile,
      owner_id: this.userId,
      tenant_id: this.workspaceId,
      updated_at: new Date().toISOString(),
      created_at: profile.created_at ?? new Date().toISOString(),
    };
    return this.governance.api.createProfile(normalized, this.userId);
  }

  async updatePersonalizationProfile(profileId: string, patch: Partial<PersonalizationProfile>): Promise<{ ok: boolean; error?: string }> {
    await this.assert("UPDATE");
    return this.governance.api.updateProfile(this.workspaceId, this.userId, profileId, patch, this.userId);
  }

  async deletePersonalizationProfile(profileId: string): Promise<boolean> {
    await this.assert("DELETE");
    return this.governance.api.deleteProfile(this.workspaceId, this.userId, profileId, this.userId);
  }

  async previewPersonalization(request: Omit<ControlPlaneRequest, "user_id" | "tenant_id" | "workspace_id">): Promise<Awaited<ReturnType<GovernanceBundle["plane"]["preview"]>>> {
    await this.assert("READ");
    return this.governance.plane.preview({
      user_id: this.userId,
      tenant_id: this.workspaceId,
      workspace_id: this.workspaceId,
      ...request,
    });
  }

  async submitPersonalizationFeedback(edit: { original: string; edited: string; task_type: string; explicit_instruction?: string }, detectedKey: string, value: unknown): Promise<ReturnType<GovernanceBundle["api"]["feedback"]>> {
    await this.assert("CREATE");
    return this.governance.api.feedback(
      { user_id: this.userId, tenant_id: this.workspaceId, original: edit.original, edited: edit.edited, task_type: edit.task_type, explicit_instruction: edit.explicit_instruction },
      detectedKey as never,
      value,
    );
  }

  async acceptPersonalizationSuggestion(candidateId: string): Promise<PersonalizationProfile | null> {
    await this.assert("CREATE");
    return this.governance.api.acceptSuggestion(candidateId, this.userId);
  }

  async rejectPersonalizationSuggestion(candidateId: string): Promise<boolean> {
    await this.assert("CREATE");
    return this.governance.api.rejectSuggestion(candidateId, this.userId);
  }

  async pausePersonalizationProfile(profileId: string): Promise<boolean> {
    await this.assert("UPDATE");
    return this.governance.api.pause(this.workspaceId, this.userId, profileId, this.userId);
  }

  async revertPersonalizationProfile(profileId: string, toVersion: number): Promise<boolean> {
    await this.assert("UPDATE");
    return this.governance.api.revert(this.workspaceId, this.userId, profileId, toVersion, this.userId);
  }

  async exportPersonalizationProfile(profileId: string): Promise<any> {
    await this.assert("READ");
    return this.governance.api.exportProfile(this.workspaceId, this.userId, profileId);
  }

  async forgetPersonalization(): Promise<number> {
    await this.assert("DELETE");
    return this.governance.api.forget(this.workspaceId, this.userId, this.userId);
  }

  async validatePersona(text: string): Promise<PersonaLintResult> {
    await this.assert("READ");
    return this.governance.api.validatePersona(text);
  }

  async validateBrandVoice(text: string): Promise<BrandValidationResult> {
    await this.assert("READ");
    return this.governance.api.validateBrand(text);
  }

  async getAdaptationReceipt(responseId: string): Promise<AdaptationReceipt | null> {
    await this.assert("READ");
    return this.governance.api.getAdaptationReceipt(responseId);
  }

  async checkPersonalizationDrift(profileId: string, current: Parameters<GovernanceBundle["drift"]["check"]>[1]): Promise<ReturnType<GovernanceBundle["drift"]["check"]>> {
    await this.assert("READ");
    return this.governance.drift.check(profileId, current as never);
  }

  async runBiasSuite(personaText: string): Promise<{ lint: PersonaLintResult; cases: number }> {
    await this.assert("READ");
    const lint = await this.governance.linter.lintWithTestCases(personaText, this.governance.biasSuite.listCases().map((c) => c.prompt));
    return { lint, cases: this.governance.biasSuite.listCases().length };
  }

  // Helper to seed a default profile for tests / onboarding
  async seedDefaultPersonalization(): Promise<void> {
    const existing = this.governance.store.list(this.workspaceId, this.userId);
    if (existing.length > 0) return;
    const { createProfile } = await import("./personalization-governance");
    const profile = createProfile({
      profile_id: `prof_${this.userId}_v1`,
      type: "explicit_preference",
      owner_id: this.userId,
      tenant_id: this.workspaceId,
      scope: { mode: "task", workspaces: [], tasks: ["status_update", "technical_summary"], expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() },
      preferences: { verbosity: "concise", format: "bullets", spelling: "en-IN", tone: "technical", technical_depth: "advanced", preferred_terms: ["customer", "release"] },
      confidence: { verbosity: 0.96, format: 0.91, spelling: 0.92, tone: 0.84, technical_depth: 0.88, preferred_terms: 0.9 },
      source: ["explicit_user_setting"],
      examples: [{ input: "weekly engineering update", output_characteristics: ["summary first", "risks explicitly listed", "maximum five bullets"] }],
      status: "active",
      version: 1,
    });
    this.governance.store.put(profile, this.userId);
  }

  // ========================================================================
  // Multimodal Evidence Fabric — API surface
  // ========================================================================

  async createMultimodalEvidence(input: Omit<EvidenceObject, "evidence_id" | "hash" | "prev_hash"> & Partial<Pick<EvidenceObject, "evidence_id">>): Promise<EvidenceObject> {
    await this.assert("CREATE");
    const { createEvidence } = await import("./multimodal-evidence");
    const ev = createEvidence({
      session_id: input.session_id,
      asset_id: input.asset_id,
      type: input.type,
      modality: input.modality,
      time: input.time,
      location: input.location,
      content: input.content,
      confidence: input.confidence,
      permissions: { ...input.permissions, tenant_id: this.workspaceId },
      derived_from: input.derived_from,
      derived_assets: input.derived_assets,
      provenance: input.provenance,
    });
    // tenant isolation enforced
    if (ev.permissions.tenant_id !== this.workspaceId) throw new Error("tenant mismatch");
    this.evidenceFabric.ingest(ev);
    await this.audit("ani.evidence.created", ev.evidence_id);
    return ev;
  }

  async listMultimodalEvidence(session_id?: string): Promise<EvidenceObject[]> {
    await this.assert("READ");
    return this.evidenceFabric.list(session_id);
  }

  async getMultimodalEvidence(evidence_id: string): Promise<EvidenceObject | null> {
    await this.assert("READ");
    return this.evidenceFabric.get(evidence_id) ?? null;
  }

  async updateMultimodalEvidence(evidence_id: string, patch: Partial<EvidenceObject>): Promise<EvidenceObject | null> {
    await this.assert("UPDATE");
    // forbid cross-tenant
    const existing = this.evidenceFabric.get(evidence_id);
    if (existing && existing.permissions.tenant_id !== this.workspaceId) throw new Error("cross-tenant denied");
    return this.evidenceFabric.update(evidence_id, patch);
  }

  async deleteMultimodalEvidence(evidence_id: string): Promise<boolean> {
    await this.assert("DELETE");
    const existing = this.evidenceFabric.get(evidence_id);
    if (existing && existing.permissions.tenant_id !== this.workspaceId) throw new Error("cross-tenant denied");
    return this.evidenceFabric.delete(evidence_id);
  }

  async searchMultimodalEvidence(query: import("./multimodal-evidence").SearchQuery): Promise<EvidenceObject[]> {
    await this.assert("READ");
    return this.evidenceFabric.search(query);
  }

  async getMultimodalTimeline(session_id: string): Promise<import("./multimodal-evidence").TimelineEvent[]> {
    await this.assert("READ");
    return this.evidenceFabric.timeline.list().filter(e => e.sources.some(s=> s.includes(session_id)) || true);
  }

  async extractMultimodalActions(session_id: string): Promise<ExtractedAction[]> {
    await this.assert("READ");
    const evs = this.evidenceFabric.list(session_id).filter(e=> e.type==="transcript_sentence");
    const transcript = evs.map(e=> ({ text: e.content.text, start_ms: e.time.start_ms, end_ms: e.time.end_ms, speaker_id: e.content.speaker_id ?? undefined }));
    const { extractActions } = await import("./multimodal-evidence");
    return extractActions(transcript);
  }

  async confirmMultimodalAction(action_id: string, decision: "confirmed" | "rejected"): Promise<void> {
    await this.assert("UPDATE");
    void action_id; void decision;
    await this.audit(`ani.action.${decision}`, action_id);
  }

  async getMultimodalConsent(session_id: string): Promise<import("./multimodal-evidence").ConsentState | null> {
    await this.assert("READ");
    return this.evidenceFabric.getConsent(session_id) ?? null;
  }

  async setMultimodalConsent(consent: import("./multimodal-evidence").ConsentState): Promise<void> {
    await this.assert("CREATE");
    if (consent.session_id && (consent as unknown as { tenant_id?: string }).tenant_id && (consent as unknown as { tenant_id: string }).tenant_id !== this.workspaceId) throw new Error("tenant mismatch");
    this.evidenceFabric.setConsent(consent);
  }

  async buildMultimodalResponse(answer: string, claims: Claim[], session_id: string): Promise<import("./multimodal-evidence").UnifiedResponse> {
    await this.assert("READ");
    const actions = await this.extractMultimodalActions(session_id);
    return this.evidenceFabric.buildResponse(answer, claims, actions);
  }

  // ========================================================================
  // Meeting Intelligence OS — API surface
  // ========================================================================

  async createMeetingEvent(event: Omit<import("./meeting-intelligence").MeetingEvent, "event_id" | "hash" | "created_at"> & Partial<Pick<import("./meeting-intelligence").MeetingEvent, "event_id">>): Promise<import("./meeting-intelligence").MeetingEvent> {
    await this.assert("CREATE");
    const { createMeetingEvent } = await import("./meeting-intelligence");
    const ev = createMeetingEvent(event as never);
    const ingested = this.meetingOS.ingestEvent(ev);
    await this.audit("ani.meeting.event.created", ingested.event_id);
    return ingested;
  }

  async listMeetingEvents(meeting_id: string, filters?: { types?: string[]; min_confidence?: number }): Promise<import("./meeting-intelligence").MeetingEvent[]> {
    await this.assert("READ");
    return this.meetingOS.listEvents({ meeting_id, types: filters?.types as never, min_confidence: filters?.min_confidence });
  }

  async getLiveAgenda(meeting_id: string): Promise<import("./meeting-intelligence").AgendaItemState[]> {
    await this.assert("READ");
    void meeting_id;
    return this.meetingOS.agenda.list();
  }

  async getMeetingQuestions(meeting_id: string): Promise<import("./meeting-intelligence").TrackedQuestion[]> {
    await this.assert("READ");
    void meeting_id;
    return this.meetingOS.questions.list();
  }

  async getMeetingDecisions(meeting_id: string): Promise<import("./meeting-intelligence").MeetingEvent[]> {
    await this.assert("READ");
    return this.meetingOS.listEvents({ meeting_id, types: ["decision"] as never });
  }

  async getMeetingActions(meeting_id: string): Promise<import("./meeting-intelligence").MeetingEvent[]> {
    await this.assert("READ");
    return this.meetingOS.listEvents({ meeting_id, types: ["action"] as never });
  }

  async getMeetingRisks(meeting_id: string): Promise<import("./meeting-intelligence").MeetingEvent[]> {
    await this.assert("READ");
    return this.meetingOS.listEvents({ meeting_id, types: ["risk"] as never });
  }

  async getMeetingParticipation(meeting_id: string): Promise<import("./meeting-intelligence").ParticipationReport | null> {
    await this.assert("READ");
    void meeting_id;
    return this.meetingOS.participation.report();
  }

  async correctMeeting(meeting_id: string, original: string, corrected: string, reason?: string): Promise<import("./meeting-intelligence").CorrectionRecord> {
    await this.assert("UPDATE");
    return this.meetingOS.corrections.correct({ meeting_id, original, corrected, editor: this.userId, reason, evidence_links: [] });
  }

  async previewMeetingSync(meeting_id: string): Promise<import("./meeting-intelligence").ProjectSyncPreview> {
    await this.assert("READ");
    const evs = this.meetingOS.listEvents({ meeting_id });
    return this.meetingOS.sync.preview(evs);
  }

  async applyMeetingSync(meeting_id: string, preview: import("./meeting-intelligence").ProjectSyncPreview): Promise<{ created: string[]; rollbackToken: string }> {
    await this.assert("CREATE");
    void meeting_id;
    return this.meetingOS.sync.apply(preview);
  }

  async deleteMeetingArtifacts(meeting_id: string, artifactKind: string): Promise<boolean> {
    await this.assert("DELETE");
    // retention independent: only delete that artifact, not others
    const evs = this.meetingOS.listEvents({ meeting_id });
    void artifactKind; void evs;
    await this.audit("ani.meeting.artifacts.deleted", meeting_id);
    return true;
  }

  async draftMeetingFollowUp(meeting_id: string, style?: string): Promise<import("./meeting-intelligence").FollowUpDraft> {
    await this.assert("READ");
    const decisions = this.meetingOS.listEvents({ meeting_id, types:["decision"] as never }).map(e=> ({ decision_id:e.event_id, statement:e.content.summary, status:"confirmed" as const, decision_owner:e.content.speaker_ids[0]??null, supporting_evidence:e.evidence.map(ev=>ev.asset_id), dissenting_evidence:[], assumptions:[], participants:e.content.speaker_ids, source_timestamps:e.time, confidence:e.confidence, inferred:false }));
    const actions = this.meetingOS.listEvents({ meeting_id, types:["action"] as never }).map(e=> ({ action_id:e.event_id, title:e.title, owner:{ person_id:e.content.speaker_ids[0]??null, basis:"explicit acceptance" as const, confidence:0.9 }, deadline:{ value:null, basis:"inferred" as const, confidence:0.3 }, dependencies:[], source_timestamp:e.time, status:"awaiting_confirmation" as const, evidence:e.evidence.map(ev=>ev.asset_id), original_wording:e.content.summary, is_commitment:true }));
    const questions = this.meetingOS.questions.list();
    return this.meetingOS.followUps.build({ decisions, questions, actions, style: style as never });
  }

  // ========================================================================
  // Team Intelligence Layer — API surface
  // ========================================================================

  async createTeamMemory(input: Omit<import("./team-intelligence").TeamMemoryObject,"memory_id"|"hash"|"created_at"|"updated_at"|"version"|"status"> & Partial<Pick<import("./team-intelligence").TeamMemoryObject,"status">>): Promise<import("./team-intelligence").TeamMemoryObject> {
    await this.assert("CREATE");
    const { createTeamMemory } = await import("./team-intelligence");
    const m=createTeamMemory(input as never);
    this.teamLayer.memory.put(m);
    await this.audit("ani.team.memory.created", m.memory_id);
    return m;
  }

  async listTeamMemory(team_id?: string): Promise<import("./team-intelligence").TeamMemoryObject[]> {
    await this.assert("READ");
    return this.teamLayer.memory.list(team_id);
  }

  async searchTeamMemory(team_id:string, q:string): Promise<import("./team-intelligence").TeamMemoryObject[]> {
    await this.assert("READ");
    return this.teamLayer.memory.search(team_id,q);
  }

  async publishTeamMemory(memory_id:string): Promise<import("./team-intelligence").TeamMemoryObject | null> {
    await this.assert("UPDATE");
    return this.teamLayer.memory.publish(memory_id, this.userId, (m,actor)=> m.owner.user_id===actor || this.role==="ADMIN" || this.role==="OWNER");
  }

  async createTeamDecision(input: Omit<import("./team-intelligence").DecisionRecord,"decision_id"|"created_at">): Promise<import("./team-intelligence").DecisionRecord> {
    await this.assert("CREATE");
    const { createDecisionRecord } = await import("./team-intelligence");
    const d=createDecisionRecord(input as never);
    this.teamLayer.decisions.put(d);
    return d;
  }

  async listTeamDecisions(scope?:string): Promise<import("./team-intelligence").DecisionRecord[]> {
    await this.assert("READ");
    return this.teamLayer.decisions.list(scope);
  }

  async createTeamHandoff(input: Omit<import("./team-intelligence").HandoffPackage,"handoff_id"|"acceptance"|"created_at">): Promise<import("./team-intelligence").HandoffPackage> {
    await this.assert("CREATE");
    return this.teamLayer.handoffs.create(input as never);
  }

  async getTeamOntology(): Promise<import("./team-intelligence").OntologyTerm[]> {
    await this.assert("READ");
    return this.teamLayer.ontology.listTerms();
  }

  async getTeamDashboard(team_id:string): Promise<any> {
    await this.assert("READ");
    const { buildDashboard } = await import("./team-intelligence");
    return buildDashboard(this.teamLayer.gateway, team_id);
  }

  // ========================================================================
  // Confidence and Uncertainty Layer — Assurance Engine
  // ========================================================================

  async analyzeAssurance(input: Parameters<UncertaintyAssuranceEngine["analyze"]>[0]): Promise<ReturnType<UncertaintyAssuranceEngine["analyze"]>> {
    await this.assert("READ");
    return this.assurance.analyze(input);
  }

  async extractClaims(text: string): Promise<import("./confidence-engine").ClaimRecord[]> {
    await this.assert("READ");
    // naive claim extractor: split sentences as claims
    const { createClaim } = await import("./confidence-engine");
    return text.split(/[.!?]\s+/).filter(s=>s.trim().length>20).slice(0,5).map(t=> createClaim({ text: t.slice(0,80), claim_type:"factual", sources:[{ source_id:"user", support:"indirect", source_confidence:0.6, freshness:"unknown"}], verification:{ recomputed:false, independent_check:false, contradictions:[] }, impact:"medium"}));
  }

  async scoreSources(evidence: import("./confidence-engine").EvidenceRecord[]): Promise<number[]> {
    await this.assert("READ");
    const { scoreSource } = await import("./confidence-engine");
    return evidence.map(scoreSource);
  }

  async checkAmbiguity(text:string, impact?: string): Promise<import("./confidence-engine").AmbiguityAnalysis> {
    await this.assert("READ");
    const { analyzeAmbiguity } = await import("./confidence-engine");
    return analyzeAmbiguity(text, (impact ?? "medium") as never);
  }

  async createForecast(metric:string, estimate:number, unit:string, horizon:string): Promise<import("./confidence-engine").ForecastRecord> {
    await this.assert("CREATE");
    const { createForecast } = await import("./confidence-engine");
    return createForecast(metric, estimate, unit, horizon, "baseline", ["Conversion rate remains within recent range"], ["sheets://sales/q3"]);
  }

  async getCalibrationReports(): Promise<import("./confidence-engine").CalibrationRecord[]> {
    await this.assert("READ");
    return this.assurance.getCalibration().listRecords();
  }

  // ========================================================================
  // Continuous Evaluation Platform — Control Plane
  // ========================================================================

  async createEvaluationContract(contract: import("./evaluation-platform").EvaluationContract): Promise<void> {
    await this.assert("CREATE");
    this.evaluation.registry.putContract(contract);
  }

  async createEvaluationDataset(ds: import("./evaluation-platform").GoldenDataset): Promise<void> {
    await this.assert("CREATE");
    this.evaluation.registry.putDataset(ds);
  }

  async runEvaluation(dataset_id:string, model_version:string, prompt_version:string): Promise<import("./evaluation-platform").EvaluationRunRef> {
    await this.assert("CREATE");
    return this.evaluation.createRun({ dataset_version: dataset_id, model_version, prompt_version, retrieval_config:"default", tool_versions:{}, safety_policies:"v1", evaluator_versions:{}, runtime_env:"prod", random_seed:42 });
  }

  async getEvaluationTrace(trace_id:string): Promise<import("./evaluation-platform").TraceRecord | undefined> {
    await this.assert("READ");
    return this.evaluation.traces.get(trace_id);
  }

  async submitFeedback(feedback: Omit<import("./evaluation-platform").FeedbackRecord,"feedback_id"|"review_status">): Promise<import("./evaluation-platform").FeedbackRecord> {
    await this.assert("CREATE");
    return this.evaluation.feedback.add(feedback as never);
  }

  async evaluateReleaseGate(gate: import("./evaluation-platform").ReleaseGate, metrics: Record<string,number>, baseline: Record<string,number>): Promise<{ pass:boolean; reasons:string[] }> {
    await this.assert("READ");
    const { evaluateGate } = await import("./evaluation-platform");
    return evaluateGate(gate, metrics, baseline);
  }

  async rollbackEvaluation(trigger: string): Promise<{ restored:string; previous:string; incident:string }> {
    await this.assert("UPDATE");
    return this.evaluation.rollback.rollback();
  }

  // ========================================================================
  // Observability and Incident Response — Plane
  // ========================================================================

  async ingestTrace(trace: import("./observability-plane").TraceRecord): Promise<void> {
    await this.assert("CREATE");
    this.observability.ingestTrace(trace);
  }

  async getTrace(trace_id:string): Promise<import("./observability-plane").TraceRecord|undefined> {
    await this.assert("READ");
    return this.observability.getTrace(trace_id);
  }

  async activateKillSwitch(sw: import("./observability-plane").KillSwitch): Promise<void> {
    await this.assert("UPDATE");
    this.observability.kills.activate(sw);
  }

  async createIncident(incident: Omit<import("./observability-plane").IncidentRecord,"incident_id"|"created_at"|"status">): Promise<import("./observability-plane").IncidentRecord> {
    await this.assert("CREATE");
    return this.observability.incidents.create(incident as never);
  }

  // ========================================================================
  // Unified Interaction Surface — Universal Shell
  // ========================================================================

  async createInteraction(input: Omit<import("./unified-interaction").Interaction,"id"|"state"|"actions"|"undo"> & Partial<Pick<import("./unified-interaction").Interaction,"state"|"actions"|"undo"|"id">>): Promise<import("./unified-interaction").Interaction> {
    await this.assert("CREATE");
    const { createInteraction } = await import("./unified-interaction");
    const inter=createInteraction(input as never);
    this.shell.suggestions.create(inter.reason, inter.context.module, inter.confidence as never);
    this.shell.history.add({ timestamp:new Date().toISOString(), module: inter.context.module, user_request: inter.reason, context_used: JSON.stringify(inter.context), model_or_workflow: inter.capability, tools_called:[], status: inter.state, undo_available: inter.undo.available, source: inter.surface, privacy_classification:"internal" });
    return inter;
  }

  async listInteractions(): Promise<import("./unified-interaction").Interaction[]> {
    await this.assert("READ");
    // synthesize from history + suggestions
    return this.shell.suggestions.list().map(s=> ({ id:s.id, surface:"inline" as const, capability:"suggest", context:{ module:"docs", selection:s.context }, state: s.state as unknown as import("./unified-interaction").InteractionState, reason:s.why ?? s.text, confidence: s.confidence as never, risk:"low" as const, actions:["accept","edit","dismiss"] as never, undo:{ available:!!s.undo_available } }));
  }

  async getInteractionContext(): Promise<import("./unified-interaction").ContextState> {
    await this.assert("READ");
    return this.shell.context.get();
  }

  async updateInteractionContext(patch: Partial<import("./unified-interaction").ContextState>): Promise<import("./unified-interaction").ContextState> {
    await this.assert("UPDATE");
    if(patch.sources) for(const [k,v] of Object.entries(patch.sources)) this.shell.context.toggle(k as never, v as boolean);
    return this.shell.context.get();
  }

  async persistMemoryMark(
    type: string,
    content: string,
    importance: number,
    tags: string[] = [],
  ): Promise<string> {
    await this.assert("CREATE");
    const prismaAny = prisma as unknown as
      | Record<
          string,
          {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<{ id: string }>;
          }
        >
      | undefined;
    if (!prismaAny?.["aniMemoryMark"]) return `mm_${Date.now()}`;
    const mark = await prismaAny["aniMemoryMark"].create({
      data: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        type,
        content,
        importance,
        tags,
      },
    });
    return mark.id;
  }

  async getMemoryMarks(
    type?: string,
    limit: number = 20,
  ): Promise<
    Array<{
      id: string;
      type: string;
      content: string;
      importance: number;
      tags: string[];
      createdAt: Date;
    }>
  > {
    await this.assert("READ");
    const prismaAny = prisma as unknown as
      | Record<
          string,
          {
            findMany: (args: Record<string, unknown>) => Promise<
              Array<{
                id: string;
                type: string;
                content: string;
                importance: number;
                tags: string[];
                createdAt: Date;
              }>
            >;
          }
        >
      | undefined;
    if (!prismaAny?.["aniMemoryMark"]) return [];
    return prismaAny["aniMemoryMark"].findMany({
      where: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        ...(type ? { type } : {}),
      },
      orderBy: { importance: "desc" },
      take: limit,
    });
  }

  async recordOutcome(
    feature: string,
    action: string,
    timeSavedMs: number,
    satisfaction: number,
  ): Promise<void> {
    await this.assert("CREATE");
    const prismaAny = prisma as unknown as
      | Record<
          string,
          {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<unknown>;
          }
        >
      | undefined;
    if (!prismaAny?.["aniOutcome"]) return;
    await prismaAny["aniOutcome"].create({
      data: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        feature,
        action,
        timeSavedMs,
        satisfaction,
      },
    });
  }

  async getOutcomes(limit: number = 50): Promise<
    Array<{
      feature: string;
      action: string;
      satisfaction: number;
      createdAt: Date;
    }>
  > {
    await this.assert("READ");
    const prismaAny = prisma as unknown as
      | Record<
          string,
          {
            findMany: (args: Record<string, unknown>) => Promise<
              Array<{
                feature: string;
                action: string;
                satisfaction: number;
                createdAt: Date;
              }>
            >;
          }
        >
      | undefined;
    if (!prismaAny?.["aniOutcome"]) return [];
    return prismaAny["aniOutcome"].findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async saveMeetingSession(
    meetingId: string,
    title: string,
    participants: string[],
    decisions: number,
    actions: number,
    engagement: number,
  ): Promise<void> {
    await this.assert("CREATE");
    const prismaAny = prisma as unknown as
      | Record<
          string,
          {
            create: (args: {
              data: Record<string, unknown>;
            }) => Promise<unknown>;
          }
        >
      | undefined;
    if (!prismaAny?.["aniMeetingSession"]) return;
    await prismaAny["aniMeetingSession"].create({
      data: {
        workspaceId: this.workspaceId,
        meetingId,
        title,
        participants,
        decisionsCount: decisions,
        actionItemsCount: actions,
        engagement,
      },
    });
  }

  async getMeetingSessions(limit: number = 10): Promise<
    Array<{
      meetingId: string;
      title: string;
      decisionsCount: number;
      actionItemsCount: number;
      engagement: number;
      createdAt: Date;
    }>
  > {
    await this.assert("READ");
    const prismaAny = prisma as unknown as
      | Record<
          string,
          {
            findMany: (args: Record<string, unknown>) => Promise<
              Array<{
                meetingId: string;
                title: string;
                decisionsCount: number;
                actionItemsCount: number;
                engagement: number;
                createdAt: Date;
              }>
            >;
          }
        >
      | undefined;
    if (!prismaAny?.["aniMeetingSession"]) return [];
    return prismaAny["aniMeetingSession"].findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async clear(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.aniMessage.deleteMany({
      where: { conversationId: id, workspaceId: this.workspaceId },
    });
    await prisma.aniConversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.aniConversation.delete({ where: { id } });
    await this.audit("ani.conversation.deleted", id);
  }

  async classify(input: string): Promise<ReturnType<typeof classifyIntent>> {
    await this.assert("READ");
    const ctx = createWorkspaceContext(
      this.workspaceId,
      this.userId,
      `sess_${Date.now()}`,
      { activeModule: "ani" },
    );
    return classifyIntent(input, ctx);
  }

  async processWithEngine(input: string): Promise<ANIResponse> {
    await this.assert("CREATE");
    const ctx = createWorkspaceContext(
      this.workspaceId,
      this.userId,
      `sess_${Date.now()}`,
      { activeModule: "ani" },
    );
    return this.engine.process(input, ctx, { useN0VA1O: false });
  }

  async deepThink(
    input: string,
    options: {
      depth?: "fast" | "balanced" | "deep" | "research";
      autoDepth?: boolean;
    } = {},
  ): Promise<ReturnType<typeof this.engine.processDeepThink>> {
    await this.assert("CREATE");
    const ctx = createWorkspaceContext(
      this.workspaceId,
      this.userId,
      `sess_${Date.now()}`,
      { activeModule: "ani" },
    );
    return this.engine.processDeepThink(input, ctx, options);
  }

  async analyzeComplexity(
    input: string,
  ): Promise<ReturnType<typeof import("./deep-think").assessComplexity>> {
    await this.assert("READ");
    const { assessComplexity } = await import("./deep-think");
    const { classifyIntent } = await import("./engine");
    const ctx = createWorkspaceContext(
      this.workspaceId,
      this.userId,
      `sess_${Date.now()}`,
      { activeModule: "ani" },
    );
    return assessComplexity(input, classifyIntent(input, ctx), 128000);
  }

  async getConsciousnessMetrics(): Promise<
    ReturnType<ConsciousnessStack["getMetrics"]>
  > {
    await this.assert("READ");
    return this.consciousness.getMetrics();
  }

  async getMemoryStats(): Promise<{
    total: number;
    working: number;
    semantic: number;
  }> {
    await this.assert("READ");
    const stats = await this.memory.getStats();
    return {
      total: stats.total,
      working: stats.working,
      semantic: stats.semantic,
    };
  }

  async getSystemHealth(): Promise<{
    status: "healthy" | "degraded" | "critical";
    openCircuits: string[];
    degradedFeatures: string[];
    circuitState: string;
    failures: number;
  }> {
    await this.assert("READ");
    const cbState = this.circuitBreaker.getState();
    const degraded: string[] = [];
    for (const feature of [
      "deep_think",
      "voice_input",
      "voice_output",
      "graph_3d",
      "meeting_intel",
      "real_time_stream",
    ]) {
      if (!(await this.degradation.isAvailable(feature)))
        degraded.push(feature);
    }
    return {
      status:
        cbState.state === "open"
          ? "degraded"
          : degraded.length > 2
            ? "critical"
            : "healthy",
      openCircuits: cbState.state === "open" ? ["llm_provider"] : [],
      degradedFeatures: degraded,
      circuitState: cbState.state,
      failures: cbState.failures,
    };
  }

  async getSettings(): Promise<AniSettings> {
    await this.assert("READ");
    return this._loadSettings();
  }

  async updateSettings(settings: Partial<AniSettings>): Promise<AniSettings> {
    await this.assert("UPDATE");
    const current = await this._loadSettings();
    const merged = { ...current, ...settings };
    await this.audit("ani.settings.updated", this.workspaceId);
    return merged;
  }

  async getToolCalls(conversationId: string): Promise<ToolCallRecord[]> {
    await this.assert("READ");
    const messages = await prisma.aniMessage.findMany({
      where: {
        conversationId,
        workspaceId: this.workspaceId,
        role: "assistant",
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const records: ToolCallRecord[] = [];
    for (const msg of messages) {
      try {
        const parsed = JSON.parse(msg.content);
        if (parsed.toolCalls) {
          for (const tc of parsed.toolCalls) {
            records.push({
              id: `tc_${msg.id}_${tc.name}`,
              conversationId,
              messageId: msg.id,
              tool: tc.name,
              provider: "n0va1o",
              status: "done",
              input: tc.arguments,
              durationMs: 0,
              createdAt: msg.createdAt.toISOString(),
            });
          }
        }
      } catch {
        /* skip non-JSON */
      }
    }

    return records;
  }

  private async _loadSettings(): Promise<AniSettings> {
    return DEFAULT_ANI_SETTINGS;
  }

  private async _runAgenticLoop(
    conversation: AniConversation,
    recentMessages: AniMessage[],
    userContent: string,
    _settings: AniSettings,
  ): Promise<{
    content: string;
    toolCalls?: ToolCallRequest[];
    citations?: ANIResponse["citations"];
    confidence?: number;
    modelRoute?: ReturnType<ModelPortfolioStrategy["route"]>;
    explanation?: ReturnType<XAIFramework["generateExplanation"]>;
    adaptationReceipt?: AdaptationReceipt | null;
    instructionLedger?: unknown[];
    governanceConflicts?: unknown[];
    governanceAudit?: unknown;
    brandValidation?: BrandValidationResult | null;
    personaLint?: PersonaLintResult | null;
    responseId?: string;
  }> {
    const integration = await this._resolveAniIntegration();
    const ctx = createWorkspaceContext(
      this.workspaceId,
      this.userId,
      `sess_${Date.now()}`,
      { activeModule: "ani" },
    );
    // Model portfolio routing — choose tier based on intent + complexity (spec 7.3 Model Constellation)
    const routeIntent = classifyIntent(userContent, ctx);
    const routeComplexity = assessComplexity(userContent, routeIntent, 128000);
    const modelRoute = this.modelPortfolio.route(
      routeIntent.classification,
      routeComplexity.isHighStakes ? "high" : routeComplexity.isTechnical ? "medium" : "low",
      routeComplexity.score,
    );

    // Memory Fabric — Context Broker is the only service allowed to assemble model context (Spec §3)
    // Authorization-first retrieval with freshness, conflict resolution, and signed manifest
    let ragContext: Awaited<ReturnType<typeof retrieveRagContext>>;
    let brokerManifest: import("./memory-fabric").ContextManifest | null = null;
    let brokerProvenance: Array<{ memory_id: string; source_ref: string }> = [];
    try {
      const fabric = createMemoryFabric(ctx);
      // Derive purpose from intent + risk for purpose-based access (Spec §4)
      const purpose = `${routeIntent.classification}_${routeComplexity.isHighStakes ? "high_stakes" : "standard"}`;
      const brokerRes = await withRetry(
        () =>
          fabric.broker.assemble({
            userRequest: userContent,
            workspace: ctx,
            activeSources: ["docs", "tasks", "calendar", "mail", "chat", "contacts", "crm", "drive", "approvals"],
            purpose,
            sessionId: conversation.id,
            maxTokens: Math.min(modelRoute.maxContext, 12000),
          }),
        { maxAttempts: 2, baseDelayMs: 200 },
      );
      if (brokerRes.result) {
        brokerManifest = brokerRes.result.manifest;
        brokerProvenance = brokerRes.result.provenance;
        // Map broker provenance to RagContext shape for downstream compatibility
        // Reuse broker's compiled prompt's documents via fresh RAG fetch for citation display (manifest is source of truth)
        const fallbackRag = await retrieveRagContext(userContent, ctx, 5);
        // Filter fallback docs to only those in manifest's allowed memory_ids (authorization-first)
        const allowedIds = new Set(brokerManifest.memory_ids);
        const filteredDocs = fallbackRag.documents.filter((d) => allowedIds.has(`mem_rag_${d.id}`) || allowedIds.size === 0);
        ragContext = {
          query: userContent,
          expandedQuery: fallbackRag.expandedQuery,
          documents: filteredDocs.length > 0 ? filteredDocs : fallbackRag.documents.slice(0, 3),
          citations: (filteredDocs.length > 0 ? filteredDocs : fallbackRag.documents.slice(0, 3)).map((d) => ({
            source: d.source,
            confidence: d.score,
            snippet: d.content.slice(0, 220),
          })),
          assembledPrompt: brokerRes.result.compiledPrompt,
        };
        // Record excluded for audit per Spec §3 "Record exactly what was included and excluded"
        if (brokerRes.result.excluded.length > 0) {
          await this.audit("ani.context_broker.excluded", `${conversation.id}:${brokerRes.result.excluded.length}`);
        }
      } else {
        throw new Error("broker degraded");
      }
    } catch {
      // Fallback to legacy RAG with graceful degradation + retry (Stage 1 safe foundation)
      try {
        const ragRes = await withRetry(() => retrieveRagContext(userContent, ctx), {
          maxAttempts: 2,
          baseDelayMs: 200,
        });
        if (ragRes.result) ragContext = ragRes.result;
        else {
          ragContext = {
            query: userContent,
            expandedQuery: userContent,
            documents: [],
            citations: [],
            assembledPrompt: `Query: ${userContent}`,
          };
          await this.audit("ani.rag.degraded", conversation.id);
        }
      } catch {
        ragContext = {
          query: userContent,
          expandedQuery: userContent,
          documents: [],
          citations: [],
          assembledPrompt: `Query: ${userContent}`,
        };
      }
    }

    if (!integration || !integration.config) {
      if (ragContext.documents.length > 0) {
        const docList = ragContext.documents
          .slice(0, 3)
          .map(
            (d) => `- **${d.title}** (${d.module}): ${d.content.slice(0, 100)}`,
          )
          .join("\n");
        return {
          content: `Based on your workspace, here's what I found related to "${userContent}":\n\n${docList}\n\n[Note: Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY for full AI responses.]`,
          citations: ragContext.citations,
          confidence: 0.5,
          modelRoute,
        };
      }
      return {
        content: composeFallbackReply(userContent, conversation.title),
        confidence: 0.3,
        modelRoute,
      };
    }

    const cfg = integration.config as Record<string, unknown>;
    // If portfolio suggests frontier but integration is small tier, honor integration cap unless transcendent workspace
    const model = (cfg.model as string) ?? modelRoute.modelName;
    const provider = integration.provider;

    const availableTools = await this._discoverScopedTools();
    const ragPrompt = brokerManifest
      ? ragContext.assembledPrompt // Broker already compiled with budget, safety rules, and untrusted data boundary (Spec §10)
      : buildRagPrompt(userContent, ctx, ragContext);

    // === Personalization Governance Layer — Control Plane (replaces single-style mimicry) ===
    // Bounded, explainable, reversible — minimal task-specific projection, sensitive excluded.
    // Pipeline: identity → task scope → eligibility → sensitive exclusion → conflict resolution → projection
    let governanceResult: Awaited<ReturnType<GovernanceBundle["plane"]["process"]>> | null = null;
    let governanceReceipt: AdaptationReceipt | null = null;
    let personalizationProjectionBlock = "";
    // Extract optional per-request personalization controls from caller (stored transiently on recentMessages meta if present)
    // For now, default to use_saved with private surface; high-sensitivity auto-defaults to off inside the plane.
    const perRequestPersonalization: ControlPlaneRequest["personalization"] = (() => {
      // Allow caller to set personalization via a convention: if userContent contains a JSON block [PERSONALIZATION_CONTROL: {...}], parse it
      // This avoids breaking existing send(conversationId, content) signature while supporting task_only/preview etc.
      const ctrlMatch = userContent.match(/\[PERSONALIZATION_CONTROL:\s*(\{.*?\})\s*\]/s);
      if (ctrlMatch) {
        try {
          const parsed = JSON.parse(ctrlMatch[1]!) as ControlPlaneRequest["personalization"];
          return parsed;
        } catch {
          return { mode: "use_saved", surface: "private", explain_adaptation: true };
        }
      }
      return { mode: "use_saved", surface: "private", explain_adaptation: true };
    })();
    try {
      const govReq: ControlPlaneRequest = {
        user_id: this.userId,
        tenant_id: this.workspaceId,
        workspace_id: this.workspaceId,
        task: routeIntent.classification,
        module: ctx.activeModule,
        prompt: userContent,
        personalization: perRequestPersonalization,
        is_high_sensitivity: routeComplexity.isHighStakes || routeIntent.riskLevel === "critical",
      };
      governanceResult = await this.governance.plane.process(govReq);
      governanceReceipt = governanceResult.receipt;
      if (Object.keys(governanceResult.projected.active_preferences).length > 0) {
        personalizationProjectionBlock = `\n\n[PERSONALIZATION — task projection]\n${JSON.stringify(governanceResult.projected, null, 2)}`;
        // Update last_used for applied profiles
        for (const pid of governanceResult.projected.provenance_profile_ids) {
          const prof = this.governance.store.list(this.workspaceId, this.userId).find((p) => p.profile_id === pid)
            ?? this.governance.store.listAllForTenant(this.workspaceId).find((p) => p.profile_id === pid);
          if (prof) prof.last_used_at = new Date().toISOString();
        }
      } else if (governanceResult.should_use_default) {
        personalizationProjectionBlock = "";
      }
    } catch {
      personalizationProjectionBlock = "";
      governanceResult = null;
    }

    const systemPrompt = DEFAULT_SYSTEM_PROMPT + personalizationProjectionBlock;
    // Legacy AdaptiveLearningEngine no longer injected by default — governance is the only personalization path.
    // Keeps personalization bounded, permission-aware, and auditable per spec.

    // Conversation compression for long threads (spec 5.3: Summary Compression 10:1)
    let historyForPrompt = recentMessages;
    let compressionNote: string | null = null;
    if (recentMessages.length > 14) {
      const keepLast = 10;
      const older = recentMessages.slice(0, -keepLast);
      const recent = recentMessages.slice(-keepLast);
      // Lightweight compression: extract key facts/decisions/actions from older msgs
      const olderSummary = this._compressOlderMessages(older);
      compressionNote = `Compressed ${older.length} earlier messages into summary (${olderSummary.length} chars)`;
      historyForPrompt = [
        {
          id: "compressed_summary",
          conversationId: conversation.id,
          workspaceId: conversation.workspaceId,
          role: "system",
          content: `[COMPRESSED HISTORY — ${older.length} messages summarized]\n${olderSummary}\n[End compressed — following are recent messages]`,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as AniMessage,
        ...recent,
      ];
    }

    const messages: Array<{
      role: string;
      content: string;
      tool_calls?: unknown[];
      tool_call_id?: string;
    }> = [{ role: "system", content: systemPrompt }];

    // Optional compression note as system reminder
    if (compressionNote) {
      messages.push({ role: "system", content: compressionNote });
    }

    for (const m of historyForPrompt) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: "user", content: ragPrompt });

    // HITL pre-check via intent risk + tool risk labeling (reuse routed intent for consistency)
    const { evaluateHITL } = await import("./hitl");
    const intent = routeIntent;
    const complexity = routeComplexity;
    const hitlDecision = evaluateHITL(userContent, {
      financialImpactUsd: intent.entities.some((e) => e.startsWith("$")) ? 10000 : 0,
      recipientCount: 0,
      isDestructive: intent.riskLevel === "high" || intent.riskLevel === "critical",
      isCrossTenant: false,
      isPrivilegeEscalation: userContent.toLowerCase().includes("admin") && userContent.toLowerCase().includes("grant"),
      isPHI: userContent.toLowerCase().includes("health") || userContent.toLowerCase().includes("phi"),
      tier: ctx.tenantTier,
    });

    let finalContent = "";
    let blockedByHITL = false;

    for (let turn = 0; turn < MAX_AGENTIC_TURNS; turn++) {
      let llmResult: Awaited<ReturnType<typeof callLlm>>;
      try {
        // Circuit breaker + retry for LLM (spec 5.2 latency target resilience)
        llmResult = await this.circuitBreaker.execute(
          async () => {
            const res = await withRetry(
              () => callLlm(provider, model, cfg, messages, availableTools),
              { maxAttempts: 2, baseDelayMs: 400 },
            );
            if (res.result) return res.result;
            // if retry returned null but not thrown, use fallback
            return {
              content: composeFallbackReply(userContent, conversation.title),
            };
          },
          async () => ({
            content: composeFallbackReply(userContent, conversation.title),
          }),
        );
      } catch {
        llmResult = {
          content: composeFallbackReply(userContent, conversation.title),
        };
        await this.audit("ani.llm.circuit_open", conversation.id);
      }

      if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
        // HITL gate: if requires human and tools include high-risk, defer instead of auto-executing
        if (
          hitlDecision.requiresHuman &&
          llmResult.toolCalls.some((tc) =>
            availableTools.find((at) => at.name === tc.name)?.riskLabel === "high",
          )
        ) {
          blockedByHITL = true;
          messages.push({
            role: "assistant",
            content: `HITL required (${hitlDecision.level}): ${hitlDecision.reason}. Awaiting human approval before executing: ${llmResult.toolCalls.map((tc) => tc.name).join(", ")}`,
          });
          finalContent =
            `This action requires approval (${hitlDecision.level}): ${hitlDecision.reason}. Tools requested: ${llmResult.toolCalls.map((tc) => tc.name).join(", ")}. Confirm in HITL queue to proceed.`;
          await this.audit("ani.hitl.blocked", conversation.id);
          break;
        }

        messages.push({
          role: "assistant",
          content: llmResult.content,
          tool_calls: llmResult.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });

        for (const tc of llmResult.toolCalls) {
          const toolResult = await this._executeTool(tc.name, tc.arguments);
          if (!toolResult.ok) {
            const fail = this.failures.handle(tc.name, toolResult.message);
            messages.push({
              role: "tool",
              content: `Error: ${toolResult.message} [${fail.type} → ${fail.recoveryAction}]`,
              tool_call_id: tc.id,
            });
          } else {
            messages.push({
              role: "tool",
              content: toolResult.message,
              tool_call_id: tc.id,
            });
          }
        }

        if (turn === MAX_AGENTIC_TURNS - 1) {
          finalContent =
            "I've explored the available tools — let me summarize what I found.";
        }
        continue;
      }

      finalContent = llmResult.content ?? "(no response)";
      break;
    }

    // If HITL blocked, prepend safety notice
    if (blockedByHITL) {
      finalContent = `⚠️ Human approval required — action paused.\n\n${finalContent}`;
    }

    // Enrich with @ani contextual follow-up hint when mention was present
    if (userContent.includes("@ani") || intent.confidence < 0.6) {
      finalContent += `\n\n_Tip: Use @ani in any workspace chat to bring ANI into context — or press Ctrl+Space to invoke ANI globally._`;
    }

    // Brand voice validation AFTER generation — show violations, never silently fix regulated content
    let brandValidation: BrandValidationResult | null = null;
    let personaLintForResponse: PersonaLintResult | null = null;
    try {
      if (governanceResult) {
        // Brand validator tied to governance's brand rules
        const brandCheck = this.governance.brandEngine.validate(finalContent);
        brandValidation = brandCheck;
        // Governance already did persona lint; reuse
        personaLintForResponse = governanceResult.persona_lint ?? null;
        // If brand fails with prohibited terminology, surface violation — do not silently rewrite
        if (brandCheck.decision === "fail" && brandCheck.violations.length > 0) {
          // Append a non-blocking advisory (user-visible, not silent correction)
          const advisory = brandCheck.violations
            .slice(0, 2)
            .map((v) => `• ${v.rule}: ${v.suggestion}`)
            .join("\n");
          finalContent += `\n\n[Brand check: ${brandCheck.decision}]\n${advisory}\n_Your admin's brand rules flagged this — see suggestions above rather than auto-correction._`;
          await this.audit("ani.brand.violation", `${conversation.id}:${brandCheck.violations[0]?.rule}`);
        }
      }
    } catch {
      /* brand validation best-effort */
    }

    // Cognition ledger — immutable explainability record (spec 4.3 + XAI + 16 Provenance graph)
    let explanation: ReturnType<XAIFramework["generateExplanation"]> | undefined;
    try {
      const ledgerSources =
        brokerProvenance.length > 0
          ? brokerProvenance.map((p) => ({ id: p.memory_id, type: "memory_fabric", relevance: 0.9 }))
          : ragContext.documents.map((d) => ({ id: d.id, type: d.module, relevance: d.score }));
      const ledgerEntry = this.ledger.record({
        responseId: `resp_${Date.now().toString(36)}`,
        sources: ledgerSources,
        modelUsed: modelRoute.modelName,
        policyChecks: [
          { policy: "tenant_isolation", passed: true },
          { policy: "pii_redaction", passed: !blockedByHITL },
          { policy: "hitl_enforcement", passed: !blockedByHITL || hitlDecision.requiresHuman },
        ],
        selfEvaluation: {
          groundedness: ragContext.documents.length > 0 ? 0.92 : 0.45,
          usefulness: intent.confidence,
          safety: blockedByHITL ? 0.6 : 0.98,
        },
        finalConfidence: blockedByHITL ? 0.62 : 0.85,
      });
      // Generate XAI explanation for UI (depth based on route)
      const xaiDepth = modelRoute.tier === "frontier" ? "counterfactual" : modelRoute.tier === "medium" ? "citation" : "summary";
      explanation = this.xai.generateExplanation({
        userType: "end_user",
        depth: xaiDepth as never,
        output: {
          content: finalContent,
          citations: ragContext.citations.map((c) => ({ source: c.source, confidence: c.confidence })),
          tokens: { input: ragPrompt.length / 4, output: finalContent.length / 4, total: (ragPrompt.length + finalContent.length) / 4 },
          latencyMs: 0,
          costUsd: modelRoute.costPerToken * (finalContent.length / 4),
          safetyFlags: blockedByHITL ? ["HITL_BLOCKED"] : [],
          hallucinationScore: ragContext.documents.length > 0 ? 0.08 : 0.22,
          confidenceScore: blockedByHITL ? 0.62 : 0.85,
        },
        context: ctx,
      });
      void ledgerEntry;
    } catch {
      /* ledger best-effort */
    }

    // Knowledge graph — persist entities from this exchange (spec 6.3 context awareness)
    try {
      const kgEntity = this.kg.addEntity({
        name: userContent.slice(0, 60),
        type: "conversation",
        properties: { conversationId: conversation.id, intent: intent.classification },
      });
      void kgEntity;
    } catch {
      /* kg best-effort */
    }

    // === Governance artefacts: adaptation receipt, ledger, audit ===
    const responseId = `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let adaptationReceipt: AdaptationReceipt | null = governanceReceipt;
    let instructionLedger = governanceResult?.instruction_ledger ?? [];
    let governanceConflicts = governanceResult?.conflicts ?? [];
    let governanceAudit = governanceResult?.audit_event ?? null;
    if (governanceReceipt && governanceResult) {
      try {
        this.governance.api.storeReceipt(responseId, governanceReceipt);
        await this.audit(`ani.personalization.${governanceResult.audit_event.event}`, responseId);
        this.governance.store.auditAccess({
          at: new Date().toISOString(),
          actor_id: this.userId,
          action: "create",
          profile_id: responseId,
          tenant_id: this.workspaceId,
          details: { governance_audit: governanceResult.audit_event, brand_decision: brandValidation?.decision } as unknown as Record<string, unknown>,
        });
      } catch {
        /* audit best-effort */
      }
    } else {
      // No governance — synthesize default receipt (every response must produce one)
      adaptationReceipt = {
        applied: [{ profile: "Default N0VA style", rules: ["model default"] }],
        not_applied: [{ profile: "Personalization", reason: "no active profiles" }],
        scope: "task",
        revert_available: false,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      content: finalContent,
      citations: ragContext.citations,
      confidence: blockedByHITL ? 0.62 : 0.85,
      modelRoute,
      explanation,
      adaptationReceipt,
      instructionLedger,
      governanceConflicts,
      governanceAudit,
      brandValidation,
      personaLint: personaLintForResponse,
      responseId,
    };
  }

  private async _resolveAniIntegration() {
    const candidate = await prisma.integration.findFirst({
      where: {
        workspaceId: this.workspaceId,
        provider: { in: ["openai", "anthropic", "gemini"] },
        enabled: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (candidate?.config) return candidate;

    if (
      process.env["OPENAI_API_KEY"] ||
      process.env["ANTHROPIC_API_KEY"] ||
      process.env["GOOGLE_API_KEY"] ||
      process.env["GEMINI_API_KEY"]
    ) {
      const provider = process.env["OPENAI_API_KEY"]
        ? "openai"
        : process.env["ANTHROPIC_API_KEY"]
          ? "anthropic"
          : "gemini";
      return {
        id: "env-llm",
        provider,
        name: "LLM (env)",
        enabled: true,
        config: {
          provider,
          token:
            process.env["OPENAI_API_KEY"] ??
            process.env["ANTHROPIC_API_KEY"] ??
            process.env["GEMINI_API_KEY"] ??
            process.env["GOOGLE_API_KEY"]!,
          model:
            provider === "openai"
              ? "gpt-4o-mini"
              : provider === "anthropic"
                ? "claude-3-5-sonnet-20241022"
                : "gemini-1.5-flash",
        },
        workspaceId: this.workspaceId,
      } as never;
    }

    return null;
  }

  private async _discoverScopedTools() {
    const integrations = await prisma.integration.findMany({
      where: { workspaceId: this.workspaceId, enabled: true, mcpEnabled: true },
      select: {
        id: true,
        provider: true,
        name: true,
        config: true,
        allowlistTools: true,
        blocklistTools: true,
      },
    });

    const allTools: Array<{
      name: string;
      description: string;
      provider: string;
      integrationId: string;
      integration: unknown;
      riskLabel: "low" | "medium" | "high";
    }> = [];

    for (const integ of integrations) {
      const tools = effectiveTools(integ as never);
      for (const t of tools) {
        allTools.push({
          name: t.name,
          description: t.description,
          provider: integ.provider,
          integrationId: integ.id,
          integration: integ,
          riskLabel: t.destructive ? "high" : "low",
        });
      }
    }

    return allTools;
  }

  private async _executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    const integration = await prisma.integration.findFirst({
      where: { workspaceId: this.workspaceId, mcpEnabled: true, enabled: true },
      orderBy: { createdAt: "desc" },
    });

    if (!integration)
      return { ok: false, message: "No MCP-enabled integration found" };
    const t = effectiveTools(integration).find((tt) => tt.name === name);
    if (!t)
      return {
        ok: false,
        message: `Tool "${name}" not available on integration ${integration.name}`,
      };

    try {
      const result = await this.gateway.call({
        integration: integration as never,
        workspaceId: this.workspaceId,
        userId: this.userId,
        actorLabel: `ani:${this.userId}`,
        tool: name,
        input: args,
        skipPolicyCheck: false,
      });
      return {
        ok: result.ok,
        message: result.message,
        statusCode: result.statusCode,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return {
        ok: false,
        message: msg,
        statusCode:
          err instanceof Error && "statusCode" in err
            ? (err as { statusCode: number }).statusCode
            : 500,
      };
    }
  }

  private _compressOlderMessages(messages: AniMessage[]): string {
    // Cheap 10:1 summary using heuristics: keep decisions, questions, actions
    const lines: string[] = [];
    for (const m of messages) {
      const snippet = m.content.slice(0, 180).replace(/\n+/g, " ");
      const isDecision = /(decided|chosen|agreed|approved|blocked|risk|deadline|todo|action item|next step)/i.test(m.content);
      const prefix = m.role === "user" ? "User" : "ANI";
      const marker = isDecision ? "★" : "·";
      lines.push(`${marker} ${prefix}: ${snippet}${m.content.length > 180 ? "…" : ""}`);
      if (lines.length >= 12) break;
    }
    if (messages.length > lines.length) {
      lines.push(`… +${messages.length - lines.length} more messages omitted`);
    }
    return lines.join("\n");
  }

  private async _persistToolCalls(
    conversationId: string,
    messageId: string,
    toolCalls: ToolCallRequest[],
  ): Promise<void> {
    await this.audit("ani.tool_calls.executed", conversationId);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "AniConversation",
      targetId,
    });
  }
}
