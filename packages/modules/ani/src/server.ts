import { prisma, logAudit, type AniConversation, type AniMessage } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { N0va1oGateway } from "@n0va/modules-n0va1o/gateway";
import { discoverTools } from "@n0va/modules-n0va1o/catalog";
import { effectiveTools } from "@n0va/modules-n0va1o/mcp";

const MODULE = "ani";

export type ConversationWithMessages = AniConversation & { messages: AniMessage[] };

const TYPING_DELAYS = [700, 1100, 900, 1500];

const MAX_CONTEXT_MESSAGES = 20;

interface LlmCallResult {
  content: string;
  toolCalls?: ToolCallRequest[];
}

interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolExecutionResult {
  ok: boolean;
  message: string;
  statusCode?: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are ANI (AI Native Intelligence), an agentic assistant that helps users navigate and operate across the N0VA workspace. You have access to tools via the MCP gateway — when a tool is needed, you'll call it, observe results, and continue.

Capabilities:
- Summarize recent docs, tasks, and conversations
- Schedule meetings and manage calendars
- Draft docs and send messages
- Inspect data across connected integrations
- Execute multi-step workflows

Guidelines:
- Only call tools when the user's request benefits from live data or a side-effect
- When unsure, ask for clarification or propose a plan
- Keep responses concise but helpful
- Always confirm high-risk actions before proceeding`;

export class AniService {
  private gateway: N0va1oGateway;

  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {
    this.gateway = new N0va1oGateway();
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

  /**
   * Send a message and get a real LLM-generated reply with optional tool calls.
   * The agentic loop runs up to MAX_TURNS: if the LLM requests tools, we
   * execute them, feed results back, and let it reply again.
   */
  async send(
    conversationId: string,
    content: string,
  ): Promise<{ userMessage: AniMessage; assistantMessage: AniMessage; delayMs: number; toolCalls?: string }> {
    await this.assert("CREATE");
    const conversation = await prisma.aniConversation.findFirst({ where: { id: conversationId, workspaceId: this.workspaceId } });
    if (!conversation) throw new Error("Conversation not found");

    const userMessage = await prisma.aniMessage.create({
      data: { conversationId, workspaceId: this.workspaceId, role: "user", content },
    });

    // Load conversation context for the LLM.
    const recentMessages = await prisma.aniMessage.findMany({
      where: { conversationId, workspaceId: this.workspaceId },
      orderBy: { createdAt: "asc" },
      take: MAX_CONTEXT_MESSAGES,
    });

    const result = await this.runAgenticLoop(conversation, recentMessages, content);

    await prisma.aniMessage.create({
      data: {
        conversationId,
        workspaceId: this.workspaceId,
        role: "assistant",
        content: result.content,
      },
    });
    await prisma.aniConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    const messageCount = await prisma.aniMessage.count({ where: { conversationId } });
    const delayMs = TYPING_DELAYS[messageCount % TYPING_DELAYS.length] ?? 900;

    return {
      userMessage,
      assistantMessage: { id: userMessage.id, conversationId, workspaceId: this.workspaceId, role: "assistant", content: result.content, createdAt: new Date() },
      delayMs,
      ...(result.toolCalls && result.toolCalls.length > 0 ? { toolCalls: JSON.stringify(result.toolCalls) } : {}),
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

  /**
   * Run the agentic loop: call LLM → if it wants tools, execute them → feed back → repeat.
   * Falls back to simulated reply when no LLM integration is configured.
   */
  private async runAgenticLoop(
    conversation: AniConversation,
    recentMessages: AniMessage[],
    userContent: string,
  ): Promise<LlmCallResult> {
    const integration = await this.resolveAniIntegration();
    if (!integration || !integration.config) {
      return { content: this.composeFallbackReply(userContent, conversation.title) };
    }

    const cfg = integration.config as Record<string, unknown>;
    const model = (cfg.model as string) ?? "gpt-4o-mini";
    const provider = integration.provider;

    const availableTools = await this.discoverScopedTools();
    if (availableTools.length === 0) {
      return { content: this.composeFallbackReply(userContent, conversation.title) };
    }

    const messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }> = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
    ];

    const maxTurns = 5;
    let currentContent = userContent;

    for (let turn = 0; turn < maxTurns; turn++) {
      messages.push({ role: "user", content: currentContent });

      const llmResult = await this.callLlm(provider, model, cfg, messages, availableTools);
      if (llmResult.toolCalls && llmResult.toolCalls.length > 0) {
        messages.push({ role: "assistant", content: llmResult.content, tool_calls: llmResult.toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.arguments) } })) });

        for (const tc of llmResult.toolCalls) {
          const toolResult = await this.executeTool(tc.name, tc.arguments);
          const resultText = toolResult.ok ? toolResult.message : `Error: ${toolResult.message}`;
          messages.push({ role: "tool", content: resultText, tool_call_id: tc.id });
        }
        currentContent = "";
        continue;
      }

      return { content: llmResult.content ?? "(no response)" };
    }

    return { content: "I've explored the available tools — let me summarize what I found." };
  }

  /**
   * Resolve the AI provider integration configured for this workspace.
   * Looks for an integration with provider = openai/anthropic/etc that has MCP
   * enabled, or returns null to fall back to simulated mode.
   */
  private async resolveAniIntegration() {
    const candidate = await prisma.integration.findFirst({
      where: {
        workspaceId: this.workspaceId,
        provider: { in: ["openai", "anthropic", "gemini" ] },
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

  /**
   * Discover all tools the user has access to across MCP-enabled integrations,
   * then rank by relevance to the user's request using the catalog discovery.
   */
  private async discoverScopedTools() {
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

  /**
   * Call the LLM with the conversation history and tool definitions.
   * Supports OpenAI-compatible and Anthropic chat APIs.
   */
  private async callLlm(
    provider: string,
    model: string,
    cfg: Record<string, unknown>,
    messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
    tools: Array<{ name: string; description: string; integrationId: string; integration: unknown }>,
  ): Promise<LlmCallResult> {
    const token = cfg.token as string | undefined;
    if (!token) {
      return { content: this.composeFallbackReply(messages[messages.length - 1]?.content ?? "", "conversation") };
    }

    const toolDefs = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: "object", properties: { input: { type: "object", description: "Tool parameters" } }, required: ["input"] },
      },
    }));

    try {
      if (provider === "openai" || provider === "openrouter" || provider === "groq" || provider === "deepseek" || provider === "mistral") {
        return await this.callOpenaiLike(provider, model, token, messages, toolDefs);
      }
      if (provider === "anthropic") {
        return await this.callAnthropic(model, token, messages, toolDefs);
      }
      if (provider === "gemini" || provider === "google") {
        return await this.callGemini(model, token, messages, toolDefs);
      }
    } catch (err) {
      console.error("ANI LLM call failed:", err instanceof Error ? err.message : err);
    }

    return { content: this.composeFallbackReply(messages[messages.length - 1]?.content ?? "", "conversation") };
  }

  private async callOpenaiLike(
    provider: string,
    model: string,
    token: string,
    messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
    toolDefs: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
  ): Promise<LlmCallResult> {
    const baseUrl = provider === "openai" ? "https://api.openai.com/v1" : provider === "anthropic" ? "https://api.anthropic.com/v1" : provider === "gemini" ? `https://generativelanguage.googleapis.com/v1beta` : `https://api.${provider}.com/v1`;

    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => {
          if (m.tool_calls) {
            return { role: m.role, content: m.content, tool_calls: m.tool_calls };
          }
          if (m.tool_call_id) {
            return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
          }
          return { role: m.role, content: m.content };
        }),
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        tool_choice: toolDefs.length > 0 ? "auto" : undefined,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      const err = errText.slice(0, 200);
      return { content: `LLM error: ${r.status} ${err}` };
    }

    const d = await r.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
    const msg = d.choices?.[0]?.message;
    if (!msg) return { content: "(no response)" };

    const toolCalls: ToolCallRequest[] = [];
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments || "{}"),
        });
      }
    }

    return { content: msg.content ?? "", toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  private async callAnthropic(
    model: string,
    token: string,
    messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
    toolDefs: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
  ): Promise<LlmCallResult> {
    const anthropicMessages: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [];
    let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.tool_calls) {
        const content = m.content || "";
        anthropicMessages.push({ role: m.role, content: content ? [{ type: "text", text: content }] : [] });
        pendingToolCalls = m.tool_calls as Array<{ id: string; name: string; arguments: string }>;
      } else if (m.tool_call_id) {
        pendingToolCalls.push({ id: m.tool_call_id, name: "", arguments: JSON.stringify(m.content) });
        anthropicMessages.push({ role: "user", content: [{ type: "tool_result", tool_use: { id: m.tool_call_id }, content: m.content }] });
        pendingToolCalls = [];
      } else {
        anthropicMessages.push({ role: m.role, content: m.content });
      }
    }

    const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": token, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model.includes("claude") ? model : "claude-3-5-sonnet-20241022",
        system: systemMsg,
        messages: anthropicMessages,
        tools: toolDefs.map((t) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })),
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      const err = errText.slice(0, 200);
      return { content: `LLM error: ${r.status} ${err}` };
    }

    const d = await r.json() as { content?: Array<{ type: string; text?: string; tool_use?: { id: string; name: string; input: Record<string, unknown> } }> };
    const textPart = d.content?.find((c) => c.type === "text");
    const toolUseParts = d.content?.filter((c) => c.type === "tool_use" && c.tool_use) ?? [];

    const toolCalls: ToolCallRequest[] = toolUseParts.map((tu) => {
      const tuData = tu.tool_use!;
      return {
        id: tuData.id,
        name: tuData.name,
        arguments: tuData.input,
      };
    });

    return { content: textPart?.text ?? "", toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  private async callGemini(
    model: string,
    token: string,
    messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
    toolDefs: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
  ): Promise<LlmCallResult> {
    const contents: Array<{ role: string; parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }> }> = [];

    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.tool_calls) {
        contents.push({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content || "" }, ...(m.tool_calls as Array<{ id: string; name: string; arguments: string }>).map((tc) => ({ functionCall: { name: tc.name, args: JSON.parse(tc.arguments || "{}") } }))] });
      } else if (m.tool_call_id) {
        contents.push({ role: "user", parts: [{ functionResponse: { name: "", response: { result: m.content } } }] });
      } else {
        contents.push({ role: m.role, parts: [{ text: m.content }] });
      }
    }

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        tools: toolDefs.length > 0 ? [{ functionDeclarations: toolDefs.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] : undefined,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      const err = errText.slice(0, 200);
      return { content: `LLM error: ${r.status} ${err}` };
    }

    const d = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> } }> };
    const parts = d.candidates?.[0]?.content?.parts ?? [];
    const text = parts.find((p) => p.text)?.text ?? "";
    const funcCall = parts.find((p) => p.functionCall);

    const toolCalls: ToolCallRequest[] = funcCall && funcCall.functionCall
      ? [{ id: `fc_${Date.now()}`, name: funcCall.functionCall.name, arguments: funcCall.functionCall.args }]
      : [];

    return { content: text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
  }

  /**
   * Execute a tool call through the N0VA1O gateway.
   * Matches the tool name against the workspace's MCP-enabled integrations.
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
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

  private composeFallbackReply(userContent: string, title: string): string {
    const lower = userContent.toLowerCase();
    if (lower.includes("schedule") || lower.includes("meeting")) {
      return `I can help with that. As a demo assistant, I'd normally pull your calendar and propose times — for now, here's a tip: the Calendar module in N0VA lets you bulk-import events, and Meeting sends invites that auto-link to docs. Want me to draft an agenda?`;
    }
    if (lower.includes("draft") || lower.includes("doc") || lower.includes("write")) {
      return `Gladly. I can draft a doc for "${title}". In this sandbox my drafting is simulated, but the Docs module has real templates — I'd create a doc titled "${title} draft" and link it back here.`;
    }
    if (lower.includes("summar")) {
      return `Summary mode (demo): I'd scan the most recent docs, messages, and task activity in this workspace and return a 5-bullet digest. This workspace has activity across 10+ modules, so expect roughly 3-5 bullets per digest.`;
    }
    return `Understood — noted on "${title}". In the full N0VA1O build, this reply would route through the configured model, with the conversation context attached. For now, this is the ANI sandbox replying to: "${userContent.slice(0, 90)}${userContent.length > 90 ? "…" : ""}"`;
  }
}
