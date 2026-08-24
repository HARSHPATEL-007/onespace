import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";

export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await requireWorkspace();
    const { url, channelId } = await req.json() as { url?: string; channelId?: string };
    if (!url || typeof url !== "string") return NextResponse.json({ error: "url required" }, { status: 400 });
    // Basic SSRF guard: block private IPs + metadata — security layer also checks
    if (/^(javascript|data|file):/i.test(url)) return NextResponse.json({ error: "blocked" }, { status: 400 });
    const svc = new ChatService(workspaceId, userId, role);
    const preview = await svc.previewUnfurl(url, channelId);
    if (!preview) return NextResponse.json({ preview: null, cached: false });
    return NextResponse.json({ preview });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
