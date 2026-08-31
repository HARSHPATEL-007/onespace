import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { type, subject, data, tenant_id } = body;
  if (!type || !subject) return NextResponse.json({ error: "type, subject required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const published = await svc.edPublishEvent({ type: String(type), subject: String(subject), data: (data as Record<string,unknown>) ?? {}, tenant_id: tenant_id?String(tenant_id):undefined });
  return NextResponse.json(published, { status: 201 });
}
