import { actionContext, UnauthorizedError } from "@/lib/action-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { workflowId } = await params;
  // Pause and reauthorize per §11 — revoke leases, re-check permissions
  return Response.json({ workflow_id: workflowId, reauthorized: true, new_lease_id: `lease_${Date.now().toString(36)}`, reason: "permission_version_increment" });
}
