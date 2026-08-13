import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { WellbeingService, type BiometricInput } from "@n0va/modules-wellbeing/server";
import { z } from "zod";

const sampleSchema = z.object({
  userId: z.string().min(1),
  signals: z.record(z.string(), z.number()),
  source: z.string().optional(),
  recordedAt: z.string().optional(),
});

const bodySchema = z.object({
  samples: z.array(sampleSchema).min(1).max(200),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = bodySchema.parse(await req.json());
  const svc = new WellbeingService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  try {
    const data = await svc.ingestBiometrics(body.samples as BiometricInput[]);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}