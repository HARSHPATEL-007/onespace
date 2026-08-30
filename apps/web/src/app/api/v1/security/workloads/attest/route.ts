import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { workload_id, tenant_id, asset_ids, required_model } = body;
  if (!workload_id || !asset_ids) return NextResponse.json({ error: "workload_id, asset_ids required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const res = await svc.ztAttestWorkload({ workload_id: String(workload_id), tenant_id: tenant_id?String(tenant_id):undefined, asset_ids: (asset_ids as string[]).map(String), required_model: required_model?String(required_model):undefined });
  return NextResponse.json(res);
}
