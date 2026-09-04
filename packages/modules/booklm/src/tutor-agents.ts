/**
 * Multi-agent tutor contracts — pure, dependency-free, deterministic.
 * Registry, intents, workflows, conflict hierarchy, composer metadata.
 * No prisma, no node APIs: safe for client components.
 */

export interface AgentDef {
  key: string; name: string; mandate: string; tools: string[];
  version: string; confidenceLimit: number; allowedActions: string[];
  dataScopes: string[]; outputs: string[];
}

export const AGENT_DEFS: AgentDef[] = [
  { key: "tutor", name: "Tutor", mandate: "Explain, demonstrate, scaffold, summarize — never assign grades.", tools: ["evidence.retrieve", "concept.graph", "example.bank"], version: "tutor-2.1", confidenceLimit: 0.45, allowedActions: ["explain", "demonstrate", "scaffold", "summarize"], dataScopes: ["mastery:read", "evidence:read"], outputs: ["explanation", "misconception_check", "confidence"] },
  { key: "socratic", name: "Socratic", mandate: "Ask one high-information question at a time with an explicit objective and stopping condition.", tools: ["question.bank", "concept.graph"], version: "socratic-1.6", confidenceLimit: 0.4, allowedActions: ["question", "hint"], dataScopes: ["mastery:read"], outputs: ["question", "purpose", "stopping_condition"] },
  { key: "research", name: "Research", mandate: "Retrieve and synthesize approved sources; separate claims from synthesis; flag gaps.", tools: ["evidence.retrieve", "source.policy"], version: "research-1.9", confidenceLimit: 0.5, allowedActions: ["retrieve", "synthesize"], dataScopes: ["evidence:read", "policy:read"], outputs: ["claims", "citations", "limitations"] },
  { key: "assessment", name: "Assessment", mandate: "Diagnose mastery and generate tasks; formative only — never declare official results.", tools: ["item.bank", "rubric.store", "concept.graph"], version: "assessment-1.8", confidenceLimit: 0.5, allowedActions: ["diagnose", "generate_task", "score_formative"], dataScopes: ["mastery:read", "attempts:read"], outputs: ["rubric", "item_intent", "scored_evidence", "uncertainty"] },
  { key: "factcheck", name: "Fact-checker", mandate: "Verify claims, detect unsupported statements, contradictions, staleness.", tools: ["evidence.retrieve", "claim.graph"], version: "factcheck-2.0", confidenceLimit: 0.55, allowedActions: ["verify", "flag"], dataScopes: ["evidence:read", "claims:read"], outputs: ["verdicts", "citations", "conflicts"] },
  { key: "planner", name: "Motivation & planning", mandate: "Plan sessions, pacing, goals, review; support autonomy, never guilt.", tools: ["plan.builder", "schedule.store"], version: "planner-1.4", confidenceLimit: 0.4, allowedActions: ["plan", "schedule"], dataScopes: ["goals:read", "mastery:read"], outputs: ["study_plan", "rationale", "workload", "opt_out"] },
  { key: "accessibility", name: "Accessibility", mandate: "Adapt content across formats; never infer disability; never change official accommodations.", tools: ["transform.checklist"], version: "accessibility-1.4", confidenceLimit: 0.4, allowedActions: ["transform", "check", "warn"], dataScopes: ["preferences:read"], outputs: ["transformation", "checks", "warnings"] },
  { key: "safety", name: "Safety & policy", mandate: "Independent policy boundary: allow, modify, refuse, escalate, or log.", tools: ["policy.engine", "source.policy"], version: "safety-2.2", confidenceLimit: 0.6, allowedActions: ["allow", "modify", "refuse", "escalate", "log"], dataScopes: ["policy:read"], outputs: ["decision", "reasons", "allowed", "blocked"] },
  { key: "debate", name: "Debate", mandate: "Map opposing interpretations fairly; no false balance on asymmetric evidence.", tools: ["claim.graph", "evidence.retrieve"], version: "debate-1.2", confidenceLimit: 0.45, allowedActions: ["map_positions", "synthesize"], dataScopes: ["claims:read", "evidence:read"], outputs: ["position_map", "assumptions", "synthesis"] },
  { key: "supervisor", name: "Teacher-supervisor", mandate: "Accountable escalation layer: packets, human review, documented resolution.", tools: ["escalation.queue", "state.snapshots"], version: "supervisor-1.5", confidenceLimit: 0.5, allowedActions: ["escalate", "recommend", "resolve"], dataScopes: ["all:read"], outputs: ["packet", "recommendation", "resolution_state"] },
];

export type Intent =
  | "explain_concept" | "diagnose_gap" | "retrieve_sources" | "assess"
  | "verify" | "plan_session" | "debate" | "accessibility_request"
  | "challenge_result" | "human_help" | "general";

const INTENT_PATTERNS: { intent: Intent; re: RegExp }[] = [
  { intent: "human_help", re: /\b(human|teacher|instructor|someone real|help me.*person)\b/i },
  { intent: "challenge_result", re: /\b(wrong|disagree|challenge|appeal|incorrect|unfair)\b/i },
  { intent: "plan_session", re: /\b(plan|schedule|study plan|pacing|workload|break|deadline|routine)\b/i },
  { intent: "assess", re: /\b(test me|quiz me|assess|exam|diagnos|check (my )?understanding|practice (questions?|problems?))\b/i },
  { intent: "verify", re: /\b(is it true|verify|fact.?check|is that (right|correct)|source\??)\b/i },
  { intent: "debate", re: /\b(debate|argue|pros and cons|opposing|other side|controvers\w*|both sides)\b/i },
  { intent: "retrieve_sources", re: /\b(sources?|papers?|references?|evidence for|research on|cite)\b/i },
  { intent: "diagnose_gap", re: /\b(don't understand|dont understand|confused|stuck|lost|why .*wrong|what am i missing|gap)\b/i },
  { intent: "accessibility_request", re: /\b(accessib\w*|audio|transcript|caption|alt text|screen reader|larger|slower|dyslex\w*)\b/i },
  { intent: "explain_concept", re: /\b(explain|what is|what are|how does|why does|teach|show me|walk me through|eli5|simplify)\b/i },
];

export function classifyIntent(message: string): Intent {
  for (const { intent, re } of INTENT_PATTERNS) if (re.test(message.trim())) return intent;
  return "general";
}

export type Workflow = "sequential" | "parallel" | "debate" | "escalation";

/** Workflow selection: debates for contested evidence, escalation for risk. */
export function selectWorkflow(intent: Intent, signals: { contested?: boolean; risky?: boolean }): { workflow: Workflow; agents: string[] } {
  if (signals.risky) return { workflow: "escalation", agents: ["safety", "supervisor"] };
  switch (intent) {
    case "debate": return { workflow: "debate", agents: ["research", "debate", "factcheck", "supervisor", "tutor"] };
    case "retrieve_sources": return { workflow: "sequential", agents: ["research", "factcheck", "tutor"] };
    case "assess": return { workflow: "sequential", agents: ["assessment", "factcheck"] };
    case "verify": return { workflow: "sequential", agents: ["factcheck", "tutor"] };
    case "plan_session": return { workflow: "sequential", agents: ["planner", "safety"] };
    case "accessibility_request": return { workflow: "parallel", agents: ["tutor", "accessibility"] };
    case "challenge_result": return { workflow: "escalation", agents: ["factcheck", "supervisor"] };
    case "human_help": return { workflow: "escalation", agents: ["supervisor"] };
    case "diagnose_gap": return { workflow: "sequential", agents: ["research", "factcheck", "tutor", "socratic", "assessment"] };
    default: return { workflow: "sequential", agents: ["tutor", "socratic", "assessment", "factcheck"] };
  }
}

/** Authority hierarchy for conflict resolution (top wins; configurable). */
export const AUTHORITY_HIERARCHY = [
  "safety-legal", "instructor-policy", "learner-preference",
  "verified-assessment", "approved-source", "model-inference", "personalization-heuristic",
] as const;

export function resolveConflictRank(source: string): number {
  const i = (AUTHORITY_HIERARCHY as readonly string[]).indexOf(source);
  return i < 0 ? 99 : i;
}

/** Escalation triggers evaluated from observable signals. */
export function escalationTriggers(signals: {
  agentDisagreement?: boolean; factcheckConfidence?: number; repeatedFailures?: number;
  misconceptionHighImpact?: boolean; dispute?: boolean; policyUnclear?: boolean;
  outOfCorpus?: boolean; humanRequested?: boolean; accessibilityRisk?: boolean;
  highStakes?: boolean; driftSuspected?: boolean; conflictingStateChange?: boolean;
}): string[] {
  const t: string[] = [];
  if (signals.agentDisagreement) t.push("agents disagree materially");
  if (signals.factcheckConfidence !== undefined && signals.factcheckConfidence < 0.45) t.push("fact-check confidence low");
  if ((signals.repeatedFailures ?? 0) >= 3) t.push("repeated prerequisite repair failure");
  if (signals.misconceptionHighImpact) t.push("high-impact misconception");
  if (signals.dispute) t.push("learner disputes result");
  if (signals.policyUnclear) t.push("safety policy unclear");
  if (signals.outOfCorpus) t.push("content outside approved corpus");
  if (signals.humanRequested) t.push("learner requested human help");
  if (signals.accessibilityRisk) t.push("transformation may alter meaning");
  if (signals.highStakes) t.push("high-stakes decision");
  if (signals.driftSuspected) t.push("suspected model drift");
  if (signals.conflictingStateChange) t.push("conflicting state updates");
  return t;
}

export type FactVerdict =
  | "verified" | "supported_with_limits" | "contested"
  | "unsupported" | "outdated" | "ambiguous" | "requires_human_review";

/** Map verification labels → fact-check verdicts. */
export function verdictFor(label: string, freshnessOk: boolean): FactVerdict {
  if (!freshnessOk) return "outdated";
  switch (label) {
    case "DIRECTLY_SUPPORTED": return "verified";
    case "QUALIFIED_SUPPORT": return "supported_with_limits";
    case "SYNTHESIZED": return "supported_with_limits";
    case "CONFLICTING": return "contested";
    case "NOT_FOUND": return "unsupported";
    case "REQUIRES_REVIEW": return "requires_human_review";
    default: return "ambiguous";
  }
}

/** Socratic stopping: stop when target uncertainty reduced or struggle cap hit. */
export function socraticShouldStop(args: {
  questionsAsked: number; uncertaintyReduced: boolean; struggleSignals: number; learnerAskedDirect: boolean;
}): { stop: boolean; reason: string } {
  if (args.learnerAskedDirect) return { stop: true, reason: "learner requested direct explanation" };
  if (args.uncertaintyReduced) return { stop: true, reason: "target uncertainty reduced" };
  if (args.struggleSignals >= 2) return { stop: true, reason: "struggle cap — give a hint, then explain" };
  if (args.questionsAsked >= 4) return { stop: true, reason: "question budget reached" };
  return { stop: false, reason: "continue" };
}
