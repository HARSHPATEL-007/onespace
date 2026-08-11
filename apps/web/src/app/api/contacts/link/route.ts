import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await requireWorkspace().catch(() => ({ workspaceId: null }));
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { contactId, channelId, userId, platform } = body;

  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  try {
    const link = await prisma.contactChatLink.create({
      data: {
        contactId,
        workspaceId,
        channelId: channelId ?? null,
        userId: userId ?? null,
        platform: platform ?? "N0VA",
        status: "ACTIVE",
      },
    });
    return NextResponse.json(link);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create link" },
      { status: 500 },
    );
  }
}
