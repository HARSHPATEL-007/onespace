import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService, aniSymptomSchema } from "@n0va/modules-health/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error:"Unauthorized"}, {status:401});
  const ctx = await requireWorkspace().catch(()=>null);
  if (!ctx) return NextResponse.json({ error:"No workspace"}, {status:400});
  const body = await req.json().catch(()=>({}));
  const parsed = aniSymptomSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten()}, {status:400});
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const result = await svc.aniSymptomChecker(parsed.data);
    return NextResponse.json({ ok:true, ...result });
  } catch (e){ return NextResponse.json({ error: e instanceof Error? e.message:"failed"}, {status:400}); }
}
