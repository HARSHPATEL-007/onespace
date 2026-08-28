import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { findingId } = await params;
  const body = await request.json().catch(() => ({}));
  const resolution = (body.resolution as "intentional" | "dismissed" | "resolved" | undefined) ?? "intentional";
  const note = body.note ? String(body.note) : undefined;
  if (!["intentional", "dismissed", "resolved"].includes(resolution)) return NextResponse.json({ error: "resolution must be intentional|dismissed|resolved" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const finding = await svc.qualityResolveFinding(findingId, resolution, note);
  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  return NextResponse.json({ findingId, resolution, note, finding });
}
