import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const op = String(body.operation ?? "high_resolution_export");
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const estimate = await svc.estimateBilling({
    operation: op as never,
    input_duration_seconds: Number(body.input_duration_seconds ?? 180),
    input_size_bytes: Number(body.input_size_bytes ?? 900000000),
    premium: Boolean(body.premium),
    resolution: String(body.resolution ?? "4K"),
    model_id: body.model_id,
    destinations: body.destinations,
    region: body.region ?? "eu-west-1",
  } as never);
  return NextResponse.json(estimate);
}
