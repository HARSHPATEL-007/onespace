import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ preflightId: string; destinationId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { preflightId, destinationId } = await params;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const pf = await svc.pfGet(String(preflightId));
  if (!pf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const dest = (pf as unknown as { destination_results: Record<string, unknown> }).destination_results[destinationId];
  if (!dest) return NextResponse.json({ error: "Destination not found" }, { status: 404 });
  return NextResponse.json({ preflight_id: preflightId, destination: destinationId, ...dest as object });
}
