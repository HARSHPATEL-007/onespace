import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const presences = await prisma.presenceSession.findMany({
    where: { workspaceId: ctx.workspace.id, lastHeartbeat: { gte: fiveMinAgo } },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });

  return NextResponse.json({ presences });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const color = ["#7c5cfc", "#25D366", "#E4405F", "#0084FF", "#FF6B35", "#1A73E8", "#34C759", "#FF2D55"][
    Math.abs(session.user.id.charCodeAt(0)) % 8
  ]!;

  const presence = await prisma.presenceSession.upsert({
    where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } },
    create: {
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      status: body.status ?? "ONLINE",
      activeResource: body.activeResource ?? null,
      activeResourceType: body.activeResourceType ?? null,
      activeSection: body.activeSection ?? null,
      typingInChannel: body.typingInChannel ?? null,
      cursorX: body.cursorX ?? null,
      cursorY: body.cursorY ?? null,
      cursorResourceId: body.cursorResourceId ?? null,
      color,
    },
    update: {
      status: body.status,
      activeResource: body.activeResource,
      activeResourceType: body.activeResourceType,
      activeSection: body.activeSection,
      typingInChannel: body.typingInChannel,
      cursorX: body.cursorX,
      cursorY: body.cursorY,
      cursorResourceId: body.cursorResourceId,
      selectionStart: body.selectionStart,
      selectionEnd: body.selectionEnd,
      selectionResourceId: body.selectionResourceId,
      lastHeartbeat: new Date(),
    },
  });

  return NextResponse.json(presence);
}
