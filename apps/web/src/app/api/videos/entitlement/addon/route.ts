import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/videos/entitlement/addon — { addOnId, enabled }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const addOnId = String(body.addOnId ?? body.id ?? "");
  const enabled = body.enabled !== false;
  if (!addOnId) return NextResponse.json({ error: "addOnId required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const env = enabled ? await svc.applyAddOn(addOnId as never) : await svc.removeAddOn(addOnId as never);
  return NextResponse.json({ envelope: env, enabled });
}
