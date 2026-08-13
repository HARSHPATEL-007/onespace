import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { WellbeingService } from "@n0va/modules-wellbeing/server";
import { z } from "zod";

const bodySchema = z.object({
  action: z.enum(["ACK", "DISMISS", "SNOOZE", "APPLY"]),
  hours: z.coerce.number().int().min(1).max(168).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  const svc = new WellbeingService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  try {
    const data = await svc.respondToIntervention(id, body.action, body.hours);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}