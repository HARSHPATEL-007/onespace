/**
 * Teaching-mode contracts — pure, dependency-free, deterministic.
 * Modes are pedagogical policies (objective, assistance, assessment, memory,
 * exits, escalation), never personality presets.
 */

export type TeachingMode =
  | "SOCRATIC" | "DIRECT" | "WORKED_EXAMPLE" | "PRACTICE" | "EXAM"
  | "DEBUGGING" | "DEBATE" | "RESEARCH_SUPERVISOR" | "FLASHCARD"
  | "ORAL_EXAM" | "PEER_REVIEW" | "ACCESSIBILITY";

export interface ModeContract {
  mode: TeachingMode;
  objective: string;
  assistance: string;
  interaction: string;
  assessmentAllowed: boolean;
  answerPolicy: string;
  memoryPolicy: string;
  exitConditions: string[];
  accessibility: string;
  supervisorIf: string[];
  banner: string;
}

export const MODE_CONTRACTS: Record<TeachingMode, ModeContract> = {
  SOCRATIC: {
    mode: "SOCRATIC", objective: "develop reasoning, diagnosis, metacognition, transfer",
    assistance: "low_to_medium", interaction: "one high-information question at a time with stated purpose",
    assessmentAllowed: true, answerPolicy: "no immediate solution; graduated hints L0-L5",
    memoryPolicy: "store target concept, reasoning evidence, misconception candidate",
    exitConditions: ["one independent application completed"],
    accessibility: "learner_selected",
    supervisorIf: ["persistent_confusion"],
    banner: "Mode: Socratic practice — I will ask questions and provide hints, but I will not give the solution immediately.",
  },
  DIRECT: {
    mode: "DIRECT", objective: "build initial understanding; repair prerequisites",
    assistance: "high", interaction: "objective → prereq check → explanation → definition → illustration → misconception → retrieval → transfer",
    assessmentAllowed: true, answerPolicy: "explain fully; follow with retrieval, teach-back, or application",
    memoryPolicy: "store topic covered and retrieval result — never mastery from exposure",
    exitConditions: ["retrieval check passed", "teach-back completed"],
    accessibility: "learner_selected",
    supervisorIf: ["high_stakes_content"],
    banner: "Mode: Direct instruction — clear systematic explanation, then I will check understanding with retrieval.",
  },
  WORKED_EXAMPLE: {
    mode: "WORKED_EXAMPLE", objective: "connect procedure to reasoning; model expert step selection",
    assistance: "high_then_fading", interaction: "identify → choose → execute → check → faded practice → independent transfer",
    assessmentAllowed: true, answerPolicy: "reveal_after_attempt; track support level",
    memoryPolicy: "store support level required and independent-transfer result",
    exitConditions: ["independent transfer task completed"],
    accessibility: "learner_selected",
    supervisorIf: ["persistent_confusion"],
    banner: "Mode: Worked example — I demonstrate step by step, then fade support until you solve independently.",
  },
  PRACTICE: {
    mode: "PRACTICE", objective: "independent fluency; retrieval and deliberate practice",
    assistance: "low", interaction: "one task at a time; feedback after commitment; no unsolicited mini-lectures",
    assessmentAllowed: true, answerPolicy: "feedback ladder: correctness → category → hint → explanation → solution",
    memoryPolicy: "store items, errors, mastery evidence — not conversation detail",
    exitConditions: ["error pattern report delivered", "review item scheduled"],
    accessibility: "learner_selected",
    supervisorIf: ["repeated_failure"],
    banner: "Mode: Practice-only — tasks and concise feedback, no teaching interruptions. Ask “why?” anytime.",
  },
  EXAM: {
    mode: "EXAM", objective: "simulate assessment conditions under instructor rules",
    assistance: "restricted", interaction: "policy locked → questions → recorded responses → no unauthorized tutoring → grading",
    assessmentAllowed: true, answerPolicy: "no answers, paths, rubric details, or coaching unless explicitly allowed",
    memoryPolicy: "official assessment record under institutional policy only",
    exitConditions: ["submission finalized"],
    accessibility: "authorized_accommodations",
    supervisorIf: ["integrity_flag", "technical_problem", "always_on_submission"],
    banner: "Mode: Exam — policy locked. I can clarify instructions and apply accommodations, but not coach or answer.",
  },
  DEBUGGING: {
    mode: "DEBUGGING", objective: "diagnose errors: observe → reproduce → localize → classify → test → fix → explain",
    assistance: "medium", interaction: "preserve attempt; ask expected outcome; one hypothesis at a time",
    assessmentAllowed: true, answerPolicy: "concise reasoning summaries; sandboxed execution only",
    memoryPolicy: "store error category and resolved/unresolved state",
    exitConditions: ["root cause explained", "regression check passed"],
    accessibility: "learner_selected",
    supervisorIf: ["unsafe_procedure"],
    banner: "Mode: Debugging — we localize and test one hypothesis at a time. Your attempt is preserved.",
  },
  DEBATE: {
    mode: "DEBATE", objective: "compare positions with evidence; no false balance",
    assistance: "medium", interaction: "question → factual/normative split → strongest positions → counterarguments → learner conclusion",
    assessmentAllowed: false, answerPolicy: "mark asymmetry explicitly when evidence is one-sided",
    memoryPolicy: "store positions examined and volunteered conclusion",
    exitConditions: ["learner forms or revises a conclusion"],
    accessibility: "learner_selected",
    supervisorIf: ["disinformation_risk"],
    banner: "Mode: Debate — strongest versions of each position with evidence. I will mark where evidence is one-sided.",
  },
  RESEARCH_SUPERVISOR: {
    mode: "RESEARCH_SUPERVISOR", objective: "support inquiry without taking ownership",
    assistance: "medium", interaction: "question → scope → sources → hypothesis → method → evidence → counterevidence → claim → audit → revision",
    assessmentAllowed: false, answerPolicy: "distinguish source claims, learner hypotheses, tutor suggestions, open questions",
    memoryPolicy: "store research artifacts and approved milestones only",
    exitConditions: ["citation audit passed", "revision plan accepted"],
    accessibility: "learner_selected",
    supervisorIf: ["authorship_request", "high_stakes_content"],
    banner: "Mode: Research supervision — I challenge scope, method, and evidence. Your research stays yours.",
  },
  FLASHCARD: {
    mode: "FLASHCARD", objective: "strengthen retrieval; schedule review; calibrate confidence",
    assistance: "minimal", interaction: "prompt recall → capture correctness, latency, confidence, hints → schedule",
    assessmentAllowed: true, answerPolicy: "never reveal restricted assessment answers",
    memoryPolicy: "store review history and scheduling data only",
    exitConditions: ["due queue cleared"],
    accessibility: "learner_selected",
    supervisorIf: [],
    banner: "Mode: Flashcards — short recall prompts. Slow answers are never treated as low ability.",
  },
  ORAL_EXAM: {
    mode: "ORAL_EXAM", objective: "evaluate spoken reasoning with follow-ups",
    assistance: "restricted", interaction: "recall → explain → apply → compare → defend → counterexample → reflect",
    assessmentAllowed: true, answerPolicy: "rubric-bound; typed/signed/AAC responses permitted when authorized",
    memoryPolicy: "authorized transcript, rubric evidence, review status only — recording consent required",
    exitConditions: ["rubric complete", "human review where required"],
    accessibility: "authorized_accommodations",
    supervisorIf: ["high_stakes_grading", "consent_missing"],
    banner: "Mode: Oral examination — follow-up questions under a rubric. Fluency is not scored as mastery.",
  },
  PEER_REVIEW: {
    mode: "PEER_REVIEW", objective: "evaluate work against criteria; suggest revisions",
    assistance: "medium", interaction: "confirm rubric → neutral summary → strengths → top issue → why → revision path → re-review",
    assessmentAllowed: false, answerPolicy: "no official grades unless authorized; label AI critique as AI, never peer consensus",
    memoryPolicy: "store rubric feedback and revision status",
    exitConditions: ["revision re-reviewed"],
    accessibility: "learner_selected",
    supervisorIf: ["grade_issuance_request"],
    banner: "Mode: Peer review (AI critique) — rubric-based feedback and revision paths, not official grades.",
  },
  ACCESSIBILITY: {
    mode: "ACCESSIBILITY", objective: "preserve access and equivalence across formats",
    assistance: "variable", interaction: "profile → content analysis → equivalent representation → adaptation → confirmation → delivery",
    assessmentAllowed: true, answerPolicy: "flag adaptations that could change what is assessed",
    memoryPolicy: "store learner-selected presentation preferences only",
    exitConditions: ["learner confirms equivalence"],
    accessibility: "learner_selected_first",
    supervisorIf: ["adaptation_changes_assessment", "sensitive_disclosure_risk"],
    banner: "Mode: Accessibility-first — your selected format with equivalent meaning. I never infer disability from behavior.",
  },
};

export const ALL_MODES = Object.keys(MODE_CONTRACTS) as TeachingMode[];

/** Selection priority: safety > assessment restrictions > learner request > course default > objective > state > recommendation. */
export function selectMode(args: {
  safetyForcesExam?: boolean; assessmentActive?: boolean;
  learnerRequest?: TeachingMode | null; courseDefault?: TeachingMode | null;
  objective?: string; tutorRecommendation?: TeachingMode | null;
}): { mode: TeachingMode; reason: string } {
  if (args.safetyForcesExam) return { mode: "EXAM", reason: "safety/institutional policy requires controlled assessment state" };
  if (args.assessmentActive) return { mode: "EXAM", reason: "active assessment restricts tutoring permissions" };
  if (args.learnerRequest) return { mode: args.learnerRequest, reason: "explicit learner request" };
  if (args.courseDefault) return { mode: args.courseDefault, reason: "instructor-configured course default" };
  if (args.objective) {
    const o = args.objective.toLowerCase();
    if (/reason|diagnos|transfer|metacognition/.test(o)) return { mode: "SOCRATIC", reason: "objective needs reasoning over delivery" };
    if (/fluency|retrieval|drill|practice/.test(o)) return { mode: "PRACTICE", reason: "objective needs fluency" };
    if (/error|bug|wrong|fix|debug/.test(o)) return { mode: "DEBUGGING", reason: "objective needs error diagnosis" };
    if (/contest|argue|position|ethic|policy/.test(o)) return { mode: "DEBATE", reason: "objective needs position comparison" };
    if (/research|inquiry|thesis|literature/.test(o)) return { mode: "RESEARCH_SUPERVISOR", reason: "objective needs inquiry support" };
    if (/review|revise|critique|feedback/.test(o)) return { mode: "PEER_REVIEW", reason: "objective needs criterion-based review" };
  }
  if (args.tutorRecommendation) return { mode: args.tutorRecommendation, reason: "tutor recommendation from recent evidence" };
  return { mode: "DIRECT", reason: "default: establish the mental model first" };
}

/** Exit evaluation: has the mode earned a transition? Returns suggestion or null. */
export function evaluateExit(mode: TeachingMode, signals: {
  independentApplication?: boolean; retrievalPassed?: boolean; teachbackDone?: boolean;
  transferDone?: boolean; errorReportDelivered?: boolean; submitted?: boolean;
  rootCauseExplained?: boolean; conclusionFormed?: boolean; auditPassed?: boolean;
  queueCleared?: boolean; rubricComplete?: boolean; revisionReviewed?: boolean;
  equivalenceConfirmed?: boolean;
}): TeachingMode | null {
  switch (mode) {
    case "SOCRATIC": return signals.independentApplication ? "PRACTICE" : null;
    case "DIRECT": return signals.retrievalPassed || signals.teachbackDone ? "SOCRATIC" : null;
    case "WORKED_EXAMPLE": return signals.transferDone ? "PRACTICE" : null;
    case "PRACTICE": return signals.errorReportDelivered ? null : null;
    case "EXAM": return signals.submitted ? "DEBUGGING" : null; // post-exam error analysis
    case "DEBUGGING": return signals.rootCauseExplained ? "PRACTICE" : null;
    case "DEBATE": return signals.conclusionFormed ? null : null;
    case "RESEARCH_SUPERVISOR": return signals.auditPassed ? null : null;
    case "FLASHCARD": return signals.queueCleared ? null : null;
    case "ORAL_EXAM": return signals.rubricComplete ? null : null;
    case "PEER_REVIEW": return signals.revisionReviewed ? null : null;
    case "ACCESSIBILITY": return signals.equivalenceConfirmed ? null : null;
  }
}

export function transitionMessage(from: TeachingMode, to: TeachingMode, reason: string): string {
  return `You have completed the ${MODE_CONTRACTS[from].objective} stage. I recommend switching from ${from.toLowerCase().replace(/_/g, " ")} to ${to.toLowerCase().replace(/_/g, " ")} mode (${reason}). You can stay if you prefer.`;
}

/** Mode safety rules enforced at runtime. */
export const MODE_SAFETY_RULES: { mode: TeachingMode; rule: string }[] = [
  { mode: "EXAM", rule: "exam overrides ordinary tutoring permissions" },
  { mode: "RESEARCH_SUPERVISOR", rule: "cannot submit work or claim authorship" },
  { mode: "PEER_REVIEW", rule: "cannot issue official grades unless authorized" },
  { mode: "ORAL_EXAM", rule: "requires recording consent" },
  { mode: "ACCESSIBILITY", rule: "cannot expose sensitive disability information" },
  { mode: "DEBATE", rule: "must not present disinformation as established fact" },
  { mode: "FLASHCARD", rule: "must not reveal restricted assessment answers" },
  { mode: "DEBUGGING", rule: "sandbox code and dangerous procedures" },
  { mode: "DIRECT", rule: "cite or qualify high-risk claims" },
];

/** Memory outcome mapping per mode (outcomes, never transcripts). */
export const MODE_MEMORY: Record<TeachingMode, { dimension: string; sourceType: string }> = {
  SOCRATIC: { dimension: "conceptual", sourceType: "socratic_dialogue" },
  DIRECT: { dimension: "recall", sourceType: "direct_instruction" },
  WORKED_EXAMPLE: { dimension: "procedural", sourceType: "worked_example" },
  PRACTICE: { dimension: "application", sourceType: "practice" },
  EXAM: { dimension: "application", sourceType: "exam_record" },
  DEBUGGING: { dimension: "analysis", sourceType: "debugging" },
  DEBATE: { dimension: "analysis", sourceType: "debate" },
  RESEARCH_SUPERVISOR: { dimension: "creation", sourceType: "research_milestone" },
  FLASHCARD: { dimension: "recall", sourceType: "flashcard_review" },
  ORAL_EXAM: { dimension: "conceptual", sourceType: "oral_exam" },
  PEER_REVIEW: { dimension: "analysis", sourceType: "peer_review" },
  ACCESSIBILITY: { dimension: "recall", sourceType: "accessible_delivery" },
};

/** Worked-example fading schedule: full demo → labels missing → partial → hint-only → independent. */
export const FADING_STAGES = [
  "full_demonstration",
  "labels_missing",
  "partially_completed",
  "hint_only",
  "independent",
] as const;

export type FadingStage = (typeof FADING_STAGES)[number];

/**
 * Support-adjusted mastery credit. "Solved with full scaffolding" must not
 * be recorded as independent mastery: credit scales with fading stage.
 */
export function fadingSupportCredit(stage: FadingStage): { credit: number; recordAs: string } {
  switch (stage) {
    case "full_demonstration": return { credit: 0.1, recordAs: "exposure — no mastery inferred" };
    case "labels_missing": return { credit: 0.25, recordAs: "guided participation" };
    case "partially_completed": return { credit: 0.5, recordAs: "partial independence" };
    case "hint_only": return { credit: 0.75, recordAs: "near-independent with hints" };
    case "independent": return { credit: 1, recordAs: "independent mastery evidence" };
  }
}

/** Practice feedback ladder L0-L4: correctness → category → hint → explanation → solution. */
export function practiceFeedback(attempt: number, correct: boolean): { level: number; show: string } {
  if (correct) return { level: 0, show: "correct" };
  const ladder = [
    "correct / incorrect only",
    "correct plus error category",
    "correct plus one hint",
    "correct plus concise explanation",
    "full worked solution",
  ];
  const level = Math.min(4, Math.max(1, attempt));
  return { level, show: ladder[level]! };
}

// ---------------------------------------------------------------------------
// Debugging loop: observe → reproduce → localize → classify → test → fix.
// ---------------------------------------------------------------------------

export const ERROR_LABELS = [
  "definition_error", "assumption_error", "unit_error", "sign_error",
  "boundary_condition_error", "algorithm_error", "syntax_error", "data_error",
  "citation_error", "interpretation_error",
] as const;

export type ErrorLabel = (typeof ERROR_LABELS)[number];

/** Heuristic error classifier over learner-visible symptoms (not hidden chain-of-thought). */
export function classifyErrorLabel(symptoms: string): ErrorLabel {
  const t = symptoms.toLowerCase();
  if (/syntax|parse|indent|bracket|colon|undefined/.test(t)) return "syntax_error";
  if (/\bunits?\b|km\/h|m\/s|degrees|percent/.test(t)) return "unit_error";
  if (/\bsign\b|negative|minus|-\s*vs/.test(t)) return "sign_error";
  if (/boundar|edge case|empty|off.by.one|limit/.test(t)) return "boundary_condition_error";
  if (/assum|suppose|took for granted/.test(t)) return "assumption_error";
  if (/defin|means|refers to/.test(t)) return "definition_error";
  if (/data|input|dataset|value/.test(t)) return "data_error";
  if (/cit|source|reference/.test(t)) return "citation_error";
  if (/interpret|misread|confus/.test(t)) return "interpretation_error";
  return "algorithm_error";
}

export interface DebuggingReport {
  observed: string;
  expected: string;
  firstDivergence: string;
  likelyCause: string;
  errorLabel: ErrorLabel;
  evidence: string[];
  smallestTest: string;
  fix: string;
  whyFixWorks: string;
  prevention: string;
}

/** Debugging output template — preserves the attempt, tests one hypothesis. */
export function debuggingReport(args: {
  observed: string; expected: string; firstDivergence?: string;
  evidence?: string[]; smallestTest?: string; fix?: string;
}): DebuggingReport {
  const label = classifyErrorLabel(`${args.observed} ${args.expected}`);
  return {
    observed: args.observed.slice(0, 300),
    expected: args.expected.slice(0, 300),
    firstDivergence: args.firstDivergence?.slice(0, 300) ?? "not yet localized — reproduce first",
    likelyCause: `hypothesis (${label}) — test before fixing`,
    errorLabel: label,
    evidence: (args.evidence ?? []).slice(0, 5),
    smallestTest: args.smallestTest?.slice(0, 200) ?? "smallest case that shows the divergence",
    fix: args.fix?.slice(0, 300) ?? "proposed after the hypothesis test passes",
    whyFixWorks: "addresses the localized cause, not the symptom",
    prevention: "regression check + note the error pattern for review",
  };
}

// ---------------------------------------------------------------------------
// Research-supervisor artifact, peer-review feedback, oral-exam plan.
// ---------------------------------------------------------------------------

export interface ResearchArtifact {
  question: string;
  scope: string;
  knownEvidence: string[];
  evidenceGaps: string[];
  candidateHypotheses: string[];
  methodOptions: string[];
  risks: string[];
  provisionalClaim: string | null;
  requiredValidation: string[];
  nextAction: string;
  claimLedger: { sourceBacked: string[]; learnerHypotheses: string[]; tutorSuggestions: string[]; openQuestions: string[] };
}

/** Inquiry scaffold — distinguishes source claims, learner hypotheses, tutor suggestions, open questions. */
export function researchArtifact(args: {
  question: string; scope?: string; knownEvidence?: string[]; gaps?: string[];
  hypotheses?: string[]; methods?: string[]; risks?: string[];
}): ResearchArtifact {
  return {
    question: args.question.slice(0, 300),
    scope: args.scope?.slice(0, 200) ?? "unscoped — narrow before collecting evidence",
    knownEvidence: (args.knownEvidence ?? []).slice(0, 8),
    evidenceGaps: (args.gaps ?? []).slice(0, 8),
    candidateHypotheses: (args.hypotheses ?? []).slice(0, 5),
    methodOptions: (args.methods ?? []).slice(0, 5),
    risks: (args.risks ?? []).slice(0, 5),
    provisionalClaim: null,
    requiredValidation: ["citation audit", "counterevidence check", "falsifiability check"],
    nextAction: "operationalize one term, then map one source",
    claimLedger: { sourceBacked: [], learnerHypotheses: args.hypotheses?.slice(0, 5) ?? [], tutorSuggestions: [], openQuestions: args.gaps?.slice(0, 8) ?? [] },
  };
}

export interface PeerFeedback {
  criterion: string;
  currentEvidence: string;
  strength: string;
  concern: string;
  whyItMatters: string;
  suggestedRevision: string;
  questionForAuthor: string;
  confidence: number;
  aiCritiqueLabel: string;
}

/** Peer-review feedback format — labeled AI critique, never peer consensus. */
export function peerReviewFeedback(args: {
  criterion: string; evidence?: string; strength?: string; concern?: string;
}): PeerFeedback {
  return {
    criterion: args.criterion.slice(0, 200),
    currentEvidence: (args.evidence ?? "not yet quoted").slice(0, 300),
    strength: (args.strength ?? "identify one grounded strength").slice(0, 200),
    concern: (args.concern ?? "identify the highest-impact issue").slice(0, 200),
    whyItMatters: "ties the concern to the criterion, not to taste",
    suggestedRevision: "one concrete revision path, then re-review",
    questionForAuthor: "what did you intend here?",
    confidence: 0.6,
    aiCritiqueLabel: "AI critique — not human peer feedback, not an official grade",
  };
}

export const ORAL_PROGRESSION = ["recall", "explain", "apply", "compare", "defend", "counterexample", "reflect"] as const;

export const ORAL_FAIRNESS: string[] = [
  "fluency is not scored as mastery",
  "typed, signed, AAC, or recorded responses permitted when authorized",
  "language proficiency separated from subject reasoning",
  "repetition and clarification allowed under the rubric",
  "no personality, accent, or affect scoring",
  "transcript corrections provided",
  "human review required for high-stakes oral grading",
];

/** Oral-exam plan: progression + fairness gates + consent tracking. */
export function oralExamPlan(args: {
  topic: string; followUps?: number; recordingConsent?: boolean; authorizedFormats?: string[];
}): {
  topic: string; progression: string[]; followUps: number;
  fairness: string[]; consent: string; blocked: string | null;
} {
  const followUps = Math.max(1, Math.min(8, args.followUps ?? 3));
  const blocked = args.recordingConsent === false ? "recording consent missing — oral examination cannot proceed" : null;
  return {
    topic: args.topic.slice(0, 200),
    progression: [...ORAL_PROGRESSION],
    followUps,
    fairness: [...ORAL_FAIRNESS],
    consent: args.recordingConsent ? "recording consent on file" : "consent not confirmed",
    blocked,
  };
}

// ---------------------------------------------------------------------------
// Exam policy + session state machine.
// ---------------------------------------------------------------------------

export interface ExamPolicy {
  timeLimitMinutes: number | null;
  permittedResources: string[];
  hintPolicy: "none" | "procedural_only" | "allowed";
  calculatorOrCodePolicy: string;
  accommodations: string[];
  revealPolicy: "never_during" | "after_submission";
  identityRequired: boolean;
  auditSubmissions: boolean;
}

export const DEFAULT_EXAM_POLICY: ExamPolicy = {
  timeLimitMinutes: null,
  permittedResources: [],
  hintPolicy: "none",
  calculatorOrCodePolicy: "instructor-defined",
  accommodations: [],
  revealPolicy: "never_during",
  identityRequired: false,
  auditSubmissions: true,
};

export type ExamSessionState = "not_started" | "locked" | "delivering" | "recording" | "submitted" | "graded";

const EXAM_TRANSITIONS: Record<ExamSessionState, Partial<Record<string, ExamSessionState>>> = {
  not_started: { start: "locked" },
  locked: { deliver: "delivering", abort: "not_started" },
  delivering: { respond: "recording", submit: "submitted" },
  recording: { respond: "recording", submit: "submitted" },
  submitted: { grade: "graded" },
  graded: {},
};

/** Controlled assessment states — illegal transitions rejected, never coerced. */
export function examSessionTransition(state: ExamSessionState, event: string): { state: ExamSessionState; ok: boolean; note: string } {
  const next = EXAM_TRANSITIONS[state]?.[event];
  if (!next) return { state, ok: false, note: `illegal transition: ${event} from ${state} — recorded, not applied` };
  return { state: next, ok: true, note: `transitioned to ${next}` };
}

/** Exam guard: what the tutor may do while an exam is active. */
export function examGuard(action: string, policy: ExamPolicy = DEFAULT_EXAM_POLICY): { allowed: boolean; instead: string } {
  const t = action.toLowerCase();
  if (/clarif.*instruction|technical problem|accommodation|procedural/.test(t)) {
    return { allowed: true, instead: "interface help, approved accommodations, and technical recording only" };
  }
  if (policy.hintPolicy === "allowed" && /hint/.test(t)) {
    return { allowed: true, instead: "policy explicitly allows hints" };
  }
  return { allowed: false, instead: "no answers, paths, rubric details, or coaching during an active exam" };
}

// ---------------------------------------------------------------------------
// Accessibility controls + equivalence check.
// ---------------------------------------------------------------------------

export const ACCESSIBILITY_CONTROLS = [
  "text_only", "audio_with_transcript", "short_sections", "describe_diagrams",
  "accessible_math", "more_processing_time", "no_timed_interaction",
  "aac_compatible", "reduce_visual_complexity",
] as const;

export type AccessibilityControl = (typeof ACCESSIBILITY_CONTROLS)[number];

/**
 * Flags adaptations that could change what is assessed — those go to
 * instructor review instead of silent delivery.
 */
export function adaptationEquivalenceCheck(controls: string[], assessedSkills: string[]): { equivalent: boolean; flags: string[] } {
  const flags: string[] = [];
  const has = (c: string) => controls.includes(c);
  if (has("text_only") && assessedSkills.some((s) => /diagram|visual|chart|graph/i.test(s))) {
    flags.push("text-only delivery with visual assessment targets — instructor review");
  }
  if (has("no_timed_interaction") && assessedSkills.some((s) => /fluency|speed|timed/i.test(s))) {
    flags.push("untimed delivery with fluency assessment targets — instructor review");
  }
  if (has("audio_with_transcript") && assessedSkills.some((s) => /listening/i.test(s))) {
    flags.push("transcript delivery with listening assessment targets — instructor review");
  }
  return { equivalent: flags.length === 0, flags };
}

// ---------------------------------------------------------------------------
// Practice exit: error-pattern report. Transition triggers. Misconceptions.
// ---------------------------------------------------------------------------

export interface ErrorPatternReport {
  attempts: number;
  errors: number;
  byCategory: { category: string; count: number }[];
  topPattern: string | null;
  reviewItem: string | null;
}

/** End-of-practice summary: error patterns + one scheduled review item. */
export function errorPatternReport(errors: { category: string; item: string }[], attempts: number): ErrorPatternReport {
  const counts = new Map<string, { count: number; item: string }>();
  for (const e of errors) {
    const cur = counts.get(e.category) ?? { count: 0, item: e.item };
    cur.count++;
    counts.set(e.category, cur);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  return {
    attempts,
    errors: errors.length,
    byCategory: ranked.map(([category, v]) => ({ category, count: v.count })),
    topPattern: ranked[0]?.[0] ?? null,
    reviewItem: ranked[0] ? `revisit ${ranked[0][1].item} (${ranked[0][0]})` : null,
  };
}

export interface TransitionTrigger {
  to: TeachingMode;
  reason: string;
  message: string;
}

/**
 * Transition triggers beyond exit conditions: prerequisite failure drops
 * to DIRECT, policy changes lock EXAM, overload simplifies, readiness
 * advances via evaluateExit. Learner agency preserved — suggestions,
 * with stay-allowed messaging.
 */
export function transitionTrigger(
  mode: TeachingMode,
  signals: { prereqFailed?: boolean; readiness?: boolean; frustration?: boolean; policyChanged?: boolean; objectiveChanged?: string | null },
): TransitionTrigger | null {
  if (signals.policyChanged) {
    return { to: "EXAM", reason: "assessment policy changed", message: transitionMessage(mode, "EXAM", "assessment policy changed") };
  }
  if (signals.prereqFailed && mode !== "DIRECT") {
    return { to: "DIRECT", reason: "prerequisite check failed — repair before advancing", message: transitionMessage(mode, "DIRECT", "prerequisite check failed") };
  }
  if (signals.frustration && mode !== "ACCESSIBILITY" && mode !== "DIRECT") {
    return { to: "DIRECT", reason: "load rising — simplify before continuing", message: transitionMessage(mode, "DIRECT", "cognitive load rising") };
  }
  if (signals.readiness) {
    const next = evaluateExit(mode, { independentApplication: true, retrievalPassed: true, teachbackDone: true, transferDone: true });
    if (next && next !== mode) {
      return { to: next, reason: "readiness demonstrated", message: transitionMessage(mode, next, "readiness demonstrated") };
    }
  }
  void signals.objectiveChanged;
  return null;
}

/**
 * Misconception candidates from learner reasoning: marker/token overlap
 * against known misconceptions, with the triggering span as evidence.
 * Advisory — instructor/confirmatory evidence decides, never this alone.
 */
export function detectMisconceptionFromReasoning(
  text: string,
  misconceptions: { id: string; statement: string; markers?: string[] }[],
): { id: string; statement: string; evidence: string; overlap: number }[] {
  const toks = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  const tt = toks(text);
  const out: { id: string; statement: string; evidence: string; overlap: number }[] = [];
  for (const m of misconceptions) {
    const markers = (m.markers ?? []).map((x) => x.toLowerCase());
    const hit = markers.find((mk) => text.toLowerCase().includes(mk));
    const mt = toks(m.statement);
    let inter = 0;
    for (const t of mt) if (tt.has(t)) inter++;
    const overlap = mt.size ? Math.round((inter / mt.size) * 100) / 100 : 0;
    if (hit || overlap >= 0.5) {
      out.push({ id: m.id, statement: m.statement, evidence: hit ?? `token overlap ${overlap}`, overlap });
    }
  }
  return out.sort((a, b) => b.overlap - a.overlap).slice(0, 5);
}

/** Socratic hint ladder L0-L5. */
export function socraticHint(level: number, conceptLabel: string): string {
  const ladder = [
    `Restating: what exactly is being asked about ${conceptLabel}?`,
    `Relevant concept: which principle about ${conceptLabel} applies here?`,
    `Prerequisite check: what must be true before that principle works?`,
    `Partial picture: sketch the setup — what are the knowns and unknowns?`,
    `Next step: try the first operation and tell me what you get.`,
    `Concise explanation follows — then you retry independently.`,
  ];
  const idx = Math.max(0, Math.min(5, Math.floor(level)));
  return ladder[idx] ?? ladder[0]!;
}
