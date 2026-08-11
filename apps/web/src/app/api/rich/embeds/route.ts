import { auth } from "@n0va/auth";
import { resolveEmbed } from "@n0va/modules-rich-content/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const sourceType = url.searchParams.get("sourceType");
  const sourceId = url.searchParams.get("sourceId");

  if (!sourceType || !sourceId) return NextResponse.json({ error: "sourceType and sourceId required" }, { status: 400 });

  const embed = await resolveEmbed(sourceType, sourceId, ctx.workspace.id);
  if (!embed) return NextResponse.json({ error: "Embed not found" }, { status: 404 });

  return NextResponse.json(embed);
}
