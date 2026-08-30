import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ exportId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { exportId } = await params; const body = await request.json().catch(()=>({}));
  const { destination_profile, strictness, generate_report, generate_remediation_suggestions } = body;
  if (!destination_profile) return NextResponse.json({ error: "destination_profile required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const report = await svc.a11yValidateExport(String(exportId), { destination_profile: String(destination_profile), strictness: strictness?String(strictness):undefined });
  return NextResponse.json(report);
}
