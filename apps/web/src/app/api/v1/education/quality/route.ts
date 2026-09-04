import { auth } from "@n0va/auth";
import { QualityService, rightsSchema, freshnessRuleSchema } from "@n0va/modules-booklm/quality";
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
  return new QualityService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/education/quality?view=... — report | reports | queue |
 * rights | freshness | impact | metrics
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "reports";
  try {
    const q = svc(c);
    switch (view) {
      case "report": {
        const [subjectType, subjectId] = [url.searchParams.get("subjectType") ?? "artifact", url.searchParams.get("subjectId") ?? ""];
        if (!subjectId) return NextResponse.json({ error: "subjectId required" }, { status: 400 });
        return NextResponse.json(await q.latestReport(subjectType, subjectId));
      }
      case "reports":
        return NextResponse.json({ reports: await q.setReports(url.searchParams.get("setId") ?? undefined) });
      case "queue":
        return NextResponse.json({ queue: await q.reviewQueue(url.searchParams.get("queue") ?? undefined) });
      case "rights":
        return NextResponse.json({ ledger: await q.rightsLedger() });
      case "freshness":
        return NextResponse.json({ rules: await q.listFreshnessRules(url.searchParams.get("setId") ?? undefined) });
      case "impact": {
        const [setId, source, kind] = [url.searchParams.get("setId") ?? "", url.searchParams.get("source") ?? "", url.searchParams.get("kind") ?? "source"];
        if (!setId || !source) return NextResponse.json({ error: "setId + source required" }, { status: 400 });
        return NextResponse.json(await q.impactAnalysis(setId, source, kind));
      }
      case "metrics":
        return NextResponse.json(await q.qualityMetrics(url.searchParams.get("setId") ?? undefined));
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}

/**
 * POST /v1/education/quality — report-artifact | report-document |
 * review-decide | rights-upsert | freshness-upsert
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
    const q = svc(c);
    switch (action) {
      case "report-artifact": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await q.reportArtifact(id), { status: 201 });
      }
      case "report-document": {
        const { id } = b as { id?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await q.reportDocument(id), { status: 201 });
      }
      case "review-decide": {
        const { id, status, note } = b as Record<string, string>;
        if (!id || !["APPROVED", "CHANGES_REQUESTED", "REJECTED", "WAIVED"].includes(status ?? "")) {
          return NextResponse.json({ error: "id + valid status required" }, { status: 400 });
        }
        await q.decideReview(id, status as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "WAIVED", note ?? "");
        return NextResponse.json({ ok: true });
      }
      case "rights-upsert": {
        const parsed = rightsSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await q.upsertRights(parsed.data), { status: 201 });
      }
      case "freshness-upsert": {
        const parsed = freshnessRuleSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await q.upsertFreshnessRule(parsed.data), { status: 201 });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
