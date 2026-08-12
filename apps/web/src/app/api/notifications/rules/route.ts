import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const rules = await prisma.notificationRule.findMany({ where: { userId: ctx.user.id, workspaceId: ctx.workspace.id }, orderBy: { order: "asc" } });
  return NextResponse.json({ rules });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { NotificationEngine } = await import("@n0va/modules-notification-engine/server");
  const engine = new NotificationEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const rule = await engine.createRule(ctx.user.id, { name: body.name, conditions: body.conditions, actions: body.actions, priority: body.priority, stopProcessing: body.stopProcessing });
    return NextResponse.json(rule);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
