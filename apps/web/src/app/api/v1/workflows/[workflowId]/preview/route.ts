// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { workflowId } = await params;
  return Response.json({
    workflow_id: workflowId,
    preview: {
      creates: [{ system: "calendar", object: "event", fields: { title: "Apollo launch review", start: "2026-08-28T14:00:00+05:30" } }],
      external_recipients: ["team@example.com"],
      estimated_cost: 0,
      risk: "medium",
    },
  });
}
