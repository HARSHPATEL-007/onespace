import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { assetId } = await params; const body = await request.json().catch(()=>({}));
  const { purpose, destination, recipient_domain, policy_id } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const review = await svc.privacyReview(String(assetId), { purpose: String(purpose ?? "external_share"), destination: String(destination ?? "client_portal_acme"), recipient_domain: String(recipient_domain ?? "acme.example"), policy_id: String(policy_id ?? "eu-client-delivery-v7") });
  return NextResponse.json(review);
}
