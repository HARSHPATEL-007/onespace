import { auth } from "@n0va/auth";
import { ThreadMemoryService } from "@n0va/modules-thread-memory/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { threadId } = await params;
  const body = await req.json().catch(() => ({}));
  const svc = new ThreadMemoryService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const pin = await svc.pinThread(threadId, body.pinType ?? "ROOM", body.reason, body.expiresAt ? new Date(body.expiresAt) : undefined);
    return NextResponse.json(pin);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
