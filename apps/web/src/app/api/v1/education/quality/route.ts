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
 * review-decide | rights-upsert | freshness-upsert | provenance-register |
 * provenance-get | approval-request | approval-state | artifact-status |
 * freshness-assess | reading-adapt | safety-disposition
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
      case "provenance-register": {
        return NextResponse.json(await q.registerProvenance(b), { status: 201 });
      }
      case "provenance-get": {
        const { content_id } = b as { content_id?: string };
        if (!content_id) return NextResponse.json({ error: "content_id required" }, { status: 400 });
        return NextResponse.json(await q.provenanceFor(content_id));
      }
      case "approval-request": {
        const { reportId, queues, deadline } = b as { reportId?: string; queues?: string[]; deadline?: string };
        if (!reportId || !Array.isArray(queues)) return NextResponse.json({ error: "reportId + queues[] required" }, { status: 400 });
        return NextResponse.json(await q.requestApproval(reportId, queues, deadline), { status: 201 });
      }
      case "approval-state": {
        const { reportId, deadline } = b as { reportId?: string; deadline?: string };
        if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });
        return NextResponse.json(await q.approvalState(reportId, deadline));
      }
      case "artifact-status": {
        const { artifactId, status } = b as { artifactId?: string; status?: string };
        if (!artifactId || !["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "SUPERSEDED", "REJECTED"].includes(status ?? "")) {
          return NextResponse.json({ error: "artifactId + valid status required" }, { status: 400 });
        }
        return NextResponse.json(await q.setArtifactReviewStatus(artifactId, status as "APPROVED"));
      }
      case "freshness-assess": {
        const { setId } = b as { setId?: string };
        if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
        return NextResponse.json(await q.freshnessAssessment(setId));
      }
      case "reading-adapt": {
        const { text, target } = b as { text?: string; target?: string };
        if (!text || !target) return NextResponse.json({ error: "text + target required" }, { status: 400 });
        return NextResponse.json(q.adaptReadingPlan(text, target));
      }
      case "safety-disposition": {
        const { safetyDisposition } = await import("@n0va/modules-booklm/quality-deep");
        const { findings, ageBand } = b as { findings?: { severity: string; category: string; excerpt: string; action: string }[]; ageBand?: string };
        if (!Array.isArray(findings)) return NextResponse.json({ error: "findings[] required" }, { status: 400 });
        return NextResponse.json(safetyDisposition(
          findings.map((f) => ({ ...f, severity: f.severity === "high" ? "high" as const : "medium" as const, action: "warn" as const })),
          ageBand ?? "",
        ));
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
