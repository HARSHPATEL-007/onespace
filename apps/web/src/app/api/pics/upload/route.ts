import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { PicsService, picsDirFor, imageDimensions } from "@n0va/modules-pics/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const rawAlbum = String(formData.get("albumId") ?? "");
  const albumId = rawAlbum ? rawAlbum : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { workspace: true },
  });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });

  const workspaceId = membership.workspaceId;
  const svc = new PicsService(workspaceId, session.user.id, membership.role);

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${crypto.randomUUID()}`;
  fs.writeFileSync(path.join(picsDirFor(workspaceId), key), buffer);
  const dims = imageDimensions(buffer);

  const photo = await svc.recordUpload({
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.length,
    storageKey: key,
    albumId,
    width: dims.width ?? null,
    height: dims.height ?? null,
  });

  return NextResponse.json({ id: photo.id, name: photo.filename });
}
