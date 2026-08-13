import { auth } from "@n0va/auth";
import { NextResponse } from "next/server";
import { traceEvent, redactForViewer, type CanonicalEvent } from "@n0va/modules-events/server";
import { requireWorkspace } from "@/lib/context";
import { rankOf } from "@n0va/authz";

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { eventId } = await params;
  const trace = await traceEvent(eventId);
  if (!trace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rank = rankOf(ctx.memberRole);
  const e = trace.envelope;
  const envelope = redactForViewer(
    {
      eventId: e.eventId,
      eventType: e.eventType,
      version: e.version,
      schemaVersion: e.schemaVersion,
      timestamp: e.timestamp.toISOString(),
      producer: e.producer,
      tenantId: e.tenantId ?? undefined,
      correlationId: e.correlationId ?? undefined,
      causationId: e.causationId ?? undefined,
      traceId: e.traceId ?? undefined,
      idempotencyKey: e.idempotencyKey ?? undefined,
      partitionKey: e.partitionKey ?? undefined,
      visibility: (e.visibility as CanonicalEvent["visibility"]) ?? "INTERNAL",
      payload: (e.payload as Record<string, unknown>) ?? {},
    },
    rank,
  );
  return NextResponse.json({ envelope, hops: trace.hops });
}