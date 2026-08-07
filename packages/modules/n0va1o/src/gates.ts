/**
 * N0VA1O Stakeholder Review Gates — deeper enhancements (spec §5).
 *
 * Cross-functional approval gates for security, operations, finance, and
 * product before shipping high-impact enhancements.
 */

export type ReviewerRole = "security" | "operations" | "finance" | "product";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ReviewGate {
  role: ReviewerRole;
  reviewer: string;
  status: ApprovalStatus;
  comments: string;
  reviewedAt?: string;
}

export interface GateCheckResult {
  passed: boolean;
  pending: ReviewerRole[];
  rejected: { role: ReviewerRole; reason: string }[];
}

/**
 * Check whether all review gates have passed. Pure function.
 */
export function checkGates(gates: ReviewGate[]): GateCheckResult {
  const pending: ReviewerRole[] = [];
  const rejected: { role: ReviewerRole; reason: string }[] = [];
  for (const gate of gates) {
    if (gate.status === "pending") pending.push(gate.role);
    else if (gate.status === "rejected") rejected.push({ role: gate.role, reason: gate.comments });
  }
  return { passed: pending.length === 0 && rejected.length === 0, pending, rejected };
}

/** Whether the enhancement requires review from a specific role. */
export function requiresReview(impact: "low" | "medium" | "high"): ReviewerRole[] {
  if (impact === "high") return ["security", "operations", "finance", "product"];
  if (impact === "medium") return ["security", "operations"];
  return ["product"];
}
