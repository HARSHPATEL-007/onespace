import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

// Bulk entitlement document — the tenant commercial contract:
// { tenant_id, edition, entitlements[], effective_version, approved_by }.
// Each capability is coherence-checked; incoherent or expired rows are
// rejected, never silently granted. Modules never promote one edition
// into another (e.g. RPM on Personal does not make it Care).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const document = await svc.editionGrantDocument(body);
    return NextResponse.json({ ok: true, document });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
