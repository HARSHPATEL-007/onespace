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
  const { snapshot_id, decision, linked_review_items, confirmation, text, actor_email, language } = body;
  if (!snapshot_id || !decision) return NextResponse.json({ error: "snapshot_id, decision required" }, { status: 400 });
  if (!["approved", "rejected", "approved_with_changes"].includes(String(decision))) return NextResponse.json({ error: "decision must be approved | rejected | approved_with_changes" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const result = await svc.portalSubmitDecision(String(portalId), {
      snapshot_id: String(snapshot_id), decision: String(decision), linked_review_items: linked_review_items ? (linked_review_items as string[]).map(String) : undefined, confirmation, text: text ? String(text) : undefined, actor_email: actor_email ? String(actor_email) : undefined, language: language ? String(language) : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
