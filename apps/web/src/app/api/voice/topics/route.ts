import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { prisma } from "@n0va/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const rows = await prisma.voiceRecording.findMany({
    where: { workspaceId: ctx.workspace.id, deletedAt: null, meta: { not: undefined } },
    select: { id: true, meta: true },
  });

  const topicCount = new Map<string, number>();
  const entityCount = new Map<string, { count: number; kind: string }>();
  for (const r of rows) {
    const topics = (r.meta as { topics?: { topics?: Array<{ label: string; count: number }>; entities?: Array<{ name: string; kind: string }> } })?.topics;
    for (const t of topics?.topics ?? []) {
      if (!t?.label) continue;
      topicCount.set(t.label, (topicCount.get(t.label) ?? 0) + t.count);
    }
    for (const e of topics?.entities ?? []) {
      if (!e?.name) continue;
      const prev = entityCount.get(e.name);
      entityCount.set(e.name, { kind: e.kind, count: (prev?.count ?? 0) + 1 });
    }
  }
  const topics = [...topicCount.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const entities = [...entityCount.entries()].map(([name, v]) => ({ name, kind: v.kind, count: v.count })).sort((a, b) => b.count - a.count);
  return NextResponse.json({ ok: true, topics, entities });
}