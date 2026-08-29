import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { review_round_id, item_ids, mode, require_confirmation } = body;
  if (!review_round_id || !item_ids) return NextResponse.json({ error: "review_round_id and item_ids required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const cluster = await svc.reviewClusterItems({ review_round_id: String(review_round_id), item_ids: (item_ids as string[]).map(String), mode: mode ? String(mode) : "semantic" });
  return NextResponse.json(cluster);
}
