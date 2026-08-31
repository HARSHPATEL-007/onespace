"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createJob, commitJob, acquireLease, heartbeatLease, checkpointJob, expireLeases,
  classifyFailure, computeBackoff, sendToDeadLetter, createSegments, completeSegment, failSegment, recoverRender, assembleRender,
  createInferenceCheckpoint, recoverInference, createChaosExperiment, getCircuitBreaker, recordFailure, getFallbackChain, getRpoRtoClass,
} from "./reliability-engineering-engine";

export function ReliabilityEngineeringPanel({ projectId }: { projectId: string }) {
  const [job, setJob] = useState(() => createJob({ tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", asset_version:4, operation:"analysis", parameters_hash:"abc", model_version:"model_n0va_scene_v4" }));
  const [segments, setSegments] = useState(() => createSegments("render_0077",12,5));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>RELIABILITY ENGINEERING — NO LOST WORK · NO DUPLICATE SIDE EFFECTS · NO SILENT CORRUPTION</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Client command → Durable job → Idempotency → Checkpoint → Atomic commit → Event → Projection</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Job ID + Tenant/Project/Asset/Version/Timeline/Workflow/Idempotency/Attempt/Input hash</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>States: created→queued→leased→running→checkpointed→completed (verified) vs failed_retryable/terminal/quarantined</span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Resumable Idempotent Jobs</div>
          <div style={{ marginTop:8, fontSize:11, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Job {job.job_id} tenant_acme:asset_001:analysis:v4:model_n0va_scene_v4:abc attempt {job.attempt} state {job.state}</div>
            <div>Idempotency key: {job.idempotency_key}</div>
            <div>Input manifest {job.input_manifest_hash.slice(0,12)}…</div>
          </div>
          <div style={{ display:"flex", gap:6, marginTop:6 }}>
            <Button size="sm" onClick={()=>{
              const dup = createJob({ tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", asset_version:4, operation:"analysis", parameters_hash:"abc", model_version:"model_n0va_scene_v4" });
              alert(`Duplicate request returned existing job ${dup.job_id} === original ${job.job_id} ? ${dup.job_id===job.job_id}`);
            }}>Test idempotency duplicate</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const committed = commitJob(job.job_id, "sha3-512:output1234567890");
              alert(`Commit ${committed?.state} output ${committed?.output_manifest_hash?.slice(0,12)} event published once`);
              setJob({...committed!} as never);
            }}>Commit with output hash</Button>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Effect ledger delivery:export_0077:client_portal committed remote_8842 attempts 3 — exactly-once business effect</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Lease-Based Workers — short-lived, heartbeat</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ display:"flex", gap:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const lease = acquireLease(job.job_id,"worker_gpu_22",30000);
                alert(`Lease ${lease.worker_id} expires ${lease.lease_expires_at.slice(11,19)} checkpoint ${lease.checkpoint_version ?? "none"}`);
              }}>Acquire lease 30s</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const hb = heartbeatLease(job.job_id,"worker_gpu_22");
                alert(`Heartbeat ${hb?.last_heartbeat_at.slice(11,19)} expires ${hb?.lease_expires_at.slice(11,19)}`);
              }}>Heartbeat</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const cp = checkpointJob(job.job_id,"scene_084");
                alert(`Checkpoint ${cp?.checkpoint} state ${cp?.state}`);
              }}>Checkpoint scene_084</Button>
            </div>
            <div style={{ marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const expired = expireLeases();
                alert(`Expired leases: ${expired.length} → queued recoverable, checkpoint loaded`);
              }}>Expire leases (simulate dead worker)</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Never permanent lock — dead worker lease expires → queued → checkpoint loaded → another worker resumes</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Retry-Safe Workflows + DLQ</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Classify: temporary_network→retry backoff, worker_interruption→resume checkpoint, consent_revoked→block remediation</div>
            <div>Backoff attempt 3: {computeBackoff(3)}ms with jitter (base 1s ×2^3) + budgets max attempts/elapsed/cost/duplicate risk</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const cls = classifyFailure("PROVIDER_TIMEOUT");
                alert(`${cls.error_class} → ${cls.action} retryable ${cls.retryable}`);
              }}>Classify provider timeout</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const dl = sendToDeadLetter({ job_id:job.job_id, consumer:"analysis-orchestrator", failure_code:"MODEL_INPUT_CORRUPT", error_class:"terminal" });
                alert(`DLQ ${dl.event_id} ${dl.failure_code} attempts ${dl.attempts} safe_to_replay ${dl.safe_to_replay} action ${dl.required_action}`);
              }}>Send to DLQ</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Primary→Retry→Delayed→DLQ→Quarantine — replay by job/tenant/failure_code/time, bulk replay prevention, tenant isolation</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Partial-Render Recovery — immutable segments</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {segments.map(s=>(
                <Badge key={s.segment_id} tone={s.state==="completed"?"success":s.state==="failed"?"warning":"neutral"}>{s.segment_id} {s.state}</Badge>
              ))}
            </div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                if (segments[0]) completeSegment(segments[0].segment_id); if (segments[1]) completeSegment(segments[1].segment_id); if (segments[2]) failSegment(segments[2].segment_id);
                setSegments([...segments]);
              }}>Complete 0,1 fail 2</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const rec = recoverRender("render_0077");
                alert(`Verified ${rec.verified.length} failed ${rec.failed.length} rerender ${rec.rerender.join(",")} — never overwrite verified`);
              }}>Recover render_0077</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const asmb = assembleRender("render_0077");
                alert(`Assemble valid ${asmb.valid} ${asmb.reason ?? ""}`);
              }}>Assemble validation</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Segment planner → validation → assembly → output validation — checkpoint at GOP/scene/keyframe — preserve verified 1-41,43 onward if 42 fails</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Checkpointed Inference — semantic units</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const cp = createInferenceCheckpoint(4,"n0va-scene-model");
              alert(`Checkpoint ${cp.analysis_run_id} next ${cp.next_unit} completed ${cp.completed_units.length}`);
              const rec = recoverInference(cp.analysis_run_id);
              alert(`Recover reused ${rec.reused} reprocess ${rec.reprocess} valid ${rec.valid}`);
              const rec2 = recoverInference(cp.analysis_run_id,"4.2.0");
              alert(`Model version change → reused ${rec2.reused} valid ${rec2.valid} (should restart)`);
            }}>Inference checkpoint scene_001 → recover</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Audio chunk/scene/shot/batch — reuse valid units, reprocess incomplete, merge deterministically, provenance model/weights/input/region/checkpoint</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Multi-Region & Chaos — bulkheads & fallbacks</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>RPO/RTO: Critical audit/legal/consent near-zero · Operational low/short · Regenerable relaxed `getRpoRtoClass("audit").rpo`</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const exp = createChaosExperiment("Kill GPU during 8K rendering","tenant_acme");
                alert(`Chaos ${exp.experiment_id} hypothesis ${exp.hypothesis} blast ${exp.blast_radius}`);
              }}>Chaos kill GPU 8K</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                recordFailure("provider:transcription:eu-west-1"); const cb = getCircuitBreaker("provider:transcription:eu-west-1");
                alert(`Circuit ${cb.state} failures ${cb.failures} — open when failure/latency/rate-limit/schema/cost/policy exceeds threshold`);
              }}>Circuit breaker</Button>
            </div>
            <div style={{ marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const fb = getFallbackChain("caption_generation");
                alert(`Fallback chain ${fb.primary} → ${fb.fallbacks.map(f=>f.model).join(" → ")}`);
              }}>Fallback chain n0va-whisper-premium→standard→regional→manual</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Isolation domains: ingestion/proxy/AI/transcoding/rendering/search/review/compliance/CDN/webhooks/agent — separate queues/pools/breakers/quotas — graceful degradation essential → important → optional</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
