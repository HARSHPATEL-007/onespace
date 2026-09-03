import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";
import { EDITIONS, PLATFORM_FOUNDATION, OPTIONAL_MODULES, LAUNCH_GATES } from "@n0va/modules-health/edition-packaging";

// Portfolio definition — Phase 1: distinct editions, users, scope, data
// domains, deployment models, support levels, regulatory classification.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const portfolio = await svc.editionPortfolioView();
    return NextResponse.json({
      ok: true,
      portfolio,
      editions: EDITIONS,
      foundation: PLATFORM_FOUNDATION,
      optionalModules: OPTIONAL_MODULES,
      launchGates: LAUNCH_GATES,
      glossary: {
        UHR: "The specific unified health-record capability N0VA provides — not marketed as a legally equivalent EHR unless applicable certification and regulatory requirements are met.",
      },
    });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
