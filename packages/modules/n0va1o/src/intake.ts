/**
 * N0VA1O Feature-Request Intake Flow — deeper enhancements (spec §4).
 *
 * Standardized intake path with fields for problem statement, business value,
 * affected users, dependencies, and suggested acceptance criteria.
 */

export type RequestStatus = "received" | "under_review" | "approved" | "scheduled" | "in_progress" | "shipped" | "declined";

export interface FeatureRequest {
  id: string;
  title: string;
  problemStatement: string;
  businessValue: string;
  affectedUsers: string[];
  dependencies: string[];
  suggestedAcceptanceCriteria: string[];
  status: RequestStatus;
  createdAt: string;
  priority?: number;
}

export interface IntakeValidation {
  complete: boolean;
  missingFields: string[];
}

/**
 * Validate that a feature request has all required fields. Prevents vague
 * requests from entering the roadmap.
 */
export function validateIntake(request: Partial<FeatureRequest>): IntakeValidation {
  const missing: string[] = [];
  if (!request.title) missing.push("title");
  if (!request.problemStatement || request.problemStatement.length < 20) missing.push("problemStatement");
  if (!request.businessValue) missing.push("businessValue");
  if (!request.affectedUsers || request.affectedUsers.length === 0) missing.push("affectedUsers");
  if (!request.suggestedAcceptanceCriteria || request.suggestedAcceptanceCriteria.length === 0) missing.push("suggestedAcceptanceCriteria");
  return { complete: missing.length === 0, missingFields: missing };
}

/** Create a validated feature request with default status. */
export function createRequest(request: Omit<FeatureRequest, "status" | "createdAt">): FeatureRequest {
  return { ...request, status: "received", createdAt: new Date().toISOString() };
}
