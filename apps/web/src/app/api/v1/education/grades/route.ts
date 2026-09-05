import { auth } from "@n0va/auth";
import { AssessmentService } from "@n0va/modules-booklm/assessment";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/education/grades — grades for the calling learner. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  try {
    const svc = new AssessmentService(c.workspace.id, c.user.id, c.memberRole);
    const grades = await svc.myGrades();
    return NextResponse.json({ grades });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

const appealSchema = z.object({
  gradeId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
});

/** POST /api/v1/education/grades — learner appeal intake (no penalty during review). */
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
  const parsed = appealSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  try {
    const svc = new AssessmentService(c.workspace.id, c.user.id, c.memberRole);
    const mine = await svc.myGrades();
    if (!mine.some((g) => g.id === parsed.data.gradeId)) {
      return NextResponse.json({ error: "Grade not found" }, { status: 404 });
    }
    return NextResponse.json(await svc.appealGrade(parsed.data.gradeId, parsed.data.reason), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
