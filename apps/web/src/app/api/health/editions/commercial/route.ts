import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

// Commercial packaging — base-edition basis, edition-specific service
// levels, optional modules. Module availability never implies edition
// equivalence.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const edition = searchParams.get("edition") as "NOVA_PERSONAL" | "NOVA_CARE" | "NOVA_CLINICAL" | "NOVA_RESEARCH" | "NOVA_PUBLIC_HEALTH" | null;
    const packaging = await svc.editionCommercial(edition ?? undefined);
    return NextResponse.json({ ok: true, packaging });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
