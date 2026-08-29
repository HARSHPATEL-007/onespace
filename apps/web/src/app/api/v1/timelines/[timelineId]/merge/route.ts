import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const body = await request.json().catch(() => ({}));
  const source_branch = String(body.source_branch ?? body.sourceBranch ?? "branch_client_alt_03");
  const target_branch = String(body.target_branch ?? body.targetBranch ?? "main");
  const resolution_map = (body.resolution_map as Record<string, string> | undefined) ?? (body.resolutionMap as Record<string, string> | undefined) ?? {};
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.collabApplyMerge({ source_branch, target_branch, resolution_map });
  return NextResponse.json({ timelineId, source_branch, target_branch, ...result });
}
