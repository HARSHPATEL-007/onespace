import { auth } from "@n0va/auth";
import { NeuralService } from "@n0va/modules-neural-chat/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const contextId = url.searchParams.get("contextId");
  const contextType = (url.searchParams.get("contextType") ?? "MESSAGE") as any;

  if (!contextId) return NextResponse.json({ error: "contextId required" }, { status: 400 });

  const svc = new NeuralService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const map = await svc.getAttentionMap(contextId, contextType);
    return NextResponse.json(map);
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
    const map = await svc.createAttentionMap({
      contextId: body.contextId,
      contextType: body.contextType,
      tokenPositions: body.tokenPositions,
      modelAttentionWeights: body.modelAttentionWeights,
      neuralAttentionCorr: body.neuralAttentionCorr,
      relevanceScore: body.relevanceScore,
    });
    return NextResponse.json(map);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
