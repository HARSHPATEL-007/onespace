// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { id } = await params;
  // In production, this would transition rule from draft → simulation → review → canary → production
  // For now, just acknowledge
  return Response.json({ ok: true, id, status: "published", version: "risk-policy-2026.08" });
}
