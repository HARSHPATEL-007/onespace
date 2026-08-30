import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { findingId } = await params; const body = await request.json().catch(() => ({})); const { reason, scope, evidence_document_ids, approver_role } = body;
  if (!reason) return NextResponse.json({ error: "reason required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const f = await svc.pfRequestException(String(findingId), { reason: String(reason), scope, evidence_document_ids: evidence_document_ids?.map(String), approver_role: approver_role ? String(approver_role) : undefined });
    return NextResponse.json(f);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 404 }); }
}
