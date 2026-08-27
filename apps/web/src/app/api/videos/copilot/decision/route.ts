import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/videos/copilot/decision — approve/reject/modify with transactional merge + conflict detection
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const proposal_id = String(body.proposal_id ?? body.proposalId ?? "");
  const action = String(body.action ?? "accept_all") as "accept_all" | "accept_selected" | "reject" | "modify";
  const selectedOpIds = Array.isArray(body.selectedOpIds) ? (body.selectedOpIds as string[]) : undefined;
  if (!proposal_id) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const result = await svc.decideCopilotProposal(proposal_id, action, selectedOpIds);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Conflict or irreversible error → 409
    return NextResponse.json({ error: msg }, { status: msg.includes("Conflict") || msg.includes("Irreversible") ? 409 : 400 });
  }
}
