import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision ? String(body.decision) : "approved_for_editorial";
  const disclosure_mode = body.disclosure_mode ? String(body.disclosure_mode) : "segment_label_and_manifest";
  const usage_scope = body.usage_scope as { commercial: boolean; territories: string[]; expires_at: string } | undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const approval = await svc.generativeApproveAsset(assetId, decision, disclosure_mode, usage_scope);
  return NextResponse.json(approval);
}
