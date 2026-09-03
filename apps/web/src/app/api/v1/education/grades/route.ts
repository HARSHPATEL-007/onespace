import { auth } from "@n0va/auth";
import { AssessmentService } from "@n0va/modules-booklm/assessment";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

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
