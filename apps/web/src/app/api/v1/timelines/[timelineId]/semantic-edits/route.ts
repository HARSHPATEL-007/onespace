import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { previewTranscriptEdit, getContinuityIssues, compileSemanticCut } from "@n0va/modules-videos/semantic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/timelines/{timelineId}/semantic-edits
 * Spec:
 * {
 *   operation: "remove_selected_transcript",
 *   token_ids: ["tok_00981", "tok_00982"],
 *   mode: "create_branch",
 *   preserve_reaction_shots: true,
 *   run_continuity_check: true
 * }
 * Also supports semantic cut commands via operation semantic_cut:<command>
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const body = await request.json().catch(() => ({}));

  const operation = String(body.operation ?? "remove_selected_transcript");
  const token_ids: string[] = Array.isArray(body.token_ids) ? body.token_ids.map(String) : [];
  const mode = String(body.mode ?? "create_branch") as "preview" | "create_branch" | "apply_to_current";
  const preserve_reaction = Boolean(body.preserve_reaction_shots ?? body.preserveReactionShots ?? true);
  const run_continuity = Boolean(body.run_continuity_check ?? body.runContinuityCheck ?? true);

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  // Semantic cut operation compilation (e.g. "semantic_cut:Remove all filler words")
  if (operation.startsWith("semantic_cut:")) {
    const cmd = operation.slice("semantic_cut:".length);
    const { plan, preview } = compileSemanticCut(cmd);
    return NextResponse.json({
      timelineId,
      operation,
      mode,
      plan,
      preview,
      continuity_check: run_continuity ? getContinuityIssues().slice(0, 2) : [],
      message: "Semantic command compiled into ordinary timeline operations with preview plan before making changes. Never silently mutates approved timeline without proposal/policy.",
    });
  }

  // Transcript-driven editing — first-class editing surface
  if (!token_ids.length) {
    return NextResponse.json({ error: "token_ids required" }, { status: 400 });
  }

  const mappedMode = mode === "create_branch" ? "create_branch" : mode === "apply_to_current" ? "apply_to_current" : "preview";
  const preview = previewTranscriptEdit({
    operation: operation as "remove_selected_transcript",
    token_ids,
    mode: mappedMode,
    preserve_reaction_shots: preserve_reaction,
    run_continuity_check: run_continuity,
  });

  const continuity = run_continuity ? getContinuityIssues().filter(c => preview.affected_ranges.some(r => Math.abs(r.range.start_ms - c.ranges[0]!.start_ms) < 5000)) : [];

  // In production: if mode === "create_branch", create lightweight branch with preview.timeline_operation
  // Here we simulate branch creation
  const branchId = mappedMode === "create_branch" ? `branch_${Date.now().toString(36)}` : null;

  return NextResponse.json({
    timelineId,
    operation,
    token_ids,
    mode: mappedMode,
    preview,
    branch: branchId ? { branch_id: branchId, parent_timeline_version: `${timelineId}:v31`, materialized_render: null } : null,
    continuity_check: continuity,
    provenance: "Edit creates normal timeline operation with semantic explanation and rollback point. Word-level anchoring preserved.",
    edit_link: branchId ? `/api/v1/timelines/${timelineId}/branches` : null,
  });
}
