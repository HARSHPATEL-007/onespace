// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalEmergencyStop } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ scope: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { scope } = await params;
  globalEmergencyStop.release(scope as never);
  return Response.json({ ok: true, scope, status: "released" });
}

