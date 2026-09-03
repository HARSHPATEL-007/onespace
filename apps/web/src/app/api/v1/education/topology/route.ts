import { auth } from "@n0va/auth";
import { KnowledgeService } from "@n0va/modules-booklm/knowledge";
import { LearningAnalyticsService } from "@n0va/modules-booklm/analytics";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/education/topology?setId=... — learner consciousness topology:
 * concept mastery, next recommended action, cockpit (streaks, calibration).
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const setId = url.searchParams.get("setId") ?? "";
  if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });

  try {
    const kg = new KnowledgeService(c.workspace.id, c.user.id);
    const an = new LearningAnalyticsService(c.workspace.id);
    const [mastery, nextAction, cockpit] = await Promise.all([
      kg.masteryForUser(setId),
      kg.nextAction(setId),
      an.learnerCockpit(setId, c.user.id),
    ]);
    return NextResponse.json({
      topology: mastery.map((m) => ({
        conceptId: m.conceptId, key: m.concept.key, label: m.concept.label,
        mastery: m.mastery, confidence: m.confidence,
        misconceptionFlag: m.misconceptionFlag, nextReviewAt: m.nextReviewAt,
      })),
      nextAction,
      cockpit,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
