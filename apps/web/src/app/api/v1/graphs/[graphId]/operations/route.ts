import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/graphs/:graphId/operations — unified graph ops per spec
 * body: { op: "disable"|"reorder"|"replace"|"compare"|"rollback"|"explain"|"schedule"|"cache_invalidate"|"approval"|"c2pa", ...params }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ graphId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { graphId } = await params;
  const body = await request.json().catch(() => ({}));
  const op = String(body.op ?? body.operation ?? "");
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);

  try {
    if (op === "disable") {
      const v = await svc.graphDisableNode({ graph_id: graphId, base_gv: String(body.base_gv ?? body.baseVersion), node_id: String(body.node_id), reason: body.reason ? String(body.reason) : undefined });
      return NextResponse.json({ op, new_graph_version: v, note: "New immutable graph version, old remains" });
    }
    if (op === "reorder") {
      const r = await svc.graphReorder({ graph_id: graphId, base_gv: String(body.base_gv), newOrder: (body.newOrder as string[]).map(String) });
      return NextResponse.json({ op, ...r, non_commutative_warning: r.warning });
    }
    if (op === "replace") {
      const r = await svc.graphReplaceNode({ graph_id: graphId, base_gv: String(body.base_gv), old_node_id: String(body.old_node_id), new_node_id: String(body.new_node_id) });
      return NextResponse.json({ op, ...r });
    }
    if (op === "compare") {
      const c = await svc.graphCompare(graphId, String(body.gvA), String(body.gvB));
      return NextResponse.json({ op, ...c });
    }
    if (op === "rollback") {
      const v = await svc.graphRollback(graphId, String(body.from_gv), String(body.to_gv), String(body.reason ?? "rollback"));
      return NextResponse.json({ op, new_head: v, note: "Preserves newer versions, new head is copy of target" });
    }
    if (op === "explain") {
      const e = await svc.graphExplainAtTime(Number(body.time_ms ?? 62400), graphId, String(body.gv));
      return NextResponse.json({ op, explain: e });
    }
    if (op === "schedule") {
      const s = await svc.graphSchedule(graphId, String(body.gv), String(body.target_node));
      return NextResponse.json({ op, schedule: s });
    }
    if (op === "approval") {
      const a = await svc.graphBindApproval({
        approval_id: String(body.approval_id ?? `approval_${Date.now()}`),
        graph_id: graphId,
        graph_version: String(body.gv),
        output_node: String(body.output_node),
        output_hash: String(body.output_hash ?? `sha3-512:${graphId}`),
        destination: String(body.destination ?? "youtube"),
        territories: (body.territories as string[] ?? ["IN", "US"]).map(String),
        format: String(body.format ?? "4k_hdr"),
      });
      return NextResponse.json({ op, approval: a });
    }
    if (op === "c2pa") {
      const m = await svc.graphC2PA(graphId, String(body.gv), String(body.output_node));
      return NextResponse.json({ op, c2pa: m });
    }
    if (op === "manifest") {
      const m = await svc.graphManifest(String(body.node_id), String(body.artifact_id));
      return NextResponse.json({ op, manifest: m });
    }
    if (op === "projection") {
      const p = await svc.graphCreateProjection(body as unknown as Parameters<typeof svc.graphCreateProjection>[0]);
      return NextResponse.json({ op, projection: p });
    }
    return NextResponse.json({ error: `Unknown op ${op} — use disable|reorder|replace|compare|rollback|explain|schedule|approval|c2pa|manifest|projection` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 400 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ graphId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { graphId } = await params;
  const { searchParams } = new URL(request.url);
  const gv = searchParams.get("gv");
  const op = searchParams.get("op");
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  if (op === "explain" && gv) {
    const e = await svc.graphExplainAtTime(Number(searchParams.get("time_ms") ?? "62400"), graphId, gv);
    return NextResponse.json(e);
  }
  if (op === "schedule" && gv) {
    const s = await svc.graphSchedule(graphId, gv, String(searchParams.get("target") ?? ""));
    return NextResponse.json(s);
  }
  const versions = await svc.graphListVersions(graphId);
  return NextResponse.json({ graph_id: graphId, versions });
}
