import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { event_id, regions, sources, destinations, recording, failover_policy } = body;
  if (!event_id || !regions || !sources || !destinations) return NextResponse.json({ error: "event_id, regions, sources, destinations required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const live = await svc.liveCreateSession({ event_id: String(event_id), regions: (regions as string[]).map(String), sources: (sources as string[]).map(String), destinations: (destinations as {platform:string;profile:string}[]).map(d=>({platform:String(d.platform),profile:String(d.profile)})), recording, failover_policy: failover_policy?String(failover_policy):undefined });
  return NextResponse.json(live, { status: 201 });
}
export async function GET(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const list = await svc.liveListSessions();
  return NextResponse.json(list);
}
