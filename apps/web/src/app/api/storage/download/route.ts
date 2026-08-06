import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@n0va/auth";
import { StorageService, storageDirFor } from "@n0va/modules-storage/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const itemId = request.nextUrl.searchParams.get("item");
  if (!itemId) return NextResponse.json({ error: "Missing item" }, { status: 400 });

  const membership = await import("@n0va/db").then(({ prisma }) =>
    prisma.workspaceMember.findFirst({
      where: { userId: session.user.id, status: "ACTIVE" },
      include: { workspace: true },
    }),
  );
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const svc = new StorageService(membership.workspaceId, session.user.id, membership.role);
  const item = await svc.getForDownload(itemId);
  if (!item.storageKey) return NextResponse.json({ error: "Not a file" }, { status: 400 });

  const filePath = path.join(storageDirFor(membership.workspaceId), item.storageKey);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: "File missing on disk" }, { status: 404 });

  const data = fs.readFileSync(filePath);
  const isInline = item.mimeType.startsWith("image/");

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Disposition": `${isInline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(item.name)}`,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}