import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/graphs/:graphId/nodes — create node or new node version
// body: { operation, parameters?, scope?, consent_refs?, inputs?, node_id? (for versioned edit) }
export async function POST(request: NextRequest, { params }: { params: Promise<{ graphId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { graphId } = await params;
  const body = await request.json().catch(() => ({}));
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);

  // If node_id present → create new version (param immutability)
  if (body.node_id && body.parameters) {
    const n2 = await svc.graphCreateNodeVersion(String(body.node_id), body.parameters as Record<string, unknown>);
    return NextResponse.json({ graph_id: graphId, previous: body.node_id, next: n2, note: "Old node remains for comparison/rollback/audit" });
  }

  const { operation, parameters, scope, consent_refs, inputs, category } = body;
  if (!operation) return NextResponse.json({ error: "operation required" }, { status: 400 });
  const n = await svc.graphCreateNode({
    operation: String(operation),
    category: category ? String(category) : undefined,
    inputs: (inputs ?? [{ port: "video", artifact_id: "artifact_src_a001" }]) as { port: string; artifact_id: string }[],
    parameters: (parameters ?? {}) as Record<string, unknown>,
    scope: scope as Record<string, unknown> | undefined,
    consent_refs: consent_refs ? (consent_refs as string[]).map(String) : undefined,
  });
  return NextResponse.json({ graph_id: graphId, node: n });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const nodes = await svc.graphListNodes();
  return NextResponse.json(nodes);
}
