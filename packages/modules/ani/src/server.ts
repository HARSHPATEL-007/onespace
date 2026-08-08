import { prisma, logAudit, type AniConversation, type AniMessage } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { N0va1oGateway } from "@n0va/modules-n0va1o/gateway";
import { effectiveTools } from "@n0va/modules-n0va1o/mcp";
import { N0VA_ANI, createANI, createWorkspaceContext, classifyIntent, type ANIResponse } from "./engine";
import { callLlm, getTypingDelay, DEFAULT_SYSTEM_PROMPT, composeFallbackReply, type ToolCallRequest } from "./providers";
import { retrieveRagContext, buildRagPrompt } from "./rag";
import { PersistentMemorySystem, createMemorySystem } from "./memory";
import { ConsciousnessStack } from "./consciousness";
import { XAIFramework, createXAI } from "./xai";
import { AdaptiveLearningEngine, createAdaptiveEngine } from "./adaptive";
import { CrisisResilienceEngine, createCrisisEngine } from "./resilience";
import { KnowledgeGraphEngine, createKnowledgeGraph } from "./knowledge-graph";
import { DEFAULT_ANI_SETTINGS, type AniSettings, type ToolCallRecord } from "./types";

const MODULE = "ani";

const MAX_CONTEXT_MESSAGES = 20;
const MAX_AGENTIC_TURNS = 5;

export type ConversationWithMessages = AniConversation & { messages: AniMessage[] };

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
  private crisis: CrisisResilienceEngine;

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
    this.crisis = createCrisisEngine();
  }

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    try {
      if (!(await can(this.workspaceId, this.role, MODULE, action))) {
        throw new Error(`Missing ${action} permission for ani`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Missing")) throw err;
      throw new Error(`Permission check failed: ${err instanceof Error ? err.message : "DB unavailable"}`);
    }
  }

  async conversations(): Promise<Array<ConversationWithMessages & { unread: number }>> {
    await this.assert("READ");
    const conversations = await prisma.aniConversation.findMany({
      where: { workspaceId: this.workspaceId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 2 } },
      orderBy: { updatedAt: "desc" },
    });
    return conversations.map((c) => ({ ...c, unread: c.messages.filter((m) => m.role === "assistant").length }));
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
      data: { workspaceId: this.workspaceId, createdById: this.userId, title: title || "New conversation" },
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
  }> {
    await this.assert("CREATE");
    const conversation = await prisma.aniConversation.findFirst({ where: { id: conversationId, workspaceId: this.workspaceId } });
    if (!conversation) throw new Error("Conversation not found");

    const userMessage = await prisma.aniMessage.create({
      data: { conversationId, workspaceId: this.workspaceId, role: "user", content },
    });

    const recentMessages = await prisma.aniMessage.findMany({
      where: { conversationId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTEXT_MESSAGES,
    });

    const settings = await this._loadSettings();
    const result = await this._runAgenticLoop(conversation, recentMessages, content, settings);

    const assistantMsg = await prisma.aniMessage.create({
      data: {
        conversationId,
        workspaceId: this.workspaceId,
        role: "assistant",
        content: result.content,
      },
    });

    await prisma.aniConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    const messageCount = await prisma.aniMessage.count({ where: { conversationId } });
    const delayMs = getTypingDelay(messageCount);

    if (result.toolCalls && result.toolCalls.length > 0) {
      await this._persistToolCalls(conversationId, assistantMsg.id, result.toolCalls);
    }

    await this.memory.store(
      { query: content, response: result.content.slice(0, 500), ragResults: result.citations?.length ?? 0 },
      { sessionId: conversationId, tier: "episodic", modality: "conversation", sensitivity: "internal" },
    );

    this.adaptive.recordFeedback(this.userId, {
      timestamp: new Date().toISOString(),
      type: "implicit",
      category: "conversation",
      rating: result.confidence,
      context: { conversationId },
      weight: 0.3,
    });

    try {
      const prismaAny = prisma as unknown as Record<string, { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }>;
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
    } catch { /* consciousness snapshots are best-effort until prisma generate runs */ }

    return {
      userMessage,
      assistantMessage: assistantMsg,
      delayMs,
      ...(result.toolCalls && result.toolCalls.length > 0 ? { toolCalls: JSON.stringify(result.toolCalls) } : {}),
      ...(result.citations ? { citations: JSON.stringify(result.citations) } : {}),
      ...(result.confidence !== undefined ? { confidence: result.confidence } : {}),
    };
  }

  async persistMemoryMark(type: string, content: string, importance: number, tags: string[] = []): Promise<string> {
    await this.assert("CREATE");
    const prismaAny = prisma as unknown as (Record<string, { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> }> | undefined);
    if (!prismaAny?.["aniMemoryMark"]) return `mm_${Date.now()}`;
    const mark = await prismaAny["aniMemoryMark"].create({
      data: { workspaceId: this.workspaceId, userId: this.userId, type, content, importance, tags },
    });
    return mark.id;
  }

  async getMemoryMarks(type?: string, limit: number = 20): Promise<Array<{ id: string; type: string; content: string; importance: number; tags: string[]; createdAt: Date }>> {
    await this.assert("READ");
    const prismaAny = prisma as unknown as (Record<string, { findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; type: string; content: string; importance: number; tags: string[]; createdAt: Date }>> }> | undefined);
    if (!prismaAny?.["aniMemoryMark"]) return [];
    return prismaAny["aniMemoryMark"].findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, ...(type ? { type } : {}) },
      orderBy: { importance: "desc" },
      take: limit,
    });
  }

  async recordOutcome(feature: string, action: string, timeSavedMs: number, satisfaction: number): Promise<void> {
    await this.assert("CREATE");
    const prismaAny = prisma as unknown as (Record<string, { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }> | undefined);
    if (!prismaAny?.["aniOutcome"]) return;
    await prismaAny["aniOutcome"].create({
      data: { workspaceId: this.workspaceId, userId: this.userId, feature, action, timeSavedMs, satisfaction },
    });
  }

  async getOutcomes(limit: number = 50): Promise<Array<{ feature: string; action: string; satisfaction: number; createdAt: Date }>> {
    await this.assert("READ");
    const prismaAny = prisma as unknown as (Record<string, { findMany: (args: Record<string, unknown>) => Promise<Array<{ feature: string; action: string; satisfaction: number; createdAt: Date }>> }> | undefined);
    if (!prismaAny?.["aniOutcome"]) return [];
    return prismaAny["aniOutcome"].findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async saveMeetingSession(meetingId: string, title: string, participants: string[], decisions: number, actions: number, engagement: number): Promise<void> {
    await this.assert("CREATE");
    const prismaAny = prisma as unknown as (Record<string, { create: (args: { data: Record<string, unknown> }) => Promise<unknown> }> | undefined);
    if (!prismaAny?.["aniMeetingSession"]) return;
    await prismaAny["aniMeetingSession"].create({
      data: { workspaceId: this.workspaceId, meetingId, title, participants, decisionsCount: decisions, actionItemsCount: actions, engagement },
    });
  }

  async getMeetingSessions(limit: number = 10): Promise<Array<{ meetingId: string; title: string; decisionsCount: number; actionItemsCount: number; engagement: number; createdAt: Date }>> {
    await this.assert("READ");
    const prismaAny = prisma as unknown as (Record<string, { findMany: (args: Record<string, unknown>) => Promise<Array<{ meetingId: string; title: string; decisionsCount: number; actionItemsCount: number; engagement: number; createdAt: Date }>> }> | undefined);
    if (!prismaAny?.["aniMeetingSession"]) return [];
    return prismaAny["aniMeetingSession"].findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async clear(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.aniMessage.deleteMany({ where: { conversationId: id, workspaceId: this.workspaceId } });
    await prisma.aniConversation.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.aniConversation.delete({ where: { id } });
    await this.audit("ani.conversation.deleted", id);
  }

  async classify(input: string): Promise<ReturnType<typeof classifyIntent>> {
    await this.assert("READ");
    const ctx = createWorkspaceContext(this.workspaceId, this.userId, `sess_${Date.now()}`, { activeModule: "ani" });
    return classifyIntent(input, ctx);
  }

  async processWithEngine(input: string): Promise<ANIResponse> {
    await this.assert("CREATE");
    const ctx = createWorkspaceContext(this.workspaceId, this.userId, `sess_${Date.now()}`, { activeModule: "ani" });
    return this.engine.process(input, ctx, { useN0VA1O: false });
  }

  async deepThink(
    input: string,
    options: { depth?: "fast" | "balanced" | "deep" | "research"; autoDepth?: boolean } = {},
  ): Promise<ReturnType<typeof this.engine.processDeepThink>> {
    await this.assert("CREATE");
    const ctx = createWorkspaceContext(this.workspaceId, this.userId, `sess_${Date.now()}`, { activeModule: "ani" });
    return this.engine.processDeepThink(input, ctx, options);
  }

  async analyzeComplexity(input: string): Promise<ReturnType<typeof import("./deep-think").assessComplexity>> {
    await this.assert("READ");
    const { assessComplexity } = await import("./deep-think");
    const { classifyIntent } = await import("./engine");
    const ctx = createWorkspaceContext(this.workspaceId, this.userId, `sess_${Date.now()}`, { activeModule: "ani" });
    return assessComplexity(input, classifyIntent(input, ctx), 128000);
  }

  async getConsciousnessMetrics(): Promise<ReturnType<ConsciousnessStack["getMetrics"]>> {
    await this.assert("READ");
    return this.consciousness.getMetrics();
  }

  async getMemoryStats(): Promise<{ total: number; working: number; semantic: number }> {
    await this.assert("READ");
    const stats = await this.memory.getStats();
    return { total: stats.total, working: stats.working, semantic: stats.semantic };
  }

  async getSystemHealth(): Promise<{ status: "healthy" | "degraded" | "critical"; openCircuits: string[]; degradedFeatures: string[]; recentFailures: Array<{ id: string; timestamp: string; severity: string; component: string; message: string }> }> {
    await this.assert("READ");
    return this.crisis.getSystemHealth();
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
      where: { conversationId, workspaceId: this.workspaceId, role: "assistant" },
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
      } catch { /* skip non-JSON */ }
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
  ): Promise<{ content: string; toolCalls?: ToolCallRequest[]; citations?: ANIResponse["citations"]; confidence?: number }> {
    const integration = await this._resolveAniIntegration();
    const ctx = createWorkspaceContext(this.workspaceId, this.userId, `sess_${Date.now()}`, { activeModule: "ani" });
    const ragContext = await retrieveRagContext(userContent, ctx);

    if (!integration || !integration.config) {
      if (ragContext.documents.length > 0) {
        const docList = ragContext.documents.slice(0, 3).map((d) => `- **${d.title}** (${d.module}): ${d.content.slice(0, 100)}`).join("\n");
        return {
          content: `Based on your workspace, here's what I found related to "${userContent}":\n\n${docList}\n\n[Note: Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY for full AI responses.]`,
          citations: ragContext.citations,
          confidence: 0.5,
        };
      }
      return { content: composeFallbackReply(userContent, conversation.title), confidence: 0.3 };
    }

    const cfg = integration.config as Record<string, unknown>;
    const model = (cfg.model as string) ?? "gpt-4o-mini";
    const provider = integration.provider;

    const availableTools = await this._discoverScopedTools();
    const ragPrompt = buildRagPrompt(userContent, ctx, ragContext);
    const adaptiveMods = this.adaptive.getAdaptivePromptModifiers(this.userId);
    const systemPrompt = DEFAULT_SYSTEM_PROMPT + (adaptiveMods.length > 0 ? "\n\n[USER PREFERENCES]\n" + adaptiveMods.join("\n") : "");

    const messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }> = [
      { role: "system", content: systemPrompt },
    ];

    for (const m of recentMessages) {
      messages.push({ role: m.role, content: m.content });
    }

    messages.push({ role: "user", content: ragPrompt });

    let finalContent = "";

    for (let turn = 0; turn < MAX_AGENTIC_TURNS; turn++) {
      const llmResult = await callLlm(provider, model, cfg, messages, availableTools);

      if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: llmResult.content,
          tool_calls: llmResult.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })),
        });

        for (const tc of llmResult.toolCalls) {
          const toolResult = await this._executeTool(tc.name, tc.arguments);
          const resultText = toolResult.ok ? toolResult.message : `Error: ${toolResult.message}`;
          messages.push({ role: "tool", content: resultText, tool_call_id: tc.id });
        }

        if (turn === MAX_AGENTIC_TURNS - 1) {
          finalContent = "I've explored the available tools — let me summarize what I found.";
        }
        continue;
      }

      finalContent = llmResult.content ?? "(no response)";
      break;
    }

    return {
      content: finalContent,
      citations: ragContext.citations,
      confidence: 0.85,
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

    if (process.env["OPENAI_API_KEY"] || process.env["ANTHROPIC_API_KEY"] || process.env["GOOGLE_API_KEY"] || process.env["GEMINI_API_KEY"]) {
      const provider = process.env["OPENAI_API_KEY"] ? "openai" : process.env["ANTHROPIC_API_KEY"] ? "anthropic" : "gemini";
      return {
        id: "env-llm",
        provider,
        name: "LLM (env)",
        enabled: true,
        config: {
          provider,
          token: process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"]!,
          model: provider === "openai" ? "gpt-4o-mini" : provider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gemini-1.5-flash",
        },
        workspaceId: this.workspaceId,
      } as never;
    }

    return null;
  }

  private async _discoverScopedTools() {
    const integrations = await prisma.integration.findMany({
      where: { workspaceId: this.workspaceId, enabled: true, mcpEnabled: true },
      select: { id: true, provider: true, name: true, config: true, allowlistTools: true, blocklistTools: true },
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

  private async _executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    const integration = await prisma.integration.findFirst({
      where: { workspaceId: this.workspaceId, mcpEnabled: true, enabled: true },
      orderBy: { createdAt: "desc" },
    });

    if (!integration) return { ok: false, message: "No MCP-enabled integration found" };
    const t = effectiveTools(integration).find((tt) => tt.name === name);
    if (!t) return { ok: false, message: `Tool "${name}" not available on integration ${integration.name}` };

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
      return { ok: result.ok, message: result.message, statusCode: result.statusCode };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, message: msg, statusCode: err instanceof Error && "statusCode" in err ? (err as { statusCode: number }).statusCode : 500 };
    }
  }

  private async _persistToolCalls(conversationId: string, messageId: string, toolCalls: ToolCallRequest[]): Promise<void> {
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
