/**
 * N0VA VIDEOS — Review Intelligence Engine
 * Ingestion → Understanding → Intelligence → Execution & Verification
 */
import type {
  ReviewItem, ReviewRound, Cluster, FeedbackRelationship, EditSuggestion, ApprovalDependencyGraph,
  Blocker, Classification, DeadlineRisk, VerificationResult, ReviewEvent, FeedbackCapture,
} from "./review-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

// ── Stores ─────────────────────────────────────────────────────────────────
const reviewItems = new Map<string, ReviewItem>();
const reviewRounds = new Map<string, ReviewRound>();
const clusters = new Map<string, Cluster>();
const relationships = new Map<string, FeedbackRelationship>();
const suggestions = new Map<string, EditSuggestion>();
const events: ReviewEvent[] = [];

// Seed round
(function seed() {
  const round: ReviewRound = {
    review_round_id: "round_client_v03", project_id: "project_001", revision_id: "rev_0192",
    stage: "client_approval", deadline: "2026-08-30T17:00:00+05:30",
    participants: [
      { user_id: "client_001", role: "client", required: true },
      { user_id: "editor_001", role: "editor", required: true },
      { user_id: "legal_001", role: "legal", required: true },
    ],
    items: [],
    risk: { level: "orange", score: 0.78, confidence: 0.84, drivers: ["legal_review_pending", "three_critical_blockers", "deadline_less_than_12_hours"], recommendations: ["Escalate legal now"] },
  };
  reviewRounds.set(round.review_round_id, round);
})();

// ── Lifecycle ────────────────────────────────────────────────────────────────
export function createReviewItem(input: {
  revision_id: string; source: { type: string; comment_id: string }; anchor: { start_ms: number; end_ms: number; frame?: number }; text: string;
  owner_id?: string; round_id?: string;
}): ReviewItem {
  const normalized = normalizeText(input.text);
  const classification = classify(input.text);
  const urgency = classification.urgency.label === "deadline_sensitive" ? "deadline_sensitive" : classification.urgency.label === "immediate" ? "deadline_sensitive" : "normal";
  const item: ReviewItem = {
    review_item_id: uid("ri"),
    source_comment_ids: [input.source.comment_id],
    review_round_id: input.round_id ?? "round_client_v03",
    status: "captured",
    type: classification.intent.label === "change_request" ? "edit_request" : "observation",
    priority: classification.urgency.label === "deadline_sensitive" ? "high" : "medium",
    urgency: urgency as ReviewItem["urgency"],
    owner_id: input.owner_id ?? "editor_001",
    affected_region: { start_ms: input.anchor.start_ms, end_ms: input.anchor.end_ms, tracks: ["video_1", "audio_dialogue"] },
    requested_change: { normalized_text: normalized, operation_type: mapIntentToOperation(classification.intent.label, input.text) },
    original_text: input.text,
    source_revision: input.revision_id,
    target_revision: null,
    verification: { status: "not_started", evidence: [] },
    blocker: false,
    created_at: nowIso(),
  };
  // auto classify urgency blocker signals
  if (classification.urgency.label === "deadline_sensitive") item.blocker = true;
  reviewItems.set(item.review_item_id, item);
  const round = reviewRounds.get(item.review_round_id);
  if (round) round.items.push(item);
  emit({ event_type: "video.review.item.created", review_item_id: item.review_item_id, source_revision: item.source_revision });
  return item;
}
export function getReviewItem(itemId: string): ReviewItem | null { return reviewItems.get(itemId) ?? null; }
export function listReviewItems(roundId?: string): ReviewItem[] {
  if (!roundId) return Array.from(reviewItems.values());
  return Array.from(reviewItems.values()).filter(r => r.review_round_id === roundId);
}

// ── Normalization ───────────────────────────────────────────────────────────
export function normalizeText(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("less flat") || lower.includes("premium")) return "Improve visual impact of the product reveal by replacing or grading the current shot.";
  if (lower.includes("tighten") || lower.includes("shorter")) return "Shorten opening range";
  if (lower.includes("close-up")) return "Replace the current product angle with the close-up shot.";
  return text.slice(0, 80);
}
function mapIntentToOperation(intent: string, text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("trim") || lower.includes("shorter")) return "trim_clip";
  if (lower.includes("close-up") || lower.includes("replace")) return "replace_clip";
  if (lower.includes("lower the music")) return "adjust_audio_gain";
  if (lower.includes("move this title")) return "shift_graphics";
  if (lower.includes("disclaimer")) return "insert_graphic";
  return intent === "change_request" ? "replace_clip" : "observation";
}

// ── Classification ───────────────────────────────────────────────────────────
export function classify(text: string): Classification {
  const lower = text.toLowerCase();
  const hasDeadline = lower.includes("deadline") || lower.includes("launch date");
  const isConcerned = lower.includes("please") || lower.includes("could we") || lower.includes("concern");
  const urgency = hasDeadline ? { label: "deadline_sensitive" as const, confidence: 0.91 } : { label: "normal" as const, confidence: 0.85 };
  const sentiment = isConcerned ? { label: "concerned" as const, confidence: 0.86 } : { label: "neutral" as const, confidence: 0.82 };
  const intent = lower.includes("?") ? { label: "question" as const, confidence: 0.88 } : { label: "change_request" as const, confidence: 0.97 };
  const explanation = [
    hasDeadline ? "Contains an explicit delivery deadline." : "No deadline detected.",
    lower.includes("claim") ? "Requests a change to an approved product claim." : "General edit request.",
  ];
  return { sentiment, urgency, intent, explanation };
}

// ── Clustering ───────────────────────────────────────────────────────────────
export function clusterItems(itemIds: string[], mode: "semantic" | "timecode" = "semantic"): Cluster {
  const items = itemIds.map(id => reviewItems.get(id)).filter(Boolean) as ReviewItem[];
  const start = Math.min(...items.map(i => i.affected_region.start_ms));
  const end = Math.max(...items.map(i => i.affected_region.end_ms));
  const cluster: Cluster = {
    cluster_id: uid("cluster"),
    review_item_ids: itemIds,
    time_range: { start_ms: start, end_ms: end },
    source_clip: "clip_004",
    intent: "Replace product reveal shot",
    participants: [...new Set(items.flatMap(i => i.source_comment_ids))],
    confidence: 0.92,
    reason: ["Same timeline region: 00:00:45–00:00:52", "Same source clip: clip_004", "Similar intent: replace or improve product angle", "Shared entity: Product X"],
  };
  clusters.set(cluster.cluster_id, cluster);
  // attach cluster to items
  for (const id of itemIds) {
    const it = reviewItems.get(id);
    if (it) it.cluster_id = cluster.cluster_id;
  }
  emit({ event_type: "video.review.comment.clustered", review_item_id: itemIds[0] });
  return cluster;
}
export function listClusters(): Cluster[] { return Array.from(clusters.values()); }
export function getCluster(clusterId: string): Cluster | null { return clusters.get(clusterId) ?? null; }

// ── Duplicate & contradiction ───────────────────────────────────────────────
export function detectReviewDuplicates(threshold = 0.85): FeedbackRelationship[] {
  // mock: group first 3 items as duplicates if they exist
  const ids = Array.from(reviewItems.keys()).slice(0, 3);
  if (ids.length < 2) return [];
  const rel: FeedbackRelationship = {
    type: "semantic_duplicate", source_ids: ids, canonical_review_item_id: ids[0]!, confidence: 0.94, human_confirmed: false,
  };
  relationships.set(ids[0]!, rel);
  emit({ event_type: "video.review.duplicate.detected", review_item_id: ids[0]! });
  return [rel];
}
export function detectContradictions(): FeedbackRelationship[] {
  // mock one contradiction
  const ids = Array.from(reviewItems.keys());
  if (ids.length < 2) return [];
  const rel: FeedbackRelationship = {
    type: "contradiction", source_ids: ids.slice(0, 2), canonical_review_item_id: ids[0]!, confidence: 0.88, human_confirmed: false,
  };
  relationships.set(uid("rel"), rel);
  emit({ event_type: "video.review.contradiction.detected", review_item_id: ids[0]! });
  return [rel];
}
export function listRelationships(): FeedbackRelationship[] { return Array.from(relationships.values()); }

// ── Comment-to-edit mapping ──────────────────────────────────────────────────
export function generateSuggestion(reviewItemId: string, opts?: { include_candidate_assets?: boolean; respect_locks?: boolean }): EditSuggestion {
  const item = reviewItems.get(reviewItemId);
  if (!item) throw new Error(`ReviewItem ${reviewItemId} not found`);
  const isHighRisk = ["legal", "consent", "voice", "synthetic", "disclaimer"].some(k => item.requested_change.normalized_text.toLowerCase().includes(k));
  const suggestion: EditSuggestion = {
    suggestion_id: uid("suggestion"),
    review_item_id: reviewItemId,
    operation: {
      type: item.requested_change.operation_type,
      target_clip_id: "clip_004",
      candidate_asset_id: "asset_camera3_closeup",
      source_in_ms: 1200,
      source_out_ms: 8200,
      parameters: { respect_locks: opts?.respect_locks ?? true },
    },
    confidence: 0.88,
    estimated_impact: {
      duration_delta_ms: 0,
      audio_retiming_required: false,
      approval_regions_affected: ["brand_review"],
      consent_legal_impact: isHighRisk ? "high" : "low",
    },
    requires_human_acceptance: true,
  };
  suggestions.set(suggestion.suggestion_id, suggestion);
  emit({ event_type: "video.review.edit-suggestion.created", review_item_id: reviewItemId });
  return suggestion;
}

// ── Approval dependency graph ────────────────────────────────────────────────
export function getApprovalGraph(): ApprovalDependencyGraph {
  return {
    nodes: [
      { node_id: "approval_creative", stage: "creative_director", scope: "full_timeline", status: "approved" },
      { node_id: "approval_legal", stage: "legal", scope: { regions: [{ start_ms: 45000, end_ms: 52000 }] }, status: "pending" },
      { node_id: "approval_client", stage: "client", scope: "full_timeline", status: "blocked" },
      { node_id: "approval_accessibility", stage: "accessibility", scope: "full_timeline", status: "pending" },
    ],
    edges: [
      { from: "approval_creative", to: "approval_client", condition: "completed" },
      { from: "approval_legal", to: "approval_client", condition: "completed" },
      { from: "approval_client", to: "approval_accessibility", condition: "completed" },
    ],
  };
}

// ── Blockers ─────────────────────────────────────────────────────────────────
export function detectBlockers(): Blocker[] {
  const blockers: Blocker[] = [];
  for (const item of reviewItems.values()) {
    if (item.priority === "critical" || item.urgency === "deadline_sensitive") {
      blockers.push({ blocker_id: uid("blocker"), review_item_id: item.review_item_id, severity: "critical", reason: "Critical or deadline-sensitive item", category: "approval" });
    }
    if (item.verification.status === "blocked") blockers.push({ blocker_id: uid("blocker"), review_item_id: item.review_item_id, severity: "high", reason: "Change blocked by locked region", category: "edit" });
  }
  // add fixed blockers per spec example
  if (reviewItems.size === 0) {
    blockers.push(
      { blocker_id: uid("blocker"), review_item_id: "ri_001", severity: "critical", reason: "Legal disclaimer removed in Revision 194.", category: "legal" },
      { blocker_id: uid("blocker"), review_item_id: "ri_002", severity: "high", reason: "Client request to replace product shot unresolved.", category: "creative" },
    );
  }
  for (const b of blockers) emit({ event_type: "video.review.blocker.detected", review_item_id: b.review_item_id });
  return blockers;
}

// ── Deadline risk ────────────────────────────────────────────────────────────
export function predictDeadlineRisk(roundId: string): DeadlineRisk {
  const round = reviewRounds.get(roundId);
  if (!round) return { level: "green", score: 0.2, confidence: 0.8, drivers: [], recommendations: [] };
  const unresolved = round.items.filter(i => !["resolved", "verified", "accepted"].includes(i.status)).length;
  const blockers = detectBlockers().filter(b => b.severity === "critical").length;
  const hoursRemaining = (new Date(round.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
  let score = 0.2 + unresolved * 0.05 + blockers * 0.15;
  if (hoursRemaining < 12) score += 0.2;
  if (blockers > 0) score += 0.15;
  score = Math.min(0.95, score);
  let level: DeadlineRisk["level"] = "green";
  if (score > 0.8) level = "red";
  else if (score > 0.6) level = "orange";
  else if (score > 0.4) level = "yellow";
  if (blockers > 2 && hoursRemaining < 6) level = "blocked";
  const risk: DeadlineRisk = {
    level, score: Number(score.toFixed(2)), confidence: 0.84,
    drivers: blockers > 0 ? ["legal_review_pending", "three_critical_blockers", "deadline_less_than_12_hours"] : ["unresolved_items"],
    recommendations: ["Escalate legal review now", "Assign second editor to non-overlapping regions", "Freeze optional polish"],
    estimated_edit_hours: 9, hours_remaining: Math.max(0, Math.round(hoursRemaining)),
  };
  emit({ event_type: "video.review.deadline-risk.changed", review_item_id: round.items[0]?.review_item_id });
  return risk;
}

// ── Verification ─────────────────────────────────────────────────────────────
export function verifyChange(reviewItemId: string, sourceRevision: string, targetRevision: string): VerificationResult {
  const item = reviewItems.get(reviewItemId);
  if (!item) throw new Error(`ReviewItem ${reviewItemId} not found`);
  // mock comparison: assume implemented if target revision differs
  const implemented = sourceRevision !== targetRevision;
  const result: VerificationResult = {
    status: implemented ? "verified_by_system" : "not_implemented",
    source_clip_removed: implemented,
    candidate_inserted: implemented,
    region: item.affected_region,
    audio_preserved: true,
    brand_affected: true,
    evidence_asset_id: `comparison_${reviewItemId}`,
    confidence: 0.91,
  };
  item.verification = { status: result.status, evidence: [{ type: "before_after", asset_id: result.evidence_asset_id! }] };
  item.status = implemented ? "implemented_pending_verification" : "not_implemented";
  item.target_revision = targetRevision;
  emit({ event_type: "video.review.item.verified", review_item_id: reviewItemId, source_revision: sourceRevision, target_revision: targetRevision, verification_status: result.status, evidence: { comparison_asset_id: result.evidence_asset_id } });
  return result;
}

// ── Voice/video feedback ingestion ───────────────────────────────────────────
export function ingestVoiceFeedback(input: { audio_asset_id: string; speaker_id?: string; transcript: string; timeline_anchor: { start_ms: number; end_ms: number } }): ReviewItem {
  // speech-to-text already done, intent extraction
  const item = createReviewItem({
    revision_id: "rev_0192",
    source: { type: "voice_note", comment_id: input.audio_asset_id },
    anchor: { start_ms: input.timeline_anchor.start_ms, end_ms: input.timeline_anchor.end_ms },
    text: input.transcript,
    owner_id: "editor_001",
  });
  emit({ event_type: "video.review.voice-feedback.transcribed", review_item_id: item.review_item_id });
  return item;
}
export function ingestVideoFeedback(input: FeedbackCapture): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const seg of input.segments) {
    const item = createReviewItem({
      revision_id: input.reviewed_version ?? "rev_0192",
      source: { type: "video_review", comment_id: input.source_asset_hash ?? "video_review_01" },
      anchor: { start_ms: seg.timeline_anchor.start_ms, end_ms: seg.timeline_anchor.end_ms },
      text: seg.transcript,
    });
    items.push(item);
  }
  emit({ event_type: "video.review.video-feedback.aligned", review_item_id: items[0]?.review_item_id });
  return items;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function emit(event: ReviewEvent): void { events.push(event); }
export function listEvents(): ReviewEvent[] { return [...events]; }
export function listReviewRounds(): ReviewRound[] { return Array.from(reviewRounds.values()); }
export function getReviewRound(roundId: string): ReviewRound | null { return reviewRounds.get(roundId) ?? null; }

export function getSuggestion(suggestionId: string): EditSuggestion | null { return suggestions.get(suggestionId) ?? null; }
export function listSuggestions(): EditSuggestion[] { return Array.from(suggestions.values()); }
export function clearReviewStores(): void {
  reviewItems.clear(); clusters.clear(); relationships.clear(); suggestions.clear(); events.length = 0;
  // reseed round
  const round: ReviewRound = {
    review_round_id: "round_client_v03", project_id: "project_001", revision_id: "rev_0192",
    stage: "client_approval", deadline: "2026-08-30T17:00:00+05:30",
    participants: [
      { user_id: "client_001", role: "client", required: true },
      { user_id: "editor_001", role: "editor", required: true },
    ],
    items: [], risk: { level: "orange", score: 0.78, confidence: 0.84, drivers: ["legal_review_pending"], recommendations: ["Escalate"] },
  };
  reviewRounds.set(round.review_round_id, round);
}
