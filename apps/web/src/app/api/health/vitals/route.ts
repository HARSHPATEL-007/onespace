import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(()=> null);
  if (!ctx) return NextResponse.json({ error:"No workspace"}, {status:400});
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId") ?? undefined;
  const take = Number(searchParams.get("take") ?? "30");
  const layer = searchParams.get("layer") ?? undefined;
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    if (patientId) {
      const rows = await svc.listVitals(patientId, { take, layer });
      return NextResponse.json({ ok:true, rows });
    }
    // global dashboard style
    const data = await svc.vitalsDashboard(patientId);
    return NextResponse.json({ ok:true, ...data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error? e.message:"failed"}, {status:400});
  }
}
