import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { tenant_id, event_type, dry_run, rate_limit } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const events = await svc.edReplay({ tenant_id: tenant_id?String(tenant_id):undefined, event_type: event_type?String(event_type):undefined, dry_run: Boolean(dry_run) });
  return NextResponse.json({ replayed: events.length, events: events.slice(0, rate_limit?Number(rate_limit):20) });
}
