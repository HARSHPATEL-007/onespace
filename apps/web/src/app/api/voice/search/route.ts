import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { VoiceNotesService } from "@n0va/modules-voice/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 25)));
  const speaker = searchParams.get("speaker") ?? undefined;
  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const results = await svc.search(
      {
        q: searchParams.get("q") ?? undefined,
        roomRef: searchParams.get("room") ?? undefined,
        source: (searchParams.get("source") as "NOTE" | "MEMO" | "HUDDLE" | "UPLOAD" | "LIVE") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
        minConfidence: searchParams.get("minConfidence") ? Number(searchParams.get("minConfidence")) : undefined,
        speaker,
      },
      limit,
    );
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
