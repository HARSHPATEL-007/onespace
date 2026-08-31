import type { RenderJob, RenderShard, RenderPolicy, RenderMetrics, RenderRegion } from "./render-orchestration-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const jobs = new Map<string, RenderJob>();
const policies = new Map<string, RenderPolicy>(); // tenant_id → policy

export const DEFAULT_RENDER_POLICY: RenderPolicy = {
  allowed_regions:["us-east-1","eu-west-1"], data_residency:"regional", max_parallel:10, allow_spot:false, require_approval_for:["cross_region"]
};

export function setRenderPolicy(tenant_id:string, policy: RenderPolicy){ policies.set(tenant_id, policy); return policy; }
export function getRenderPolicy(tenant_id:string){ return policies.get(tenant_id) ?? DEFAULT_RENDER_POLICY; }

export function createRenderJob(input: Omit<RenderJob,"job_id"|"shards"|"status"|"created_at">): RenderJob {
  const policy=getRenderPolicy(input.tenant_id);
  // policy enforcement — explainable block
  if(!policy.allowed_regions.includes(input.region) && policy.data_residency==="enforced"){
    const j: RenderJob = { ...input, job_id: uid("render"), shards:[], status:"policy_blocked", policy_decision:`Region ${input.region} not allowed — residency enforced`, created_at: nowIso() };
    jobs.set(j.job_id, j); return j;
  }
  if(input.region!=="us-east-1" && policy.require_approval_for.includes("cross_region")){
    const j: RenderJob = { ...input, job_id: uid("render"), shards:[], status:"policy_blocked", policy_decision:"Cross-region requires approval", created_at: nowIso() };
    jobs.set(j.job_id, j); return j;
  }
  const job: RenderJob = { ...input, job_id: uid("render"), shards:[], status:"queued", created_at: nowIso() };
  // shard per region for multi-region — auditable
  for(let i=0;i<2;i++){
    const shard: RenderShard = { shard_id: uid("shard"), job_id: job.job_id, region: i===0? input.region : (policy.allowed_regions[0] ?? "us-east-1"), status:"queued", attempt:0 };
    job.shards.push(shard);
  }
  jobs.set(job.job_id, job); return job;
}
export function getRenderJob(job_id:string){ return jobs.get(job_id) ?? null; }
export function listRenderJobs(tenant_id?:string){ const arr=[...jobs.values()]; return tenant_id? arr.filter(j=> j.tenant_id===tenant_id): arr; }
export function advanceShard(shard_id:string, status:RenderShard["status"], worker_id?:string){
  for(const j of jobs.values()){
    const s=j.shards.find(x=> x.shard_id===shard_id);
    if(s){ s.status=status; if(worker_id) s.worker_id=worker_id; if(status==="ready") s.output_hash=`sha256:shard_${shard_id}`; // reversible: shard output hash
      if(j.shards.every(x=> x.status==="ready")) j.status="ready";
      if(s.status==="failed") j.status="failed";
      return s; }
  }
  return null;
}
export function getMetrics(tenant_id?:string): RenderMetrics {
  const arr=listRenderJobs(tenant_id);
  return {
    queued: arr.filter(j=> j.status==="queued").length,
    rendering: arr.filter(j=> j.status==="rendering").length,
    ready: arr.filter(j=> j.status==="ready").length,
    failed: arr.filter(j=> j.status==="failed").length,
    p50_sec: 45, p95_sec: 120, retry_rate: 0.04,
    region_utilization: { "us-east-1":0.6, "eu-west-1":0.4, "ap-south-1":0.2 } as Record<RenderRegion, number>
  };
}
export function clearForTests(){ jobs.clear(); policies.clear(); }
