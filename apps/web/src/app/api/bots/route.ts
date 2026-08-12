import { auth } from "@n0va/auth";
import { BotEngine } from "@n0va/modules-bot-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const engine = new BotEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json({ bots: await engine.listBots() }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const engine = new BotEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json(await engine.createBot({ name: body.name, description: body.description, persona: body.persona, knowledgeScopes: body.knowledgeScopes, permissions: body.permissions, triggers: body.triggers })); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
