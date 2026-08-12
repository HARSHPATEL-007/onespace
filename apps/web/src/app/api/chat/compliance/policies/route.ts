import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const [policies, config, stats, assignments] = await Promise.all([
    svc.listRetentionPolicies(),
    svc.getComplianceConfig(),
    svc.listComplianceStats(),
    svc.listGovernanceAssignments(),
  ]);
  return NextResponse.json({ policies, config, stats, assignments });
}
