import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const detection = svc.literacyDetectAmbiguity({ text: body.text, patientAge: body.patientAge, pregnancyStatus: body.pregnancyStatus, dose: body.dose });
    // Also create clarification session for audit
    let session = null;
    try { session = await svc.literacyCreateClarification(body.patientId ?? null, detection.riskTier, detection.questions, detection.emergencyScreen); } catch {}
    return NextResponse.json({ ok: true, ...detection, session, clarification_required: detection.clarificationRequired, risk_level: detection.riskTier.toLowerCase(), questions: detection.questions, emergency_screen: detection.emergencyScreen });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
