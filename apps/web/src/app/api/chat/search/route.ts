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
  const q = url.searchParams.get("q") ?? "";
  const channelId = url.searchParams.get("channelId");
  const author = url.searchParams.get("author");
  const hasAttachment = url.searchParams.get("hasAttachment") === "true";
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 100);

  if (!q.trim() && !channelId && !author) {
    return NextResponse.json({ error: "At least one search parameter required" }, { status: 400 });
  }

  const where: any = {
    workspaceId: ctx.workspace.id,
    deletedAt: null,
  };

  if (q.trim()) {
    where.OR = [
      { body: { contains: q, mode: "insensitive" } },
      { authorName: { contains: q, mode: "insensitive" } },
    ];
  }
  if (channelId) where.channelId = channelId;
  if (author) where.authorName = { contains: author, mode: "insensitive" };
  if (hasAttachment) where.attachments = { some: {} };
  if (after) where.createdAt = { ...where.createdAt, gt: new Date(after) };
  if (before) where.createdAt = { ...where.createdAt, lt: new Date(before) };

  const messages = await prisma.chatMessage.findMany({
    where,
    include: {
      channel: { select: { name: true, kind: true } },
      attachments: { select: { filename: true, mimeType: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ messages, count: messages.length });
}
