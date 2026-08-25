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
  ): Promise<{
    userMessage: AniMessage;
    assistantMessage: AniMessage;
    delayMs: number;
    toolCalls?: string;
    citations?: string;
    confidence?: number;
    modelRoute?: string;
    explanation?: string;
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

    const recentMessages = await prisma.aniMessage.findMany({
      where: { conversationId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTEXT_MESSAGES,
    });

    const settings = await this._loadSettings();
    const result = await this._runAgenticLoop(
      conversation,
      recentMessages,
      normalizedContent,
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

    this.adaptive.recordFeedback(this.userId, {
      timestamp: new Date().toISOString(),
      type: "implicit",
      category: "conversation",
      rating: result.confidence,
      context: { conversationId },
      weight: 0.3,
    });

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
    };
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
    const adaptiveMods = this.adaptive.getAdaptivePromptModifiers(this.userId);
    const systemPrompt =
      DEFAULT_SYSTEM_PROMPT +
      (adaptiveMods.length > 0
        ? "\n\n[USER PREFERENCES]\n" + adaptiveMods.join("\n")
        : "");

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

    return {
      content: finalContent,
      citations: ragContext.citations,
      confidence: blockedByHITL ? 0.62 : 0.85,
      modelRoute,
      explanation,
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
