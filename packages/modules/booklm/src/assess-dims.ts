/**
 * Deep-assessment dimensions — pure, dependency-free, deterministic.
 * 12 interpretable dimensions with subscore rubrics, evidence-weighted
 * aggregation, decision rules, sequence, blueprint validation.
 */

export const ASSESS_DIMS = [
  "retrieval", "application", "novel_transfer", "error_diagnosis",
  "concept_mapping", "teach_back", "oral_explanation", "practical_demonstration",
  "project_evaluation", "reflection_metacognition", "peer_assessment",
  "portfolio_evidence",
] as const;
export type AssessDim = (typeof ASSESS_DIMS)[number];

export const DIM_QUESTIONS: Record<AssessDim, string> = {
  retrieval: "Can the learner recall essential knowledge?",
  application: "Can the learner use a known method?",
  novel_transfer: "Can the learner adapt knowledge to a new situation?",
  error_diagnosis: "Can the learner locate and explain a mistake?",
  concept_mapping: "Can the learner organize relationships?",
  teach_back: "Can the learner make the idea understandable to another?",
  oral_explanation: "Can the learner reason verbally and respond to probing?",
  practical_demonstration: "Can the learner perform or enact the skill?",
  project_evaluation: "Can the learner integrate knowledge over time?",
  reflection_metacognition: "Can the learner judge what is known and uncertain?",
  peer_assessment: "Can the learner apply criteria to another's work?",
  portfolio_evidence: "Does evidence show development and durable competence?",
};

/** Average of defined subscores (0..1 each); missing parts lower coverage, not score. */
function avg(parts: (number | null | undefined)[]): number {
  const v = parts.filter((p): p is number => typeof p === "number");
  if (v.length === 0) return 0;
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100;
}

export interface Subscores { [k: string]: number | null | undefined }

/** Per-dimension rubric aggregation from subscore parts. */
export function scoreDimension(dim: AssessDim, parts: Subscores): { score: number; parts: Subscores; primaryGap: string | null } {
  const score = avg(Object.values(parts));
  let primaryGap: string | null = null;
  let worst = 1;
  for (const [k, v] of Object.entries(parts)) {
    if (typeof v === "number" && v < worst) { worst = v; primaryGap = k; }
  }
  void dim;
  return { score, parts, primaryGap };
}

/** Project weights (course-configurable defaults, always visible). */
export const PROJECT_WEIGHTS: Record<string, number> = {
  process: 0.25, product: 0.25, reasoning: 0.2, evidence: 0.15, iteration: 0.1, reflection: 0.05,
};

export function scoreProject(parts: Subscores, weights: Record<string, number> = PROJECT_WEIGHTS): number {
  let s = 0, w = 0;
  for (const [k, v] of Object.entries(parts)) {
    if (typeof v !== "number") continue;
    const wt = weights[k] ?? 0;
    s += v * wt; w += wt;
  }
  return w > 0 ? Math.round((s / w) * 100) / 100 : 0;
}

/** Calibration error |predicted − observed|, lower is better. */
export function calibrationError(predicted: number, observed: number): number {
  return Math.round(Math.abs(predicted - observed) * 100) / 100;
}

export interface DimEvidence {
  score: number; independent: boolean; condition: string;
  supportLevel: "independent" | "cued" | "scaffolded" | "demonstrated";
  transferLevel?: number | null; at: number;
}

export interface DimAggregate {
  score: number | null; tasks: number; successes: number;
  quality: number; coverage: number; confidence: number;
  limitations: string[];
}

/**
 * Aggregate dimension evidence. A score from 10 varied tasks ≠ one task:
 * coverage + limitations expose the difference. Correct-through-irrelevant-
 * method evidence must arrive pre-discounted by the scorer (see recordEvidence
 * reasonableness flag).
 */
export function aggregateDimension(evidence: DimEvidence[]): DimAggregate {
  if (evidence.length === 0) {
    return { score: null, tasks: 0, successes: 0, quality: 0, coverage: 0, confidence: 0, limitations: ["no evidence sampled"] };
  }
  const independent = evidence.filter((e) => e.supportLevel === "independent");
  const weighted = evidence.reduce((s, e) => s + e.score * (e.independent ? 1 : 0.6), 0);
  const weights = evidence.reduce((s, e) => s + (e.independent ? 1 : 0.6), 0);
  const score = Math.round((weighted / weights) * 100) / 100;
  const successes = evidence.filter((e) => e.score >= 0.6).length;
  const coverage = Math.min(1, evidence.length / 4);
  const quality = Math.min(1, independent.length / 2) * 0.6 + coverage * 0.4;
  const confidence = Math.round(Math.min(0.95, 0.3 + evidence.length * 0.08 + (independent.length > 0 ? 0.15 : 0)) * 100) / 100;
  const limitations: string[] = [];
  if (evidence.length < 2) limitations.push(`only ${evidence.length} task(s) sampled`);
  if (independent.length === 0) limitations.push("no independent (unscaffolded) evidence");
  const conditions = new Set(evidence.map((e) => e.condition).filter(Boolean));
  if (conditions.size === 1 && evidence.length > 1) limitations.push(`single condition only (${[...conditions][0]})`);
  return {
    score, tasks: evidence.length, successes,
    quality: Math.round(quality * 100) / 100, coverage: Math.round(coverage * 100) / 100,
    confidence, limitations,
  };
}

/** Condition-split averages (labeled, never silently compared). */
export function conditionSplit(evidence: DimEvidence[]): Record<string, { n: number; avg: number }> {
  const groups = new Map<string, number[]>();
  for (const e of evidence) {
    const k = e.condition || "unspecified";
    const arr = groups.get(k) ?? [];
    arr.push(e.score);
    groups.set(k, arr);
  }
  const out: Record<string, { n: number; avg: number }> = {};
  for (const [k, v] of groups) {
    out[k] = { n: v.length, avg: Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 };
  }
  return out;
}

export type ConditionLabel = "open_book" | "closed_book" | "limited_resource" | "tool_assisted" | "collaborative" | "oral" | "practical" | "unspecified";

/** Assessment decision rules → intervention kinds. */
export function decisionRule(profile: Partial<Record<AssessDim, number | null>>): { rule: string; action: string } | null {
  const g = (d: AssessDim) => profile[d] ?? null;
  if (g("retrieval") !== null && g("retrieval")! < 0.5) {
    return { rule: "retrieval_low", action: "retrieval practice or direct prerequisite instruction" };
  }
  if (g("application") !== null && g("application")! < 0.5 && (g("retrieval") ?? 0) >= 0.6) {
    return { rule: "application_gap", action: "worked examples and guided application" };
  }
  if ((g("application") ?? 0) >= 0.6 && g("novel_transfer") !== null && g("novel_transfer")! < 0.5) {
    return { rule: "transfer_gap", action: "contrasting cases and varied contexts" };
  }
  if ((g("novel_transfer") ?? 0) >= 0.6 && g("error_diagnosis") !== null && g("error_diagnosis")! < 0.5) {
    return { rule: "diagnosis_gap", action: "debugging and faulty-solution analysis" };
  }
  if (g("reflection_metacognition") !== null && g("reflection_metacognition")! < 0.5) {
    return { rule: "metacognition_gap", action: "confidence prediction and reflection" };
  }
  if (g("oral_explanation") !== null && g("oral_explanation")! < 0.5
    && (g("practical_demonstration") ?? 0) >= 0.6) {
    return { rule: "oral_written_split", action: "investigate language, mode, or accessibility before diagnosing concepts" };
  }
  if (ASSESS_DIMS.every((d) => g(d) === null)) {
    return { rule: "sparse_evidence", action: "report insufficient evidence — assign no mastery label" };
  }
  return null;
}

/** Balanced assessment sequence (not a rigid hierarchy). */
export const ASSESS_SEQUENCE: AssessDim[] = [
  "retrieval", "application", "error_diagnosis", "concept_mapping",
  "novel_transfer", "teach_back", "oral_explanation", "practical_demonstration",
  "project_evaluation", "reflection_metacognition", "portfolio_evidence", "peer_assessment",
];

/** Blueprint validation: educator weights must cover dimensions and sum ≈ 1. */
export function validateBlueprint(weights: Record<string, number>, minimums: Record<string, number>): { valid: boolean; problems: string[] } {
  const problems: string[] = [];
  const keys = Object.keys(weights).filter((k) => (ASSESS_DIMS as readonly string[]).includes(k));
  if (keys.length === 0) problems.push("no recognized dimensions weighted");
  const sum = keys.reduce((s, k) => s + (weights[k] ?? 0), 0);
  if (Math.abs(sum - 1) > 0.02) problems.push(`weights sum to ${Math.round(sum * 100) / 100}, expected 1.00`);
  for (const [k, v] of Object.entries(minimums)) {
    if (!(ASSESS_DIMS as readonly string[]).includes(k)) problems.push(`unknown dimension in minimums: ${k}`);
    if (typeof v !== "number" || v < 0) problems.push(`invalid minimum for ${k}`);
  }
  return { valid: problems.length === 0, problems };
}

/** Transparent composite grade ONLY through course-approved weights; components preserved. */
export function compositeGrade(
  profile: Partial<Record<AssessDim, number | null>>,
  weights: Record<string, number>,
): { grade: number | null; components: { dim: string; score: number | null; weight: number }[] } {
  const components = Object.entries(weights)
    .filter(([k]) => (ASSESS_DIMS as readonly string[]).includes(k))
    .map(([dim, weight]) => ({ dim, score: profile[dim as AssessDim] ?? null, weight }));
  const usable = components.filter((c) => c.score !== null);
  if (usable.length === 0) return { grade: null, components };
  const wSum = usable.reduce((s, c) => s + c.weight, 0) || 1;
  const grade = Math.round((usable.reduce((s, c) => s + (c.score ?? 0) * c.weight, 0) / wSum) * 100) / 100;
  return { grade, components };
}
