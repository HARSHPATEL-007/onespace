import { auth } from "@n0va/auth";
import { SearchEngine } from "@n0va/modules-search-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const engine = new SearchEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    await engine.indexContent({
      contentType: body.contentType,
      contentId: body.contentId,
      title: body.title,
      body: body.body,
      metadata: body.metadata,
      permissions: body.permissions,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
