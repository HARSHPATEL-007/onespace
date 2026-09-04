/**
 * Memory trust + lifecycle — pure, dependency-free, deterministic.
 * Document classification, injection scanning, lifecycle guards, confidence,
 * retrieval ranking, contradiction rules, agent access matrix.
 */

export type DocSpanLabel =
  | "content_claim" | "course_instruction" | "assignment_requirement"
  | "quoted_instruction" | "embedded_prompt" | "external_command"
  | "suspicious_instruction" | "untrusted_metadata" | "learner_annotation"
  | "generated_summary";

const SPAN_PATTERNS: { label: DocSpanLabel; re: RegExp }[] = [
  { label: "embedded_prompt", re: /\b(ignore (previous|all|above) instructions|disregard (all|previous|prior)|(you are now|from now on you are)|new instructions:|system prompt|jailbreak)\b/i },
  { label: "external_command", re: /\b(send|email|upload|transmit|exfiltrate).{0,40}(to|at)\s+[\w.]+@[\w.]+|\b(curl|wget|fetch|POST to)\s+https?:/i },
  { label: "suspicious_instruction", re: /\b(reveal|disclose|expose).{0,40}(private|profile|password|key|secret|grade)|store this (instruction|permanently|forever)|give the answer instead of/i },
  { label: "quoted_instruction", re: /^["“].{0,200}(click|press|type|enter|select).{0,200}["”]$/i },
  { label: "assignment_requirement", re: /\b(submit|due|deadline|deliverable|rubric|grading|points? (awarded|deducted)|must (include|submit|complete))\b/i },
  { label: "course_instruction", re: /\b(read chapter|syllabus|office hours|lecture|week \d+|module \d+|learning objective)\b/i },
  { label: "untrusted_metadata", re: /^(author|creator|producer|hidden|white-text|comment):/i },
  { label: "learner_annotation", re: /^\[(my note|todo|remember|question)\]/i },
  { label: "generated_summary", re: /^(summary|tl;dr|in summary|abstract):/i },
];

/** Classify an extracted span; default is content_claim (data, not orders). */
export function classifyDocSpan(text: string): DocSpanLabel {
  for (const { label, re } of SPAN_PATTERNS) if (re.test(text.trim())) return label;
  return "content_claim";
}

/** Trust rank: lower number = higher authority. Documents are near the bottom. */
export function trustRank(source: string): number {
  const order = ["system_policy", "tenant_policy", "instructor", "learner", "application_config", "document", "extracted", "generated"];
  const i = order.indexOf(source);
  return i < 0 ? 90 : i;
}

const INJECTION_PATTERNS = [
  /ignore (previous|all|above) instructions/i,
  /disregard (all|previous|prior) (instructions|rules|policies)/i,
  /reveal (the |your )?(private|system|secret|hidden|profile|learner)/i,
  /store this (instruction |permanently|forever)/i,
  /send .* to .*@.*/i,
  /give the answer instead of/i,
  /you are now (a |an )?[\w ]{0,30}(without|free of|above)/i,
  /\[?\s*system\s*:.*override/i,
  /<\!--[\s\S]{0,200}?(ignore|reveal|send|store)[\s\S]{0,200}?-->/i,
  /white-?text|hidden-text|aria-hidden/i,
];

export interface InjectionFinding { pattern: string; excerpt: string; severity: "high" | "medium" }

/** Scan text for prompt-injection patterns (incl. hidden-text markers). */
export function injectionScan(text: string): InjectionFinding[] {
  const out: InjectionFinding[] = [];
  for (const re of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      out.push({
        pattern: String(re),
        excerpt: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).slice(0, 200),
        severity: /reveal|send|store|override|exfiltrate/i.test(m[0]) ? "high" : "medium",
      });
    }
  }
  return out;
}

export type ConfidenceLevel =
  | "explicit" | "verified" | "strong" | "moderate"
  | "weak" | "hypothesis" | "contested" | "expired";

/** Confidence level from provenance + evidence counts. */
export function confidenceLevelFor(args: {
  learnerDeclared?: boolean; instructorVerified?: boolean;
  evidenceCount?: number; independentSources?: number;
  contested?: boolean; expired?: boolean; singleObservation?: boolean;
}): ConfidenceLevel {
  if (args.expired) return "expired";
  if (args.contested) return "contested";
  if (args.learnerDeclared) return "explicit";
  if (args.instructorVerified) return "verified";
  if ((args.independentSources ?? 0) >= 2 && (args.evidenceCount ?? 0) >= 3) return "strong";
  if ((args.evidenceCount ?? 0) >= 2) return "moderate";
  if (args.singleObservation) return "weak";
  if ((args.evidenceCount ?? 0) >= 1) return "weak";
  return "hypothesis";
}

export type MemoryLifecycle =
  | "CANDIDATE" | "PROPOSED" | "CONFIRMED" | "ACTIVE"
  | "REVALIDATED" | "STALE" | "EXPIRED" | "DELETED" | "ARCHIVED";

const TRANSITIONS: Record<MemoryLifecycle, MemoryLifecycle[]> = {
  CANDIDATE: ["PROPOSED", "DELETED"],
  PROPOSED: ["CONFIRMED", "DELETED"],
  CONFIRMED: ["ACTIVE", "DELETED"],
  ACTIVE: ["REVALIDATED", "STALE", "EXPIRED", "DELETED", "ARCHIVED"],
  REVALIDATED: ["ACTIVE", "STALE", "EXPIRED", "DELETED"],
  STALE: ["REVALIDATED", "EXPIRED", "DELETED", "ARCHIVED"],
  EXPIRED: ["REVALIDATED", "DELETED", "ARCHIVED"],
  DELETED: [],
  ARCHIVED: [],
};

/** Guard lifecycle moves; repetition alone never promotes. */
export function canTransition(from: MemoryLifecycle, to: MemoryLifecycle, opts?: { confirmed?: boolean; repetitionOnly?: boolean }): boolean {
  if (opts?.repetitionOnly && (to === "CONFIRMED" || to === "ACTIVE")) return false;
  if ((to === "CONFIRMED" || to === "ACTIVE") && !opts?.confirmed && from !== "REVALIDATED") return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Scope escalation guard: lower scopes never silently become higher ones. */
const SCOPE_RANK = ["TASK", "SESSION", "COURSE", "LONG_TERM", "CLASSROOM", "TENANT", "SYSTEM"] as const;

export function scopeRank(scope: string): number {
  const i = (SCOPE_RANK as readonly string[]).indexOf(scope);
  return i < 0 ? 99 : i;
}

export function mayPromoteScope(from: string, to: string, confirmed: boolean): boolean {
  if (scopeRank(to) <= scopeRank(from)) return true; // narrowing or same
  return confirmed; // widening requires explicit confirmation
}

/** Retrieval ranking: task → session → course → learner → classroom → tenant → system. */
export function retrievalOrder(scope: string): number {
  const order = ["TASK", "SESSION", "COURSE", "LONG_TERM", "CLASSROOM", "TENANT", "SYSTEM"];
  const i = order.indexOf(scope);
  return i < 0 ? 90 : i;
}

export interface RankCandidate { scope: string; confidence: number; lastUsedAt: number; sensitive: boolean; needed: boolean }

/** Minimum-necessary ranking: non-sensitive first, then scope order, then score. */
export function rankMemories(items: RankCandidate[]): number[] {
  return items
    .map((m, i) => ({ i, m }))
    .filter(({ m }) => m.needed)
    .sort((a, b) =>
      Number(a.m.sensitive) - Number(b.m.sensitive)
      || retrievalOrder(a.m.scope) - retrievalOrder(b.m.scope)
      || (b.m.confidence * recency(b.m.lastUsedAt)) - (a.m.confidence * recency(a.m.lastUsedAt)),
    )
    .map(({ i }) => i);
}

function recency(ts: number): number {
  if (!ts) return 0.3;
  const days = (Date.now() - ts) / 86_400_000;
  return Math.max(0.1, 1 / (1 + days / 30));
}

/** Contradiction resolution order: correction > scope/time > newer verified. */
export function resolveContradiction(args: {
  hasCorrection: boolean; scopeNarrower: boolean; newerVerified: boolean;
}): "correction" | "narrower_scope" | "newer_verified" | "ask_learner" {
  if (args.hasCorrection) return "correction";
  if (args.scopeNarrower) return "narrower_scope";
  if (args.newerVerified) return "newer_verified";
  return "ask_learner";
}

/** Agent access matrix: scope → access per agent (read/propose/none). */
export type Access = "rw-propose" | "read" | "limited" | "proposal" | "none" | "authorized";

const MATRIX: Record<string, Record<string, Access>> = {
  tutor: { SESSION: "rw-propose", COURSE: "read", LONG_TERM: "limited", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  socratic: { SESSION: "read", COURSE: "read", LONG_TERM: "limited", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  research: { SESSION: "read", COURSE: "read", LONG_TERM: "none", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  assessment: { SESSION: "rw-propose", COURSE: "read", LONG_TERM: "proposal", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  factcheck: { SESSION: "read", COURSE: "read", LONG_TERM: "none", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  planner: { SESSION: "read", COURSE: "read", LONG_TERM: "read", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  accessibility: { SESSION: "read", COURSE: "read", LONG_TERM: "read", CLASSROOM: "read", TENANT: "read", SENSITIVE: "authorized" },
  safety: { SESSION: "read", COURSE: "read", LONG_TERM: "read", CLASSROOM: "read", TENANT: "read", SENSITIVE: "read" },
  debate: { SESSION: "read", COURSE: "read", LONG_TERM: "none", CLASSROOM: "read", TENANT: "read", SENSITIVE: "none" },
  supervisor: { SESSION: "read", COURSE: "read", LONG_TERM: "read", CLASSROOM: "read", TENANT: "read", SENSITIVE: "authorized" },
};

export function agentAccess(agentKey: string, scope: string, sensitive: boolean): Access {
  if (sensitive) {
    const s = MATRIX[agentKey]?.SENSITIVE ?? "none";
    return s === "authorized" || s === "read" ? s : "none";
  }
  return MATRIX[agentKey]?.[scope] ?? "none";
}

/** Scopes an agent may receive in a state snapshot. */
export function snapshotScopes(agentKey: string): string[] {
  const scopes = ["TASK", "SESSION", "COURSE", "LONG_TERM", "CLASSROOM", "TENANT", "SYSTEM"];
  return scopes.filter((s) => {
    const a = agentAccess(agentKey, s, false);
    return a === "read" || a === "rw-propose" || a === "limited" || a === "proposal";
  });
}
