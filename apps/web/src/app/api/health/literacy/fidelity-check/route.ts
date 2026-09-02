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
  if (!body.original || !body.adapted) return NextResponse.json({ error: "original and adapted required" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const result = svc.literacyFidelityCheck(body.original, body.adapted);
    // Also test structured response contract
    let structured = null;
    try { structured = svc.literacyBuildStructuredResponse({ facts: [{ statement: body.original.dose ?? "Take tablet", source: "observation-...", origin: "device_generated", timestamp: new Date().toISOString() }], interpretation: { statement: "Higher than average", confidence: "moderate" }, action: { statement: body.adapted, urgency: "today" }, language: body.language ?? "gu-IN", readingLevel: body.readingLevel ?? "plain" }); } catch {}
    return NextResponse.json({ ok: true, fidelity: result, structured });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
