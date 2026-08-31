import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { subject_id, scope, reason, verify_replicas } = body;
  if (!scope?.tenant_id) return NextResponse.json({ error: "scope.tenant_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const cert = await svc.privacyDeletion({ subject_id: subject_id?String(subject_id):undefined, scope: { tenant_id: String(scope.tenant_id), asset_ids: scope.asset_ids?.map(String), derived_types: scope.derived_types?.map(String) }, reason: String(reason ?? "consent_withdrawal"), verify_replicas: Boolean(verify_replicas) });
  return NextResponse.json(cert, { status: 201 });
}
