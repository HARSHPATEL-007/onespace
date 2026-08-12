import { auth } from "@n0va/auth";
import { HuddleService } from "@n0va/modules-huddle-media/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const svc = new HuddleService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json({ huddles: await svc.getActiveHuddles() }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const svc = new HuddleService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const huddle = await svc.createHuddle({ title: body.title, mode: body.mode ?? "INSTANT", channelId: body.channelId, recordingEnabled: body.recordingEnabled, recordingType: body.recordingType, scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined, guestPolicy: body.guestPolicy });
    return NextResponse.json(huddle);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
