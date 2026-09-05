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

export interface RubricContractCriterion {
  id: string; label: string; weight: number; maxPoints: number;
  levels?: Record<string, string> | null;
  mustHave?: string[]; acceptableVariants?: string[];
  nonEvidence?: string[]; dependsOn?: string[];
}

export interface RubricContractInput {
  rubricVersion: number;
  frozen: boolean;
  criteria: RubricContractCriterion[];
}

/**
 * Rubric-as-contract validation: levels present, must-have elements
 * defined, weights summing to ~1, dependencies acyclic and referencing
 * real criteria, non-evidence exclusions declared. A rubric that fails
 * here must not take submissions.
 */
export function validateRubricContract(r: RubricContractInput): { valid: boolean; issues: string[]; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];
  if (r.criteria.length === 0) issues.push("rubric has no criteria");
  const ids = new Set(r.criteria.map((c) => c.id));
  let wsum = 0;
  for (const c of r.criteria) {
    if (!c.levels || Object.keys(c.levels).length === 0) issues.push(`${c.label}: no performance levels defined`);
    if ((c.mustHave ?? []).length === 0) warnings.push(`${c.label}: no must-have elements — graders improvise`);
    if ((c.nonEvidence ?? []).length === 0) warnings.push(`${c.label}: no non-evidence exclusions (style features may leak into scores)`);
    if (!(c.maxPoints > 0)) issues.push(`${c.label}: maxPoints must be positive`);
    if (c.weight < 0) issues.push(`${c.label}: negative weight`);
    wsum += c.weight;
    for (const d of c.dependsOn ?? []) {
      if (!ids.has(d)) issues.push(`${c.label}: depends on unknown criterion ${d}`);
      if (d === c.id) issues.push(`${c.label}: depends on itself`);
    }
  }
  if (r.criteria.length > 0 && Math.abs(wsum - 1) > 0.01) {
    warnings.push(`weights sum to ${Math.round(wsum * 100) / 100}, not 1 — totals will mislead`);
  }
  // Dependency cycles (A→B→A makes ordering ungradeable).
  const adj = new Map(r.criteria.map((c) => [c.id, (c.dependsOn ?? []).filter((d) => ids.has(d))]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const box: { cycle: string[] | null } = { cycle: null };
  const dfs = (node: string, trail: string[]): void => {
    if (box.cycle || done.has(node)) return;
    if (visiting.has(node)) {
      box.cycle = [...trail.slice(trail.indexOf(node)), node];
      return;
    }
    visiting.add(node);
    for (const next of adj.get(node) ?? []) dfs(next, [...trail, node]);
    visiting.delete(node);
    done.add(node);
  };
  for (const c of r.criteria) dfs(c.id, []);
  if (box.cycle) issues.push(`dependency cycle: ${box.cycle.join(" → ")}`);
  if (!r.frozen) warnings.push("rubric not frozen — freeze on open; changes after submissions need approval");
  return { valid: issues.length === 0, issues, warnings };
}

/**
 * Double-penalty check: the same evidence span (quote or location) cited
 * under two criteria penalizes one error twice. Flags for the instructor —
 * never auto-adjusts, since shared evidence is sometimes legitimate.
 */
export function doublePenaltyCheck(
  evidence: { criterionId: string; criterionLabel?: string; location?: string; quote?: string }[],
): { criterionA: string; criterionB: string; span: string; note: string }[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const findings: { criterionA: string; criterionB: string; span: string; note: string }[] = [];
  for (let i = 0; i < evidence.length; i++) {
    for (let j = i + 1; j < evidence.length; j++) {
      const a = evidence[i]!, b = evidence[j]!;
      if (a.criterionId === b.criterionId) continue;
      const qa = norm(a.quote ?? ""), qb = norm(b.quote ?? "");
      const sameQuote = qa.length > 20 && qb.length > 20 && (qa.includes(qb.slice(0, 40)) || qb.includes(qa.slice(0, 40)));
      const sameLoc = !!a.location && a.location === b.location;
      if (sameQuote || sameLoc) {
        findings.push({
          criterionA: a.criterionLabel ?? a.criterionId,
          criterionB: b.criterionLabel ?? b.criterionId,
          span: (a.quote || a.location || "").slice(0, 120),
          note: "same span under two criteria — confirm one error is not penalized twice",
        });
      }
    }
  }
  return findings.slice(0, 10);
}

/**
 * non_evidence enforcement: reasoning that scores style features the
 * rubric explicitly excludes (grammar, accent, formatting…) is flagged.
 */
export function nonEvidenceCheck(reasoning: string, nonEvidence: string[]): string[] {
  const hits: string[] = [];
  for (const n of nonEvidence) {
    const term = n.trim().toLowerCase();
    if (term.length < 3) continue;
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(reasoning)) {
      hits.push(`reasoning scores excluded feature: “${n.trim()}”`);
    }
  }
  return hits;
}

export type ReasoningStage =
  | "representation" | "concept_selection" | "assumptions" | "method"
  | "steps" | "error_location" | "result" | "verification";

const REASONING_WEIGHTS: Record<ReasoningStage, number> = {
  representation: 0.1, concept_selection: 0.2, assumptions: 0.08, method: 0.15,
  steps: 0.2, error_location: 0.05, result: 0.1, verification: 0.12,
};

/**
 * Reasoning-path scoring: grades the path separately from the outcome.
 * Returns the weighted aggregate plus the weakest stage as the diagnosis —
 * the stage to remediate, not just a number.
 */
export function scoreReasoningPath(stages: Partial<Record<ReasoningStage, number>>): {
  score: number; weakest: ReasoningStage | null; diagnosis: string;
} {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let sum = 0, wsum = 0;
  let weakest: ReasoningStage | null = null, weakestV = Infinity;
  for (const [stage, w] of Object.entries(REASONING_WEIGHTS) as [ReasoningStage, number][]) {
    const v = stages[stage];
    if (v == null) continue;
    sum += clamp(v) * w;
    wsum += w;
    if (clamp(v) < weakestV) {
      weakestV = clamp(v);
      weakest = stage;
    }
  }
  const score = wsum > 0 ? Math.round((sum / wsum) * 100) / 100 : 0;
  return {
    score,
    weakest,
    diagnosis: weakest ? `weakest stage: ${weakest.replace(/_/g, " ")} — remediate there, not at the final answer` : "no stages provided",
  };
}

export interface DeploymentThresholds {
  minExact: number;
  maxMeanAbs: number;
  minN: number;
}

export const DEFAULT_DEPLOYMENT_THRESHOLDS: DeploymentThresholds = { minExact: 0.8, maxMeanAbs: 0.5, minN: 5 };

/**
 * Calibration deployment gate: per-criterion go/no-go against agreement
 * thresholds. Never totals-only — a system can match totals while
 * systematically misgrading one criterion.
 */
export function calibrationDeploymentGate(
  byCriterion: Record<string, { exact: number; meanAbs: number; n: number }>,
  thresholds: DeploymentThresholds = DEFAULT_DEPLOYMENT_THRESHOLDS,
): { deployable: boolean; perCriterion: Record<string, { go: boolean; blockers: string[] }>; blockers: string[] } {
  const perCriterion: Record<string, { go: boolean; blockers: string[] }> = {};
  const blockers: string[] = [];
  for (const [key, m] of Object.entries(byCriterion)) {
    const b: string[] = [];
    if (m.n < thresholds.minN) b.push(`only ${m.n} calibration examples (need ${thresholds.minN})`);
    if (m.exact < thresholds.minExact) b.push(`exact agreement ${m.exact} below ${thresholds.minExact}`);
    if (m.meanAbs > thresholds.maxMeanAbs) b.push(`mean abs difference ${m.meanAbs} above ${thresholds.maxMeanAbs}`);
    perCriterion[key] = { go: b.length === 0, blockers: b };
    if (b.length > 0) blockers.push(`${key}: ${b.join("; ")}`);
  }
  if (Object.keys(byCriterion).length === 0) blockers.push("no calibrated criteria — score instructor examples first");
  return { deployable: blockers.length === 0, perCriterion, blockers: blockers.slice(0, 20) };
}

export interface SourceCheckInput {
  authorSnapshot: string;
  answerSnapshot: string;
  gradeSnapshot: string;
  currentSnapshot: string;
  /** Changed source claims since grading (quotes or claim texts). */
  changedEvidence: string[];
  criteriaEvidence: { criterionId: string; label?: string; quotes: string[] }[];
}

/**
 * Source-grounded grading check: snapshot drift between authoring,
 * answering, grading, and now — with changed evidence mapped to the
 * criteria it touches. Ambiguous or contradictory sources flag review
 * instead of penalizing reasonable learner interpretations.
 */
export function gradingSourceCheck(input: SourceCheckInput): {
  changeDetected: boolean; affectedCriteria: { criterionId: string; label: string; matchedChange: string }[];
  regradeRequired: boolean; note: string;
} {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const changeDetected = input.currentSnapshot !== input.gradeSnapshot;
  const affected: { criterionId: string; label: string; matchedChange: string }[] = [];
  if (changeDetected) {
    for (const c of input.criteriaEvidence) {
      for (const ch of input.changedEvidence) {
        const nc = norm(ch);
        if (nc.length < 15) continue;
        const hit = c.quotes.some((q) => {
          const nq = norm(q);
          return nq.includes(nc.slice(0, 60)) || nc.includes(nq.slice(0, 60));
        });
        if (hit) {
          affected.push({ criterionId: c.criterionId, label: c.label ?? c.criterionId, matchedChange: ch.slice(0, 160) });
          break;
        }
      }
    }
  }
  return {
    changeDetected,
    affectedCriteria: affected.slice(0, 20),
    regradeRequired: affected.length > 0,
    note: !changeDetected
      ? "snapshots identical — no source drift since grading"
      : affected.length > 0
        ? `${affected.length} criteria touch changed evidence — shadow regrade, then instructor review`
        : "source changed but no graded evidence overlaps the change — notification only",
  };
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
