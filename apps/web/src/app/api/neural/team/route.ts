import { auth } from "@n0va/auth";
import { NeuralService } from "@n0va/modules-neural-chat/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new NeuralService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const summary = await svc.getTeamFlowSummary();
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
