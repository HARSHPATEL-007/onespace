export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolExecutionResult {
  ok: boolean;
  message: string;
  statusCode?: number;
}

export interface LlmCallResult {
  content: string;
  toolCalls?: ToolCallRequest[];
}

const TYPING_DELAYS = [700, 1100, 900, 1500];

export function getTypingDelay(messageCount: number): number {
  return TYPING_DELAYS[messageCount % TYPING_DELAYS.length] ?? 900;
}

export const DEFAULT_SYSTEM_PROMPT = `You are ANI (AI Native Intelligence), an agentic assistant that helps users navigate and operate across the N0VA workspace. You have access to tools via the MCP gateway — when a tool is needed, you'll call it, observe results, and continue.

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

export function composeFallbackReply(
  userContent: string,
  title: string,
): string {
  const lower = userContent.toLowerCase();
  if (lower.includes("schedule") || lower.includes("meeting")) {
    return `I can help with that. As a demo assistant, I'd normally pull your calendar and propose times — for now, here's a tip: the Calendar module in N0VA lets you bulk-import events, and Meeting sends invites that auto-link to docs. Want me to draft an agenda?`;
  }
  if (
    lower.includes("draft") ||
    lower.includes("doc") ||
    lower.includes("write")
  ) {
    return `Gladly. I can draft a doc for "${title}". In this sandbox my drafting is simulated, but the Docs module has real templates — I'd create a doc titled "${title} draft" and link it back here.`;
  }
  if (lower.includes("summar")) {
    return `Summary mode (demo): I'd scan the most recent docs, messages, and task activity in this workspace and return a 5-bullet digest. This workspace has activity across 10+ modules, so expect roughly 3-5 bullets per digest.`;
  }
  return `Understood — noted on "${title}". In the full N0VA1O build, this reply would route through the configured model, with the conversation context attached. For now, this is the ANI sandbox replying to: "${userContent.slice(0, 90)}${userContent.length > 90 ? "…" : ""}"`;
}

export async function callLlm(
  provider: string,
  model: string,
  cfg: Record<string, unknown>,
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
  tools: Array<{
    name: string;
    description: string;
    integrationId: string;
    integration: unknown;
  }>,
): Promise<LlmCallResult> {
  const token = cfg.token as string | undefined;
  if (!token) {
    return {
      content: composeFallbackReply(
        messages[messages.length - 1]?.content ?? "",
        "conversation",
      ),
    };
  }

  const toolDefs = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: {
          input: { type: "object", description: "Tool parameters" },
        },
        required: ["input"],
      },
    },
  }));

  try {
    if (
      provider === "openai" ||
      provider === "openrouter" ||
      provider === "groq" ||
      provider === "deepseek" ||
      provider === "mistral"
    ) {
      return await callOpenaiLike(provider, model, token, messages, toolDefs);
    }
    if (provider === "anthropic") {
      return await callAnthropic(model, token, messages, toolDefs);
    }
    if (provider === "gemini" || provider === "google") {
      return await callGemini(model, token, messages, toolDefs);
    }
  } catch (err) {
    console.error(
      "ANI LLM call failed:",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    content: composeFallbackReply(
      messages[messages.length - 1]?.content ?? "",
      "conversation",
    ),
  };
}

export async function callOpenaiLike(
  provider: string,
  model: string,
  token: string,
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
  toolDefs: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>,
): Promise<LlmCallResult> {
  const baseUrl =
    provider === "openai"
      ? "https://api.openai.com/v1"
      : provider === "anthropic"
        ? "https://api.anthropic.com/v1"
        : provider === "gemini"
          ? "https://generativelanguage.googleapis.com/v1beta"
          : `https://api.${provider}.com/v1`;

  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => {
        if (m.tool_calls) {
          return { role: m.role, content: m.content, tool_calls: m.tool_calls };
        }
        if (m.tool_call_id) {
          return {
            role: "tool",
            content: m.content,
            tool_call_id: m.tool_call_id,
          };
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

  const d = (await r.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
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

  return {
    content: msg.content ?? "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export async function callAnthropic(
  model: string,
  token: string,
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
  toolDefs: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>,
): Promise<LlmCallResult> {
  const anthropicMessages: Array<{
    role: string;
    content: string | Array<Record<string, unknown>>;
  }> = [];
  let pendingToolCalls: Array<{ id: string; name: string; arguments: string }> =
    [];

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.tool_calls) {
      const content = m.content || "";
      anthropicMessages.push({
        role: m.role,
        content: content ? [{ type: "text", text: content }] : [],
      });
      pendingToolCalls = m.tool_calls as Array<{
        id: string;
        name: string;
        arguments: string;
      }>;
    } else if (m.tool_call_id) {
      pendingToolCalls.push({
        id: m.tool_call_id,
        name: "",
        arguments: JSON.stringify(m.content),
      });
      anthropicMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use: { id: m.tool_call_id },
            content: m.content,
          },
        ],
      });
      pendingToolCalls = [];
    } else {
      anthropicMessages.push({ role: m.role, content: m.content });
    }
  }

  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": token,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.includes("claude") ? model : "claude-3-5-sonnet-20241022",
      system: systemMsg,
      messages: anthropicMessages,
      tools: toolDefs.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      })),
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    const err = errText.slice(0, 200);
    return { content: `LLM error: ${r.status} ${err}` };
  }

  const d = (await r.json()) as {
    content?: Array<{
      type: string;
      text?: string;
      tool_use?: { id: string; name: string; input: Record<string, unknown> };
    }>;
  };
  const textPart = d.content?.find((c) => c.type === "text");
  const toolUseParts =
    d.content?.filter((c) => c.type === "tool_use" && c.tool_use) ?? [];

  const toolCalls: ToolCallRequest[] = toolUseParts.map((tu) => {
    const tuData = tu.tool_use!;
    return {
      id: tuData.id,
      name: tuData.name,
      arguments: tuData.input,
    };
  });

  return {
    content: textPart?.text ?? "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export async function callGemini(
  model: string,
  token: string,
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
  toolDefs: Array<{
    type: string;
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>,
): Promise<LlmCallResult> {
  const contents: Array<{
    role: string;
    parts: Array<{
      text?: string;
      functionCall?: { name: string; args: Record<string, unknown> };
      functionResponse?: { name: string; response: Record<string, unknown> };
    }>;
  }> = [];

  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.tool_calls) {
      contents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [
          { text: m.content || "" },
          ...(
            m.tool_calls as Array<{
              id: string;
              name: string;
              arguments: string;
            }>
          ).map((tc) => ({
            functionCall: {
              name: tc.name,
              args: JSON.parse(tc.arguments || "{}"),
            },
          })),
        ],
      });
    } else if (m.tool_call_id) {
      contents.push({
        role: "user",
        parts: [
          { functionResponse: { name: "", response: { result: m.content } } },
        ],
      });
    } else {
      contents.push({ role: m.role, parts: [{ text: m.content }] });
    }
  }

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents,
        tools:
          toolDefs.length > 0
            ? [
                {
                  functionDeclarations: toolDefs.map((t) => ({
                    name: t.function.name,
                    description: t.function.description,
                    parameters: t.function.parameters,
                  })),
                },
              ]
            : undefined,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      }),
    },
  );

  if (!r.ok) {
    const errText = await r.text();
    const err = errText.slice(0, 200);
    return { content: `LLM error: ${r.status} ${err}` };
  }

  const d = (await r.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name: string; args: Record<string, unknown> };
        }>;
      };
    }>;
  };
  const parts = d.candidates?.[0]?.content?.parts ?? [];
  const text = parts.find((p) => p.text)?.text ?? "";
  const funcCall = parts.find((p) => p.functionCall);

  const toolCalls: ToolCallRequest[] =
    funcCall && funcCall.functionCall
      ? [
          {
            id: `fc_${Date.now()}`,
            name: funcCall.functionCall.name,
            arguments: funcCall.functionCall.args,
          },
        ]
      : [];

  return {
    content: text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
