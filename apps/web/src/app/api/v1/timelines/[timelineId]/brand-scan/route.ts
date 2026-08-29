import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const body = await request.json().catch(() => ({}));
  const graph_version = body.graph_version ? String(body.graph_version) : "gv42";
  const brand_policy = body.brand_policy ? String(body.brand_policy) : "brand_nova_2026.08";
  const region = body.region ? String(body.region) : "IN";
  const platforms = body.platforms ? (body.platforms as string[]).map(String) : ["youtube", "instagram_reels", "broadcast"];
  const checks = body.checks ? (body.checks as string[]).map(String) : ["logos", "fonts", "colors", "voice", "products", "disclaimers", "lower_thirds", "music", "terminology", "regional_rules"];
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const findings = await svc.brandRunScan({ timelineId, graphVersion: graph_version, region, platforms, checks, transcript: body.transcript ? String(body.transcript) : undefined });
  return NextResponse.json({ timelineId, graph_version, brand_policy, region, platforms, checks, findings, total: findings.length });
}
