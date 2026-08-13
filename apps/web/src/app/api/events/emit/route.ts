import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { rankOf } from "@n0va/authz";
import { NextResponse } from "next/server";
import { EVENT_TYPES, validateEvent, messageCreated, taskCreated, approvalRequested, invoiceFlagged } from "@n0va/modules-events";
import { getEventBus } from "@/lib/eventbus";

const FACTORIES: Record<string, (payload: Record<string, unknown>, producer: string, tenantId: string) => ReturnType<typeof messageCreated>> = {
  "chat.message.created": (p, producer, tenantId) => messageCreated(p, { producer, tenantId }),
  "task.created": (p, producer, tenantId) => taskCreated(p, { producer, tenantId }),
  "approval.requested": (p, producer, tenantId) => approvalRequested(p, { producer, tenantId }),
  "invoice.flagged": (p, producer, tenantId) => invoiceFlagged(p, { producer, tenantId }),
};

/** Admin-only: emit a synthetic event through the bus for testing. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  if (rankOf(ctx.memberRole) < 3) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { eventType?: string; payload?: Record<string, unknown> };
  const eventType = body.eventType ?? "";
  const payload = body.payload ?? {};
  const factory = FACTORIES[eventType];
  if (!factory) {
    return NextResponse.json({ error: `unsupported eventType; allowed: ${Object.keys(FACTORIES).join(", ")}` }, { status: 400 });
  }
  const event = factory(payload, "events-admin", ctx.workspace.id);
  const validation = validateEvent(event);
  if (!validation.ok) return NextResponse.json({ error: `invalid payload: ${validation.errors.join(", ")}` }, { status: 400 });
  const result = await getEventBus().emit(event);
  if (!result.ok) return NextResponse.json({ error: result.errors.join(", ") }, { status: 500 });
  return NextResponse.json({ ok: true, eventId: event.eventId });
}

export async function GET() {
  return NextResponse.json({ eventTypes: Object.values(EVENT_TYPES) });
}