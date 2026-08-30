import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params; const body = await request.json().catch(()=>({}));
  const { scope, from, to, reason, mode, operator_id } = body;
  if (!scope || !from || !to || !reason) return NextResponse.json({ error: "scope, from, to, reason required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const res = await svc.liveFailover(String(sessionId), { scope: String(scope), from: String(from), to: String(to), reason: String(reason), mode: mode?String(mode):undefined, operator_id: operator_id?String(operator_id):undefined });
    return NextResponse.json(res);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
