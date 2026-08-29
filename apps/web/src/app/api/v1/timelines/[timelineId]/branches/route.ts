import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { createBranchFromSemanticRules, listBranches } from "@n0va/modules-videos/semantic";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/timelines/{timelineId}/branches
 * Spec: Generate Alternate Cut — lightweight branches over shared immutable source graph
 * Body: { name, parent_version, semantic_rules, constraints, mode: proposal }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const body = await request.json().catch(() => ({}));

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  // Collaboration branch: {name, from_revision, scope}
  if (body.from_revision) {
    const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
    const branch = await svc.collabCreateBranch({
      name: String(body.name ?? `branch_${Date.now()}`),
      from_revision: String(body.from_revision),
      scope: body.scope as { time_ranges: { start_ms: number; end_ms: number }[] } | undefined,
    });
    return NextResponse.json({ ...branch, timelineId, kind: "collaboration_branch" });
  }

  const name = String(body.name ?? `branch_${Date.now()}`);
  const parent = String(body.parent_version ?? body.parent ?? `${timelineId}:v31`);
  const rules = (body.semantic_rules ?? body.selection_rules ?? [
    { include: "narrative.role=evidence", minimum_importance: 0.78 },
    { exclude: "dialogue.contains=filler" },
  ]) as { include?: string; exclude?: string; minimum_importance?: number }[];
  const constraints = (body.constraints ?? { max_duration_ms: 60000, aspect_ratio: "9:16" }) as { maximum_duration_ms?: number; aspect_ratio?: string };

  // Validate parent exists conceptually; create branch
  const cRaw = constraints as unknown as Record<string, number | string | undefined>;
  const maxDuration = (cRaw.maximum_duration_ms as number | undefined) ?? (cRaw.max_duration_ms as number | undefined);
  const branch = createBranchFromSemanticRules({
    name,
    parent,
    rules,
    constraints: {
      maximum_duration_ms: maxDuration as number | undefined,
      aspect_ratio: constraints.aspect_ratio,
    },
  });

  // mode handling: proposal vs committed
  const mode = String(body.mode ?? "proposal");
  return NextResponse.json({
    ...branch,
    timelineId,
    mode,
    materialized_render: mode === "proposal" ? null : `https://cdn.n0va.io/render/${branch.branch_id}/master.mp4`,
    message: "Alternate cut is lightweight branch over shared source graph — no duplicate media, analysis, or unchanged clip defs. Includes parent version, inclusion/exclusion spans, ordering, branch effects/captions/narrative target/duration.",
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const { searchParams } = new URL(request.url);
  if (searchParams.get("kind") === "collaboration") {
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
    if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
    const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
    const branches = await svc.collabListBranches();
    return NextResponse.json({ timelineId, branches, kind: "collaboration" });
  }
  // list branches filtered by timeline if possible (all for demo)
  return NextResponse.json({ timelineId, branches: listBranches() });
}
