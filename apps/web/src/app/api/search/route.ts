import { NextResponse } from "next/server";
import { CloudSearchService } from "@n0va/modules-cloud-search/server";
import { getWorkspaceContext } from "@/lib/context";

export async function GET(req: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const svc = new CloudSearchService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const hits = await svc.search(q);
    return NextResponse.json(hits);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
