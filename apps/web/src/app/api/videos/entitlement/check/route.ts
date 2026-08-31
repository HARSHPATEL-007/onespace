import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/videos/entitlement/check — checks a capability against current envelope and records audit
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const feature = String(body.feature ?? body.capability ?? "");
  const requested_operation = String(body.requested_operation ?? body.operation ?? "");
  if (!feature || !requested_operation) return NextResponse.json({ error: "feature and requested_operation required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.checkEntitlement({ feature, requested_operation, usage_delta: body.usage_delta });
  return NextResponse.json(result);
}
