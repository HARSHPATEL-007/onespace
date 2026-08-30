import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const { text, campaign_id, product_id, require_consent } = body;
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const results = await svc.kgHybridSearch({ text: String(text), campaign_id: campaign_id ? String(campaign_id) : undefined, product_id: product_id ? String(product_id) : undefined, require_consent: Boolean(require_consent) });
  return NextResponse.json(results);
}
export async function GET(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url); const text = searchParams.get("q") ?? "approved Q3 Product X";
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const results = await svc.kgHybridSearch({ text, campaign_id: "campaign_q3", product_id: "product_007", require_consent: true });
  return NextResponse.json(results);
}
