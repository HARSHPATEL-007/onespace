import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

// Request-time enforcement: technical availability never implies
// commercial, clinical, or legal enablement. Closed by default.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.tenantId || !body.edition || !body.capability) {
    return NextResponse.json({ error: "tenantId, edition, capability required" }, { status: 400 });
  }
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const decision = await svc.editionCheck(body.tenantId, body.edition, {
      capability: body.capability,
      userRole: body.userRole,
      region: body.region,
      organization: body.organization,
      specialty: body.specialty,
      patientPopulation: body.patientPopulation,
      deviceCatalog: body.deviceCatalog,
      aiModel: body.aiModel,
      dataDomain: body.dataDomain,
      residency: body.residency,
      approvals: body.approvals,
    });
    return NextResponse.json({ ok: true, decision });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
