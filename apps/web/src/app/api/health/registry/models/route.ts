import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const rows = await svc.listSafetyModels(); return NextResponse.json({ ok: true, rows }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.modelId || !body.displayName) return NextResponse.json({ error: "modelId and displayName required" }, { status: 400 });
  const { ModelRegistry } = await import("@n0va/modules-health/registry");
  const reg = new ModelRegistry(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    // Model identity & lineage — production-eligible only when all approved
    const row = await (reg as unknown as { upsertModel?: (a: unknown)=>Promise<unknown> })?.upsertModel?.(body);
    // Fallback to safety upsertModel if registry doesn't have it (uses safety's)
    if (!row) {
      const { ClinicalSafetyOS } = await import("@n0va/modules-health/safety");
      const safety = new ClinicalSafetyOS(ctx.workspaceId, ctx.userId, ctx.role);
      const fallback = await safety.upsertModel({ modelId: body.modelId, modelVersion: body.modelVersion ?? "1.0.0", displayName: body.displayName, safetyClass: body.safetyClass ?? "S3", approvedUse: body.approvedUse ?? body.intendedUse ?? "general", excludedUse: body.excludedUse, requiredInputs: body.requiredInputs, maxInputAgeMin: body.maxInputAgeMin, minSignalQuality: body.minSignalQuality, minCalibration: body.minCalibration, requiredRole: body.requiredRole, executionMode: body.executionMode, regulatoryStatus: body.regulatoryStatus });
      return NextResponse.json({ ok: true, model: fallback });
    }
    return NextResponse.json({ ok: true, model: row });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
