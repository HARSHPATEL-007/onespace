import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { videosDirFor } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const file = path.join(videosDirFor(membership.workspaceId), key);
  if (!fs.existsSync(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const stat = fs.statSync(file);
  const stream = fs.createReadStream(file);
  // Determine mime (fallback mp4)
  const mime = key.endsWith(".mp3") ? "audio/mpeg" : key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") || key.endsWith(".jpeg") ? "image/jpeg" : "video/mp4";
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    },
  });
}
