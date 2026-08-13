import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { VoiceNotesService } from "@n0va/modules-voice/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const recording = await svc.get(id);
    if (!recording) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, recording });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    segments?: Array<{ id: string; correctedText: string }>;
    consent?: "NONE" | "INFORMED" | "GUEST_DISCLOSED" | "ON_DEVICE";
  };
  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const result = await svc.correct(id, { title: body.title, segments: body.segments, consent: body.consent });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { audio?: boolean; transcript?: boolean };
  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const result = await svc.softDelete(id, { audio: body.audio, transcript: body.transcript });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
