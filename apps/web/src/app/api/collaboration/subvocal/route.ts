import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const config = await prisma.subVocalConfig.findUnique({ where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } } });
  return NextResponse.json({ config });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const config = await prisma.subVocalConfig.upsert({
    where: { userId_workspaceId: { userId: ctx.user.id, workspaceId: ctx.workspace.id } },
    create: { userId: ctx.user.id, workspaceId: ctx.workspace.id, enabled: body.enabled ?? false, confidenceThreshold: body.confidenceThreshold ?? 0.7, showConfidence: body.showConfidence ?? true, ephemeralConfirm: body.ephemeralConfirm ?? true, sessionKey: crypto.randomUUID() },
    update: { ...(body.enabled !== undefined && { enabled: body.enabled }), ...(body.confidenceThreshold && { confidenceThreshold: body.confidenceThreshold }), ...(body.showConfidence !== undefined && { showConfidence: body.showConfidence }), ...(body.ephemeralConfirm !== undefined && { ephemeralConfirm: body.ephemeralConfirm }) },
  });
  return NextResponse.json(config);
}
