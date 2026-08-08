import { prisma, logAudit, type AniConversation, type AniMessage } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { N0va1oGateway } from "@n0va/modules-n0va1o/gateway";
import { effectiveTools } from "@n0va/modules-n0va1o/mcp";
import { discoverTools } from "@n0va/modules-n0va1o/catalog";
import { N0VA_ANI, createANI, createWorkspaceContext, classifyIntent, type ANIResponse } from "./engine";
import { callLlm, getTypingDelay, DEFAULT_SYSTEM_PROMPT, composeFallbackReply, type LlmCallResult, type ToolCallRequest } from "./providers";
import { retrieveRagContext, buildRagPrompt } from "./rag";
import { ConsciousnessStack } from "./consciousness";
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

  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {
    this.gateway = new N0va1oGateway();
    this.engine = createANI({ workspaceId });
    this.consciousness = new ConsciousnessStack();
  }

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for ani`);
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

    return {
      userMessage,
      assistantMessage: assistantMsg,
      delayMs,
      ...(result.toolCalls && result.toolCalls.length > 0 ? { toolCalls: JSON.stringify(result.toolCalls) } : {}),
      ...(result.citations ? { citations: JSON.stringify(result.citations) } : {}),
      ...(result.confidence !== undefined ? { confidence: result.confidence } : {}),
    };
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

  async getConsciousnessMetrics(): Promise<ReturnType<ConsciousnessStack["getMetrics"]>> {
    await this.assert("READ");
    return this.consciousness.getMetrics();
  }

  async getMemoryStats(): Promise<{ total: number; working: number; semantic: number }> {
    await this.assert("READ");
    return { total: 0, working: 0, semantic: 0 };
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
    return [];
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
    if (!integration || !integration.config) {
      return { content: composeFallbackReply(userContent, conversation.title) };
    }

    const cfg = integration.config as Record<string, unknown>;
    const model = (cfg.model as string) ?? "gpt-4o-mini";
    const provider = integration.provider;

    const availableTools = await this._discoverScopedTools();
    if (availableTools.length === 0) {
      return { content: composeFallbackReply(userContent, conversation.title) };
    }

    const ctx = createWorkspaceContext(this.workspaceId, this.userId, `sess_${Date.now()}`, { activeModule: "ani" });
    const ragContext = retrieveRagContext(userContent, ctx);
    const ragPrompt = buildRagPrompt(userContent, ctx, ragContext);

    const messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }> = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
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
      return { id: "env-llm", provider, name: "LLM (env)", enabled: true, config: { provider, token: process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"]! }, workspaceId: this.workspaceId } as never;
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
