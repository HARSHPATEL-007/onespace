import { auth } from "@n0va/auth";
import { AdaptiveService, loopPlanSchema, loopRespondSchema, policySchemaAdaptive, overrideSchema } from "@n0va/modules-booklm/adapt";
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
  return new AdaptiveService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/learner/adaptive?view=...&conceptId=...&setId=...
 * views: state | diagnose | difficulty | loops | retrieval-due | session |
 * interleave | elaboration-prompts | diagnostic | modality | controls |
 * policy | overrides | strategies
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "state";
  const conceptId = url.searchParams.get("conceptId") ?? "";
  const setId = url.searchParams.get("setId") ?? undefined;
  try {
    const a = svc(c);
    switch (view) {
      case "state":
        if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
        return NextResponse.json(await a.stateVector(conceptId));
      case "diagnose":
        if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
        return NextResponse.json(await a.diagnose(conceptId));
      case "difficulty":
        if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
        return NextResponse.json(await a.difficultyState(conceptId));
      case "loops":
        if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
        return NextResponse.json({ loops: await a.loopHistory(conceptId) });
      case "retrieval-due":
        return NextResponse.json({ due: await a.retrievalDue() });
      case "interleave":
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await a.interleaveSet(setId, (url.searchParams.get("level") as "low" | "moderate" | "high") ?? "moderate"));
      case "diagnostic":
        if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
        return NextResponse.json({ items: await a.calibrateDiagnostic(conceptId) });
      case "modality":
        return NextResponse.json({ best: await a.bestModality(conceptId || null) });
      case "controls":
        return NextResponse.json({ controls: await a.getControls() });
      case "policy":
        return NextResponse.json({ policy: await a.effectivePolicy(setId) });
      case "overrides":
        return NextResponse.json({ overrides: await a.activeOverrides(url.searchParams.get("targetId") ?? undefined) });
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /v1/learner/adaptive — plan | respond | retrieval-answer | session |
 * session-accept | elaborate | control | policy | override | override-off |
 * difficulty-bump | difficulty-reset | ensure-items
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
    const a = svc(c);
    if (action === "plan") {
      const parsed = loopPlanSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await a.planLoop(parsed.data), { status: 201 });
    }
    if (action === "respond") {
      const parsed = loopRespondSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await a.respondLoop(parsed.data));
    }
    if (action === "ensure-items") {
      const { conceptId, setId, items } = b as { conceptId?: string; setId?: string; items?: { key: string; format?: string }[] };
      if (!conceptId || !Array.isArray(items)) return NextResponse.json({ error: "conceptId + items required" }, { status: 400 });
      await a.ensureRetrievalItems(conceptId, setId, items);
      return NextResponse.json({ ok: true });
    }
    if (action === "retrieval-answer") {
      const { itemKey, conceptId, correct, latencyMs, novelty } = b as Record<string, never>;
      if (!itemKey || !conceptId || typeof correct !== "boolean") {
        return NextResponse.json({ error: "itemKey + conceptId + correct required" }, { status: 400 });
      }
      return NextResponse.json(await a.answerRetrieval(itemKey, conceptId, correct, Number(latencyMs) || 0, Number(novelty) || 0));
    }
    if (action === "session") {
      const setId = (b.setId as string) || undefined;
      const minutes = Math.max(10, Math.min(180, Number(b.minutes) || 25));
      return NextResponse.json(await a.planSession(setId, minutes), { status: 201 });
    }
    if (action === "session-accept") {
      const { planId, accepted, modification } = b as Record<string, never>;
      if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });
      await a.acceptSessionPlan(String(planId), Boolean(accepted), String(modification ?? ""));
      return NextResponse.json({ ok: true });
    }
    if (action === "elaborate") {
      const { conceptId, text, keyTerms } = b as { conceptId?: unknown; text?: unknown; keyTerms?: unknown };
      if (typeof conceptId !== "string" || typeof text !== "string" || !conceptId || !text) {
        return NextResponse.json({ error: "conceptId + text required" }, { status: 400 });
      }
      const terms = Array.isArray(keyTerms) ? keyTerms.map(String) : [];
      return NextResponse.json(await a.scoreElaboration(conceptId, text, terms));
    }
    if (action === "control") {
      const { control, value } = b as Record<string, never>;
      if (!control) return NextResponse.json({ error: "control required" }, { status: 400 });
      return NextResponse.json(await a.setControl(String(control), value));
    }
    if (action === "policy") {
      const parsed = policySchemaAdaptive.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await a.upsertPolicy(parsed.data));
    }
    if (action === "override") {
      const parsed = overrideSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await a.createOverride(parsed.data), { status: 201 });
    }
    if (action === "override-off") {
      const { id } = b as { id?: string };
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await a.deactivateOverride(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "difficulty-bump") {
      const { conceptId, success, hints, transfer, bottleneck } = b as Record<string, never>;
      if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
      const bn = (bottleneck ?? {}) as Record<string, boolean>;
      return NextResponse.json(await a.updateDifficulty(
        String(conceptId), Number(success ?? 0.5), Number(hints ?? 0), Number(transfer ?? 0),
        {
          slowResponse: bn.slowResponse === true, highHintUse: bn.highHintUse === true,
          novelFailure: bn.novelFailure === true, ambiguityFailure: bn.ambiguityFailure === true,
          timePressureFailure: bn.timePressureFailure === true, modalityFailure: bn.modalityFailure === true,
        },
      ));
    }
    if (action === "difficulty-reset") {
      const { conceptId } = b as Record<string, never>;
      if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });
      return NextResponse.json(await a.resetDifficulty(String(conceptId)));
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
