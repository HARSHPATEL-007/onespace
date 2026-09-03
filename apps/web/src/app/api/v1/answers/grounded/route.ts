import { auth } from "@n0va/auth";
import { EvidenceService, ANSWER_MODES } from "@n0va/modules-booklm/evidence";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const groundedSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  setId: z.string().min(1),
  evidence_ids: z.array(z.string()).max(30).default([]),
  mode: z.enum(ANSWER_MODES).default("GUIDED"),
  response_type: z.string().max(50).default("teach"),
  citation_style: z.string().max(50).default("inline-expandable"),
});

/**
 * POST /v1/answers/grounded — citation-first answer generation.
 * Decomposes into atomic claims, verifies each against evidence spans,
 * persists an auditable AnswerRecord with claim graph + quality scores.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = groundedSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  try {
    const ev = new EvidenceService(c.workspace.id, c.user.id, c.memberRole);
    const result = await ev.groundedAnswerV2(parsed.data.setId, parsed.data.question, {
      mode: parsed.data.mode,
      evidenceIds: parsed.data.evidence_ids,
    });
    return NextResponse.json({ ...result, response_type: parsed.data.response_type, citation_style: parsed.data.citation_style });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Grounded answer failed" }, { status: 500 });
  }
}
