import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { rankOf } from "@n0va/authz";
import { NextResponse } from "next/server";
import { traceLineage, redactForViewer, redactPayload } from "@n0va/modules-events/server";
import { getEventBus } from "@/lib/eventbus";

/** Causal lineage tree: command → event → event → saga.* graph for one root. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId query param required" }, { status: 400 });

  const tree = await traceLineage(eventId, { window: 1000 });
  if (!tree) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const rank = rankOf(ctx.memberRole);
  const walk = (node: typeof tree): unknown => ({
    eventId: node.envelope.eventId,
    eventType: node.envelope.eventType,
    timestamp: node.envelope.timestamp.toISOString(),
    producer: node.envelope.producer,
    correlationId: node.envelope.correlationId,
    causationId: node.envelope.causationId,
    payload: rank >= 3 ? node.envelope.payload : node.envelope.visibility === "CONFIDENTIAL" ? redactPayload(node.envelope.payload as Record<string, unknown>) : node.envelope.payload,
    hops: node.hops.map((h) => ({ consumer: h.consumer, status: h.status, latencyMs: h.latencyMs, retryCount: h.retryCount, at: h.at.toISOString() })),
    children: node.children.map(walk),
  });

  return NextResponse.json({ tree: walk(tree), rank });
}