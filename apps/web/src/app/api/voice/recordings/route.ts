import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { VoiceNotesService } from "@n0va/modules-voice/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const result = await svc.ingest({
      title: typeof body.title === "string" ? body.title : "Voice note",
      source: (body.source as "NOTE" | "MEMO" | "HUDDLE" | "UPLOAD" | "LIVE") ?? "NOTE",
      textHint: typeof body.textHint === "string" ? body.textHint : undefined,
      segments: Array.isArray(body.segments) ? (body.segments as never) : undefined,
      audioDurationMs: typeof body.audioDurationMs === "number" ? body.audioDurationMs : undefined,
      mimeType: typeof body.mimeType === "string" ? body.mimeType : undefined,
      language: typeof body.language === "string" ? body.language : undefined,
      roomRef: typeof body.roomRef === "string" ? body.roomRef : undefined,
      sensitiveTerms: Array.isArray(body.sensitiveTerms) ? (body.sensitiveTerms as string[]) : undefined,
      meta: typeof body.meta === "object" && body.meta !== null ? (body.meta as Record<string, unknown>) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const status = searchParams.get("status") ?? undefined;
  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const recordings = await svc.list(limit, status);
    return NextResponse.json({ ok: true, recordings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
