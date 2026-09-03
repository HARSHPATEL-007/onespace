import { auth } from "@n0va/auth";
import { MaterialsService } from "@n0va/modules-booklm/materials";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["summary", "glossary", "flashcards", "practice-test", "revision-sheet", "viva"] as const;
type Kind = (typeof KINDS)[number];

/**
 * GET /api/v1/booklm/materials?setId=...&kind=summary|glossary|flashcards|practice-test|revision-sheet|viva
 * Deterministic study-material generation (no LLM dependency).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const setId = url.searchParams.get("setId") ?? "";
  const kind = (url.searchParams.get("kind") ?? "summary") as Kind;
  if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of: ${KINDS.join(", ")}` }, { status: 400 });

  try {
    const svc = new MaterialsService(c.workspace.id);
    switch (kind) {
      case "summary": return NextResponse.json(await svc.summary(setId));
      case "glossary": return NextResponse.json(await svc.glossary(setId));
      case "flashcards": return NextResponse.json(await svc.flashcards(setId));
      case "practice-test": return NextResponse.json(await svc.practiceTest(setId));
      case "revision-sheet": return NextResponse.json(await svc.revisionSheet(setId));
      case "viva": return NextResponse.json(await svc.vivaQuestions(setId));
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Materials failed" }, { status: 500 });
  }
}
