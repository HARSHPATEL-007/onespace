/**
 * Learner-graph mathematics — pure, dependency-free, deterministic.
 * Dimension-specific mastery, rich decay, estimate intervals, state machine,
 * cohort privacy bands. No prisma, no node APIs: safe for client components.
 */

export const DIMENSIONS = [
  "recognition", "recall", "conceptual", "procedural", "application",
  "transfer", "analysis", "creation", "metacognition", "collaboration",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type MasteryState =
  | "UNKNOWN" | "EXPOSED" | "RECOGNIZED" | "EMERGING" | "PRACTICED"
  | "RELIABLE" | "TRANSFER_CAPABLE" | "DURABLE" | "INDEPENDENT" | "MENTOR_CAPABLE"
  | "DECAYING" | "CONTESTED" | "MISAPPLIED" | "SUPERSEDED";

/** Learner-facing label: never a stigmatizing diagnosis. */
export function learnerStatusLabel(status: MasteryState): string {
  if (status === "UNKNOWN") return "not yet explored";
  return status.toLowerCase().replace(/_/g, " ");
}

/** Rich decay: M = M0·e^(−λt)·(1+αR)·(1+βT)·(1−γE). */
export function decayRich(
  m0: number, daysSince: number, lambda: number,
  retrievalStrength: number, transferDiversity: number, errorEvidence: number,
  alpha = 0.3, beta = 0.2, gamma = 0.4,
): number {
  const t = Math.max(0, daysSince);
  const m = m0 * Math.exp(-lambda * t)
    * (1 + alpha * clamp01(retrievalStrength))
    * (1 + beta * clamp01(transferDiversity))
    * (1 - gamma * clamp01(errorEvidence));
  return Math.round(clamp01(m) * 1000) / 1000;
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Estimate interval (Wilson-style): distinguishes "probably 42%" from
 * "weak evidence". Wider when evidence is scarce or contradictory.
 */
export function estimateInterval(value: number, evidenceCount: number, disagreement = 0): { lo: number; hi: number; band: "low" | "medium" | "high" } {
  const n = Math.max(1, evidenceCount);
  const p = clamp01(value);
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom + disagreement * 0.05;
  const r = (x: number) => Math.round(clamp01(x) * 100) / 100;
  const band = n >= 12 && disagreement === 0 ? "high" : n >= 5 ? "medium" : "low";
  return { lo: r(center - half), hi: r(center + half), band };
}

/** Evidence required before a state transition is granted. */
export function transitionRequires(status: MasteryState): string {
  switch (status) {
    case "EXPOSED": return "viewed or interacted with content";
    case "RECOGNIZED": return "identifies the concept (recognition evidence)";
    case "EMERGING": return "answers basic questions correctly";
    case "PRACTICED": return "succeeds across repeated attempts";
    case "RELIABLE": return "consistent performance across sessions";
    case "TRANSFER_CAPABLE": return "succeeds in a novel context";
    case "DURABLE": return "delayed retrieval remains successful";
    case "INDEPENDENT": return "solves without scaffolding";
    case "MENTOR_CAPABLE": return "accurately teaches or critiques the concept";
    case "DECAYING": return "predicted decay — retrieval not checked recently";
    case "CONTESTED": return "conflicting evidence about mastery";
    case "MISAPPLIED": return "used correctly in training but wrong in a new context";
    case "SUPERSEDED": return "source or standard changed underneath the knowledge";
    default: return "no evidence yet";
  }
}

/** Forward progression order; regression states branch off RELIABLE. */
export const STATE_ORDER: MasteryState[] = [
  "UNKNOWN", "EXPOSED", "RECOGNIZED", "EMERGING", "PRACTICED",
  "RELIABLE", "TRANSFER_CAPABLE", "DURABLE", "INDEPENDENT", "MENTOR_CAPABLE",
];

export function nextForwardState(status: MasteryState): MasteryState | null {
  const i = STATE_ORDER.indexOf(status);
  if (i < 0 || i >= STATE_ORDER.length - 1) return null;
  return STATE_ORDER[i + 1]!;
}

/**
 * Infer a candidate status from fresh observation signals.
 * Exposure is never treated as mastery: EXPOSED caps below EMERGING.
 */
export function inferStatus(args: {
  current: MasteryState; correct: boolean; repeatedSuccess: number;
  sessionsConsistent: boolean; novelContext: boolean; delayedSuccess: boolean;
  noScaffold: boolean; taughtAccurately: boolean; daysSinceVerified: number;
  decayPredicted: number; conflicting: boolean; misapplied: boolean; superseded: boolean;
}): { status: MasteryState; reason: string } {
  const a = args;
  if (a.superseded) return { status: "SUPERSEDED", reason: "source or standard changed" };
  if (a.misapplied) return { status: "MISAPPLIED", reason: "training success did not transfer to the new context" };
  if (a.conflicting) return { status: "CONTESTED", reason: "conflicting evidence about this mastery" };
  if (a.decayPredicted < 0.35 && a.daysSinceVerified > 21 && STATE_ORDER.indexOf(a.current) >= STATE_ORDER.indexOf("RELIABLE")) {
    return { status: "DECAYING", reason: `recall not checked in ${Math.round(a.daysSinceVerified)} days` };
  }
  if (!a.correct) return { status: a.current, reason: "incorrect response — no advancement" };
  if (a.taughtAccurately) return { status: "MENTOR_CAPABLE", reason: "accurate teaching demonstration" };
  if (a.noScaffold && a.delayedSuccess) return { status: "INDEPENDENT", reason: "unscaffolded delayed success" };
  if (a.delayedSuccess) return { status: "DURABLE", reason: "delayed retrieval successful" };
  if (a.novelContext) return { status: "TRANSFER_CAPABLE", reason: "success in a novel context" };
  if (a.sessionsConsistent) return { status: "RELIABLE", reason: "consistent across sessions" };
  if (a.repeatedSuccess >= 3) return { status: "PRACTICED", reason: `${a.repeatedSuccess} repeated successes` };
  if (a.repeatedSuccess >= 1) return { status: "EMERGING", reason: "basic questions answered" };
  return { status: "RECOGNIZED", reason: "concept identified" };
}

// ---------------------------------------------------------------------------
// Privacy-preserving cohort comparison: bands, never rankings; suppressed
// below the minimum cohort size to prevent re-identification.
// ---------------------------------------------------------------------------

export const COHORT_MIN_N = 10;

export function cohortSafe(n: number, min = COHORT_MIN_N): boolean {
  return n >= min;
}

/** Relative band vs cohort median — no exact peer ranks, ever. */
export function cohortBand(value: number, median: number): "above" | "near" | "below" {
  if (value > median + 0.08) return "above";
  if (value < median - 0.08) return "below";
  return "near";
}

// ---------------------------------------------------------------------------
// Path planning helpers.
// ---------------------------------------------------------------------------

export interface PathStep { conceptKey: string; label: string; kind: string; minutes: number; reason: string }

export interface PathPlan {
  name: string; tradeOff: string; totalMinutes: number; steps: PathStep[];
}

/** Assemble a path from ordered gaps; kinds: gap/decay/misconception/goal/transfer. */
export function assemblePath(
  name: string, tradeOff: string,
  gaps: { conceptKey: string; label: string; kind: string; weight: number }[],
  minutesPerStep = 12,
): PathPlan {
  const steps = [...gaps]
    .sort((a, b) => b.weight - a.weight)
    .map((g) => ({
      conceptKey: g.conceptKey, label: g.label,
      kind: g.kind, minutes: minutesPerStep,
      reason: reasonForKind(g.kind),
    }));
  return { name, tradeOff, steps, totalMinutes: steps.length * minutesPerStep };
}

function reasonForKind(kind: string): string {
  switch (kind) {
    case "prerequisite": return "hard prerequisite — cannot reasonably proceed without it";
    case "gap": return "detected gap blocking the current goal";
    case "decay": return "scheduled review — recall not checked recently";
    case "misconception": return "current interpretation to revisit before it spreads";
    case "transfer": return "novel-context practice to make knowledge portable";
    case "goal": return "directly advances the learner's stated goal";
    default: return "recommended next step";
  }
}

/** Strategy effectiveness summary from per-strategy outcome tallies. */
export function strategySummary(
  tallies: Record<string, { success: number; total: number }>,
): { strategy: string; effectiveness: "high" | "moderate" | "low" | "insufficient"; rate: number }[] {
  return Object.entries(tallies).map(([strategy, t]): {
    strategy: string; effectiveness: "high" | "moderate" | "low" | "insufficient"; rate: number;
  } => {
    if (t.total < 3) return { strategy, effectiveness: "insufficient", rate: 0 };
    const rate = t.success / t.total;
    return {
      strategy, rate: Math.round(rate * 100) / 100,
      effectiveness: rate >= 0.7 ? "high" : rate >= 0.45 ? "moderate" : "low",
    };
  }).sort((a, b) => b.rate - a.rate);
}
