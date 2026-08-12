import { auth } from "@n0va/auth";
import { ThreadMemoryService } from "@n0va/modules-thread-memory/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { threadId } = await params;
  const svc = new ThreadMemoryService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const tree = await svc.getThreadTree(threadId);
    return NextResponse.json({ actions: tree?.actionItems ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { threadId } = await params;
  const body = await req.json().catch(() => ({}));
  const svc = new ThreadMemoryService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const items = await svc.extractActionItems(threadId, body.messageId);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
