import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { FormsService } from "@n0va/modules-forms/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const svc = new FormsService(membership.workspaceId, session.user.id, membership.role);
  const responses = await svc.responses(id);
  return NextResponse.json(
    responses.map((r) => ({ id: r.id, submittedAt: r.submittedAt, answers: r.answers })),
  );
}