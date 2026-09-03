import { auth } from "@n0va/auth";
import { AssessmentService, assessmentSchema } from "@n0va/modules-booklm/assessment";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/education/assessments?setId=... — list rubric assessments. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const setId = url.searchParams.get("setId") ?? undefined;
  const svc = new AssessmentService(c.workspace.id, c.user.id, c.memberRole);
  try {
    const assessments = await svc.listAssessments(setId);
    return NextResponse.json({ assessments });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/v1/education/assessments — create a rubric assessment (instructor only).
 * Body: { setId?, title, description?, criteria: [{ label, description?, weight?, maxPoints? }] }
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
  const parsed = assessmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });

  const svc = new AssessmentService(c.workspace.id, c.user.id, c.memberRole);
  try {
    const assessment = await svc.createAssessment(parsed.data);
    return NextResponse.json({ assessment }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
