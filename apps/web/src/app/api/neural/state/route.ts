import { auth } from "@n0va/auth";
import { NeuralService } from "@n0va/modules-neural-chat/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const svc = new NeuralService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const record = await svc.ingestState({
      source: body.source ?? "WEARABLE",
      modality: body.modality ?? "EEG",
      samplingRate: body.samplingRate,
      attention: body.attention,
      stress: body.stress,
      cognitiveLoad: body.cognitiveLoad,
      flowProb: body.flowProb,
      blinkRate: body.blinkRate,
      heartRate: body.heartRate,
      embedding: body.embedding ?? {},
      provenanceHash: body.provenanceHash ?? crypto.randomUUID(),
    });
    return NextResponse.json(record);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new NeuralService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const records = await svc.getRecentState(50);
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
