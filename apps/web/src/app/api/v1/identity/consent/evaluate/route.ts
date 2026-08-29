import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { person_id, operation, project_id, territory, platform, audience } = body;
  if (!person_id || !operation) return NextResponse.json({ error: "person_id and operation required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const decision = await svc.identityEvaluate({
    person_id: String(person_id),
    operation: String(operation),
    project_id: String(project_id ?? "project_001"),
    territory: String(territory ?? "IN"),
    platform: String(platform ?? "youtube"),
    audience: String(audience ?? "public"),
  });
  return NextResponse.json(decision);
}
