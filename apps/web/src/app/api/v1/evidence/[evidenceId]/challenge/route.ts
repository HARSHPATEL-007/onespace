import { auth } from "@n0va/auth";
import { EvidenceService, challengeSchema } from "@n0va/modules-booklm/evidence";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/evidence/[evidenceId]/challenge — dispute a citation.
 * Body: { reason, learner_note?, category?, setId? }
 * GET — list challenges for an evidence object (instructors see all).
 */
export async function POST(req: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { evidenceId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = challengeSchema.safeParse({ ...(body as object), evidenceId });
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const ev = new EvidenceService(c.workspace.id, c.user.id, c.memberRole);
    const challenge = await ev.challengeEvidence(parsed.data);
    return NextResponse.json({ challenge }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ evidenceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { evidenceId } = await params;

  const ev = new EvidenceService(c.workspace.id, c.user.id, c.memberRole);
  const all = await ev.listChallenges();
  return NextResponse.json({ challenges: all.filter((ch) => ch.evidenceId === evidenceId) });
}
