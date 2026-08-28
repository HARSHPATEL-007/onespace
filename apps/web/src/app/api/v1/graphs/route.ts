import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/graphs — list graph versions (optionally ?graph_id=)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const graphId = searchParams.get("graph_id") ?? undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const versions = await svc.graphListVersions(graphId);
  const nodes = await svc.graphListNodes();
  return NextResponse.json({ graph_id: graphId ?? "all", versions, nodes: nodes.slice(0, 20) });
}

// POST /api/v1/graphs — create graph version {graph_id, root_inputs, active_outputs, nodes, edges}
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { graph_id, root_inputs, active_outputs, nodes, edges } = body;
  if (!graph_id || !root_inputs || !nodes || !edges) return NextResponse.json({ error: "graph_id, root_inputs, nodes, edges required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const v = await svc.graphCreateVersion({ graph_id: String(graph_id), root_inputs: root_inputs.map(String), active_outputs: active_outputs.map(String), nodes: nodes.map(String), edges: edges as [string, string][] });
  return NextResponse.json(v);
}
