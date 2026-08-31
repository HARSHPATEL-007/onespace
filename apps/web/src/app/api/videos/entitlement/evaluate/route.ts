import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/videos/entitlement/evaluate — { from?, to }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const to = String(body.to ?? body.plan ?? "");
  if (!["creator","team","business","studio","regulated"].includes(to)) return NextResponse.json({ error: "to must be creator|team|business|studio|regulated" }, { status: 400 });
  const fromRaw = body.from ? String(body.from) : undefined;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const evalRes = await svc.evaluateTierChange({ from: fromRaw as never, to: to as never });
  return NextResponse.json(evalRes);
}
