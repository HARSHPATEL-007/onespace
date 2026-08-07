import { prisma } from "@n0va/db";
import { N0va1oGateway, GatewayError } from "@n0va/modules-n0va1o/gateway";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Public webhook ingestion endpoint. The URL path is a random per-integration
 * token; payloads are signed with the integration's webhook secret
 * (X-N0VA-Signature: sha256 hex). Metadata only is stored — never payloads.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ webhookPath: string }> }) {
  const { webhookPath } = await params;
  const rawBody = await request.text();

  const integration = await prisma.integration.findFirst({
    where: { webhookPath, webhookEnabled: true },
  });
  if (!integration) {
    return NextResponse.json({ ok: false, error: "Unknown webhook endpoint" }, { status: 404 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = null;
  }

  const gateway = new N0va1oGateway();
  try {
    const result = await gateway.ingestWebhook({
      integration,
      rawBody,
      parsedBody,
      signature: request.headers.get("x-n0va-signature"),
      idempotencyKey: request.headers.get("x-idempotency-key"),
      actorLabel: request.headers.get("user-agent") ?? "webhook",
    });
    return NextResponse.json(
      { ok: result.ok, replayed: result.replayed, eventId: result.eventId, message: result.message },
      { status: result.replayed ? 202 : 200 },
    );
  } catch (err) {
    const status = err instanceof GatewayError ? err.statusCode : 500;
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Webhook rejected" }, { status });
  }
}
