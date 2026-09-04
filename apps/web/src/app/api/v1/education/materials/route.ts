import { auth } from "@n0va/auth";
import { StudyFactoryService, generateSchema } from "@n0va/modules-booklm/factory";
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
  return new StudyFactoryService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/education/materials?setId=...&type=... | /{id} |
 * /{id}/provenance | /{id}/impact?doc=...
 * POST /v1/education/materials — build-model | generate | validate |
 * review | publish | translate | adapt | accessibility | regenerate |
 * consistency-check
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const setId = url.searchParams.get("setId") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const view = url.searchParams.get("view") ?? "list";
  try {
    const f = svc(c);
    if (view === "provenance") {
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json(await f.provenance(id));
    }
    if (view === "impact") {
      const doc = url.searchParams.get("doc") ?? "";
      if (!doc) return NextResponse.json({ error: "doc required" }, { status: 400 });
      return NextResponse.json(await f.impact(doc));
    }
    if (view === "consistency") {
      if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
      return NextResponse.json(await f.consistency(setId));
    }
    if (id) return NextResponse.json(await f.get(id));
    if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
    return NextResponse.json({
      artifacts: await f.list(setId, url.searchParams.get("type") ?? undefined),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}

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
  const action = String(b.action ?? "generate");
  try {
    const f = svc(c);
    switch (action) {
      case "build-model": {
        const setId = String(b.setId ?? "");
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        const { model, prereqs } = await f.buildModel(setId);
        return NextResponse.json({ modelId: model.id, nodes: (model.nodes as unknown[]).length, prereqs: prereqs.length }, { status: 201 });
      }
      case "generate": {
        const parsed = generateSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await f.generate(parsed.data), { status: 201 });
      }
      case "validate": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await f.validate(id));
      }
      case "review": {
        const { id, approve, note } = b as { id?: string; approve?: boolean; note?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await f.review(id, approve ?? true, note ?? "");
        return NextResponse.json({ ok: true });
      }
      case "publish": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await f.publish(id);
        return NextResponse.json({ ok: true });
      }
      case "translate":
      case "adapt":
      case "accessibility": {
        const { id, opts } = b as { id?: string; opts?: Record<string, unknown> };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(
          await f.transform(id, action as "translate" | "adapt" | "accessibility", opts ?? {}),
          { status: 201 },
        );
      }
      case "regenerate": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await f.regenerate(id), { status: 201 });
      }
      case "consistency-check": {
        const setId = String(b.setId ?? "");
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await f.consistency(setId));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
