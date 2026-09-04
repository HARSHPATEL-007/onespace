import { auth } from "@n0va/auth";
import {
  IntegrityService, policySchemaIntegrity, itemSchema, recordSchema,
  accommodationSchema, defenseSchema,
} from "@n0va/modules-booklm/integrity-service";
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
  return new IntegrityService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/learner/integrity?view=... — status | queue | packet&id=... |
 * appeals | items | exposure&templateKey=... | accommodations | defenses |
 * overview | metrics | policy&assessmentId=...
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "status";
  try {
    const s = svc(c);
    switch (view) {
      case "status":
        return NextResponse.json({ status: await s.learnerStatus() });
      case "queue":
        return NextResponse.json({ queue: await s.reviewQueue() });
      case "packet": {
        const id = url.searchParams.get("id") ?? "";
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await s.reviewerPacket(id));
      }
      case "appeals":
        return NextResponse.json({ appeals: await s.listAppeals(url.searchParams.get("recordId") ?? undefined) });
      case "exposure": {
        const t = url.searchParams.get("templateKey") ?? "";
        if (!t) return NextResponse.json({ error: "templateKey required" }, { status: 400 });
        return NextResponse.json(await s.exposureMap(t));
      }
      case "accommodations":
        return NextResponse.json({ accommodations: await s.listAccommodations(url.searchParams.get("userId") ?? undefined) });
      case "defenses":
        return NextResponse.json({ defenses: await s.listDefenses() });
      case "overview":
        return NextResponse.json(await s.instructorOverview(url.searchParams.get("setId") ?? undefined));
      case "metrics":
        return NextResponse.json(await s.qualityMetrics());
      case "policy": {
        const assessmentId = url.searchParams.get("assessmentId") ?? "";
        if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
        return NextResponse.json(await s.getPolicy(assessmentId));
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

/**
 * POST /v1/learner/integrity — policy | item | variant | expose | record |
 * review | appeal | appeal-resolve | similarity | authorship |
 * accommodation | accommodation-off | defense | defense-score | leak-respond
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
    const s = svc(c);
    switch (action) {
      case "policy": {
        const parsed = policySchemaIntegrity.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        await s.upsertPolicy(parsed.data);
        return NextResponse.json({ ok: true });
      }
      case "item": {
        const parsed = itemSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await s.createItem(parsed.data), { status: 201 });
      }
      case "variant": {
        const { templateKey, assessmentId, setId } = b as Record<string, string>;
        if (!templateKey) return NextResponse.json({ error: "templateKey required" }, { status: 400 });
        return NextResponse.json(await s.makeVariant(templateKey, assessmentId, setId), { status: 201 });
      }
      case "expose": {
        const { itemId, templateKey, kind } = b as Record<string, string>;
        await s.logExposure(itemId || null, templateKey ?? "", kind || "view");
        return NextResponse.json({ ok: true });
      }
      case "item-status": {
        const { id, status } = b as { id?: string; status?: string };
        if (!id || !["ACTIVE", "FROZEN", "RETIRED", "INVALIDATED"].includes(status ?? "")) {
          return NextResponse.json({ error: "id + valid status required" }, { status: 400 });
        }
        await s.setItemStatus(id, status as "ACTIVE" | "FROZEN" | "RETIRED" | "INVALIDATED");
        return NextResponse.json({ ok: true });
      }
      case "leak-respond": {
        const templateKey = String(b.templateKey ?? "");
        if (!templateKey) return NextResponse.json({ error: "templateKey required" }, { status: 400 });
        return NextResponse.json(await s.leakageRespond(templateKey));
      }
      case "record": {
        const parsed = recordSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await s.recordSubmission(parsed.data), { status: 201 });
      }
      case "review": {
        const { id, decision, reason } = b as Record<string, string>;
        if (!id || !reason || !["CLEARED", "VIOLATION"].includes(decision ?? "")) {
          return NextResponse.json({ error: "id + decision + written reason required" }, { status: 400 });
        }
        await s.reviewDecision(id, decision as "CLEARED" | "VIOLATION", reason);
        return NextResponse.json({ ok: true });
      }
      case "appeal": {
        const { recordId, reason, evidence } = b as Record<string, string>;
        if (!recordId || !reason) return NextResponse.json({ error: "recordId + reason required" }, { status: 400 });
        return NextResponse.json(await s.fileAppeal(recordId, reason, evidence ?? ""), { status: 201 });
      }
      case "appeal-resolve": {
        const { id, status, resolution } = b as Record<string, string>;
        if (!id || !["UPHELD", "OVERTURNED"].includes(status ?? "")) {
          return NextResponse.json({ error: "id + valid status required" }, { status: 400 });
        }
        return NextResponse.json(await s.resolveAppeal(id, status as "UPHELD" | "OVERTURNED", resolution ?? ""));
      }
      case "similarity": {
        const { setId, text } = b as Record<string, string>;
        if (!setId || !text) return NextResponse.json({ error: "setId + text required" }, { status: 400 });
        return NextResponse.json(await s.analyzeSubmission(setId, text));
      }
      case "authorship": {
        const signals = Array.isArray(b.signals) ? (b.signals as string[]) : [];
        return NextResponse.json(s.authorshipCheck(signals));
      }
      case "accommodation": {
        const parsed = accommodationSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await s.upsertAccommodation(parsed.data), { status: 201 });
      }
      case "accommodation-off": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await s.deactivateAccommodation(id);
        return NextResponse.json({ ok: true });
      }
      case "defense": {
        const parsed = defenseSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await s.scheduleDefense(parsed.data), { status: 201 });
      }
      case "defense-score": {
        const { id, scores, transcript, note } = b as { id?: string; scores?: Record<string, number>; transcript?: string; note?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await s.scoreDefense(id, scores ?? {}, transcript ?? "", note ?? "");
        return NextResponse.json({ ok: true });
      }
      case "interpret": {
        const { event, userId } = b as Record<string, string>;
        if (!event) return NextResponse.json({ error: "event required" }, { status: 400 });
        return NextResponse.json(await s.interpretEvent(event, userId || c.user.id));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
