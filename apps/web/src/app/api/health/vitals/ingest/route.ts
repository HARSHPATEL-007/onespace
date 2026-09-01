import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService, vitalSchema } from "@n0va/modules-health/server";
import { z } from "zod";

const batchSchema = z.object({ batch: z.array(vitalSchema) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error:"Unauthorized"}, {status:401});
  const ctx = await requireWorkspace().catch(()=> null);
  if (!ctx) return NextResponse.json({ error:"No workspace"}, {status:400});
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  const body = await req.json().catch(()=> ({}));
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten()}, {status:400});
  try {
    const result = await svc.ingestVitals(parsed.data.batch);
    return NextResponse.json({ ok:true, result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error? e.message:"failed"}, {status:400});
  }
}
