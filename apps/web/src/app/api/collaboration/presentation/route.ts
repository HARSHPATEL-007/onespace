import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const presentations = await prisma.presentationSession.findMany({ where: { workspaceId: ctx.workspace.id, endedAt: null }, include: { startedBy: { select: { name: true } } } });
  return NextResponse.json({ presentations });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const pres = await prisma.presentationSession.create({ data: { workspaceId: ctx.workspace.id, startedById: ctx.user.id, channelId: body.channelId, title: body.title ?? "Presentation" } });
  return NextResponse.json(pres);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (body.presentationId) {
    await prisma.presentationSession.update({ where: { id: body.presentationId }, data: { endedAt: new Date() } });
  }
  return NextResponse.json({ success: true });
}
