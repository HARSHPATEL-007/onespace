import { auth } from "@n0va/auth";
import { LearnerGraphService, profileSchema, goalSchema, observeSchema, correctionSchema } from "@n0va/modules-booklm/graph";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function svc(c: { workspace: { id: string }; user: { id: string }; memberRole: string }) {
  return new LearnerGraphService(c.workspace.id, c.user.id, c.memberRole);
}

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

/**
 * GET /v1/learner/graph?conceptId=... — history | mastery-claim | transfer |
 * confidence-map | competency-map | changed | decaying | export.
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const conceptId = url.searchParams.get("conceptId") ?? "";
  const what = url.searchParams.get("view") ?? "history";
  try {
    if (what === "changed") {
      const days = parseInt(url.searchParams.get("days") ?? "30", 10) || 30;
      return NextResponse.json({ changes: await svc(c).whatChanged(days) });
    }
    if (what === "decaying") {
      return NextResponse.json({ decaying: await svc(c).decayedSkills() });
    }
    if (what === "mastery-claim") {
      if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
      return NextResponse.json(await svc(c).masteryClaim(conceptId));
    }
    if (what === "transfer") {
      if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
      return NextResponse.json(await svc(c).transferProfile(conceptId));
    }
    if (what === "confidence-map") {
      return NextResponse.json({
        confidence: await svc(c).confidenceMap(url.searchParams.get("setId") ?? undefined),
      });
    }
    if (what === "competency-map") {
      const setIds = (url.searchParams.get("setIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (setIds.length === 0) return NextResponse.json({ error: "setIds required (comma-separated)" }, { status: 400 });
      return NextResponse.json({ shared: await svc(c).competencyMap(setIds) });
    }
    if (what === "export") {
      const format = url.searchParams.get("format") ?? "jsonld";
      if (format === "csv") {
        return new Response(await svc(c).exportCsv(), {
          headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=learner-graph.csv" },
        });
      }
      return NextResponse.json(await svc(c).exportGraph({ level: url.searchParams.get("level") ?? "record" }));
    }
    if (!conceptId) return NextResponse.json({ error: "conceptId (or view=changed|decaying|export) is required" }, { status: 400 });
    return NextResponse.json(await svc(c).conceptHistory(conceptId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/** POST /v1/learner/graph — observe | goal | profile | correction | undo (action field). */
export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = (body as { action?: string })?.action ?? "observe";
  try {
    const g = svc(c);
    if (action === "observe") {
      const parsed = observeSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await g.observe(parsed.data), { status: 201 });
    }
    if (action === "goal") {
      const parsed = goalSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await g.createGoal(parsed.data), { status: 201 });
    }
    if (action === "profile") {
      const parsed = profileSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await g.createProfile(parsed.data), { status: 201 });
    }
    if (action === "correction") {
      const parsed = correctionSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await g.applyCorrection(parsed.data), { status: 201 });
    }
    if (action === "undo") {
      const id = String((body as { id?: string })?.id ?? "");
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      return NextResponse.json(await g.undoCorrection(id));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
