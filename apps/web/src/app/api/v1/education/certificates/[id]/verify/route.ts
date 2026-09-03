import { createHash } from "node:crypto";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/education/certificates/[id]/verify
 * Credential verification: an APPROVED rubric grade acts as the certificate.
 * Returns the credential plus a deterministic verification hash any third party
 * can recompute from the disclosed fields (topology proof of understanding).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { id } = await params;

  const grade = await prisma.grade.findFirst({
    where: { id, workspaceId: c.workspace.id },
    include: {
      assessment: { select: { id: true, title: true, description: true } },
      user: { select: { id: true, name: true, email: true } },
      evidence: { include: { criterion: { select: { id: true, label: true, maxPoints: true } } } },
    },
  });
  if (!grade) return NextResponse.json({ error: "Certificate not found", valid: false }, { status: 404 });

  const fingerprint = [
    grade.workspaceId, grade.id, grade.userId,
    grade.totalPoints, grade.maxPoints, grade.approved,
    grade.createdAt.toISOString(),
  ].join("|");
  const verificationHash = createHash("sha256").update(fingerprint).digest("hex");

  return NextResponse.json({
    valid: grade.approved,
    certificate: {
      id: grade.id,
      learner: { id: grade.user.id, name: grade.user.name },
      assessment: grade.assessment,
      totalPoints: grade.totalPoints,
      maxPoints: grade.maxPoints,
      percentage: grade.maxPoints ? Math.round((grade.totalPoints / grade.maxPoints) * 1000) / 10 : 0,
      approved: grade.approved,
      issuedAt: grade.createdAt,
      criteria: grade.evidence.map((e) => ({
        criterion: e.criterion.label,
        maxPoints: e.criterion.maxPoints,
        points: e.points,
        reasoning: e.reasoning,
      })),
      verificationHash,
    },
  });
}
