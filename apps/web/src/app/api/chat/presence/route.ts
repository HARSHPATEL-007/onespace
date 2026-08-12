import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const presence = await svc.listPresence();
  return NextResponse.json({ presence });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const valid = ["ONLINE", "AWAY", "BUSY", "DND", "IDLE"] as const;
  let status: (typeof valid)[number];
  let customStatus: string | undefined;
  try {
    const body = await req.json();
    status = body.status;
    customStatus = body.customStatus ?? undefined;
  } catch {
    return NextResponse.json({ error: "Invalid presence" }, { status: 400 });
  }
  if (!(valid as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  await svc.setPresence(status, customStatus);
  return NextResponse.json({ ok: true });
}
