import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService, savedSearchSchema } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const searches = await svc.listSavedSearches();
  return NextResponse.json({ searches });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let parsed;
  try {
    parsed = savedSearchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid saved search" }, { status: 400 });
  }

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const search = await svc.saveSearch(parsed.name, parsed.query, parsed.filters);
  return NextResponse.json({ search });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const searchId = url.searchParams.get("id");
  if (!searchId) return NextResponse.json({ error: "Missing search id" }, { status: 400 });

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  await svc.deleteSavedSearch(searchId);
  return NextResponse.json({ ok: true });
}
