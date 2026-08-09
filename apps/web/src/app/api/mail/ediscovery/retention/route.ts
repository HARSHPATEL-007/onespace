import { NextResponse } from "next/server";
import { actionContext } from "@/lib/action-context";
import { EDiscoveryEngine } from "@n0va/modules-mail";

/**
 * POST /api/mail/ediscovery/retention
 * Create a retention policy.
 */
export async function POST(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const body = await req.json();
    const engine = new EDiscoveryEngine(workspaceId);

    const policy = await engine.createRetentionPolicy({
      name: body.name,
      retentionPeriodDays: body.retentionPeriodDays,
      action: body.action || "archive",
      applyTo: body.applyTo || "all",
      target: body.target,
    });

    return NextResponse.json(policy);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create retention policy" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/mail/ediscovery/retention
 * List all retention policies.
 */
export async function GET(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const engine = new EDiscoveryEngine(workspaceId);
    const policies = await engine.getRetentionPolicies();
    return NextResponse.json({ policies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list retention policies" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/mail/ediscovery/retention/apply
 * Apply all active retention policies.
 */
export async function PUT(req: Request) {
  try {
    const { workspaceId } = await actionContext();
    const engine = new EDiscoveryEngine(workspaceId);
    const result = await engine.applyRetentionPolicies();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to apply retention policies" },
      { status: 500 },
    );
  }
}
