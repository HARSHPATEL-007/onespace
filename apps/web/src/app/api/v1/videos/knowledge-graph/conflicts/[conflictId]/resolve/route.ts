import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ conflictId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conflictId } = await params; const body = await request.json().catch(() => ({})); const { chosen_source } = body;
  if (!chosen_source) return NextResponse.json({ error: "chosen_source required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const conflict = await svc.kgResolveConflict(String(conflictId), String(chosen_source));
  if (!conflict) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
  return NextResponse.json(conflict);
}
