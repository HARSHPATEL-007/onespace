import { auth } from "@n0va/auth";
import { EvalService } from "@n0va/modules-booklm/eval";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/education/eval?setId=... — retrieval/generation/learning/safety metrics. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const setId = new URL(req.url).searchParams.get("setId") ?? undefined;

  const svc = new EvalService(c.workspace.id);
  return NextResponse.json(await svc.workspaceEval(setId));
}
