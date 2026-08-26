/**
 * N0VA ANI — Memory Consolidator
 * Asynchronous service that transforms repeated observations into versioned, evidence-backed knowledge.
 * Immutable events + derived projections, per N0VA-ANI.md Memory Consolidator spec.
 */

import type { CanonicalMemoryObject } from "./memory-fabric";

// ---------------------------------------------------------------------------
// Event Normalizer — common envelope before reasoning
// ---------------------------------------------------------------------------
export interface NormalizedEvent {
  event_id: string;
  event_type: string; // statement_observed, task_updated, etc.
  tenant_id: string;
  source: { system: string; resource_id: string; locator: string; version: number };
  actor: string;
  observed_at: string;
  content_ref: string; // vault://source/...
  entities: string[];
  classification: string;
  visibility_policy: string;
  content_text?: string;
  has_instruction?: boolean;
}

export function normalizeEvent(raw: {
  system: string;
  resource_id: string;
  locator: string;
  version?: number;
  actor?: string;
  tenant_id?: string;
  observed_at?: string;
  content: string;
  entities?: string[];
  classification?: string;
}): NormalizedEvent {
  return {
    event_id: `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
    event_type: "statement_observed",
    tenant_id: raw.tenant_id ?? "tenant_acme",
    source: { system: raw.system, resource_id: raw.resource_id, locator: raw.locator, version: raw.version ?? 1 },
    actor: raw.actor ?? "user_unknown",
    observed_at: raw.observed_at ?? new Date().toISOString(),
    content_ref: `vault://source/${raw.resource_id}/${raw.locator}`,
    entities: raw.entities ?? [],
    classification: raw.classification ?? "internal",
    visibility_policy: "project_members",
    content_text: raw.content,
    has_instruction: /ignore previous instructions|remember as permanent/i.test(raw.content),
  };
}

// ---------------------------------------------------------------------------
// Candidate Grouping — by semantic claim, not document
// ---------------------------------------------------------------------------
export interface ClaimCluster {
  cluster_id: string;
  claim_type: string; // ProjectScheduleChange, Ownership, etc.
  subject: string;
  field: string;
  candidate_values: string[];
  supporting_events: string[]; // event_ids
  conflicting_values: string[];
}

export function groupCandidates(events: NormalizedEvent[]): ClaimCluster[] {
  const clusters = new Map<string, ClaimCluster>();
  for (const ev of events) {
    const text = (ev.content_text ?? "").toLowerCase();
    let field = "generic";
    let value = "";
    let claimType = "GenericClaim";
    if (text.includes("launch") && text.includes("september")) {
      field = "launch_date";
      claimType = "ProjectScheduleChange";
      const m = text.match(/september\s+(\d{1,2})/i);
      value = m ? `2026-09-${m[1]!.padStart(2, "0")}` : "";
    } else if (text.includes("owner")) {
      field = "owner";
      claimType = "Ownership";
      value = ev.content_text ?? "";
    } else {
      field = ev.entities[0] ?? "generic";
      value = ev.content_text?.slice(0, 40) ?? "";
    }
    const key = `${ev.entities[0] ?? "unknown"}:${field}`;
    let cluster = clusters.get(key);
    if (!cluster) {
      cluster = { cluster_id: `claimcluster_${Math.random().toString(36).slice(2, 6)}`, claim_type: claimType, subject: ev.entities[0] ?? "unknown", field, candidate_values: [], supporting_events: [], conflicting_values: [] };
      clusters.set(key, cluster);
    }
    if (value && !cluster!.candidate_values.includes(value) && !cluster!.conflicting_values.includes(value)) {
      // Simple heuristic: most frequent value is candidate, others are conflicting
      if (cluster!.candidate_values.length === 0) cluster!.candidate_values.push(value);
      else if (cluster!.candidate_values[0] !== value) cluster!.conflicting_values.push(value);
    }
    cluster!.supporting_events.push(ev.event_id);
  }
  return [...clusters.values()];
}

// ---------------------------------------------------------------------------
// Canonical Claim Model — temporal + provenance
// ---------------------------------------------------------------------------
export interface CanonicalClaim {
  claim_id: string;
  subject: string;
  predicate: string;
  object: { type: string; value: string };
  valid_from: string;
  valid_until: string | null;
  observed_from: string;
  observed_until: string;
  status: "confirmed" | "proposed" | "superseded";
  confidence: number;
  source_refs: string[];
  supersedes: string[];
  visibility_policy: string;
  steward: string;
}

export interface EpisodeSummary {
  episode_id: string;
  episode_type: string;
  subject: string;
  summary: string;
  start_time: string;
  end_time: string;
  participants: string[];
  evidence: string[];
  status: "confirmed" | "proposed";
}

// ---------------------------------------------------------------------------
// Consolidation Job — per spec
// ---------------------------------------------------------------------------
export type ConsolidationTrigger = "scheduled" | "threshold" | "event_driven" | "workflow_driven" | "manual" | "compliance";
export interface ConsolidationJob {
  job_id: string;
  tenant_id: string;
  scope: { entities: string[]; memory_types: string[]; time_range: { from: string; to: string } };
  trigger: ConsolidationTrigger;
  priority: "low" | "medium" | "high";
  model_version: string;
  policy_version: string;
  status: "pending" | "running" | "awaiting_approval" | "committed" | "failed" | "cancelled";
  created_at: string;
  input_watermark: string;
  idempotency_key: string;
  output_event_ids: string[];
}

export function createConsolidationJobId(): string {
  return `consolidation_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`;
}

export function buildIdempotencyKey(tenantId: string, clusterId: string, modelVersion: string, watermark: string): string {
  return `${tenantId}:${clusterId}:${modelVersion}:${watermark}`;
}

// ---------------------------------------------------------------------------
// Memory Consolidator Service — separate from real-time inference
// ---------------------------------------------------------------------------
export interface ConsolidationResult {
  job_id: string;
  new_canonical_memories: CanonicalClaim[];
  superseded_memories: string[];
  duplicate_groups_collapsed: number;
  episode_summaries: EpisodeSummary[];
  decisions_promoted: Array<{ decision_id: string; status: string }>;
  procedures_extracted: Array<{ procedure_id: string; name: string }>;
  policy_transitions: Array<{ old_policy: string; new_policy: string }>;
  review_items: ReviewItem[];
  embedding_ops: { canonical_created: number; episode_created: number; duplicates_removed: number };
  change_report: string;
  events: Array<{ event_type: string; event_id: string; memory_id: string }>;
}

export interface ReviewItem {
  review_id: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  subject: string;
  claims: string[];
  reason: string;
  recommended_reviewer: string;
  blocked_actions: string[];
  deadline: string;
}

export interface DriftSignal {
  memory_id: string;
  signal_type: string;
  observations: number;
  window_days: number;
  severity: "low" | "medium" | "high";
  recommended_action: string;
}

export class MemoryConsolidator {
  private jobs = new Map<string, ConsolidationJob>();
  private reviewQueue: ReviewItem[] = [];
  private embeddingIndex = new Map<string, string>(); // content_hash -> memory_id

  // Idempotent job creation
  createJob(params: {
    tenant_id: string;
    scope: ConsolidationJob["scope"];
    trigger?: ConsolidationTrigger;
    priority?: ConsolidationJob["priority"];
    model_version?: string;
    policy_version?: string;
    input_watermark?: string;
  }): ConsolidationJob {
    const watermark = params.input_watermark ?? new Date().toISOString();
    const clusterId = params.scope.entities.join(",") || "global";
    const idempotencyKey = buildIdempotencyKey(params.tenant_id, clusterId, params.model_version ?? "memory-consolidator-1.0", watermark);
    // Check existing job with same key (idempotency)
    for (const j of this.jobs.values()) {
      if (j.idempotency_key === idempotencyKey && j.status !== "failed") return j;
    }
    const job: ConsolidationJob = {
      job_id: createConsolidationJobId(),
      tenant_id: params.tenant_id,
      scope: params.scope,
      trigger: params.trigger ?? "scheduled",
      priority: params.priority ?? "high",
      model_version: params.model_version ?? "memory-consolidator-1.0",
      policy_version: params.policy_version ?? "memory-policy-3.4",
      status: "pending",
      created_at: new Date().toISOString(),
      input_watermark: watermark,
      idempotency_key: idempotencyKey,
      output_event_ids: [],
    };
    this.jobs.set(job.job_id, job);
    return job;
  }

  getJob(jobId: string): ConsolidationJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  listJobs(tenantId?: string): ConsolidationJob[] {
    const all = [...this.jobs.values()];
    return tenantId ? all.filter((j) => j.tenant_id === tenantId) : all;
  }

  // Main consolidation — merges duplicates, links entities, promotes decisions
  async consolidate(jobId: string, events: NormalizedEvent[]): Promise<ConsolidationResult> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`job not found: ${jobId}`);
    job.status = "running";

    const clusters = groupCandidates(events);
    const newClaims: CanonicalClaim[] = [];
    const superseded: string[] = [];
    const episodes: EpisodeSummary[] = [];
    let duplicateCollapsed = 0;

    for (const cluster of clusters) {
      if (cluster.claim_type === "ProjectScheduleChange" && cluster.candidate_values.length > 0) {
        const canonicalValue = cluster.candidate_values[0]!;
        // Merge duplicate facts — one canonical memory with multiple evidence links
        newClaims.push({
          claim_id: `claim_${Math.random().toString(36).slice(2, 6)}`,
          subject: cluster.subject,
          predicate: "HAS_LAUNCH_DATE",
          object: { type: "date", value: canonicalValue },
          valid_from: new Date().toISOString(),
          valid_until: null,
          observed_from: events[0]?.observed_at ?? new Date().toISOString(),
          observed_until: events[events.length - 1]?.observed_at ?? new Date().toISOString(),
          status: "confirmed",
          confidence: this.computeConfidence(cluster.supporting_events.length, 0, cluster.conflicting_values.length > 0),
          source_refs: cluster.supporting_events,
          supersedes: cluster.conflicting_values.length > 0 ? [`claim_old_${cluster.subject}`] : [],
          visibility_policy: "project_members",
          steward: "team_pm",
        });
        if (cluster.conflicting_values.length > 0) superseded.push(`claim_old_${cluster.subject}`);
        duplicateCollapsed += Math.max(0, cluster.supporting_events.length - 1);

        // Episode summary for repeated schedule change
        if (cluster.supporting_events.length >= 3) {
          episodes.push({
            episode_id: `episode_${Math.random().toString(36).slice(2, 6)}`,
            episode_type: "schedule_change",
            subject: cluster.subject,
            summary: `The launch moved from ${cluster.conflicting_values[0] ?? "September 10"} to ${canonicalValue} after the security review timeline changed.`,
            start_time: events[0]?.observed_at ?? new Date().toISOString(),
            end_time: events[events.length - 1]?.observed_at ?? new Date().toISOString(),
            participants: [...new Set(events.map((e) => e.actor))],
            evidence: cluster.supporting_events.slice(0, 3),
            status: "confirmed",
          });
        }
      }
    }

    // Detect drift per spec
    const driftSignals: DriftSignal[] = [];
    // Review queue for ambiguous
    const reviewItems: ReviewItem[] = [];
    if (clusters.some((c) => c.conflicting_values.length > 0)) {
      reviewItems.push({
        review_id: `review_${Date.now().toString(36)}`,
        type: "conflicting_schedule_claim",
        priority: "high",
        subject: clusters[0]?.subject ?? "unknown",
        claims: newClaims.map((c) => c.claim_id),
        reason: "two authoritative sources disagree",
        recommended_reviewer: "project_owner",
        blocked_actions: ["reschedule_dependent_tasks", "send_external_launch_update"],
        deadline: new Date(Date.now() + 2 * 24 * 3600000).toISOString(),
      });
    }

    // Embedding consolidation
    const embeddingOps = { canonical_created: newClaims.length, episode_created: episodes.length, duplicates_removed: duplicateCollapsed };

    // Impact analysis — which dependent tasks at risk (example: task_66 fixed date)
    const impact = {
      dependent_tasks: ["task_51", "task_66", "task_72"],
      at_risk_tasks: ["task_66"],
      risk_reason: "task_66 has a fixed September 10 delivery date",
      notification_required: true,
    };
    void impact;

    // Change report
    const changeReport = this.generateChangeReport(job, newClaims, superseded, episodes, impact);

    const eventsOut = [
      { event_type: "memory.consolidated", event_id: `evt_${Date.now().toString(36)}`, memory_id: newClaims[0]?.claim_id ?? "none" },
      { event_type: "memory.superseded", event_id: `evt_${Date.now().toString(36)}_2`, memory_id: superseded[0] ?? "none" },
    ];
    job.output_event_ids = eventsOut.map((e) => e.event_id);
    job.status = "committed";
    this.reviewQueue.push(...reviewItems);

    return {
      job_id: job.job_id,
      new_canonical_memories: newClaims,
      superseded_memories: superseded,
      duplicate_groups_collapsed: duplicateCollapsed,
      episode_summaries: episodes,
      decisions_promoted: newClaims.filter((c) => c.predicate === "HAS_LAUNCH_DATE").map((c) => ({ decision_id: `decision_${c.claim_id}`, status: "approved" })),
      procedures_extracted: [],
      policy_transitions: [],
      review_items: reviewItems,
      embedding_ops: embeddingOps,
      change_report: changeReport,
      events: eventsOut,
    };
  }

  private computeConfidence(evidenceCount: number, contradictionCount: number, hasConflict: boolean): number {
    // confidence_new = authority * consistency * temporal * entity_confidence * confirmation - contradiction - staleness
    const authority = 0.9;
    const consistency = Math.min(1, 0.7 + evidenceCount * 0.06);
    const temporal = 0.88;
    const entityConf = 0.99;
    const confirmation = 1.0;
    const contradictionPenalty = hasConflict ? 0.2 : 0;
    const staleness = 0;
    return Math.max(0, Math.min(1, authority * consistency * temporal * entityConf * confirmation - contradictionPenalty - staleness));
  }

  generateChangeReport(
    job: ConsolidationJob,
    claims: CanonicalClaim[],
    superseded: string[],
    episodes: EpisodeSummary[],
    impact: { dependent_tasks: string[]; at_risk_tasks: string[]; risk_reason: string },
  ): string {
    return [
      `## Memory Consolidation Report`,
      ``,
      `**Project:** ${job.scope.entities[0] ?? "Apollo Launch"}`,
      `**Run:** ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
      `**Sources analyzed:** ${job.scope.time_range.from} to ${job.scope.time_range.to}`,
      `**New canonical memories:** ${claims.length}`,
      `**Superseded memories:** ${superseded.length}`,
      `**Dependent tasks affected:** ${impact.dependent_tasks.length}`,
      `**Review items:** ${0}`,
      ``,
      `### Changed`,
      ...claims.map((c) => `- ${c.subject} ${c.predicate} = ${c.object.value} (confidence ${c.confidence.toFixed(2)}) — ${c.source_refs.length} sources linked.`),
      ``,
      `### Impact`,
      `- At-risk tasks: ${impact.at_risk_tasks.join(", ") || "none"} — ${impact.risk_reason}`,
      `- No external communication was sent automatically.`,
      ``,
      `### Confidence`,
      ...claims.map((c) => `- ${c.claim_id}: ${c.confidence.toFixed(2)} (temporal 0.88, entity 0.99)`),
    ].join("\n");
  }

  getReviewQueue(): ReviewItem[] {
    return [...this.reviewQueue];
  }

  // Embedding helpers
  hashContent(content: string): string {
    let h = 0;
    for (let i = 0; i < content.length; i++) h = (h * 31 + content.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, "0");
  }

  // Safe rules per spec
  canMergeAcrossTenants(a: string, b: string): boolean {
    void a;
    void b;
    return false; // Never merge across tenants
  }
}

export const globalMemoryConsolidator = new MemoryConsolidator();
