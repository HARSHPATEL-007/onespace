import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const verify = url.searchParams.get("verify") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const action = url.searchParams.get("action") ?? undefined;

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const [entries, chain] = await Promise.all([
    svc.listAudit({ limit, cursor, action }),
    verify ? svc.verifyAuditChain() : null,
  ]);
  return NextResponse.json({ entries, chain });
}
