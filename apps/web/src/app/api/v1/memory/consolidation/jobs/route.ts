import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalMemoryConsolidator, normalizeEvent } from "@n0va/modules-ani/memory-consolidator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/memory/consolidation/jobs — create and optionally run consolidation
export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: {
    scope?: { entities?: string[]; memory_types?: string[]; time_range?: { from: string; to: string } };
    trigger?: "scheduled" | "threshold" | "event_driven" | "manual";
    priority?: "low" | "medium" | "high";
    operations?: string[];
    execution_mode?: string;
    tenant_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const tenantId = body.tenant_id ?? "tenant_acme";
  const job = globalMemoryConsolidator.createJob({
    tenant_id: tenantId,
    scope: {
      entities: body.scope?.entities ?? ["project_44"],
      memory_types: body.scope?.memory_types ?? ["ProjectDecision", "Schedule"],
      time_range: body.scope?.time_range ?? { from: "2026-08-01T00:00:00Z", to: new Date().toISOString() },
    },
    trigger: body.trigger ?? "manual",
    priority: body.priority ?? "high",
  });

  // For demo, immediately run with mock events (5 observations of launch date)
  const mockEvents = [
    { system: "meeting", resource_id: "meeting_101", locator: "segment_12", content: "We are considering moving the launch to September 17.", entities: ["project_44"] },
    { system: "mail", resource_id: "mail_77", locator: "paragraph_3", content: "Security review will push the launch.", entities: ["project_44"] },
    { system: "meeting", resource_id: "meeting_112", locator: "segment_31", content: "The launch is now September 17.", entities: ["project_44"] },
    { system: "docs", resource_id: "doc_88", locator: "paragraph_14", content: "Approved launch date: September 17.", entities: ["project_44"] },
    { system: "tasks", resource_id: "task_44", locator: "comment_8", content: "All dependent milestones moved to September 17.", entities: ["project_44"] },
  ].map((e) => normalizeEvent({ ...e, tenant_id: tenantId }));

  const result = await globalMemoryConsolidator.consolidate(job.job_id, mockEvents);

  return Response.json({ job, result }, { status: 201 });
}

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const jobs = globalMemoryConsolidator.listJobs();
  return Response.json({ count: jobs.length, jobs });
}
