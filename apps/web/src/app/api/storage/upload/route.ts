import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { StorageService, storageDirFor, checksumOf } from "@n0va/modules-storage/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const rawParent = String(formData.get("parentId") ?? "");
  const parentId = rawParent ? rawParent : null;
  const rawItem = String(formData.get("itemId") ?? "");
  const itemId = rawItem ? rawItem : null;
  const scopeId = itemId ?? parentId;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: session.user.id,
      status: "ACTIVE",
      ...(scopeId
        ? { workspace: { storageItems: { some: { id: scopeId } } } }
        : {}),
    },
    include: { workspace: true },
  });

  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });

  const workspaceId = membership.workspaceId;
  const svc = new StorageService(workspaceId, session.user.id, membership.role);

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${crypto.randomUUID()}`;
  const dir = storageDirFor(workspaceId);
  fs.writeFileSync(path.join(dir, key), buffer);

  const item = itemId
    ? await svc.uploadNewVersion({
        itemId,
        sizeBytes: buffer.length,
        storageKey: key,
        checksum: checksumOf(buffer),
        changeSummary: String(formData.get("changeSummary") ?? "") || null,
      })
    : await svc.recordUpload({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: buffer.length,
        storageKey: key,
        checksum: checksumOf(buffer),
        parentId,
        changeSummary: String(formData.get("changeSummary") ?? "") || null,
      });

  return NextResponse.json({ id: item.id, name: item.name });
}