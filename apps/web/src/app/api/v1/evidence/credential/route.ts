import { auth } from "@n0va/auth";
import { buildEvidenceCredential } from "@n0va/modules-booklm/epistemics";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const credentialSchema = z.object({
  learnerId: z.string().trim().min(1).max(200),
  conceptId: z.string().trim().min(1).max(200),
  claims: z.array(z.object({
    text: z.string().trim().min(1).max(2000),
    evidenceRefs: z.array(z.string().max(200)).default([]),
    verdict: z.string().max(60).default("UNCERTAIN"),
    sourceVersions: z.array(z.string().max(80)).default([]),
  })).min(1).max(40),
  sourceVersions: z.array(z.string().max(80).default("")).default([]),
  modelVersion: z.string().max(80).default("unknown"),
  retrievalVersion: z.string().max(80).default("unknown"),
});

/**
 * POST /v1/evidence/credential — mint an evidence-aware credential.
 * Only verified claims (supporting verdict + evidence refs) count toward
 * the credential; everything else is listed as explicitly not credentialed.
 * Completion alone mints nothing — empty support refuses with 422.
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
  const parsed = credentialSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  const credential = buildEvidenceCredential(parsed.data);
  if (!credential.minted) {
    return NextResponse.json({ error: credential.refusal, credential }, { status: 422 });
  }
  return NextResponse.json({ credential }, { status: 201 });
}
