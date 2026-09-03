import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

// Launch gates — evidence before claims. High-risk clinical / public-health
// claims never launch on technical readiness alone.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.edition || !body.evidence) {
    return NextResponse.json({ error: "edition and evidence required" }, { status: 400 });
  }
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const launch = await svc.editionLaunch(body.edition, body.evidence, body.approver ?? ctx.userId);
    return NextResponse.json({ ok: true, launch });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
