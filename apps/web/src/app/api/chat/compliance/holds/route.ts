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
  const holds = await svc.listLegalHolds(true);
  return NextResponse.json({ holds });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: { op: "place" | "release"; holdId?: string; scope?: string; objectId?: string; objectType?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  if (body.op === "place") {
    const hold = await svc.placeLegalHold({
      scope: body.scope ?? "MESSAGE",
      objectId: body.objectId,
      objectType: body.objectType as "MESSAGE" | "FILE" | "EXPORT" | "AI_ARTIFACT",
      reason: body.reason ?? "Legal hold",
    });
    return NextResponse.json({ hold });
  }
  const hold = await svc.releaseLegalHold(body.holdId!, body.reason ?? "Released");
  return NextResponse.json({ hold });
}
