import type { IngestJob, ProxyJob, IngestPolicy, IngestMetrics, ProxyTier } from "./ingest-proxy-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const jobs = new Map<string, IngestJob>();
const dedup = new Map<string, string>(); // idempotency_key → job_id

export const DEFAULT_POLICY: IngestPolicy = {
  max_bytes_gb: 50, allowed_containers: ["mp4","mov","mxf","webm","mp3","wav"], allowed_codecs: ["h264","h265","prores","vp9","aac","pcm"],
  scan_malware: true, require_checksum: true, proxy_tiers: ["thumb","preview_480","edit_1080"]
};

export function createIngestJob(input: Omit<IngestJob,"job_id"|"status"|"attempts"|"proxy_jobs"|"validation"|"created_at"|"updated_at"|"idempotency_key"> & { idempotency_key?: string }): IngestJob {
  const key = input.idempotency_key ?? `${input.tenant_id}:${input.checksum.value}`;
  const existing = dedup.get(key);
  if(existing) return jobs.get(existing)!; // duplicate prevention — searchable, not double ingest
  const job: IngestJob = {
    job_id: uid("ingest"), tenant_id: input.tenant_id, project_id: input.project_id, source: input.source, original_name: input.original_name, mime: input.mime, bytes: input.bytes,
    checksum: input.checksum, status:"queued", attempts:0, idempotency_key: key,
    proxy_jobs: [], validation:{ container_valid:true, codec_supported:true, malware_passed:true, policy_passed:true },
    created_at: nowIso(), updated_at: nowIso(), audit:{ actor: input.audit.actor, correlation_id: input.audit.correlation_id }
  };
  // policy enforcement — explainable block
  if(job.bytes > DEFAULT_POLICY.max_bytes_gb*1024*1024*1024) { job.status="failed"; job.validation.policy_passed=false; }
  jobs.set(job.job_id, job); dedup.set(key, job.job_id);
  // queue proxies — reversible (can re-render)
  for(const tier of DEFAULT_POLICY.proxy_tiers){
    const pj: ProxyJob = { proxy_id: uid("proxy"), parent_job_id: job.job_id, tier, status:"queued", content_hash: `phash_${job.checksum.value.slice(0,8)}_${tier}` };
    job.proxy_jobs.push(pj);
  }
  job.status="proxy_queued";
  return job;
}
export function getIngestJob(job_id:string){ return jobs.get(job_id) ?? null; }
export function listIngestJobs(tenant_id?:string){ const arr=[...jobs.values()]; return tenant_id? arr.filter(j=> j.tenant_id===tenant_id): arr; }
export function advanceProxy(proxy_id:string, status:ProxyJob["status"]){
  for(const j of jobs.values()){
    const p=j.proxy_jobs.find(x=> x.proxy_id===proxy_id);
    if(p){ p.status=status; if(status==="ready"){ p.bytes= Math.round(j.bytes*0.2); } j.updated_at=nowIso(); if(j.proxy_jobs.every(x=> x.status==="ready")) j.status="ready"; return p; }
  }
  return null;
}
export function getMetrics(tenant_id?:string): IngestMetrics {
  const arr=listIngestJobs(tenant_id);
  return {
    queued: arr.filter(j=> j.status==="queued").length,
    hashing: arr.filter(j=> j.status==="hashing").length,
    proxy_rendering: arr.filter(j=> j.proxy_jobs.some(p=> p.status==="rendering")).length,
    ready: arr.filter(j=> j.status==="ready").length,
    failed: arr.filter(j=> j.status==="failed").length,
    avg_ingest_sec: 2.1, p95_proxy_sec: 8.4, duplicate_hit_rate: dedup.size? 0.12:0
  };
}
export function searchAssets(tenant_id:string, query:string){
  // every asset searchable — mock semantic search over ingested jobs
  const q=query.toLowerCase();
  return [...jobs.values()].filter(j=> j.tenant_id===tenant_id && (`${j.original_name} ${j.checksum.value}`.toLowerCase().includes(q)));
}
export function clearForTests(){ jobs.clear(); dedup.clear(); }
