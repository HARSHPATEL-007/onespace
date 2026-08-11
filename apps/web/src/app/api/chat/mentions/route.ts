import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");

  const mentions = await prisma.chatMessage.findMany({
    where: {
      workspaceId: ctx.workspace.id,
      body: { contains: `@${ctx.user.name ?? ctx.user.email ?? ""}` },
      ...(channelId ? { channelId } : {}),
    },
    include: { channel: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ mentions });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { messageId, mentionedUserId, channelId } = body;

  const mentionedMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: ctx.workspace.id, userId: mentionedUserId, status: "ACTIVE" },
  });

  if (!mentionedMember) return NextResponse.json({ error: "User not in workspace" }, { status: 404 });

  await prisma.notification.create({
    data: {
      workspaceId: ctx.workspace.id,
      userId: mentionedUserId,
      type: "chat_mention",
      title: `${ctx.user.name ?? "Someone"} mentioned you`,
      body: body.preview ?? "You were mentioned in a message",
      link: `/m/chat?c=${channelId}${messageId ? `&m=${messageId}` : ""}`,
    },
  });

  return NextResponse.json({ success: true });
}
