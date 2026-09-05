import { auth } from "@n0va/auth";
import { OrchestratorService, runTurnSchema, modePolicySchema } from "@n0va/modules-booklm/orchestrate";
import {
  MODE_CONTRACTS, ALL_MODES, MODE_SAFETY_RULES, MODE_MEMORY,
  socraticHint, fadingSupportCredit, practiceFeedback, debuggingReport,
  researchArtifact, peerReviewFeedback, oralExamPlan, examSessionTransition,
  examGuard, adaptationEquivalenceCheck, errorPatternReport, transitionTrigger,
  type TeachingMode,
} from "@n0va/modules-booklm/tutor-modes";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

function svc(c: { workspace: { id: string }; user: { id: string }; memberRole: string }) {
  return new OrchestratorService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/tutor/agents?view=... — registry | sessions | session&id=... |
 * events&id=... | replay&id=... | escalations[&status=...] | modes[&setId=...] |
 * mode-quality[&setId=...] | contract&mode=... | safety | memory-map
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "registry";
  const id = url.searchParams.get("id") ?? "";
  try {
    const o = svc(c);
    switch (view) {
      case "registry":
        return NextResponse.json({ agents: await o.listAgents() });
      case "session":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await o.sessionDetail(id));
      case "events":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json({ events: await o.sessionEvents(id) });
      case "replay":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await o.replaySession(id));
      case "escalations":
        return NextResponse.json({ escalations: await o.listEscalations(url.searchParams.get("status") ?? undefined) });
      case "modes":
        return NextResponse.json({
          contracts: ALL_MODES.map((m) => MODE_CONTRACTS[m]),
          policies: url.searchParams.get("setId") ? await o.modePolicies(url.searchParams.get("setId")!) : [],
        });
      case "mode-quality":
        return NextResponse.json(await o.modeQuality(url.searchParams.get("setId") ?? undefined));
      case "contract": {
        const mode = String(url.searchParams.get("mode") ?? "DIRECT").toUpperCase() as TeachingMode;
        if (!(ALL_MODES as string[]).includes(mode)) return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
        return NextResponse.json({
          contract: MODE_CONTRACTS[mode],
          safety: MODE_SAFETY_RULES.filter((r) => r.mode === mode),
          memory: MODE_MEMORY[mode],
        });
      }
      case "safety":
        return NextResponse.json({ rules: MODE_SAFETY_RULES });
      case "memory-map":
        return NextResponse.json({ map: MODE_MEMORY });
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}

/**
 * POST /v1/tutor/agents — start | turn | seed | escalate-resolve.
 * turn: { sessionId?, setId?, conceptId?, message }
 * Pure mode machinery (no DB): hint | fading-credit | practice-feedback |
 * debugging-report | research-artifact | peer-feedback | oral-plan |
 * exam-transition | exam-guard | equivalence | error-pattern | transition
 */
export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "turn");
  try {
    const o = svc(c);
    if (action === "seed") {
      return NextResponse.json({ agents: await o.seedRegistry() });
    }
    if (action === "start") {
      const setId = typeof b.setId === "string" ? b.setId : undefined;
      return NextResponse.json(await o.startSession(setId), { status: 201 });
    }
    if (action === "turn") {
      const parsed = runTurnSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await o.runTurn(parsed.data));
    }
    if (action === "escalate-resolve") {
      const { id, resolution, status } = b as { id?: string; resolution?: string; status?: string };
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await o.resolveEscalation(id, String(resolution ?? ""), status === "DISMISSED" ? "DISMISSED" : "RESOLVED");
      return NextResponse.json({ ok: true });
    }
    if (action === "mode-policy") {
      const parsed = modePolicySchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await o.setModePolicy(parsed.data));
    }
    if (action === "progress") {
      const { sessionId, signals } = b as { sessionId?: string; signals?: Record<string, boolean> };
      if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });
      return NextResponse.json(await o.reportProgress(sessionId, (signals ?? {}) as never));
    }
    // -- Pure mode machinery (deterministic, no persistence) --
    if (action === "hint") {
      const { level, concept } = b as { level?: number; concept?: string };
      if (level == null || !concept) return NextResponse.json({ error: "level + concept required" }, { status: 400 });
      return NextResponse.json({ hint: socraticHint(Number(level), String(concept).slice(0, 200)) });
    }
    if (action === "fading-credit") {
      const { stage } = b as { stage?: string };
      const stages = ["full_demonstration", "labels_missing", "partially_completed", "hint_only", "independent"] as const;
      if (!stages.includes((stage ?? "") as (typeof stages)[number])) return NextResponse.json({ error: "valid stage required" }, { status: 400 });
      return NextResponse.json(fadingSupportCredit(stage as (typeof stages)[number]));
    }
    if (action === "practice-feedback") {
      const { attempt, correct } = b as { attempt?: number; correct?: boolean };
      return NextResponse.json(practiceFeedback(Number(attempt ?? 0), correct === true));
    }
    if (action === "debugging-report") {
      const { observed, expected, firstDivergence, evidence, smallestTest, fix } = b as Record<string, string | string[]>;
      if (!observed || !expected) return NextResponse.json({ error: "observed + expected required" }, { status: 400 });
      return NextResponse.json(debuggingReport({
        observed: String(observed), expected: String(expected),
        firstDivergence: firstDivergence ? String(firstDivergence) : undefined,
        evidence: Array.isArray(evidence) ? evidence.map(String) : undefined,
        smallestTest: smallestTest ? String(smallestTest) : undefined,
        fix: fix ? String(fix) : undefined,
      }));
    }
    if (action === "research-artifact") {
      const { question } = b as { question?: string };
      if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
      const { scope, knownEvidence, gaps, hypotheses, methods, risks } = b as Record<string, string | string[]>;
      const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).slice(0, 8) : undefined);
      return NextResponse.json(researchArtifact({
        question: String(question), scope: typeof scope === "string" ? scope : undefined,
        knownEvidence: arr(knownEvidence), gaps: arr(gaps), hypotheses: arr(hypotheses),
        methods: arr(methods), risks: arr(risks),
      }));
    }
    if (action === "peer-feedback") {
      const { criterion } = b as { criterion?: string };
      if (!criterion) return NextResponse.json({ error: "criterion required" }, { status: 400 });
      const { evidence, strength, concern } = b as Record<string, string>;
      return NextResponse.json(peerReviewFeedback({
        criterion: String(criterion),
        evidence: evidence ? String(evidence) : undefined,
        strength: strength ? String(strength) : undefined,
        concern: concern ? String(concern) : undefined,
      }));
    }
    if (action === "oral-plan") {
      const { topic } = b as { topic?: string };
      if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
      const { followUps, recordingConsent, authorizedFormats } = b as { followUps?: number; recordingConsent?: boolean; authorizedFormats?: string[] };
      return NextResponse.json(oralExamPlan({
        topic: String(topic),
        followUps: followUps != null ? Number(followUps) : undefined,
        recordingConsent,
        authorizedFormats: Array.isArray(authorizedFormats) ? authorizedFormats.map(String) : undefined,
      }));
    }
    if (action === "exam-transition") {
      const { state, event } = b as { state?: string; event?: string };
      const states = ["not_started", "locked", "delivering", "recording", "submitted", "graded"] as const;
      if (!states.includes((state ?? "") as (typeof states)[number]) || !event) {
        return NextResponse.json({ error: "valid state + event required" }, { status: 400 });
      }
      return NextResponse.json(examSessionTransition(state as (typeof states)[number], String(event)));
    }
    if (action === "exam-guard") {
      const { guardAction } = b as { guardAction?: string };
      if (!guardAction) return NextResponse.json({ error: "guardAction required" }, { status: 400 });
      return NextResponse.json(examGuard(String(guardAction)));
    }
    if (action === "equivalence") {
      const { controls, assessedSkills } = b as { controls?: string[]; assessedSkills?: string[] };
      if (!Array.isArray(controls) || !Array.isArray(assessedSkills)) {
        return NextResponse.json({ error: "controls[] + assessedSkills[] required" }, { status: 400 });
      }
      return NextResponse.json(adaptationEquivalenceCheck(controls.map(String), assessedSkills.map(String)));
    }
    if (action === "error-pattern") {
      const { errors, attempts } = b as { errors?: { category: string; item: string }[]; attempts?: number };
      if (!Array.isArray(errors)) return NextResponse.json({ error: "errors[] required" }, { status: 400 });
      return NextResponse.json(errorPatternReport(
        errors.map((e) => ({ category: String(e.category), item: String(e.item) })),
        Number(attempts ?? errors.length),
      ));
    }
    if (action === "transition") {
      const { mode, signals } = b as { mode?: string; signals?: Record<string, boolean | string> };
      const m = String(mode ?? "DIRECT").toUpperCase() as TeachingMode;
      if (!(ALL_MODES as string[]).includes(m)) return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
      const s = (signals ?? {}) as Record<string, boolean | string>;
      return NextResponse.json(transitionTrigger(m, {
        prereqFailed: s.prereqFailed === true,
        readiness: s.readiness === true,
        frustration: s.frustration === true,
        policyChanged: s.policyChanged === true,
        objectiveChanged: typeof s.objectiveChanged === "string" ? s.objectiveChanged : null,
      }) ?? { to: null, note: "no trigger — stay in mode" });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
