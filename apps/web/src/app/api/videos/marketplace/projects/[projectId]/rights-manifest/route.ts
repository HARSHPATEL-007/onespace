import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const { projectId } = await params;
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  // Generate manifest for first installed item as demo
  const installations = await svc.marketplaceInstallations({ project_id: projectId });
  if (!installations.length) return NextResponse.json({ manifest: null, note: "No marketplace items installed" });
  const first = installations[0] as unknown as { item_id: string };
  const manifest = await svc.marketplaceRightsManifest(first.item_id, `asset_${projectId}`);
  return NextResponse.json({ manifest, project_id: projectId });
}
