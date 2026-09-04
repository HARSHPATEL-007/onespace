/**
 * Grading policy — pure, dependency-free, deterministic.
 * Uncertainty ranges, partial-credit decomposition, approval gates,
 * learner explanations, fairness guards, regrade rules.
 */

export interface UncertaintyInput {
  evidenceCount: number; boundaryProximity: number; // 0 = clear level, 1 = on a boundary
  implicitEvidence?: boolean; alternativeMethod?: boolean;
  contextUncertainty?: boolean; sourceConflict?: boolean;
}

export interface UncertaintyResult {
  confidence: number; scoreLow: number; scoreHigh: number;
  reasons: string[]; action: "publish" | "instructor_review" | "human_grading";
}

/** Uncertainty describes the grading judgment, never the learner. */
export function gradeUncertainty(points: number, maxPoints: number, input: UncertaintyInput): UncertaintyResult {
  const reasons: string[] = [];
  let confidence = 0.9;
  if (input.evidenceCount === 0) { confidence -= 0.4; reasons.push("no linked evidence"); }
  else if (input.evidenceCount === 1) { confidence -= 0.15; reasons.push("single evidence span"); }
  if (input.boundaryProximity > 0.6) { confidence -= 0.2; reasons.push("rubric level boundary"); }
  else if (input.boundaryProximity > 0.3) { confidence -= 0.1; reasons.push("near a rubric boundary"); }
  if (input.implicitEvidence) { confidence -= 0.12; reasons.push("evidence is implicit rather than explicit"); }
  if (input.alternativeMethod) { confidence -= 0.12; reasons.push("valid alternative method not in examples"); }
  if (input.contextUncertainty) { confidence -= 0.1; reasons.push("accommodation or task context affects interpretation"); }
  if (input.sourceConflict) { confidence -= 0.1; reasons.push("reference material changed or conflicts"); }
  confidence = Math.round(Math.max(0.05, Math.min(0.98, confidence)) * 100) / 100;
  const half = Math.round(maxPoints * (1 - confidence) * 0.5 * 100) / 100;
  const action = confidence >= 0.85 ? "publish" : confidence >= 0.6 ? "instructor_review" : "human_grading";
  return {
    confidence,
    scoreLow: Math.round(Math.max(0, points - half) * 100) / 100,
    scoreHigh: Math.round(Math.min(maxPoints, points + half) * 100) / 100,
    reasons, action,
  };
}

export type ErrorKind = "local" | "propagation" | "conceptual" | "incomplete" | "alternative_method" | "none";

/** Classify a wrong-answer-with-reasoning case for partial credit. */
export function classifyPartialCredit(args: {
  finalCorrect: boolean; structureSound: boolean; earlyError?: boolean;
  wrongModel?: boolean; sufficientEvidence?: boolean; alternativeValid?: boolean;
}): { kind: ErrorKind; creditFraction: number; justification: string } {
  if (args.finalCorrect && args.sufficientEvidence === false) {
    return { kind: "incomplete", creditFraction: 0.6, justification: "Answer correct but evidence insufficient — partial credit." };
  }
  if (args.finalCorrect) return { kind: "none", creditFraction: 1, justification: "Correct with evidence." };
  if (args.alternativeValid) {
    return { kind: "alternative_method", creditFraction: 1, justification: "Method differs from reference but satisfies the rubric — full credit." };
  }
  if (args.wrongModel) {
    return { kind: "conceptual", creditFraction: 0.3, justification: "Selected model is inappropriate, though execution may be coherent." };
  }
  if (args.earlyError) {
    return { kind: "propagation", creditFraction: 0.55, justification: "Early error propagated — later steps judged on method, not contaminated values." };
  }
  if (args.structureSound) {
    return { kind: "local", creditFraction: 0.75, justification: "Structure sound; one local step wrong." };
  }
  return { kind: "incomplete", creditFraction: 0.35, justification: "Reasoning too thin to credit further." };
}

/** Approval gate: stakes × confidence × holds. High stakes always needs a human. */
export function approvalGate(args: {
  stakes: string; confidence: number; holds?: string[]; mode?: string;
}): { publish: boolean; reviewStatus: string; reason: string } {
  if (args.mode === "human_only" || args.stakes === "high") {
    return { publish: false, reviewStatus: "instructor_approval_required", reason: "high-stakes or human-only mode" };
  }
  if ((args.holds ?? []).length > 0) {
    return { publish: false, reviewStatus: "instructor_approval_required", reason: `automatic hold: ${args.holds![0]}` };
  }
  if (args.confidence >= 0.9 && args.stakes !== "high") {
    return { publish: true, reviewStatus: "auto_published", reason: "high confidence, low stakes" };
  }
  if (args.confidence >= 0.6) {
    return { publish: false, reviewStatus: "instructor_review", reason: "moderate uncertainty" };
  }
  return { publish: false, reviewStatus: "human_grading_required", reason: "high uncertainty" };
}

const VAGUE_BANNED = [
  /needs more depth/i, /poor understanding/i, /the ai thinks/i,
  /lacks sophistication/i, /you sound uncertain/i, /not good enough/i,
];

/** Specific, respectful, actionable learner explanation from evidence. */
export function explainGrade(args: {
  total: number; max: number;
  criteria: { label: string; points: number; max: number; gap: string; next: string; reviewed?: boolean }[];
}): { text: string; vagueFlags: string[] } {
  const lines = ["## Your result", "", `Score: ${args.total}/${args.max}`, "", "### What you did well"];
  const strong = args.criteria.filter((c) => c.max > 0 && c.points / c.max >= 0.75);
  lines.push(strong.length > 0
    ? strong.map((c) => `- ${c.label}: ${c.points}/${c.max}`).join("\n")
    : "Every criterion shows a starting point — see feedback below.");
  lines.push("", "### Criterion feedback");
  const vagueFlags: string[] = [];
  for (const c of args.criteria) {
    lines.push("", `${c.label}: ${c.points}/${c.max}`);
    if (c.gap) lines.push(c.gap);
    if (c.next) lines.push(`Next step: ${c.next}`);
    if (c.reviewed) lines.push("This criterion was reviewed by the instructor because the evidence could support two rubric levels.");
    for (const re of VAGUE_BANNED) {
      if (re.test(`${c.gap} ${c.next}`)) vagueFlags.push(`${c.label}: vague language detected`);
    }
  }
  return { text: lines.join("\n"), vagueFlags };
}

/** Fairness disparity with minimum-n guard (no finding below threshold). */
export function disparity(
  groups: { name: string; values: number[] }[],
  minN = 10,
): { comparable: boolean; pairs: { a: string; b: string; stdDiff: number; nA: number; nB: number }[] } {  const stats = groups.map((g) => {
    const n = g.values.length;
    const mean = n ? g.values.reduce((s, v) => s + v, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(g.values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 1;
    return { name: g.name, n, mean, sd };
  });
  const pairs: { a: string; b: string; stdDiff: number; nA: number; nB: number }[] = [];
  let comparable = false;
  for (let i = 0; i < stats.length; i++) {
    for (let j = i + 1; j < stats.length; j++) {
      const a = stats[i]!, b = stats[j]!;
      if (a.n < minN || b.n < minN) continue;
      comparable = true;
      const pooled = Math.sqrt((a.sd ** 2 + b.sd ** 2) / 2) || 1;
      pairs.push({
        a: a.name, b: b.name,
        stdDiff: Math.round(((a.mean - b.mean) / pooled) * 100) / 100,
        nA: a.n, nB: b.n,
      });
    }
  }
  return { comparable, pairs };
}

/** Regrade applier: increases auto (policy permitting); decreases need review. */
export function applyRegradeRule(oldScore: number, newScore: number, opts?: { allowAutoIncrease?: boolean }): {
  apply: "auto" | "review" | "none"; delta: number;
} {
  const delta = Math.round((newScore - oldScore) * 100) / 100;
  if (delta === 0) return { apply: "none", delta };
  if (delta > 0) return { apply: opts?.allowAutoIncrease === false ? "review" : "auto", delta };
  return { apply: "review", delta };
}

/**
 * Disparity from pre-aggregated group stats (means/sds/ns) — raw score
 * arrays never cross this boundary, so identities cannot leak through it.
 */
export function disparityOfMeans(
  groups: { name: string; mean: number; sd: number; n: number }[],
  minN = 10,
): { comparable: boolean; pairs: { a: string; b: string; stdDiff: number; nA: number; nB: number }[] } {
  const pairs: { a: string; b: string; stdDiff: number; nA: number; nB: number }[] = [];
  let comparable = false;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i]!, b = groups[j]!;
      if (a.n < minN || b.n < minN) continue;
      comparable = true;
      const pooled = Math.sqrt((a.sd ** 2 + b.sd ** 2) / 2) || 1;
      pairs.push({
        a: a.name, b: b.name,
        stdDiff: Math.round(((a.mean - b.mean) / pooled) * 100) / 100,
        nA: a.n, nB: b.n,
      });
    }
  }
  return { comparable, pairs };
}
