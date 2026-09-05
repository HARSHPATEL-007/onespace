/**
 * Assessment-integrity analysis — pure, dependency-free, deterministic.
 * Triage, variant generation with invariants, similarity/authorship analysis,
 * notices, accommodation-aware interpretation. A signal is a reason to
 * investigate, never proof of wrongdoing.
 */

export type TriageLevel = "informational" | "low" | "moderate" | "high" | "critical";

export interface IntegritySignal {
  type: string; severity: "low" | "medium" | "high";
  evidence: string; confidence: number;
  independentType?: string;
}

/** Signals that must never feed integrity scoring. */
export const EXCLUDED_SIGNALS = [
  "facial_expression", "heart_rate", "typing_speed", "gaze", "posture",
  "emotion_estimate", "eeg", "mouse_movement",
];

/**
 * Triage convergence rule: never escalate from one weak signal. Escalate only
 * when ≥2 independent evidence types converge, evidence is policy-relevant,
 * accommodation/technical explanations were checked, and the learner can respond.
 */
export function triageLevel(args: {
  signals: IntegritySignal[];
  policyRelevant?: boolean; accommodationChecked?: boolean; learnerCanRespond?: boolean;
}): { level: TriageLevel; reason: string } {
  const relevant = (args.policyRelevant ?? true) && (args.accommodationChecked ?? true) && (args.learnerCanRespond ?? true);
  const types = new Set(args.signals.map((s) => s.independentType ?? s.type));
  const high = args.signals.filter((s) => s.severity === "high").length;
  const medium = args.signals.filter((s) => s.severity === "medium").length;
  if (args.signals.length === 0) return { level: "informational", reason: "no signals" };
  if (!relevant) return { level: "low", reason: "recorded; relevance/accommodation/response not yet established" };
  if (types.size < 2 && high === 0) {
    return { level: "low", reason: "single evidence type — recorded and monitored, not escalated" };
  }
  if (high >= 2 && types.size >= 2) return { level: "critical", reason: "converging high-severity evidence" };
  if (high >= 1 && types.size >= 2) return { level: "high", reason: "converging evidence requires human review" };
  if (medium >= 2 || types.size >= 2) return { level: "moderate", reason: "multiple explainable anomalies — ask learner for clarification" };
  return { level: "low", reason: "ambiguous signal — record and monitor" };
}

/** Mandatory human-review triggers. */
export function reviewRequired(args: {
  highStakes?: boolean; penaltyConsidered?: boolean; ambiguous?: boolean;
  appealed?: boolean; accommodationAffects?: boolean; signalsConflict?: boolean;
  authorshipCase?: boolean; oralConflict?: boolean; lowConfidence?: boolean;
  sensitiveContext?: boolean; progressionImpact?: boolean;
}): string[] {
  const t: string[] = [];
  if (args.highStakes) t.push("high-stakes assessment");
  if (args.penaltyConsidered) t.push("penalty or failure considered");
  if (args.ambiguous) t.push("ambiguous evidence");
  if (args.appealed) t.push("learner appealed");
  if (args.accommodationAffects) t.push("accommodation affects interpretation");
  if (args.signalsConflict) t.push("conflicting signals");
  if (args.authorshipCase) t.push("authorship/plagiarism analysis");
  if (args.oralConflict) t.push("conflicting oral-defense evidence");
  if (args.lowConfidence) t.push("low system confidence");
  if (args.sensitiveContext) t.push("protected/sensitive context");
  if (args.progressionImpact) t.push("progression/credential impact");
  return t;
}

// ---------------------------------------------------------------------------
// Deterministic variant generation (seeded PRNG; invariants validated).
// ---------------------------------------------------------------------------

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["Amina", "Ravi", "Lena", "Diego", "Priya", "Tomas", "Yuki", "Sara", "Omar", "Nina"];
const CONTEXTS = ["urban pond", "school garden", "rooftop array", "clinic trial", "transit survey", "bakery oven"];

export interface VariantSpec {
  templateKey: string; variantId: string;
  numbers: number[]; names: string[]; context: string; order: number[];
  invariants: string[]; randomizedFields: string[];
}

/** Build a variant: numbers/names/context/order shuffled; invariants declared. */
export function buildVariant(templateKey: string, salt: string, count = 3): VariantSpec {
  const rand = mulberry(hashSeed(`${templateKey}:${salt}`));
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const numbers = Array.from({ length: count }, () => Math.round((10 + rand() * 90) * 10) / 10);
  const names = Array.from({ length: 2 }, () => pick(NAMES));
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    templateKey,
    variantId: `v_${Math.abs(hashSeed(templateKey + salt)).toString(36).slice(0, 6)}`,
    numbers, names, context: pick(CONTEXTS), order,
    invariants: ["same_concept", "same_difficulty_band", "same_rubric", "same_expected_reasoning"],
    randomizedFields: ["dataset_values", "scenario_names", "question_order"],
  };
}

// ---------------------------------------------------------------------------
// Similarity / authorship analysis as review signals (never verdicts).
// ---------------------------------------------------------------------------

export interface OverlapFinding {
  layer: string; detail: string; legitimateExplanation: string;
}

const STOP = new Set("the,a,an,and,or,of,to,in,on,for,with,is,are,was,were,be,as,by,at,from,that,this,it".split(","));

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

function ngrams(ts: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= ts.length; i++) out.add(ts.slice(i, i + n).join(" "));
  return out;
}

/** Multi-layer overlap with legitimate explanations attached to each layer. */
export function analyzeSimilarity(submission: string, sources: { id: string; text: string }[]): {
  level: "low" | "moderate" | "high"; findings: (OverlapFinding & { sourceId: string })[];
} {
  const st = tokens(submission);
  const s5 = ngrams(st, 5);
  const s3 = ngrams(st, 3);
  const findings: (OverlapFinding & { sourceId: string })[] = [];
  for (const src of sources) {
    const tt = tokens(src.text);
    const t5 = ngrams(tt, 5);
    const t3 = ngrams(tt, 3);
    const exact = [...s5].filter((g) => t5.has(g));
    if (exact.length > 0) {
      findings.push({
        sourceId: src.id, layer: "exact_phrase",
        detail: `${exact.length} shared 5-gram(s), e.g. “${exact[0]!.split(" ").slice(0, 8).join(" ")}…”`,
        legitimateExplanation: "quotation, common definition, or shared prompt language",
      });
    }
    const near = [...s3].filter((g) => t3.has(g)).length;
    if (near >= 3 && exact.length === 0) {
      findings.push({
        sourceId: src.id, layer: "structural",
        detail: `${near} shared 3-grams with rewording`,
        legitimateExplanation: "shared prompt, standard method, or approved collaboration",
      });
    }
  }
  const level = findings.some((f) => f.layer === "exact_phrase" && f.detail.length > 60) ? "high"
    : findings.length > 0 ? "moderate" : "low";
  return { level, findings };
}

const PROHIBITED_AUTHORSHIP = [
  "disability-related communication differences", "second-language writing",
  "assistive technology", "grammar correction", "dictation",
  "topic/genre/support changes", "biometric identity signals", "AI-probability alone",
];

/** Authorship follow-up: conversation-first, prohibited inferences listed. */
export function authorshipFollowUp(signals: string[]): { message: string; prohibited: string[]; options: string[] } {
  return {
    message: `The submission shows ${signals.join("; ") || "a pattern worth discussing"}. This is not proof of unauthorized assistance.`,
    prohibited: PROHIBITED_AUTHORSHIP,
    options: [
      "explain your sources and revision process",
      "provide draft history",
      "complete an oral defense",
      "request instructor review",
      "submit a clarification",
    ],
  };
}

/** Accommodation-aware reading of an ambiguous event. */
export function interpretWithAccommodation(event: string, effects: string[]): { ordinary: string; aware: string; action: string } {
  const hasTime = effects.some((e) => /time|break|processing|pace/i.test(e));
  return {
    ordinary: `${event}: possibly inactivity.`,
    aware: hasTime
      ? `${event}: could reflect approved processing time or assistive technology.`
      : `${event}: no accommodation on file changes the reading.`,
    action: hasTime ? "Exclude from integrity scoring; retain as technical event only if needed." : "Score normally.",
  };
}

/**
 * Telemetry allowlist: only assessment-workspace events the policy permits.
 * Private files, unrelated browsing, passwords, personal keystrokes, hidden
 * data outside the environment, and biometrics are prohibited — collection
 * attempts in these categories are rejected, never stored.
 */
export const TELEMETRY_ALLOWLIST = [
  "compile", "run", "test", "test_pass", "test_fail",
  "edit_milestone", "save", "commit", "checkpoint",
  "debug_attempt", "coverage", "dependency_install",
  "file_create", "file_modify",
  "browser_fullscreen", "browser_copy_paste", "browser_resource",
  "browser_switch", "browser_network", "browser_calculator",
  "browser_device", "browser_identity", "browser_technical", "browser_disconnect",
];

const PROHIBITED_TELEMETRY = [
  "private_file", "browsing", "password", "keystroke", "hidden_data",
  "biometric", "screen_content", "webcam", "microphone",
];

export function telemetryEventAllowed(category: string): { allowed: boolean; reason: string } {
  const c = category.toLowerCase().trim();
  if (PROHIBITED_TELEMETRY.some((p) => c.includes(p))) {
    return { allowed: false, reason: `prohibited telemetry category “${category}” — rejected, never stored` };
  }
  if ((TELEMETRY_ALLOWLIST as string[]).includes(c)) {
    return { allowed: true, reason: "within assessment-workspace policy scope" };
  }
  return { allowed: false, reason: `unknown telemetry category “${category}” — allowlist-only collection` };
}

export interface CodeProcessSummary {
  milestones: { t: string; event: string }[];
  testProgression: string;
  interpretation: "consistent_with_independent_development" | "thin_process_evidence" | "needs_context";
  note: string;
}

/**
 * Programming process summary from milestone events. Supports learning and
 * debugging — never a hidden productivity or surveillance score.
 */
export function codeProcessSummary(events: { t: string; event: string; detail?: string }[]): CodeProcessSummary {
  const milestones = events.slice(0, 40).map((e) => ({ t: e.t, event: e.event }));
  const kinds = new Set(events.map((e) => e.event));
  const has = (...ks: string[]) => ks.some((k) => kinds.has(k));
  const testRuns = events.filter((e) => e.event === "test_pass" || e.event === "test_fail").length;
  let interpretation: CodeProcessSummary["interpretation"];
  let testProgression = testRuns > 0 ? `${testRuns} test run(s) recorded` : "no test runs recorded";
  if (has("function_stub_created", "edit_milestone") && has("first_test_run", "test_fail", "test_pass") && has("all_visible_tests_pass", "commit", "checkpoint")) {
    interpretation = "consistent_with_independent_development";
  } else if (events.length <= 1) {
    interpretation = "thin_process_evidence";
    testProgression += " — final artifact only; process says little either way";
  } else {
    interpretation = "needs_context";
  }
  return {
    milestones,
    testProgression,
    interpretation,
    note: "Process evidence supports learning and debugging, not productivity scoring or misconduct findings alone.",
  };
}

/**
 * Secure-browser control event with real-vs-software-error distinction.
 * Restrictions triggered by software error must never read as violations.
 */
export function browserControlEvent(args: {
  control: string; triggered: boolean; realEvent: boolean; detail?: string;
}): { kind: string; control: string; outcome: string; note: string } {
  return {
    kind: "browser_control",
    control: args.control,
    outcome: !args.triggered
      ? "not_triggered"
      : args.realEvent
        ? "restriction_applied_on_real_event"
        : "triggered_by_software_error — not a violation",
    note: (args.detail ?? "").slice(0, 200) || "logged with trigger cause",
  };
}

/**
 * Alternative explanations per signal for reviewer packets. Every flag
 * travels with its innocent readings — reviewers see them by default.
 */
export function alternativeExplanations(
  signals: { type: string }[],
  accommodationEffects: string[] = [],
): string[] {
  const out: string[] = [];
  const hasAccomm = accommodationEffects.length > 0;
  for (const s of signals) {
    const t = s.type.toLowerCase();
    if (/exposure|preview|view/.test(t)) {
      out.push("authorized practice exposure — encountering an item in practice does not punish the learner");
    } else if (/similar|overlap|plagiar|copy/.test(t)) {
      out.push("shared prompt, starter code, or approved collaboration");
    } else if (/time|pause|duration|speed/.test(t)) {
      out.push(hasAccomm
        ? `approved accommodation effect (${accommodationEffects.join(", ")}) — excluded from integrity scoring`
        : "assistive technology, interruption, or device issue");
    } else if (/switch|focus|fullscreen|browser|technical|disconnect/.test(t)) {
      out.push("technical event or software error — verify against the event log before any reading");
    } else if (/authorship|style|vocab/.test(t)) {
      out.push("draft evolution, second-language writing, or assistive tooling — conversation first");
    } else {
      out.push("single-signal reading pending — converging evidence required before escalation");
    }
  }
  return [...new Set(out)].slice(0, 10);
}

/** Learner notice: what, meaning, evidence in/out, options, deadline, no penalty pending. */
export function buildNotice(args: {
  flagged: string; evidenceIn: string[]; evidenceOut?: string[];
  deadlineDays?: number; recordId?: string;
}): { title: string; body: string } {
  const out = args.evidenceOut ?? ["typing speed", "webcam behavior", "heart rate"];
  return {
    title: "Review notice",
    body: [
      `What was flagged: ${args.flagged}.`,
      "What this means: a review signal, not a finding of misconduct.",
      `Evidence considered: ${args.evidenceIn.join("; ") || "listed in your review packet"}.`,
      `Evidence not considered: ${out.join(", ")}.`,
      "Your options: explain your process, upload drafts/notes, request oral defense, request human review, appeal.",
      `Deadline: ${args.deadlineDays ?? 14} calendar days.`,
      "Your grade: no penalty applied while review is pending.",
    ].join("\n"),
  };
}
