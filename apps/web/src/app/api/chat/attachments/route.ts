import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { mkdir } from "fs/promises";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const messageId = formData.get("messageId") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const maxSize = 50 * 1024 * 1024;
  if (bytes.length > maxSize) return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 413 });

  const ext = file.name.split(".").pop() ?? "";
  const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const uploadDir = join(process.cwd(), "uploads", ctx.workspace.id);
  await mkdir(uploadDir, { recursive: true });
  const filePath = join(uploadDir, filename);
  await writeFile(filePath, bytes);

  const storageKey = `${ctx.workspace.id}/${filename}`;
  const isImage = file.type.startsWith("image/");

  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const checksum = Buffer.from(hashBuf).toString("hex");

  const attachment = await prisma.chatAttachment.create({
    data: {
      messageId: messageId ?? "pending",
      workspaceId: ctx.workspace.id,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: bytes.length,
      storageKey,
      thumbnailKey: isImage ? storageKey : null,
      checksum,
    },
  });

  return NextResponse.json({
    id: attachment.id,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    storageKey: attachment.storageKey,
    thumbnailKey: attachment.thumbnailKey,
    url: `/api/chat/attachments/${attachment.id}/download`,
  });
}
