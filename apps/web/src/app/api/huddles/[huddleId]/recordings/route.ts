import { auth } from "@n0va/auth";
import { HuddleService } from "@n0va/modules-huddle-media/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request, { params }: { params: Promise<{ huddleId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { huddleId } = await params;
  const body = await req.json().catch(() => ({}));
  const svc = new HuddleService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try { return NextResponse.json(await svc.startRecording(huddleId, body.recordingType)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 }); }
}
