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
  const package_uri = body.package_uri ? String(body.package_uri) : body.packageId ? String(body.packageId) : "";
  const target_profile = body.target_profile ? String(body.target_profile) : body.target ? String(body.target) : "resolve_color_xml";
  if (!package_uri) return NextResponse.json({ error: "package_uri required (n0va://packages/... or packageId)" }, { status: 400 });
  const pkgId = package_uri.includes("://") ? package_uri.split("/").pop() ?? package_uri : package_uri;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const report = await svc.interchangeValidate(pkgId, target_profile);
  return NextResponse.json(report);
}
