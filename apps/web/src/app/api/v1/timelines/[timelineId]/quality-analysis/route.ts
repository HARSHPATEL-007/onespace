import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const body = await request.json().catch(() => ({}));
  const passes = (body.passes as string[] | undefined) ?? ["editorial_continuity", "technical", "visual_consistency", "graphics_text", "distribution"];
  const graph_version = body.graph_version ? String(body.graph_version) : "gv42";
  const export_profiles = body.export_profiles ? (body.export_profiles as string[]).map(String) : undefined;
  const projectType = body.project_type ? String(body.project_type) : undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const warnings = await svc.qualityRunAnalysis({ timelineId, graphVersion: graph_version, passes, exportProfiles: export_profiles, projectType });
  return NextResponse.json({ timelineId, graph_version, passes, mode: "non_destructive", warnings, total: warnings.length });
}
