import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const prefs = await prisma.userNotificationPrefs.findUnique({ where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } } });
  return NextResponse.json({ prefs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const prefs = await prisma.userNotificationPrefs.upsert({
    where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } },
    create: { userId: ctx.user.id, workspaceId: ctx.workspace.id, ...body },
    update: body,
  });
  return NextResponse.json({ prefs });
}
