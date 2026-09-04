import { auth } from "@n0va/auth";
import { LearnerGraphService } from "@n0va/modules-booklm/graph";
import { MisconceptionService, misconceptionSchema } from "@n0va/modules-booklm/misconceptions";
import { RecommendationService } from "@n0va/modules-booklm/recommend";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

/**
 * GET /v1/learner/adapt?setId=...&view=...
 * views: recommendations | paths | strategies | misconceptions | clusters | goals | profiles | cohort&conceptId=...
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const setId = url.searchParams.get("setId") ?? "";
  const view = url.searchParams.get("view") ?? "recommendations";
  try {
    const rec = new RecommendationService(c.workspace.id, c.user.id);
    const mis = new MisconceptionService(c.workspace.id, c.user.id, c.memberRole);
    const g = new LearnerGraphService(c.workspace.id, c.user.id, c.memberRole);
    switch (view) {
      case "recommendations":
        if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });
        return NextResponse.json({ recommendations: await rec.list(setId) });
      case "paths":
        if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });
        return NextResponse.json({ paths: await rec.planPaths(setId) });
      case "strategies":
        return NextResponse.json(await rec.strategyEffectiveness());
      case "misconceptions":
        return NextResponse.json({
          misconceptions: await mis.list(url.searchParams.get("status") ?? undefined, true),
          clusters: await mis.clusters(),
        });
      case "goals":
        return NextResponse.json({ goals: await g.listGoals() });
      case "profiles":
        return NextResponse.json({ profiles: await g.listProfiles() });
      case "corrections":
        return NextResponse.json({ corrections: await g.listCorrections() });
      case "cohort": {
        const conceptId = url.searchParams.get("conceptId") ?? "";
        if (!conceptId) return NextResponse.json({ error: "conceptId is required" }, { status: 400 });
        return NextResponse.json(await g.cohortComparison(conceptId));
      }
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /v1/learner/adapt — generate | recommend-status | misconception | advance |
 * acknowledge | root-cause.
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
  const action = (body as { action?: string })?.action ?? "";
  try {
    const rec = new RecommendationService(c.workspace.id, c.user.id);
    const mis = new MisconceptionService(c.workspace.id, c.user.id, c.memberRole);
    if (action === "generate") {
      const setId = String((body as { setId?: string })?.setId ?? "");
      if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });
      return NextResponse.json({ recommendations: await rec.generate(setId) }, { status: 201 });
    }
    if (action === "recommend-status") {
      const { id, status } = body as { id?: string; status?: string };
      if (!id || !["ACCEPTED", "REJECTED", "DISMISSED"].includes(status ?? "")) {
        return NextResponse.json({ error: "id + valid status required" }, { status: 400 });
      }
      await rec.setStatus(id, status as "ACCEPTED" | "REJECTED" | "DISMISSED");
      return NextResponse.json({ ok: true });
    }
    if (action === "misconception") {
      const parsed = misconceptionSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await mis.report(parsed.data), { status: 201 });
    }
    if (action === "advance") {
      const { id, to } = body as { id?: string; to?: string };
      if (!id || !to) return NextResponse.json({ error: "id + to required" }, { status: 400 });
      return NextResponse.json(await mis.advance(id, to));
    }
    if (action === "acknowledge") {
      const { id, acknowledged } = body as { id?: string; acknowledged?: boolean };
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await mis.acknowledge(id, acknowledged ?? true);
      return NextResponse.json({ ok: true });
    }
    if (action === "root-cause") {
      const conceptId = String((body as { conceptId?: string })?.conceptId ?? "");
      if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
      return NextResponse.json({ hints: await mis.rootCauseHints(conceptId) });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") || msg.startsWith("Invalid transition") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
