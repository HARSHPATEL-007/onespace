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
  const { revision_id, source, anchor, text } = body;
  if (!revision_id || !source || !anchor || !text) return NextResponse.json({ error: "revision_id, source, anchor, text required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const item = await svc.reviewCreateItem({
    revision_id: String(revision_id),
    source: { type: String(source.type), comment_id: String(source.comment_id) },
    anchor: { start_ms: Number(anchor.start_ms), end_ms: Number(anchor.end_ms), frame: anchor.frame ? Number(anchor.frame) : undefined },
    text: String(text),
  });
  return NextResponse.json(item);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const roundId = searchParams.get("roundId") ?? undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const items = await svc.reviewListItems(roundId);
  return NextResponse.json(items);
}
