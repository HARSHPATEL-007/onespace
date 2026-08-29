import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { findingId } = await params;
  const body = await request.json().catch(() => ({}));
  const approved_by = body.approved_by ? String(body.approved_by) : session.user.id;
  const reason = body.reason ? String(body.reason) : "Waiver approved for campaign";
  const scope = body.scope as Record<string, unknown> | undefined;
  const expires_at = body.expires_at ? String(body.expires_at) : "2026-12-31T23:59:59Z";
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const waiver = await svc.brandCreateWaiver({ finding_id: findingId, approved_by, reason, scope, expires_at });
  return NextResponse.json(waiver);
}
