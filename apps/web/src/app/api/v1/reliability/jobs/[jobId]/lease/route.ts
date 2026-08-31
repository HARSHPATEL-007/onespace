import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await params; const body = await request.json().catch(()=>({}));
  const { worker_id } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const lease = await svc.relLeaseJob(String(jobId), String(worker_id ?? `worker_${session.user.id.slice(0,4)}`));
    return NextResponse.json(lease);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
