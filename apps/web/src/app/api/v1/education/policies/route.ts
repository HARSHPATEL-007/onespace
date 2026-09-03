import { auth } from "@n0va/auth";
import { PolicyService, policySchema } from "@n0va/modules-booklm/policies";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /v1/education/policies?setId=... — effective source policy (defaults when unconfigured). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const setId = new URL(req.url).searchParams.get("setId") ?? "";
  if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });

  const svc = new PolicyService(c.workspace.id, c.user.id, c.memberRole);
  return NextResponse.json({ policy: await svc.effectivePolicy(setId) });
}

/** PUT /v1/education/policies — upsert course source policy (instructor only). */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = policySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const svc = new PolicyService(c.workspace.id, c.user.id, c.memberRole);
    return NextResponse.json({ policy: await svc.upsertPolicy(parsed.data) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
