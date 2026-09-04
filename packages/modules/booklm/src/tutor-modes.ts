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
