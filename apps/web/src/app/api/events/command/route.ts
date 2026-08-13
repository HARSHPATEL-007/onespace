import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { rankOf } from "@n0va/authz";
import { NextResponse } from "next/server";
import { getEventBus } from "@/lib/eventbus";
import { approvalRequested, taskCreated } from "@n0va/modules-events";

/** Admin-only: execute a causal command through the bus (intent → chained events). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  if (rankOf(ctx.memberRole) < 3) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { commandType?: string; payload?: Record<string, unknown> };
  const commandType = body.commandType ?? "";
  const payload = body.payload ?? {};

  const approvalHandler = async (p: Record<string, unknown>): Promise<import("@n0va/modules-events").CanonicalEvent[]> => [
    {
      ...approvalRequested({ approvalId: String(p.approvalId ?? "ap_unknown"), requestType: "PURCHASE", requestedBy: String(p.actorId ?? "system") }, { producer: "command-bus", tenantId: ctx.workspace.id }),
      eventType: "approval.decision",
      version: "1.0",
      payload: { ...p, approvalId: String(p.approvalId ?? "ap_unknown") },
    },
  ];
  const taskHandler = async (p: Record<string, unknown>): Promise<import("@n0va/modules-events").CanonicalEvent[]> => [
    taskCreated(
      {
        taskId: String(p.taskId ?? `t_${Date.now().toString(36)}`),
        title: String(p.title ?? "Command-created task"),
        assigneeId: String(p.assigneeId ?? "demo"),
        workspaceId: ctx.workspace.id,
        ...p,
      },
      { producer: "command-bus", tenantId: ctx.workspace.id },
    ),
  ];
  const handlersMap: Record<string, (p: Record<string, unknown>) => Promise<import("@n0va/modules-events").CanonicalEvent[]>> = {
    "approval.decision": approvalHandler,
    "task.create": taskHandler,
  };

  const handler = handlersMap[commandType];
  if (!handler) return NextResponse.json({ error: `unsupported commandType; allowed: ${Object.keys(handlersMap).join(", ")}` }, { status: 400 });

  const result = await getEventBus().execute(commandType, payload, {
    actorId: session.user.id ?? "admin",
    tenantId: ctx.workspace.id,
    targetAggregate: String(payload.aggregateId ?? payload.approvalId ?? payload.taskId ?? ctx.workspace.id),
    correlationId: String(payload.workflowId ?? payload.correlationId ?? "corr_" + Date.now().toString(36)),
    idempotencyKey: payload.idempotencyKey ? String(payload.idempotencyKey) : undefined,
  }, handler);

  return NextResponse.json(
    result.ok
      ? { ok: true, commandId: result.command.commandId, caused: result.caused.map((e) => e.eventId) }
      : { ok: false, errors: result.errors },
    { status: result.ok ? 200 : 500 },
  );
}