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

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  const draft = await prisma.mailDraft.findFirst({
    where: {
      workspaceId: ctx.workspace.id,
      createdById: ctx.user.id,
      status: "DRAFT",
      threadId: channelId,
    },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });

  return NextResponse.json({ draft });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { channelId, content } = body;

  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });

  const existing = await prisma.mailDraft.findFirst({
    where: {
      workspaceId: ctx.workspace.id,
      createdById: ctx.user.id,
      status: "DRAFT",
      threadId: channelId,
    },
  });

  if (existing) {
    const updated = await prisma.mailDraft.update({
      where: { id: existing.id },
      data: { body: content ?? "", updatedAt: new Date() },
    });
    return NextResponse.json({ draft: updated });
  }

  const draft = await prisma.mailDraft.create({
    data: {
      workspaceId: ctx.workspace.id,
      createdById: ctx.user.id,
      subject: "",
      body: content ?? "",
      status: "DRAFT",
      threadId: channelId,
    },
  });

  return NextResponse.json({ draft });
}
