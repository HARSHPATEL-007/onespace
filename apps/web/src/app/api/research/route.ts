import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalResearchOrchestrator, type ResearchMode } from "@n0va/modules-ani/research-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/research
 * Body per spec §17: { question, mode, scope, requirements, execution }
 * Creates plan and optionally starts execution.
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  let body: {
    question?: string;
    mode?: ResearchMode;
    scope?: { sources?: string[]; time_range?: [string, string]; jurisdictions?: string[]; geography?: string[]; domains?: string[] };
    requirements?: { minimum_sources?: number; primary_sources_required?: boolean; show_conflicts?: boolean; citation_granularity?: string };
    execution?: { require_plan_approval?: boolean; max_cost?: number; max_duration_seconds?: number };
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.question || typeof body.question !== "string") {
    return Response.json({ error: "Missing question" }, { status: 400 });
  }

  const mode = (body.mode as ResearchMode) ?? "deep_research";
  const timeRange = body.scope?.time_range ?? null;
  const geography = body.scope?.jurisdictions ?? body.scope?.geography ?? ["IN", "US"];
  const domains = body.scope?.domains ?? ["technology", "finance"];

  const plan = globalResearchOrchestrator.generatePlan(body.question, mode, {
    time_range: timeRange as [string, string] | null,
    geography,
    domains,
    cost_priority: "depth",
  });

  // Apply requirements to source policy
  if (body.requirements?.minimum_sources) {
    plan.source_policy.minimum_independent_sources = body.requirements.minimum_sources;
  }
  if (body.requirements?.primary_sources_required !== undefined) {
    plan.source_policy.require_primary_source_for_factual_claims = body.requirements.primary_sources_required;
  }
  if (body.execution?.max_cost) plan.max_cost = body.execution.max_cost;
  if (body.execution?.max_duration_seconds) plan.max_duration_seconds = body.execution.max_duration_seconds;

  const needsApproval = body.execution?.require_plan_approval ?? (mode !== "quick_answer");
  if (needsApproval) plan.status = "awaiting_approval";

  const workspaceContext = {
    workspaceId: ctx.workspaceId,
    tenantId: ctx.workspaceId,
    userId: ctx.userId,
    sessionId: `research_${plan.research_id}`,
    activeModule: "research",
    language: "en",
    timezone: "UTC",
    locale: "en-US",
    tenantTier: "enterprise" as const,
  } as never;

  const job = await globalResearchOrchestrator.startResearch(plan, workspaceContext);

  // If awaiting approval, do not auto-execute beyond plan creation
  if (job.status === "awaiting_approval") {
    return Response.json(
      {
        research_id: job.research_id,
        plan,
        status: job.status,
        next: `POST /api/research/${job.research_id}/approve to start`,
      },
      { status: 201 },
    );
  }

  return Response.json(
    {
      research_id: job.research_id,
      plan,
      status: job.status,
      events: job.events,
    },
    { status: 201 },
  );
}

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const jobs = globalResearchOrchestrator.listJobs();
  return Response.json({ count: jobs.length, jobs: jobs.map((j: any) => ({ research_id: j.research_id, question: j.plan.question, status: j.status, mode: j.plan.mode })) });
}
