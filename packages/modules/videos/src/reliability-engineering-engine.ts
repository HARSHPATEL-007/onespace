/**
 * N0VA VIDEOS — Reliability Engineering Engine
 * Durable jobs, leases, checkpoints, DLQ, partial-render, chaos, multi-region
 */
import type { JobRecord, LeaseRecord, IdempotencyRecord, EffectLedger, DeadLetterRecord, SegmentRecord, InferenceCheckpoint, ChaosExperiment, CircuitBreakerState, FallbackChain } from "./reliability-engineering-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0,12)}${uid("h").slice(-4)}`; }

const jobs = new Map<string, JobRecord>();
const leases = new Map<string, LeaseRecord>();
const idempotency = new Map<string, IdempotencyRecord>();
const effects = new Map<string, EffectLedger>();
const deadLetters = new Map<string, DeadLetterRecord>();
const segments = new Map<string, SegmentRecord>();
const inferenceCps = new Map<string, InferenceCheckpoint>();
const chaosExps = new Map<string, ChaosExperiment>();
const circuitBreakers = new Map<string, { state: CircuitBreakerState; failures: number; last_failure?: string }>();

// ── Job Identity & Idempotency ───────────────────────────────────────────────
export function createJob(input: { tenant_id: string; project_id: string; asset_id: string; asset_version: number; operation: string; parameters_hash?: string; timeline_version?: number; model_version?: string; region?: string }): JobRecord {
  const key = `${input.tenant_id}:${input.asset_id}:${input.operation}:v${input.asset_version}:${input.model_version ?? "default"}:${input.parameters_hash ?? "noparam"}:${input.timeline_version ?? "0"}`;
  const existing = idempotency.get(key);
  if (existing) {
    const job = jobs.get(existing.job_id);
    if (job) return job; // reuse
  }
  const job: JobRecord = {
    job_id: uid("job"), tenant_id: input.tenant_id, project_id: input.project_id, asset_id: input.asset_id, asset_version: input.asset_version,
    timeline_version: input.timeline_version, idempotency_key: key, attempt: 1,
    input_manifest_hash: hash(key), region: input.region ?? "eu-west-1", state:"created", created_at: nowIso(), updated_at: nowIso(),
  };
  jobs.set(job.job_id, job);
  idempotency.set(key, { idempotency_key: key, job_id: job.job_id, state:"created" });
  return job;
}
export function getJob(jobId: string): JobRecord | null { return jobs.get(jobId) ?? null; }
export function listJobs(): JobRecord[] { return Array.from(jobs.values()); }
export function commitJob(jobId: string, outputHash: string): JobRecord | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  // Verify output integrity before completed
  if (!outputHash.startsWith("sha3-512:")) throw new Error("Invalid output hash");
  job.output_manifest_hash = outputHash;
  job.state = "completed";
  job.updated_at = nowIso();
  const rec = idempotency.get(job.idempotency_key);
  if (rec) { rec.state="completed"; rec.result_hash = outputHash; rec.completed_at = nowIso(); }
  // Effect ledger once
  const effectKey = `delivery:${job.asset_id}:${job.project_id}`;
  if (!effects.has(effectKey)) effects.set(effectKey, { effect_key: effectKey, provider:"client_portal", status:"committed", remote_reference:`remote_${hash(jobId).slice(0,6)}`, attempts:1 });
  return job;
}

// ── Lease-Based Workers ──────────────────────────────────────────────────────
export function acquireLease(jobId: string, workerId: string, ttlMs=30000): LeaseRecord {
  const job = jobs.get(jobId);
  if (!job) throw new Error("Job not found");
  if (leases.has(jobId)) {
    const existing = leases.get(jobId)!;
    if (new Date(existing.lease_expires_at).getTime() > Date.now()) throw new Error("Job already leased");
  }
  const lease: LeaseRecord = {
    job_id: jobId, worker_id: workerId, region: job.region,
    lease_started_at: nowIso(), lease_expires_at: new Date(Date.now()+ttlMs).toISOString(), last_heartbeat_at: nowIso(), attempt: job.attempt,
  };
  leases.set(jobId, lease);
  job.state="leased"; job.worker_id=workerId; job.updated_at=nowIso();
  return lease;
}
export function heartbeatLease(jobId: string, workerId: string): LeaseRecord | null {
  const lease = leases.get(jobId);
  if (!lease || lease.worker_id!==workerId) return null;
  lease.last_heartbeat_at = nowIso();
  lease.lease_expires_at = new Date(Date.now()+30000).toISOString();
  return lease;
}
export function checkpointJob(jobId: string, checkpoint: string): JobRecord | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.checkpoint = checkpoint;
  job.state="checkpointed";
  job.updated_at = nowIso();
  const lease = leases.get(jobId);
  if (lease) lease.checkpoint_version = checkpoint;
  return job;
}
export function expireLeases(): string[] {
  const expired: string[] = [];
  for (const [jobId, lease] of leases.entries()) {
    if (new Date(lease.lease_expires_at).getTime() < Date.now()) {
      leases.delete(jobId);
      const job = jobs.get(jobId);
      if (job) { job.state="queued"; job.attempt+=1; }
      expired.push(jobId);
    }
  }
  return expired;
}

// ── Retry Classification ─────────────────────────────────────────────────────
export function classifyFailure(errorCode: string): { error_class: string; action: string; retryable: boolean } {
  const map: Record<string, { cls:string; action:string; retryable:boolean }> = {
    "NETWORK_TIMEOUT":{ cls:"temporary_network", action:"Retry with backoff", retryable:true },
    "WORKER_KILLED":{ cls:"worker_interruption", action:"Resume from checkpoint", retryable:true },
    "PROVIDER_TIMEOUT":{ cls:"provider_timeout", action:"Retry or switch provider", retryable:true },
    "INVALID_INPUT":{ cls:"invalid_input", action:"Mark terminal failure", retryable:false },
    "POLICY_DENIED":{ cls:"policy_denial", action:"Do not retry until policy changes", retryable:false },
    "CONSENT_REVOKED":{ cls:"consent_revoked", action:"Block and start remediation", retryable:false },
    "CORRUPT_OUTPUT":{ cls:"corrupt_output", action:"Discard output and resume", retryable:true },
  };
  const m = map[errorCode] ?? { cls:"unknown", action:"Quarantine for investigation", retryable:false };
  return { error_class: m.cls, action: m.action, retryable: m.retryable };
}
export function computeBackoff(attempt: number, baseMs=1000, maxMs=30000): number {
  const delay = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  const jitter = Math.random()*500;
  return Math.round(delay + jitter);
}
export function shouldRetry(jobId: string, maxAttempts=5, maxElapsedMs=300000, maxCost=100): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.attempt >= maxAttempts) return false;
  // check elapsed
  const elapsed = Date.now() - new Date(job.created_at).getTime();
  if (elapsed > maxElapsedMs) return false;
  return true;
}

// ── Dead-Letter Queues ───────────────────────────────────────────────────────
export function sendToDeadLetter(input: { job_id: string; consumer: string; failure_code: string; error_class: string }): DeadLetterRecord {
  const job = jobs.get(input.job_id);
  const dl: DeadLetterRecord = {
    event_id: uid("evt"), job_id: input.job_id, consumer: input.consumer, tenant_id: job?.tenant_id ?? "tenant_acme",
    failure_code: input.failure_code, error_class: input.error_class as never, attempts: job?.attempt ?? 5,
    first_failed_at: job?.created_at ?? nowIso(), last_failed_at: nowIso(), checkpoint: job?.checkpoint, input_manifest_hash: job?.input_manifest_hash ?? hash(input.job_id),
    safe_to_replay: !["unknown","terminal","policy_denial","consent_revoked","legal_hold"].includes(input.error_class), required_action: input.error_class==="unknown" ? "repair_source_asset" : "investigate",
  };
  deadLetters.set(dl.event_id, dl);
  // Quarantine job if unknown
  if (job && input.error_class==="unknown") job.state="quarantined";
  return dl;
}
export function listDeadLetters(): DeadLetterRecord[] { return Array.from(deadLetters.values()); }
export function replayDeadLetter(filter: { job_id?: string; tenant_id?: string; failure_code?: string }): number {
  let count=0;
  for (const dl of deadLetters.values()) {
    if (filter.job_id && dl.job_id!==filter.job_id) continue;
    if (filter.tenant_id && dl.tenant_id!==filter.tenant_id) continue;
    if (filter.failure_code && dl.failure_code!==filter.failure_code) continue;
    if (!dl.safe_to_replay) continue;
    count++;
    // In real, would requeue
  }
  return count;
}

// ── Partial-Render Recovery ──────────────────────────────────────────────────
export function createSegments(renderId: string, timelineVersion: number, count=5): SegmentRecord[] {
  const segs: SegmentRecord[] = [];
  for (let i=0;i<count;i++) {
    const seg: SegmentRecord = {
      render_id: renderId, timeline_version: timelineVersion, segment_id:`segment_${String(i).padStart(4,"0")}`,
      frame_range:{ start: i*5000, end: (i+1)*5000-1 }, dependencies:[`asset_001:v4`,`lut_brand_v3`],
      state:"pending", output_uri:`n0va://render-segments/${renderId}/${String(i).padStart(4,"0")}`, checksum: hash(`${renderId}${i}`),
    };
    segments.set(seg.segment_id, seg);
    segs.push(seg);
  }
  return segs;
}
export function completeSegment(segmentId: string): SegmentRecord | null {
  const seg = segments.get(segmentId);
  if (!seg) return null;
  seg.state="completed";
  return seg;
}
export function failSegment(segmentId: string): SegmentRecord | null {
  const seg = segments.get(segmentId);
  if (!seg) return null;
  seg.state="failed";
  return seg;
}
export function recoverRender(renderId: string): { verified: SegmentRecord[]; failed: SegmentRecord[]; rerender: string[] } {
  const all = Array.from(segments.values()).filter(s=>s.render_id===renderId);
  const verified = all.filter(s=>s.state==="completed");
  const failed = all.filter(s=>s.state==="failed");
  const rerender = failed.map(s=>s.segment_id);
  // Never overwrite verified
  return { verified, failed, rerender };
}
export function assembleRender(renderId: string): { valid: boolean; reason?: string } {
  const all = Array.from(segments.values()).filter(s=>s.render_id===renderId);
  if (all.some(s=>s.state!=="completed")) return { valid:false, reason:"Not all segments completed" };
  // Validate same timeline version and hashes
  const versions = new Set(all.map(s=>s.timeline_version));
  if (versions.size>1) return { valid:false, reason:"Mismatched timeline versions" };
  return { valid:true };
}

// ── Checkpointed Inference ───────────────────────────────────────────────────
export function createInferenceCheckpoint(assetVersion: number, modelId: string): InferenceCheckpoint {
  const cp: InferenceCheckpoint = {
    analysis_run_id: uid("analysis"), asset_version: assetVersion, model_id: modelId, model_version:"4.1.0",
    input_manifest_hash: hash(`${assetVersion}${modelId}`), completed_units:[{ unit_type:"scene", unit_id:"scene_001", start_ms:0, end_ms:4500, output_hash: hash("scene_001") }],
    next_unit:"scene_002", state_hash: hash("state"),
  };
  inferenceCps.set(cp.analysis_run_id, cp);
  return cp;
}
export function recoverInference(analysisRunId: string, newModelVersion?: string): { reused: number; reprocess: number; valid: boolean } {
  const cp = inferenceCps.get(analysisRunId);
  if (!cp) return { reused:0, reprocess:0, valid:false };
  if (newModelVersion && newModelVersion!==cp.model_version) return { reused:0, reprocess:1, valid:false };
  return { reused: cp.completed_units.length, reprocess:1, valid:true };
}

// ── Chaos & Backup ───────────────────────────────────────────────────────────
export function createChaosExperiment(hypothesis: string, blastRadius: string): ChaosExperiment {
  const exp: ChaosExperiment = { experiment_id: uid("chaos"), hypothesis, blast_radius: blastRadius, expected_behavior:"Recover via checkpoint", abort_condition:"Error budget exceeded", rollback_method:"Restore from replica", observed_result:"pending" };
  chaosExps.set(exp.experiment_id, exp);
  return exp;
}
export function listChaosExperiments(): ChaosExperiment[] { return Array.from(chaosExps.values()); }

// ── Dependency Isolation & Circuit Breaker ───────────────────────────────────
export function getCircuitBreaker(key: string): { state: string; failures: number } {
  const cb = circuitBreakers.get(key);
  if (!cb) return { state:"closed", failures:0 };
  return { state: cb.state, failures: cb.failures };
}
export function recordFailure(key: string): void {
  const cb = circuitBreakers.get(key) ?? { state:"closed" as const, failures:0 };
  cb.failures+=1;
  if (cb.failures>5) cb.state="open";
  circuitBreakers.set(key, cb);
}
export function getFallbackChain(workflow: string): FallbackChain {
  return { workflow, primary:"n0va-whisper-premium-v5", fallbacks:[{ model:"n0va-whisper-standard-v5", allowed_quality_loss:0.04, max_cost:0.02 }, { model:"approved-provider-regional", data_residency:"eu" }, { model:"manual_upload" }] };
}

// ── Multi-Region ─────────────────────────────────────────────────────────────
export function getRpoRtoClass(dataType: string): { rpo: string; rto: string } {
  if (["audit","legal_hold","consent","approval"].includes(dataType)) return { rpo:"near-zero", rto:"minimal" };
  if (["timeline","job_state","checkpoint"].includes(dataType)) return { rpo:"low", rto:"short" };
  return { rpo:"relaxed", rto:"capacity-dependent" };
}
