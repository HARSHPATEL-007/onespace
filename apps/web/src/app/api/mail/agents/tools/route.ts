import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { getMailAgentTools, mailAgentWorkflows, AGENT_PERSONAS } from "@n0va/modules-mail";

/**
 * GET /api/mail/agents/tools
 * List all available mail agent tools (for N0VA1O gateway).
 */
export async function GET(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const tools = getMailAgentTools();

    const url = new URL(req.url);
    const persona = url.searchParams.get("persona") || "mail_concierge";

    // Filter tools based on persona capabilities
    const personaConfig = AGENT_PERSONAS[persona as keyof typeof AGENT_PERSONAS];
    const filteredTools = personaConfig
      ? tools.filter((tool) => {
          const capability = tool.name.split(".")[1] || "";
          return personaConfig.capabilities.some(
            (cap) => capability.includes(cap) || cap === "read",
          );
        })
      : tools;

    return NextResponse.json({
      workspaceId,
      persona,
      tools: filteredTools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list agent tools" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mail/agents/tools
 * Execute a mail agent tool.
 * Body: { tool: string, params: Record<string, unknown>, persona?: string }
 */
export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await actionContext();
    const body = await req.json();
    const tools = getMailAgentTools();
    const tool = tools.find((t) => t.name === body.tool);

    if (!tool) {
      return NextResponse.json({ error: `Tool not found: ${body.tool}` }, { status: 404 });
    }

    const context = {
      workspaceId,
      userId,
      persona: (body.persona as any) || "mail_concierge",
      autonomyLevel: "high" as const,
    };

    const result = await tool.handler(body.params || {}, context);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tool execution failed" },
      { status: 500 },
    );
  }
}
