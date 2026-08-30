import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const edges = await svc.kgListEdges();
  return NextResponse.json(edges);
}
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const { from_node, type, to_node, confidence, evidence, media_interval } = body;
  if (!from_node || !type || !to_node) return NextResponse.json({ error: "from_node, type, to_node required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const edge = await svc.kgCreateEdge({ from_node: String(from_node), type: String(type), to_node: String(to_node), confidence: confidence ? Number(confidence) : undefined, evidence, media_interval });
    return NextResponse.json(edge, { status: 201 });
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
