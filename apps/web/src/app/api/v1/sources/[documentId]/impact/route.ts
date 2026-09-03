import { auth } from "@n0va/auth";
import { EvidenceService } from "@n0va/modules-booklm/evidence";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/sources/[documentId]/impact — source-update impact analysis.
 * Returns affected answers, claims, lessons, learner notes, and attempts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { documentId } = await params;

  try {
    const ev = new EvidenceService(c.workspace.id, c.user.id, c.memberRole);
    return NextResponse.json(await ev.sourceImpact(documentId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
