import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { WellbeingService, type EnvSample } from "@n0va/modules-wellbeing/server";
import { z } from "zod";

const sampleSchema = z.object({
  roomRef: z.string().min(1),
  co2: z.number().optional(),
  voc: z.number().optional(),
  pm25: z.number().optional(),
  temperatureC: z.number().optional(),
  humidity: z.number().optional(),
  lightLux: z.number().optional(),
  noiseDb: z.number().optional(),
  occupancy: z.number().optional(),
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
    const data = await svc.ingestEnvironment(body.samples as EnvSample[]);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}