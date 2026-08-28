import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ proposalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { proposalId } = await params;
  const body = await request.json().catch(() => ({}));
  const destination = (body.destination as "new_branch" | "current_timeline" | undefined) ?? "new_branch";
  const branch_name = body.branch_name ? String(body.branch_name) : undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.qualityApplyProposal(proposalId, destination, branch_name);
  return NextResponse.json({ proposalId, destination, branch_name, ...result });
}
