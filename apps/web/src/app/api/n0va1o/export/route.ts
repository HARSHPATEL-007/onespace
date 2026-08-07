import { N0va1oService } from "@n0va/modules-n0va1o/server";
import { getWorkspaceContext } from "@/lib/context";
import { NextResponse } from "next/server";

/** Session-protected audit export (compliance-ready CSV). Metadata only. */
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const svc = new N0va1oService(ctx.workspaceId, ctx.userId, ctx.role);
  const csv = await svc.exportCsv();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="n0va1o-audit-${ctx.workspace.slug}-${stamp}.csv"`,
    },
  });
}