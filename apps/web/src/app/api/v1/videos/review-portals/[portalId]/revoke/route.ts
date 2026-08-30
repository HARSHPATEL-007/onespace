import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ portalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { portalId } = await params;
  const body = await request.json().catch(() => ({}));
  const { reason, revoke_active_sessions, revoke_download_tokens } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.portalRevoke(String(portalId), { reason: reason ? String(reason) : undefined, revoke_active_sessions: revoke_active_sessions !== false, revoke_download_tokens: revoke_download_tokens !== false });
  return NextResponse.json({ portal_id: portalId, revoked_sessions: result.revoked_sessions, revoked_links: result.revoked_links, reason: reason ?? "revoked", message: "Review access revoked. Previously recorded comments and decisions remain in the audit trail." });
}
