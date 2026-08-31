import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ pluginId: string; version: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { pluginId, version } = await params; const body = await request.json().catch(()=>({}));
  const { requested_scopes, target_regions } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  // Mock review request
  return NextResponse.json({ plugin_id: pluginId, version, requested_scopes, target_regions, status:"review_requested", review_id: `review_${Date.now()}` });
}
