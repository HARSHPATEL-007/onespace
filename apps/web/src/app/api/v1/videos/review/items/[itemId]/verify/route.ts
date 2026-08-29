import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { itemId } = await params;
  const body = await request.json().catch(() => ({}));
  const { source_revision, target_revision } = body;
  if (!source_revision || !target_revision) return NextResponse.json({ error: "source_revision and target_revision required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.reviewVerifyChange(itemId, String(source_revision), String(target_revision));
  return NextResponse.json(result);
}
