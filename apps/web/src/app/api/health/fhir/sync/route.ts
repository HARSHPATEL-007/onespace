import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error:"Unauthorized"}, {status:401});
  const ctx = await requireWorkspace().catch(()=>null);
  if (!ctx) return NextResponse.json({ error:"No workspace"}, {status:400});
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const rows = await svc.listFhirSyncs(Number(new URL(req.url).searchParams.get("take") ?? "30"));
    return NextResponse.json({ ok:true, rows });
  } catch (e){ return NextResponse.json({ error: e instanceof Error? e.message:"failed"}, {status:400}); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error:"Unauthorized"}, {status:401});
  const ctx = await requireWorkspace().catch(()=>null);
  if (!ctx) return NextResponse.json({ error:"No workspace"}, {status:400});
  const body = await req.json().catch(()=>({}));
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const result = await svc.fhirSync(body as never);
    return NextResponse.json({ ok:true, ...result });
  } catch (e){ return NextResponse.json({ error: e instanceof Error? e.message:"failed"}, {status:400}); }
}
