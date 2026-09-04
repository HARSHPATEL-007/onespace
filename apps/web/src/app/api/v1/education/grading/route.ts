import { auth } from "@n0va/auth";
import {
  GradingService, richEvidenceSchema, gradeV2Schema, calibrationSchema, fairnessSchema,
} from "@n0va/modules-booklm/grading";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

function svc(c: { workspace: { id: string }; user: { id: string }; memberRole: string }) {
  return new GradingService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/education/grading?view=... — history&id=... | explain&id=... |
 * calibration&assessmentId=... | calibration-metrics&assessmentId=... |
 * fairness | blind-queue | dashboard&assessmentId=...
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "history";
  try {
    const g = svc(c);
    switch (view) {
      case "history": {
        const id = url.searchParams.get("id") ?? "";
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await g.gradeHistory(id));
      }
      case "explain": {
        const id = url.searchParams.get("id") ?? "";
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await g.explainGrade(id));
      }
      case "calibration": {
        const assessmentId = url.searchParams.get("assessmentId") ?? "";
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        return NextResponse.json({ examples: await g.listCalibration(assessmentId) });
      }
      case "calibration-metrics": {
        const assessmentId = url.searchParams.get("assessmentId") ?? "";
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        return NextResponse.json(await g.calibrationMetrics(assessmentId));
      }
      case "fairness":
        return NextResponse.json({ audits: await g.listFairness(url.searchParams.get("setId") ?? undefined) });
      case "blind-queue":
        return NextResponse.json({ queue: await g.blindQueue() });
      case "dashboard": {
        const assessmentId = url.searchParams.get("assessmentId") ?? "";
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        return NextResponse.json(await g.dashboard(assessmentId));
      }
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

const partialSchema = z.object({
  finalCorrect: z.boolean(), structureSound: z.boolean(),
  earlyError: z.boolean().default(false), wrongModel: z.boolean().default(false),
  sufficientEvidence: z.boolean().default(true), alternativeValid: z.boolean().default(false),
});

/**
 * POST /v1/education/grading — submit-v2 | approve-criterion | freeze |
 * bump-version | shadow | apply-regrade | calibration | ai-scores |
 * fairness | fairness-metrics | fairness-resolve | partial-credit
 */
export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "");
  try {
    const g = svc(c);
    switch (action) {
      case "submit-v2": {
        const parsed = gradeV2Schema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await g.submitGradeV2(parsed.data), { status: 201 });
      }
      case "approve-criterion": {
        const { gradeId, criterionId, approved, points, note } = b as Record<string, never>;
        if (!gradeId || !criterionId) return NextResponse.json({ error: "gradeId + criterionId required" }, { status: 400 });
        return NextResponse.json(await g.approveCriterion(
          String(gradeId), String(criterionId), approved !== false,
          points === undefined || points === null || points === "" ? undefined : Number(points),
          String(note ?? ""),
        ));
      }
      case "freeze": {
        const { assessmentId, frozen } = b as Record<string, never>;
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        await g.freezeRubric(String(assessmentId), frozen !== false);
        return NextResponse.json({ ok: true });
      }
      case "bump-version": {
        const { assessmentId } = b as { assessmentId?: string };
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        await g.bumpRubricVersion(assessmentId);
        return NextResponse.json({ ok: true });
      }
      case "shadow": {
        const { assessmentId } = b as { assessmentId?: string };
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        return NextResponse.json({ diffs: await g.shadowRegrade(assessmentId) });
      }
      case "apply-regrade": {
        const { assessmentId, gradeIds, reason } = b as { assessmentId?: string; gradeIds?: string[]; reason?: string };
        if (!assessmentId || !Array.isArray(gradeIds)) return NextResponse.json({ error: "assessmentId + gradeIds required" }, { status: 400 });
        return NextResponse.json(await g.applyRegrade(assessmentId, gradeIds, true, reason ?? ""));
      }
      case "calibration": {
        const parsed = calibrationSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await g.saveCalibration(parsed.data), { status: 201 });
      }
      case "ai-scores": {
        const { id, scores } = b as { id?: string; scores?: Record<string, number> };
        if (!id || !scores) return NextResponse.json({ error: "id + scores required" }, { status: 400 });
        await g.recordAiScores(id, scores);
        return NextResponse.json({ ok: true });
      }
      case "fairness": {
        const parsed = fairnessSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await g.saveFairness(parsed.data), { status: 201 });
      }
      case "fairness-metrics": {
        const groups = Array.isArray(b.groups) ? b.groups as { name: string; mean: number; sd: number; n: number }[] : [];
        return NextResponse.json(await g.fairnessMetrics(groups));
      }
      case "fairness-resolve": {
        const { id, status, action: act } = b as Record<string, string>;
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await g.resolveFairness(id, status ?? "closed", act ?? "");
        return NextResponse.json({ ok: true });
      }
      case "partial-credit": {
        const parsed = partialSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(g.partialCredit(parsed.data));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
