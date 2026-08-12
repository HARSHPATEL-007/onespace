import { auth } from "@n0va/auth";
import { BotEngine } from "@n0va/modules-bot-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ botId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { botId } = await params;
  const body = await req.json().catch(() => ({}));
  const engine = new BotEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const result = await engine.handleAITrigger(botId, body.message ?? "", body.signals ?? {});
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
