/**
 * N0VA VIDEOS — Reliability Engineering Types
 * Recoverable jobs, deterministic workflows, isolated dependencies, graceful degradation
 */

export type JobState = "created" | "queued" | "leased" | "running" | "checkpointed" | "paused" | "retrying" | "partially_completed" | "awaiting_dependency" | "completed" | "failed_retryable" | "failed_terminal" | "cancelled" | "quarantined" | "recovered";
export type FailureClass = "temporary_network" | "worker_interruption" | "capacity_shortage" | "provider_timeout" | "invalid_input" | "policy_denial" | "consent_revoked" | "legal_hold" | "corrupt_output" | "unknown";

export type JobRecord = {
  job_id: string; tenant_id: string; project_id: string; asset_id: string; asset_version: number;
  timeline_version?: number; workflow_id?: string; idempotency_key: string; attempt: number;
  checkpoint?: string; input_manifest_hash: string; output_manifest_hash?: string; policy_decision?: string;
  region: string; worker_id?: string; state: JobState; recovery_instructions?: string;
  created_at: string; updated_at: string;
};

export type LeaseRecord = {
  job_id: string; worker_id: string; region: string;
  lease_started_at: string; lease_expires_at: string; last_heartbeat_at: string;
  checkpoint_version?: string; attempt: number;
};

export type IdempotencyRecord = {
  idempotency_key: string; job_id: string; state: JobState; result_hash?: string; completed_at?: string;
};

export type EffectLedger = {
  effect_key: string; provider: string; status: "pending" | "committed" | "failed"; remote_reference?: string; attempts: number;
};

export type DeadLetterRecord = {
  event_id: string; job_id: string; consumer: string; tenant_id: string;
  failure_code: string; error_class: FailureClass; attempts: number;
  first_failed_at: string; last_failed_at: string; checkpoint?: string; input_manifest_hash: string; safe_to_replay: boolean; required_action: string;
};

export type SegmentRecord = {
  render_id: string; timeline_version: number; segment_id: string;
  frame_range: { start: number; end: number }; dependencies: string[];
  state: "pending" | "completed" | "failed"; output_uri: string; checksum: string;
};

export type InferenceCheckpoint = {
  analysis_run_id: string; asset_version: number; model_id: string; model_version: string;
  input_manifest_hash: string; completed_units: { unit_type: string; unit_id: string; start_ms: number; end_ms: number; output_hash: string }[];
  next_unit: string; state_hash: string;
};

export type ChaosExperiment = {
  experiment_id: string; hypothesis: string; blast_radius: string; tenant_scope?: string;
  expected_behavior: string; abort_condition: string; rollback_method: string; observed_result?: string;
};

export type CircuitBreakerState = "closed" | "open" | "half_open";

export type FallbackChain = {
  workflow: string; primary: string; fallbacks: { model: string; allowed_quality_loss?: number; max_cost?: number; data_residency?: string }[];
};

export type ReliabilitySlo = {
  workflow: string; successful_recovery_rate: number; duplicate_side_effect_rate: number; checkpoint_recovery_success: number;
};
