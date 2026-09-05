import { auth } from "@n0va/auth";
import { DecisionService, pedagogyDecisionSchema, reviewSchema } from "@n0va/modules-booklm/decisions";
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
  return new DecisionService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/learner/decisions?setId=...&status=... | ?view=card&id=... | ?view=metrics&setId=...
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "list";
  try {
    const d = svc(c);
    if (view === "card") {
      const id = url.searchParams.get("id") ?? "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await d.card(id));
    }
    if (view === "metrics") {
      return NextResponse.json(await d.metrics(url.searchParams.get("setId") ?? undefined));
    }
    return NextResponse.json({
      decisions: await d.list(
        url.searchParams.get("setId") ?? undefined,
        url.searchParams.get("status") ?? undefined,
      ),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * POST /v1/learner/decisions — create | draft | control | educator |
 * deliver | measure | review. Draft plans without persisting.
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
  const action = String(b.action ?? "create");
  try {
    const d = svc(c);
    switch (action) {
      case "create": {
        const parsed = pedagogyDecisionSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await d.create(parsed.data), { status: 201 });
      }
      case "draft": {
        const { evidence, evidenceKinds, candidates, confidences, agents } = b as {
          evidence?: { type: string; result: string; context?: string }[];
          evidenceKinds?: string[]; agents?: string[];
          candidates?: { strategy: string; fit: Record<string, number>; risks?: string[] }[];
          confidences?: { strategy?: number; outcome?: number; policy?: number };
        };
        if (!Array.isArray(evidence) || !Array.isArray(candidates) || candidates.length === 0) {
          return NextResponse.json({ error: "evidence[] + non-empty candidates[] required" }, { status: 400 });
        }
        return NextResponse.json(d.draftDecision({
          evidence: evidence.map((e) => ({ type: String(e.type), result: String(e.result), context: e.context ? String(e.context) : undefined })),
          evidenceKinds: Array.isArray(evidenceKinds) ? evidenceKinds.map(String) : undefined,
          candidates: candidates.map((c) => ({
            strategy: String(c.strategy),
            fit: (c.fit ?? {}) as import("@n0va/modules-booklm/pedagogy").StrategyFit,
            risks: Array.isArray(c.risks) ? c.risks.map(String) : undefined,
          })),
          confidences, agents: Array.isArray(agents) ? agents.map(String) : undefined,
        }));
      }
      case "control": {
        const { id, control, note, modifiedAction } = b as Record<string, string>;
        if (!id || !control) return NextResponse.json({ error: "id + control required" }, { status: 400 });
        try {
          return NextResponse.json(await d.control(id, control, note ?? "", modifiedAction ?? ""));
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed";
          const status = msg.startsWith("Unknown control") ? 400 : msg.startsWith("Forbidden") ? 403 : 500;
          return NextResponse.json({ error: msg }, { status });
        }
      }
      case "educator": {
        const { id, control, note, payload } = b as { id?: string; control?: string; note?: string; payload?: Record<string, unknown> };
        if (!id || !control) return NextResponse.json({ error: "id + control required" }, { status: 400 });
        return NextResponse.json(await d.educator(id, control, note ?? "", payload ?? {}));
      }
      case "deliver":
      case "measure": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await d.mark(id, action === "deliver" ? "DELIVERED" : "MEASURED");
        return NextResponse.json({ ok: true });
      }
      case "review": {
        const { id, ...rest } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const parsed = reviewSchema.safeParse(rest);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await d.review(id, parsed.data), { status: 201 });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
