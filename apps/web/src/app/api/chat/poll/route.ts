import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const pollId = searchParams.get("pollId");
  const messageId = searchParams.get("messageId");

  let id = pollId;
  if (!id && messageId) {
    const msg = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId: ctx.workspace.id } });
    id = msg?.pollId ?? null;
  }
  if (!id) return NextResponse.json({ poll: null });

  const svc = new ChatService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  const poll = await svc.getPoll(id);
  return NextResponse.json({ poll });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { op, pollId, optionIndex } = body;
  if (!pollId || !["vote", "resolve"].includes(op)) {
    return NextResponse.json({ error: "op (vote|resolve) and pollId required" }, { status: 400 });
  }

  const svc = new ChatService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  const poll = op === "vote" ? await svc.votePoll(pollId, optionIndex) : await svc.resolvePoll(pollId);
  return NextResponse.json({ ok: true, poll });
}
