import { auth } from "@n0va/auth";
import { NeuralService } from "@n0va/modules-neural-chat/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new NeuralService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const huddles = await svc.getActiveHuddles();
    return NextResponse.json({ huddles });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const svc = new NeuralService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const huddle = await svc.createHuddle({
      title: body.title ?? "Neural Huddle",
      roomId: body.roomId,
      subvocalEnabled: body.subvocalEnabled,
      neuralStreamEnabled: body.neuralStreamEnabled,
      latencyTargetMs: body.latencyTargetMs,
    });
    return NextResponse.json(huddle);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
