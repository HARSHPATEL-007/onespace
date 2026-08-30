import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { findingId } = await params; const body = await request.json().catch(() => ({})); const { resolution_type, replacement_asset_id, note, rerun_affected_checks } = body;
  if (!resolution_type) return NextResponse.json({ error: "resolution_type required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const f = await svc.pfResolveFinding(String(findingId), { resolution_type: String(resolution_type), replacement_asset_id: replacement_asset_id ? String(replacement_asset_id) : undefined, note: note ? String(note) : undefined, rerun_affected_checks: Boolean(rerun_affected_checks) });
    return NextResponse.json(f);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 404 }); }
}
