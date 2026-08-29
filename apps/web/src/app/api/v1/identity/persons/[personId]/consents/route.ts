import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { personId } = await params;
  const body = await request.json().catch(() => ({}));
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const grant = await svc.identityCreateConsent(personId, {
    territories: body.territories ? (body.territories as string[]).map(String) : undefined,
    projects: body.projects ? (body.projects as string[]).map(String) : undefined,
    platforms: body.platforms ? (body.platforms as string[]).map(String) : undefined,
    permissions: body.permissions as Record<string, boolean> | undefined,
    expires_at: body.expires_at ? String(body.expires_at) : undefined,
    evidence_id: body.evidence_id ? String(body.evidence_id) : undefined,
  });
  return NextResponse.json(grant);
}
