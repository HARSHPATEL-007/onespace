import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { VoiceNotesService } from "@n0va/modules-voice/server";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "voice");

function audioPath(id: string, ext: string) {
  return path.join(UPLOADS_DIR, `${id}${ext}`);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string" || !file.size) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  if (file.type && !file.type.startsWith("audio/")) {
    return NextResponse.json({ error: "File must be audio" }, { status: 400 });
  }

  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    await svc.get(id); // auth + existence check
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".webm").toLowerCase();
    await fs.writeFile(audioPath(id, ext), buf);
    const result = await svc.attachAudio(id, {
      ext,
      sizeBytes: buf.byteLength,
      mimeType: file.type || "audio/webm",
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const recording = await svc.get(id);
    if (!recording?.audioKey) return NextResponse.json({ error: "No audio uploaded" }, { status: 404 });
    const ext = recording.audioKey.replace(/^voice:\/\/[^.]*/, "") || ".webm";
    const filePath = audioPath(id, ext);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) return NextResponse.json({ error: "Audio file missing" }, { status: 404 });

    const mime = recording.mimeType || "audio/webm";
    const range = req.headers.get("range");
    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=3600",
    };

    if (range) {
      const m = range.match(/^bytes=(\d*)-(\d*)$/);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          const chunk = await fs.readFile(filePath);
          headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
          headers["Content-Length"] = String(end - start + 1);
          return new NextResponse(chunk.subarray(start, end + 1), { status: 206, headers });
        }
      }
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    }

    const data = await fs.readFile(filePath);
    return new NextResponse(data, { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}

export async function HEAD(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return GET(req, { params }).then((res) => new NextResponse(null, { status: res.status, headers: res.headers }));
}