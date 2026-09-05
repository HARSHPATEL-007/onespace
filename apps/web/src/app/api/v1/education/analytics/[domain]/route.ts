import { auth } from "@n0va/auth";
import { AssessInsightsService } from "@n0va/modules-booklm/assess-insights";
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
  return new AssessInsightsService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/education/analytics/{domain} — items | concepts(gain) |
 * misconceptions | mastery(time-to-mastery) | concept-mastery(envelope) |
 * calibration | dropoff | question-quality | early-warning | interventions |
 * map | metric-definitions
 * Query: setId, conceptKey, windowDays, userId (instructor).
 */
export async function GET(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { domain } = await params;
  const url = new URL(req.url);
  const setId = url.searchParams.get("setId") ?? "";
  const conceptKey = url.searchParams.get("conceptKey") ?? undefined;
  const windowDays = parseInt(url.searchParams.get("windowDays") ?? "90", 10) || 90;
  const userId = url.searchParams.get("userId") ?? undefined;
  try {
    const s = svc(c);
    switch (domain) {
      case "items":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await s.itemAnalysis(setId, windowDays));
      case "concepts":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json({ gains: await s.gainByConcept(setId, windowDays, userId) });
      case "misconceptions":
        return NextResponse.json({ clusters: await s.misconceptionClusters(setId || undefined) });
      case "mastery":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json({ mastery: await s.timeToMastery(setId, conceptKey, userId) });
      case "concept-mastery": {
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        if (!conceptKey) return NextResponse.json({ error: "conceptKey required — the envelope is per concept" }, { status: 400 });
        return NextResponse.json(await s.conceptMastery(setId, conceptKey, windowDays, userId));
      }
      case "calibration":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await s.calibration(setId, conceptKey, userId));
      case "dropoff":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await s.dropoff(setId, windowDays));
      case "question-quality":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await s.questionQuality(setId, windowDays));
      case "early-warning":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json({ warnings: await s.earlyWarnings(setId, userId) });
      case "interventions":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json({ outcomes: await s.interventionOutcomes(setId, userId) });
      case "map":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await s.learnerMap(setId));
      case "metric-definitions":
        return NextResponse.json({ definitions: s.metricDefinitions() });
      default:
        return NextResponse.json({ error: "Unknown domain" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /v1/education/analytics/{domain} — cohort-report | dismiss-warning.
 */
export async function POST(req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { domain } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  try {
    const s = svc(c);
    if (domain === "cohort-report") {
      const { setA, setB, conceptKey, windowDays } = b as Record<string, string>;
      if (!setA || !setB || !conceptKey) {
        return NextResponse.json({ error: "setA + setB + conceptKey required" }, { status: 400 });
      }
      return NextResponse.json(await s.cohortReport(setA, setB, conceptKey, Number(windowDays) || 90));
    }
    if (domain === "dismiss-warning") {
      const { conceptKey, reason } = b as Record<string, string>;
      if (!conceptKey) return NextResponse.json({ error: "conceptKey required" }, { status: 400 });
      await s.dismissWarning(conceptKey, reason ?? "");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown domain" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
