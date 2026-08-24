import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
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
  const url = new URL(req.url);
  const wantTree = url.searchParams.get("tree") === "1" || url.searchParams.get("deep") === "1";

  const [parent, directReplies] = await Promise.all([
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

  // Deep nesting: fetch full tree flat list via ChatService (unlimited logical, 10 visible)
  let replies = directReplies;
  if (wantTree) {
    try {
      const svc = new ChatService(ctx.workspace.id, session.user.id, ctx.memberRole);
      const t = await svc.getThreadTree(parentId, { maxDepth: 20 });
      replies = t.flat.map((f) => t.tree.flatMap(function walk(n: any): any[] { return [n, ...n.children.flatMap(walk)]; }).find((x: any)=> x.id===f.id) ?? directReplies.find(d=> d.id===f.id)).filter(Boolean) as typeof directReplies;
      // Fallback: if mapping failed, fetch all channel messages and filter descendants (server already does)
      if (replies.length === directReplies.length) {
        const channelMsgs = await prisma.chatMessage.findMany({
          where: { channelId: parent.channelId, workspaceId: ctx.workspace.id, deletedAt: null },
          include: { attachments: true },
          orderBy: { createdAt: "asc" },
          take: 500,
        });
        const isDesc = (m: typeof channelMsgs[number]): boolean => {
          let cur: string | null = m.parentId;
          let g=0;
          while (cur && g<20) { if (cur===parentId) return true; const p = channelMsgs.find(x=> x.id===cur); cur = p?.parentId ?? null; g++; }
          return false;
        };
        replies = channelMsgs.filter(isDesc);
      }
    } catch { replies = directReplies; }
  }

  const participantRows = await prisma.chatMessage.groupBy({
    by: ["createdById"],
    where: { parentId: replies.length? { in: replies.map(r=> r.parentId).filter(Boolean) as string[] } : undefined, deletedAt: null },
    _count: { _all: true },
  });
  // Broader participant set: include all replies in tree
  const allIds = [...new Set([parent.createdById, ...replies.map(r=> r.createdById)])];

  const participants = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, email: true, image: true },
  });

  const info = {
    replyCount: replies.length,
    participantCount: allIds.length,
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
