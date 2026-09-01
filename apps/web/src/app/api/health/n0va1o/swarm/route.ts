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
    const rows = await svc.listAgentRuns(Number(new URL(req.url).searchParams.get("take") ?? "20"));
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
    if (body.agent_id || body.agentId) {
      const r = await svc.deployAgent({ agent_id: body.agent_id ?? body.agentId, name: body.name ?? body.agent_id, description: body.description, inputs: body.inputs, model: body.model, outputs: body.outputs });
      return NextResponse.json({ ok:true, ...r });
    }
    const r = await svc.orchestrateSwarm(body.intent ?? "assess_patient_for_sepsis", body.patientId);
    return NextResponse.json({ ok:true, ...r });
  } catch (e){ return NextResponse.json({ error: e instanceof Error? e.message:"failed"}, {status:400}); }
}
