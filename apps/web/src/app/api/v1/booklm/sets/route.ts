import { auth } from "@n0va/auth";
import { LearningService, learningSetSchema } from "@n0va/modules-booklm/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

/** GET /api/v1/booklm/sets — list learning sets (collections). */
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const svc = new LearningService(c.workspace.id, c.user.id, c.memberRole);
  const sets = await svc.list();
  return NextResponse.json({
    sets: sets.map((s) => ({
      id: s.id, title: s.title, description: s.description,
      items: s.items.length, updatedAt: s.updatedAt,
    })),
  });
}

/** POST /api/v1/booklm/sets — ingest a new collection. Body: { title, description? } */
export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = learningSetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  const svc = new LearningService(c.workspace.id, c.user.id, c.memberRole);
  const id = await svc.create(parsed.data.title, parsed.data.description);
  return NextResponse.json({ id }, { status: 201 });
}
