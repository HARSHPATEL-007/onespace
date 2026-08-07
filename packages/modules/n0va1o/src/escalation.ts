/**
 * N0VA1O Human-in-the-Loop Escalation — explicit escalation paths for risky,
 * ambiguous, or high-impact actions with approve/modify/reject/defer/escalate.
 */

/* ---------- risk classification ---------- */

export type ActionRisk = "low" | "medium" | "high" | "critical";
export type Reversibility = "reversible" | "partially_reversible" | "irreversible";
export type ExecutionMode = "automatic" | "review_only" | "pre_approval";

export interface RiskClassification {
  action: string;
  risk: ActionRisk;
  reversibility: Reversibility;
  businessImpact: "low" | "medium" | "high";
  mode: ExecutionMode;
}

/**
 * Classify an action by risk, reversibility, and impact. Pure. High-consequence
 * + low-reversibility actions become pre-approval cases.
 */
export function classifyRisk(opts: { action: string; risk: ActionRisk; reversibility: Reversibility; businessImpact: "low" | "medium" | "high" }): RiskClassification {
  const mode: ExecutionMode = (opts.risk === "critical" || opts.risk === "high") && opts.reversibility === "irreversible" ? "pre_approval" : opts.risk === "high" || opts.businessImpact === "high" ? "review_only" : "automatic";
  return { ...opts, mode };
}

/* ---------- escalation outcomes ---------- */

export type EscalationOutcome = "approve" | "modify" | "reject" | "defer" | "request_info" | "escalate";

export interface EscalationDecision {
  escalationId: string;
  outcome: EscalationOutcome;
  reviewer: string;
  timestamp: string;
  reason: string;
  modifiedAction?: string;
}

/**
 * Create an escalation decision. Pure — does not execute the action.
 */
export function makeDecision(opts: { escalationId: string; outcome: EscalationOutcome; reviewer: string; reason: string; modifiedAction?: string }): EscalationDecision {
  return { ...opts, timestamp: new Date().toISOString() };
}

/** Whether the outcome permits execution. Pure. */
export function canExecute(decision: EscalationDecision): boolean {
  return decision.outcome === "approve" || decision.outcome === "modify";
}

/* ---------- routing and ownership ---------- */

export type ReviewerRole = "operational" | "security" | "legal" | "compliance" | "manager";

export interface Reviewer {
  id: string;
  role: ReviewerRole;
  domains: string[];
  authority: number;
  available: boolean;
}

export interface RoutingResult {
  primary: string | null;
  fallbacks: string[];
  reason: string;
}

/**
 * Route an escalation to the correct reviewer by domain, role, and authority.
 * Supports sequential approval and fallback paths. Pure.
 */
export function routeEscalation(opts: { domain: string; role: ReviewerRole; reviewers: Reviewer[] }): RoutingResult {
  const eligible = opts.reviewers.filter((r) => r.role === opts.role && r.domains.includes(opts.domain));
  const available = eligible.filter((r) => r.available).sort((a, b) => b.authority - a.authority);
  if (available.length === 0) {
    const fallback = eligible.sort((a, b) => b.authority - a.authority)[0];
    return { primary: fallback?.id ?? null, fallbacks: [], reason: fallback ? "Primary unavailable — using fallback" : "No eligible reviewer" };
  }
  return { primary: available[0]!.id, fallbacks: available.slice(1).map((r) => r.id), reason: `Routed to ${available[0]!.id}` };
}

/* ---------- timeout and fail-safe ---------- */

export interface TimeoutConfig {
  windowMs: number;
  escalationOnTimeout: boolean;
}

export interface TimeoutResult {
  timedOut: boolean;
  action: "none" | "escalate" | "execute";
  reason: string;
}

/**
 * Apply timeout fail-safe: defaults to "no action" if approval window expires.
 * Escalates on timeout rather than silent execution. Pure.
 */
export function applyTimeout(opts: { decision: EscalationDecision | null; config: TimeoutConfig; elapsedMs: number }): TimeoutResult {
  if (opts.decision) return { timedOut: false, action: canExecute(opts.decision) ? "execute" : "none", reason: "Decision received" };
  if (opts.elapsedMs >= opts.config.windowMs) {
    return opts.config.escalationOnTimeout
      ? { timedOut: true, action: "escalate", reason: "Approval window expired — escalating" }
      : { timedOut: true, action: "none", reason: "Approval window expired — no action taken" };
  }
  return { timedOut: false, action: "none", reason: "Awaiting decision" };
}

/* ---------- evidence for review ---------- */

export interface ReviewEvidence {
  proposedAction: string;
  policyContext: string;
  expectedSideEffects: string[];
  sourceDocuments: string[];
  confidence: number;
  version: string;
}

/**
 * Package evidence for a human reviewer. Pure.
 */
export function packageReviewEvidence(opts: { proposedAction: string; policyContext: string; expectedSideEffects: string[]; sourceDocuments: string[]; confidence: number }): ReviewEvidence {
  return { ...opts, version: `v${Date.now()}` };
}

/* ---------- governance ---------- */

export interface EscalationAudit {
  escalationId: string;
  action: string;
  reviewer: string;
  decision: EscalationOutcome;
  modifiedFrom?: string;
  reason: string;
  timestamp: string;
}

/** Log an escalation decision. Pure. */
export function auditEscalation(opts: { escalationId: string; action: string; reviewer: string; decision: EscalationOutcome; modifiedFrom?: string; reason: string }): EscalationAudit {
  return { ...opts, timestamp: new Date().toISOString() };
}

/* ---------- metrics ---------- */

export interface EscalationMetrics {
  approvalLatencyMs: number;
  overrideRate: number;
  rejectionRate: number;
  escalationRate: number;
  total: number;
}

/**
 * Compute escalation metrics from a history of decisions. Pure.
 */
export function measureEscalations(decisions: EscalationDecision[], totalActions: number): EscalationMetrics {
  const total = decisions.length;
  const overrides = decisions.filter((d) => d.outcome === "modify").length;
  const rejections = decisions.filter((d) => d.outcome === "reject").length;
  const escalations = decisions.filter((d) => d.outcome === "escalate").length;
  return {
    approvalLatencyMs: 0,
    overrideRate: total > 0 ? overrides / total : 0,
    rejectionRate: total > 0 ? rejections / total : 0,
    escalationRate: total > 0 ? escalations / total : 0,
    total: totalActions,
  };
}
