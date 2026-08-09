import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { EDiscoveryEngine } from "@n0va/modules-mail";

/**
 * POST /api/mail/ediscovery/holds
 * Create a legal hold.
 */
export async function POST(req: Request) {
  try {
    const { workspaceId, userId } = await actionContext();
    const body = await req.json();
    const engine = new EDiscoveryEngine(workspaceId);

    const hold = await engine.createLegalHold({
      name: body.name,
      description: body.description || "",
      createdBy: userId,
      users: body.users || [],
      dateRange: { start: new Date(body.dateStart), end: new Date(body.dateEnd) },
      keywords: body.keywords || [],
      attachmentTypes: body.attachmentTypes || [],
    });

    return NextResponse.json(hold);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create legal hold" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/mail/ediscovery/holds
 * List all legal holds.
 */
export async function GET(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const engine = new EDiscoveryEngine(workspaceId);
    const holds = await engine.getLegalHolds();
    return NextResponse.json({ holds });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list legal holds" },
      { status: 500 },
    );
  }
}
