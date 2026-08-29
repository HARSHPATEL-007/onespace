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
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const lock = await svc.collabAcquireLock({
      branch_id: String(body.branch_id ?? "branch_roughcut"),
      tracks: (body.tracks as string[] ?? ["video_1", "audio_dialogue"]).map(String),
      start_ms: Number(body.start_ms ?? 45000),
      end_ms: Number(body.end_ms ?? 78000),
      lock_type: body.lock_type ? String(body.lock_type) : "exclusive_edit",
    });
    return NextResponse.json({ timelineId, lock });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message), timelineId }, { status: 409 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branch_id") ?? undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const locks = await svc.collabListLocks(branchId);
  return NextResponse.json({ timelineId, branch_id: branchId, locks });
}
