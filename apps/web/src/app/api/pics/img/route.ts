import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { picsDirFor } from "@n0va/modules-pics/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return new NextResponse("Bad request", { status: 400 });

  const photo = await prisma.photo.findFirst({
    where: { storageKey: key, workspace: { members: { some: { userId: session.user.id, status: "ACTIVE" } } } },
  });
  if (!photo) return new NextResponse("Not found", { status: 404 });

  const file = path.join(picsDirFor(photo.workspaceId), photo.storageKey);
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });

  const data = fs.readFileSync(file);
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600" },
  });
}
