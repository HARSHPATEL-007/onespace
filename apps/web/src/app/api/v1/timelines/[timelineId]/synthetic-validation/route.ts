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
  const graph_version = body.graph_version ? String(body.graph_version) : "gv42";
  const checks = (body.checks as string[] | undefined) ?? ["segment_classification","visible_disclosure","machine_provenance","model_registry","usage_restrictions","likeness_consent","product_consistency","temporal_consistency"];
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.generativeSyntheticValidation(timelineId, graph_version, checks.map(String));
  return NextResponse.json(result);
}
