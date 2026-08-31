#!/usr/bin/env node
import { createJob, commitJob, acquireLease, heartbeatLease, checkpointJob, expireLeases, classifyFailure, computeBackoff, sendToDeadLetter, createSegments, completeSegment, failSegment, recoverRender, assembleRender, createInferenceCheckpoint, recoverInference, createChaosExperiment, getCircuitBreaker, recordFailure, getFallbackChain } from "./src/reliability-engineering-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Reliability Engineering Smoke ===");

// 1. Job identity deterministic business key
let job1 = createJob({ tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", asset_version:4, operation:"analysis", parameters_hash:"abc", model_version:"model_n0va_scene_v4" });
assert(job1.idempotency_key==="tenant_acme:asset_001:analysis:v4:model_n0va_scene_v4:abc:0", `key ${job1.idempotency_key}`);
let jobDup = createJob({ tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", asset_version:4, operation:"analysis", parameters_hash:"abc", model_version:"model_n0va_scene_v4" });
assert(jobDup.job_id===job1.job_id, "idempotent duplicate returns existing job");
console.log(`Job ${job1.job_id} key ${job1.idempotency_key}`);

// 2. Atomic commit verifies output hash
let committed = commitJob(job1.job_id, "sha3-512:output1234567890");
assert(committed.state==="completed" && committed.output_manifest_hash.startsWith("sha3-512:"), "commit completed with hash");
console.log(`Commit output ${committed.output_manifest_hash.slice(0,12)}`);

// 3. Lease-based workers short-lived heartbeat checkpoint
let job2 = createJob({ tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_002", asset_version:1, operation:"transcode" });
let lease = acquireLease(job2.job_id,"worker_gpu_22",30000);
assert(lease.worker_id==="worker_gpu_22" && lease.lease_expires_at, "lease acquired");
let hb = heartbeatLease(job2.job_id,"worker_gpu_22");
assert(hb.last_heartbeat_at, "heartbeat");
let cp = checkpointJob(job2.job_id,"scene_084");
assert(cp.checkpoint==="scene_084" && cp.state==="checkpointed", "checkpoint scene_084");
let expired = expireLeases(); // none expired yet
assert(Array.isArray(expired), "expire check");
console.log(`Lease ${lease.worker_id} checkpoint ${cp.checkpoint}`);

// 4. Retry classification
let cls = classifyFailure("PROVIDER_TIMEOUT");
assert(cls.error_class==="provider_timeout" && cls.retryable===true, "provider timeout retryable");
let cls2 = classifyFailure("INVALID_INPUT");
assert(cls2.retryable===false, "invalid input terminal");
let backoff = computeBackoff(3);
assert(backoff>=8000 && backoff<=30500, `backoff 3 ${backoff}ms`);
console.log(`Backoff 3 ${backoff}ms`);

// 5. Dead-letter with tenant isolation
let dl = sendToDeadLetter({ job_id: job2.job_id, consumer:"analysis-orchestrator", failure_code:"MODEL_INPUT_CORRUPT", error_class:"terminal" });
assert(dl.tenant_id==="tenant_acme" && dl.safe_to_replay===false, "DLQ terminal not safe to replay");
console.log(`DLQ ${dl.event_id} ${dl.failure_code} safe ${dl.safe_to_replay}`);

// 6. Partial-render recovery immutable segments
let segs = createSegments("render_0077",12,5);
assert(segs.length===5 && segs[0].output_uri.includes("render_0077"), "5 segments");
completeSegment(segs[0].segment_id); completeSegment(segs[1].segment_id); failSegment(segs[2].segment_id);
let rec = recoverRender("render_0077");
assert(rec.verified.length===2 && rec.failed.length===1 && rec.rerender.includes(segs[2].segment_id), "recover verified 2 failed 1 rerender 2 never overwrite verified");
let asmFail = assembleRender("render_0077");
assert(asmFail.valid===false, "assemble fails not all completed");
completeSegment(segs[2].segment_id); completeSegment(segs[3].segment_id); completeSegment(segs[4].segment_id);
let asmPass = assembleRender("render_0077");
assert(asmPass.valid===true, "assemble valid after all completed");
console.log(`Partial render verified ${rec.verified.length} rerender ${rec.rerender.join(",")}`);

// 7. Checkpointed inference semantic units
let cpInf = createInferenceCheckpoint(4,"n0va-scene-model");
assert(cpInf.completed_units[0].unit_id==="scene_001" && cpInf.next_unit==="scene_002", "inference scene_001→scene_002");
let recInf = recoverInference(cpInf.analysis_run_id);
assert(recInf.reused===1 && recInf.valid===true, "reuse 1");
let recInf2 = recoverInference(cpInf.analysis_run_id,"4.2.0");
assert(recInf2.valid===false, "model version change invalid");
console.log(`Inference reuse ${recInf.reused} valid ${recInf.valid}`);

// 8. Chaos & circuit breaker & fallback
let chaos = createChaosExperiment("Kill GPU during 8K rendering","tenant_acme");
assert(chaos.experiment_id && chaos.hypothesis.includes("Kill GPU"), "chaos experiment");
let cbBefore = getCircuitBreaker("provider:transcription:eu-west-1");
assert(cbBefore.state==="closed", "circuit closed");
for(let i=0;i<6;i++) recordFailure("provider:transcription:eu-west-1");
let cbAfter = getCircuitBreaker("provider:transcription:eu-west-1");
assert(cbAfter.state==="open" && cbAfter.failures===6, "circuit open after 6 failures");
let fallback = getFallbackChain("caption_generation");
assert(fallback.primary==="n0va-whisper-premium-v5" && fallback.fallbacks[0].model==="n0va-whisper-standard-v5", "fallback chain");
console.log(`Chaos ${chaos.experiment_id} circuit ${cbAfter.state} fallback ${fallback.primary}`);

console.log("\nAll reliability smoke checks passed.");
