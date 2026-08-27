import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
import { parseIntentEnvelope } from "@n0va/modules-videos/copilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/videos/copilot/proposal — plan (no commit) + simulation, returns typed proposal
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const user_request = String(body.user_request ?? body.intent ?? "");
  const project_id = String(body.project_id ?? body.projectId ?? "");
  const timeline_id = body.timeline_id ? String(body.timeline_id) : undefined;
  const autonomy_mode = body.autonomy_mode ?? body.autonomyMode ?? "assisted";
  if (!user_request || !project_id) return NextResponse.json({ error: "user_request and project_id required" }, { status: 400 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const envelope = parseIntentEnvelope({
    user_request,
    project_id,
    timeline_id,
    autonomy_mode,
    target_duration_ms: body.target_duration_ms ?? null,
  });
  const proposal = await svc.createCopilotProposal(envelope);
  return NextResponse.json(proposal);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const list = await svc.listCopilotProposals(projectId ?? undefined);
  return NextResponse.json(list);
}
