import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const state = await prisma.adaptivePaneState.findUnique({ where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } } });
  return NextResponse.json({ state });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const state = await prisma.adaptivePaneState.upsert({
    where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } },
    create: { userId: ctx.user.id, workspaceId: ctx.workspace.id, currentMode: body.currentMode ?? "COLLABORATION", activePane: body.activePane ?? "NONE", paneWidth: body.paneWidth ?? 360, collapsed: body.collapsed ?? false },
    update: { ...(body.currentMode && { currentMode: body.currentMode }), ...(body.activePane && { activePane: body.activePane }), ...(body.paneWidth && { paneWidth: body.paneWidth }), ...(body.collapsed !== undefined && { collapsed: body.collapsed }) },
  });
  return NextResponse.json(state);
}
