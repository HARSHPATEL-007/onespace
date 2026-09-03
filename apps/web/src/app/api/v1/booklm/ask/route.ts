import { auth } from "@n0va/auth";
import { EvidenceService } from "@n0va/modules-booklm/evidence";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const askSchema = z.object({
  setId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
});

/**
 * POST /api/v1/booklm/ask — grounded Q&A with citation binding.
 * Extractive-only: refuses when no source supports an answer (no hallucinations).
 * Body: { setId, question }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const ev = new EvidenceService(c.workspace.id, c.user.id);
    const result = await ev.groundedAnswer(parsed.data.setId, parsed.data.question);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ask failed" }, { status: 500 });
  }
}
