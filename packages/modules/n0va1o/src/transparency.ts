/**
 * N0VA1O Communication and Transparency — deeper enhancements (spec §10).
 *
 * Status visibility for enhancement requests: received, under review, approved,
 * scheduled, in progress, shipped, or declined.
 */

export type EnhancementStatus = "received" | "under_review" | "approved" | "scheduled" | "in_progress" | "shipped" | "declined";

export interface StatusUpdate {
  requestId: string;
  status: EnhancementStatus;
  timestamp: string;
  note: string;
  actor: string;
}

export interface TransparencyRecord {
  requestId: string;
  title: string;
  currentStatus: EnhancementStatus;
  history: StatusUpdate[];
}

/**
 * Apply a status transition. Validates that the transition is allowed.
 * Returns the update record (pure — caller persists).
 */
export function transitionStatus(
  record: TransparencyRecord,
  newStatus: EnhancementStatus,
  actor: string,
  note: string,
): { update: StatusUpdate; valid: boolean } {
  const valid = isValidTransition(record.currentStatus, newStatus);
  const update: StatusUpdate = {
    requestId: record.requestId,
    status: newStatus,
    timestamp: new Date().toISOString(),
    note,
    actor,
  };
  return { update, valid };
}

function isValidTransition(from: EnhancementStatus, to: EnhancementStatus): boolean {
  const allowed: Record<EnhancementStatus, EnhancementStatus[]> = {
    received: ["under_review", "declined"],
    under_review: ["approved", "declined"],
    approved: ["scheduled", "declined"],
    scheduled: ["in_progress", "declined"],
    in_progress: ["shipped", "declined"],
    shipped: [],
    declined: [],
  };
  return allowed[from]?.includes(to) ?? false;
}
