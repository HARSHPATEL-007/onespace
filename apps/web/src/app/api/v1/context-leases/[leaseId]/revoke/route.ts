import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { RetrievalLeaseManager } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const manager = new RetrievalLeaseManager();

export async function POST(_req: Request, { params }: { params: Promise<{ leaseId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { leaseId } = await params;
  const ok = manager.revoke(leaseId);
  return Response.json({ revoked: ok, lease_id: leaseId });
}

