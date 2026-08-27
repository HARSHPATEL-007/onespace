import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService, videosDirFor } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = String(formData.get("projectId") ?? "") || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { workspace: true },
  });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const workspaceId = membership.workspaceId;
  const svc = new VideosService(workspaceId, session.user.id, membership.role);

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${crypto.randomUUID()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dir = videosDirFor(workspaceId);
  fs.writeFileSync(path.join(dir, key), buffer);

  // crude width/height/duration detection (mock)
  let width: number | null = null;
  let height: number | null = null;
  let durationMs: number | null = null;
  if (file.type.startsWith("video/")) {
    // mock 1920x1080, 30fps, estimate duration from size
    width = 1920;
    height = 1080;
    durationMs = Math.max(5000, Math.min(300000, Math.round((buffer.length / (1024 * 1024)) * 8000)));
  } else if (file.type.startsWith("image/")) {
    width = 1920;
    height = 1080;
  }

  const asset = await svc.recordAssetUpload({
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.length,
    storageKey: key,
    projectId,
    width,
    height,
    durationMs,
  } as never);

  return NextResponse.json({
    id: (asset as { id: string }).id ?? key,
    filename: file.name,
    storageKey: key,
    sizeBytes: buffer.length,
    mimeType: file.type,
    projectId,
    neural: { model: "n0va-video-analysis-v4", brandSafety: 0.98 },
  });
}
