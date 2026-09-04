import { auth } from "@n0va/auth";
import { AssessProfileService, evidenceSchema, blueprintSchema } from "@n0va/modules-booklm/assess-profile";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

function svc(c: { workspace: { id: string }; user: { id: string }; memberRole: string }) {
  return new AssessProfileService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/learner/assess?view=...&setId=... — profile | learner-report |
 * educator-report | sequence | blueprints | blueprint-check&objective=...
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "profile";
  const setId = url.searchParams.get("setId") ?? "";
  const conceptKey = url.searchParams.get("conceptKey") ?? undefined;
  const label = url.searchParams.get("label") ?? conceptKey ?? "concept";
  if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
  try {
    const a = svc(c);
    switch (view) {
      case "profile":
        return NextResponse.json(await a.profile(setId, conceptKey));
      case "learner-report":
        if (!conceptKey) return NextResponse.json({ error: "conceptKey required" }, { status: 400 });
        return NextResponse.json(await a.learnerReport(setId, conceptKey, label));
      case "educator-report":
        if (!conceptKey) return NextResponse.json({ error: "conceptKey required" }, { status: 400 });
        return NextResponse.json(await a.educatorReport(setId, conceptKey, label));
      case "sequence":
        return NextResponse.json({ sequence: await a.sequence(setId, conceptKey) });
      case "blueprints":
        return NextResponse.json({ blueprints: await a.listBlueprints(setId) });
      case "blueprint-check": {
        const objective = url.searchParams.get("objective") ?? "";
        if (!objective) return NextResponse.json({ error: "objective required" }, { status: 400 });
        return NextResponse.json(await a.blueprintCheck(setId, objective, conceptKey));
      }
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/** POST /v1/learner/assess — evidence | blueprint. */
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
  const action = String(b.action ?? "evidence");
  try {
    const a = svc(c);
    if (action === "evidence") {
      const parsed = evidenceSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await a.recordEvidence(parsed.data), { status: 201 });
    }
    if (action === "blueprint") {
      const parsed = blueprintSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await a.upsertBlueprint(parsed.data), { status: 201 });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : msg.startsWith("Blueprint invalid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
