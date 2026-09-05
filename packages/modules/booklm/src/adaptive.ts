/**
 * Adaptive control mathematics — pure, dependency-free, deterministic.
 * Difficulty control, error taxonomy, remediation policy, interleaving,
 * session planning, gain estimation, diagnostic placement.
 */

export const DIFFICULTY_DIMS = [
  "complexity", "steps", "scaffolding", "ambiguity", "novelty",
  "distractors", "timePressure", "modalitySwitch", "transferDistance",
  "outputFormat", "caseComplexity", "errorTolerance", "independence",
] as const;
export type DifficultyDim = (typeof DIFFICULTY_DIMS)[number];

export const LADDER: Record<number, string> = {
  0: "Recognition", 1: "Recall with cues", 2: "Direct application",
  3: "Multi-step application", 4: "Error diagnosis", 5: "Novel case",
  6: "Ambiguous problem", 7: "Independent creation",
  8: "Evaluation and defense", 9: "Teaching or mentoring",
};

export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Difficulty controller: d(t+1) = d(t) + η(p−p*) − μh + νx.
 * Never raises on speed alone — speed is not an input.
 */
export function nextDifficulty(
  d: number, success: number, target: number,
  hintDependence: number, transfer: number,
  eta = 0.4, mu = 0.3, nu = 0.2,
): number {
  const r = (n: number) => Math.round(n * 100) / 100;
  return r(clamp(d + eta * (success - target) - mu * hintDependence + nu * transfer, 0, 9));
}

/** Which single dimension to move, given the bottleneck signal. */
export function dimensionToMove(signal: {
  slowResponse: boolean; highHintUse: boolean; novelFailure: boolean;
  ambiguityFailure: boolean; timePressureFailure: boolean; modalityFailure: boolean;
}): DifficultyDim {
  if (signal.novelFailure) return "transferDistance";
  if (signal.ambiguityFailure) return "ambiguity";
  if (signal.timePressureFailure) return "timePressure";
  if (signal.modalityFailure) return "modalitySwitch";
  if (signal.highHintUse) return "scaffolding";
  if (signal.slowResponse) return "timePressure";
  return "complexity";
}

// ---------------------------------------------------------------------------
// Error taxonomy (16) + remediation policy.
// ---------------------------------------------------------------------------

export type ErrorType =
  | "recall" | "vocabulary" | "prerequisite" | "omission" | "sequence"
  | "calculation" | "representation" | "overgeneralization" | "undergeneralization"
  | "causal" | "boundary" | "strategy" | "transfer" | "calibration"
  | "language" | "ambiguous_prompt";

const ERR_PATTERNS: { type: ErrorType; re: RegExp }[] = [
  { type: "vocabulary", re: /\b(what does(\s+\w+){0,4}\s+mean|means\?|defin\w+|term|word|called|refers to|confus\w*(\s+\w+){0,3}\s+(terms?|words?|names?|definitions?|meanings?))\b/i },
  { type: "prerequisite", re: /\b(prerequisite|missing (step|basic|foundation)|need.*first|haven't learned|never (learned|studied))\b/i },
  { type: "sequence", re: /\b(order|sequence|steps? out of|wrong order|before|after)\b/i },
  { type: "calculation", re: /\b(arithmet\w*|comput\w*|math error|sign error|off by|miscalc)\b/i },
  { type: "representation", re: /\b(graph|diagram|figure|table|misread|axis|label|chart)\b/i },
  { type: "overgeneralization", re: /\b(always|all cases|every|in general|overgeneral)\b/i },
  { type: "causal", re: /\b(because|causes?|caused|due to|mechanism|why does)\b/i },
  { type: "boundary", re: /\b(except|edge case|boundary|condition|only when|unless)\b/i },
  { type: "strategy", re: /\b(which method|strategy|approach|how to (start|solve)|method)\b/i },
  { type: "transfer", re: /\b(new (case|context|problem|situation)|unfamiliar|different domain|apply.*elsewhere)\b/i },
  { type: "calibration", re: /\b(confident|sure|thought i knew|overconfident|guessed)\b/i },
  { type: "language", re: /\b(english|translation|wording|unclear (words?|terms?)|esl)\b/i },
  { type: "ambiguous_prompt", re: /\b(ambiguous|unclear|confusing question|what (do you mean|is being asked))\b/i },
  { type: "omission", re: /\b(skipped|missed (a )?step|forgot (to|a)|left out|omitted)\b/i },
];

export function classifyError(answer: string, reasoning: string, correct: boolean): ErrorType {
  if (correct) return "recall";
  const text = `${answer} ${reasoning}`;
  for (const { type, re } of ERR_PATTERNS) if (re.test(text)) return type;
  return "recall";
}

export const REMEDIATION: Record<ErrorType, { first: string; kind: string }> = {
  recall: { first: "Retrieval cue and compact review", kind: "retrieval" },
  vocabulary: { first: "Contrastive definition and examples", kind: "contrast" },
  prerequisite: { first: "Prerequisite repair path", kind: "repair" },
  omission: { first: "Step trace and targeted practice", kind: "trace" },
  sequence: { first: "Step trace and targeted practice", kind: "trace" },
  calculation: { first: "Worked calculation with check step", kind: "worked" },
  representation: { first: "Re-read the representation with labels", kind: "reread" },
  overgeneralization: { first: "Counterexample and boundary test", kind: "counterexample" },
  undergeneralization: { first: "Second example in a new context", kind: "vary" },
  causal: { first: "Mechanism diagram and prediction task", kind: "mechanism" },
  boundary: { first: "Boundary-condition probe", kind: "probe" },
  strategy: { first: "Compare multiple methods side by side", kind: "compare" },
  transfer: { first: "Surface-feature variation and novel case", kind: "novel" },
  calibration: { first: "Prediction-before-answer with calibration feedback", kind: "calibrate" },
  language: { first: "Rephrase with terminology glossary", kind: "rephrase" },
  ambiguous_prompt: { first: "Clarify the prompt, then retry", kind: "clarify" },
};

// ---------------------------------------------------------------------------
// Modality sequencing: concept→diagram, procedure→worked example, …
// ---------------------------------------------------------------------------

export const MODALITY_SEQUENCE: Record<string, string> = {
  concept: "annotated diagram", procedure: "worked example", application: "interactive simulation",
  misconception: "counterexample", transfer: "unfamiliar case", metacognition: "confidence reflection",
};

export function sequenceModality(need: string, tried: string[]): string {
  const first = MODALITY_SEQUENCE[need] ?? "worked example";
  if (!tried.includes(first)) return first;
  const fallbacks = ["socratic dialogue", "case study", "concept map", "flashcards"];
  return fallbacks.find((m) => !tried.includes(m)) ?? "worked example";
}

// ---------------------------------------------------------------------------
// Interleaving: purposeful mixing with controls.
// ---------------------------------------------------------------------------

export interface InterleaveSpec {
  sets: { conceptKey: string; label: string; count: number; kind: "target" | "confusable" | "old" | "novel" }[];
  comparisonItems: number;
  reason: string;
}

export function planInterleave(args: {
  target: { conceptKey: string; label: string }[];
  confusables: { conceptKey: string; label: string }[];
  oldMaterial: { conceptKey: string; label: string }[];
  novel: { conceptKey: string; label: string }[];
  level: "low" | "moderate" | "high";
}): InterleaveSpec {
  const take = args.level === "low" ? 1 : 2;
  const sets: InterleaveSpec["sets"] = [
    ...args.target.slice(0, 2).map((t) => ({ ...t, count: 2 as const, kind: "target" as const })),
    ...args.confusables.slice(0, take).map((t) => ({ ...t, count: 1 as const, kind: "confusable" as const })),
    ...args.oldMaterial.slice(0, args.level === "high" ? 2 : 1).map((t) => ({ ...t, count: 1 as const, kind: "old" as const })),
    ...args.novel.slice(0, 1).map((t) => ({ ...t, count: 1 as const, kind: "novel" as const })),
  ];
  return {
    sets,
    comparisonItems: args.confusables.length > 0 ? 1 : 0,
    reason: args.level === "low"
      ? "low interleaving for initial acquisition"
      : args.level === "moderate"
        ? "moderate interleaving for practice with strategy selection"
        : "high interleaving for exam preparation and transfer",
  };
}

export interface RemediationStage {
  stage: string;
  action: string;
  retest: string | null;
}

/**
 * Misconception-first remediation path: test the suspected cause, intervene
 * on the mechanism, re-test similar then changed-surface, schedule delayed
 * retrieval, escalate on persistent low confidence. Repeating the same
 * material is never a stage.
 */
export function remediationPath(errorType: ErrorType, conceptLabel: string): RemediationStage[] {
  const rem = REMEDIATION[errorType];
  return [
    { stage: "test_cause", action: `Probe: one item isolating ${conceptLabel} ${errorType.replace(/_/g, " ")}`, retest: null },
    { stage: "intervene", action: `${rem.first} (${rem.kind})`, retest: null },
    { stage: "retest_similar", action: "Structurally similar item, same surface", retest: "similar" },
    { stage: "retest_changed", action: "Changed surface context, same structure", retest: "changed_surface" },
    { stage: "delayed_retrieval", action: "Spaced retrieval after the interval", retest: "delayed" },
    { stage: "escalate", action: "Human escalation + diagnostic reassessment if confidence stays low", retest: null },
  ];
}

export interface RepairOption {
  mode: "minimal" | "foundational" | "just_in_time" | "parallel";
  blockers: string[];
  minutes: number;
  tradeoff: string;
}

/**
 * Costed prerequisite repair options so the learner chooses speed vs depth.
 * Minimal fixes only the blocker; foundational rebuilds the cluster;
 * just-in-time teaches inside the target lesson; parallel continues the
 * target while repairing a secondary gap.
 */
export function repairPathOptions(blockers: { label: string; mastery: number }[], minutesPerBlock = 10): RepairOption[] {
  const labels = blockers.map((b) => b.label);
  const cost = Math.max(1, blockers.length) * minutesPerBlock;
  return [
    {
      mode: "minimal", blockers: labels.slice(0, 1), minutes: minutesPerBlock,
      tradeoff: "fastest — fixes only the blocking prerequisite",
    },
    {
      mode: "foundational", blockers: labels, minutes: cost + 10,
      tradeoff: "slowest — rebuilds the broader dependency cluster",
    },
    {
      mode: "just_in_time", blockers: labels.slice(0, 1), minutes: Math.max(4, Math.round(minutesPerBlock / 2)),
      tradeoff: "taught inside the target lesson — least disruption, shallowest repair",
    },
    {
      mode: "parallel", blockers: labels.slice(1), minutes: cost,
      tradeoff: "continue the target lesson while repairing a secondary gap",
    },
  ];
}

// ---------------------------------------------------------------------------
// Gain estimation: pre/post delta with uncertainty from evidence count.
// ---------------------------------------------------------------------------

export function estimateGain(before: number, after: number, evidenceCount: number): { gain: number; confidence: number } {
  const gain = Math.round((after - before) * 100) / 100;
  const confidence = Math.round(clamp(0.3 + evidenceCount * 0.1, 0, 0.9) * 100) / 100;
  return { gain, confidence };
}

// ---------------------------------------------------------------------------
// Diagnostic placement: 3-5 items + confidence + novel + teach-back.
// ---------------------------------------------------------------------------

export interface DiagnosticItem { kind: "recall" | "application" | "novel" | "teachback" | "confidence"; prompt: string }

export function buildDiagnostic(conceptLabel: string): DiagnosticItem[] {
  return [
    { kind: "recall", prompt: `Define ${conceptLabel} in one sentence.` },
    { kind: "application", prompt: `Solve a standard ${conceptLabel} problem.` },
    { kind: "novel", prompt: `Apply ${conceptLabel} in a context you have not seen before.` },
    { kind: "teachback", prompt: `Explain ${conceptLabel} as if teaching a peer. What breaks if a key assumption fails?` },
    { kind: "confidence", prompt: `How confident are you with ${conceptLabel}? (0-100, no penalty either way)` },
  ];
}

/** Elaboration scoring rubric (deterministic): correctness signals in text. */
export function scoreElaboration(text: string, keyTerms: string[]): {
  completeness: number; causalStructure: number; termUse: number; total: number;
} {
  const low = text.toLowerCase();
  const words = low.split(/[^a-z0-9]+/).filter(Boolean);
  const completeness = clamp(words.length / 80, 0, 1);
  const causal = (low.match(/\b(because|therefore|since|causes?|leads to|results in|mechanism)\b/g) ?? []).length;
  const causalStructure = clamp(causal / 3, 0, 1);
  const hits = keyTerms.filter((t) => low.includes(t.toLowerCase())).length;
  const termUse = keyTerms.length ? hits / keyTerms.length : 0;
  const total = Math.round(((completeness + causalStructure + termUse) / 3) * 100) / 100;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { completeness: r(completeness), causalStructure: r(causalStructure), termUse: r(termUse), total };
}

/** Session plan assembler: warm-up → lesson → practice → transfer → reflection. */
export interface SessionBlock { name: string; minutes: number; detail: string; why: string }

export function assembleSession(totalMinutes: number, args: {
  warmup: string[]; lesson: string; lessonWhy: string;
  practice: string; transfer: string; reflection: string;
}): SessionBlock[] {
  const m = Math.max(10, totalMinutes);
  const split = (frac: number) => Math.max(2, Math.round(m * frac));
  return [
    { name: "Retrieval warm-up", minutes: split(0.16), detail: `Review: ${args.warmup.join(", ") || "due items"}`, why: "retrieval before re-explanation" },
    { name: "Target lesson", minutes: split(0.28), detail: args.lesson, why: args.lessonWhy },
    { name: "Guided practice", minutes: split(0.24), detail: args.practice, why: "one worked example, then one independent" },
    { name: "Transfer task", minutes: split(0.2), detail: args.transfer, why: "novel context converts procedure into portable skill" },
    { name: "Reflection", minutes: Math.max(2, m - split(0.16) - split(0.28) - split(0.24) - split(0.2)), detail: args.reflection, why: "self-explanation consolidates" },
  ];
}
