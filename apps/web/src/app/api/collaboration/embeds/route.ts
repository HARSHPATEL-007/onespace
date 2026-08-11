import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");
  const embeds = await prisma.liveEmbed.findMany({ where: { workspaceId: ctx.workspace.id, ...(channelId ? { channelId } : {}) }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ embeds });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.sourceType || !body.sourceId || !body.url) return NextResponse.json({ error: "sourceType, sourceId, url required" }, { status: 400 });
  const embed = await prisma.liveEmbed.create({ data: { channelId: body.channelId, workspaceId: ctx.workspace.id, messageId: body.messageId, sourceType: body.sourceType, sourceId: body.sourceId, title: body.title ?? body.sourceType, description: body.description ?? null, thumbnailUrl: body.thumbnailUrl ?? null, url: body.url, metadata: body.metadata ?? {} } });
  return NextResponse.json(embed);
}
