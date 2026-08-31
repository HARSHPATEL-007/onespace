import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { policy_id, event, asset_id, destination, principal_id, plugin_id } = body;
  if (!policy_id) return NextResponse.json({ error: "policy_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  if (plugin_id) {
    const decision = await svc.ppEvaluatePolicy({ policy_id: String(policy_id), event: String(event ?? "plugin_execution_requested"), asset_id: asset_id?String(asset_id):"asset_001", destination: destination?String(destination):undefined, plugin_id: String(plugin_id) });
    return NextResponse.json(decision);
  }
  if (!asset_id) return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  const decision = await svc.privacyPolicyEvaluate({ policy_id: String(policy_id), event: String(event ?? "export_requested"), asset_id: String(asset_id), destination: String(destination ?? "client_portal_acme"), principal_id: principal_id?String(principal_id):undefined });
  return NextResponse.json(decision);
}
