import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { AiMonitoringService } from "@n0va/modules-ai-monitoring/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");

  const where: Record<string, unknown> = { workspaceId: ctx.workspace.id, status: "PENDING" };
  if (messageId) where.messageId = messageId;

  const suggestions = await prisma.smartReplySuggestion.findMany({
    where,
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    take: 8,
  });
  return NextResponse.json({ suggestions });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { op, id } = body;
  if (!id || !["accept", "dismiss"].includes(op)) {
    return NextResponse.json({ error: "op (accept|dismiss) and id required" }, { status: 400 });
  }

  const svc = new AiMonitoringService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  if (op === "accept") await svc.acceptSuggestion(id);
  else await svc.dismissSuggestion(id);
  return NextResponse.json({ ok: true });
}