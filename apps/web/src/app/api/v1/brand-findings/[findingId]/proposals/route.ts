import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { findingId } = await params;
  const body = await request.json().catch(() => ({}));
  const preserve = body.preserve ? (body.preserve as string[]).map(String) : ["timing", "speaker_identity"];
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const proposal = await svc.brandGenerateProposal(findingId, preserve);
  if (!proposal) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  return NextResponse.json(proposal);
}
