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
  const prompt = String(body.prompt ?? "");
  const style = String(body.style ?? "cinematic");
  const durationSec = Number(body.durationSec ?? 30);
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });

  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const job = await svc.generateVideoAI({ prompt, style: style as "cinematic", durationSec, resolution: "1080p", cameraMovement: "static" });
  return NextResponse.json(job);
}
