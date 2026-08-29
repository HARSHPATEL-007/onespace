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
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const branch_id = String(body.branch_id ?? "branch_roughcut");
  const operations = (body.operations as { type: string; clip_id?: string; payload?: Record<string, unknown> }[] | undefined) ?? (body.type ? [{ type: String(body.type), clip_id: body.clip_id ? String(body.clip_id) : undefined, payload: (body.payload as Record<string, unknown>) ?? {} }] : []);
  if (!operations.length) return NextResponse.json({ error: "operations[] or type required" }, { status: 400 });
  try {
    const results = [];
    for (const op of operations) {
      const res = await svc.collabSubmitOperation({
        branch_id,
        type: String(op.type),
        clip_id: op.clip_id ? String(op.clip_id) : undefined,
        payload: (op.payload as Record<string, unknown>) ?? {},
        base_revision: body.base_revision ? String(body.base_revision) : "rev_0189",
      });
      results.push(res);
    }
    return NextResponse.json({ timelineId, branch_id, operations: results });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message), timelineId, branch_id }, { status: 403 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branch_id") ?? undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  // For demo, return empty or list via service if available
  // We use direct import of collaboration engine for listing
  const { listOperations } = await import("@n0va/modules-videos/collaboration");
  const ops = listOperations(branchId);
  return NextResponse.json({ timelineId, branch_id: branchId, operations: ops });
}
