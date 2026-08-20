import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ parentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { parentId } = await params;

  const [parent, replies] = await Promise.all([
    prisma.chatMessage.findFirst({
      where: { id: parentId, workspaceId: ctx.workspace.id },
      include: { attachments: true },
    }),
    prisma.chatMessage.findMany({
      where: { parentId, deletedAt: null },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!parent) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const participantRows = await prisma.chatMessage.groupBy({
    by: ["createdById"],
    where: { parentId, deletedAt: null },
    _count: { _all: true },
  });

  const participantIds = [
    ...new Set([parent.createdById, ...participantRows.map((r) => r.createdById)]),
  ];

  const participants = await prisma.user.findMany({
    where: { id: { in: participantIds } },
    select: { id: true, name: true, email: true, image: true },
  });

  const info = {
    replyCount: participantRows.reduce((sum, r) => sum + r._count._all, 0),
    participantCount: participantIds.length,
    lastReplyAt: replies.length > 0 ? replies[replies.length - 1]!.createdAt.toISOString() : null,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name ?? p.email,
      email: p.email,
      image: p.image,
    })),
  };

  return NextResponse.json({ parent, replies, info });
}
