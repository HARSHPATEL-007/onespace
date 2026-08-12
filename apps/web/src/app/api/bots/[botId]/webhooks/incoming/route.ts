import { NextResponse } from "next/server";
import { BotEngine } from "@n0va/modules-bot-engine/server";

export async function POST(req: Request, { params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  const body = await req.json().catch(() => ({}));

  const engine = new BotEngine(body.workspaceId ?? "", "system", "ADMIN");
  try {
    const result = await engine.handleWebhook(botId, body);
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
