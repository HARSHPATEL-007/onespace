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
  const graph_version = body.graph_version ? String(body.graph_version) : "gv42";
  const profile = body.profile ? String(body.profile) : "avid_editorial_aaf";
  const media_mode = body.media_mode ? String(body.media_mode) : "proxy_with_relink_map";
  const handle_frames = body.handle_frames ? Number(body.handle_frames) : 48;
  const validate_roundtrip = body.validate_roundtrip !== undefined ? Boolean(body.validate_roundtrip) : true;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const pkg = await svc.interchangeCreatePackage({ timelineId, graphVersion: graph_version, profile, mediaMode: media_mode, handleFrames: handle_frames, validateRoundtrip: validate_roundtrip });
  return NextResponse.json(pkg);
}
