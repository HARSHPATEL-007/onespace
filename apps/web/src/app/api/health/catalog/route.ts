import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error:"Unauthorized"}, {status:401});
  const ctx = await requireWorkspace().catch(()=>null);
  if (!ctx) return NextResponse.json({ error:"No workspace"}, {status:400});
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  return NextResponse.json({ ok:true, catalog: svc.apiCatalog(), risks: HealthService.RISK_DEFINITIONS, layers: HealthService.LAYER_NAMES, ehr: HealthService.EHR_SYSTEMS });
}
