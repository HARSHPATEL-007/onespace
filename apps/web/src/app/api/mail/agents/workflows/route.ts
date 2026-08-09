import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { mailAgentWorkflows } from "@n0va/modules-mail";

/**
 * GET /api/mail/agents/workflows
 * List all mail agent workflows.
 */
export async function GET() {
  try {
    const workflows = mailAgentWorkflows.getWorkflows();
    return NextResponse.json({ workflows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list workflows" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mail/agents/workflows
 * Create or execute a workflow.
 * Body: { action: "create" | "execute", ... }
 */
export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await actionContext();
    const body = await req.json();

    if (body.action === "execute") {
      const workflowId = body.workflowId;
      const result = await mailAgentWorkflows.executeWorkflow(workflowId, {
        workspaceId,
        userId,
        persona: body.persona || "mail_concierge",
        autonomyLevel: "high",
      });
      return NextResponse.json(result);
    }

    // Create workflow
    const workflow = mailAgentWorkflows.createWorkflow({
      name: body.name,
      description: body.description || "",
      persona: body.persona || "mail_concierge",
      triggers: body.triggers || [],
      steps: body.steps || [],
    });

    return NextResponse.json(workflow);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Workflow operation failed" },
      { status: 500 },
    );
  }
}
