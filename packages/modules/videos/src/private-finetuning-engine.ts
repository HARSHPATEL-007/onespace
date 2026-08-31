import type { FinetuneJob, PrivateModel, FinetunePolicy } from "./private-finetuning-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const jobs = new Map<string, FinetuneJob>();
const models = new Map<string, PrivateModel>();
const policies = new Map<string, FinetunePolicy>(); // tenant_id → policy

export const DEFAULT_FINETUNE_POLICY: FinetunePolicy = {
  require_consent_for:["caption","voice_style"], allow_cross_region:false, max_dataset_gb:100, retention_days:365, audit_every_training:true
};

export function setFinetunePolicy(tenant_id:string, policy: FinetunePolicy){ policies.set(tenant_id, policy); return policy; }
export function getFinetunePolicy(tenant_id:string){ return policies.get(tenant_id) ?? DEFAULT_FINETUNE_POLICY; }

export function createFinetuneJob(input: Omit<FinetuneJob,"job_id"|"status"|"explainable"|"tenant_isolated"|"created_at">): FinetuneJob {
  const policy=getFinetunePolicy(input.tenant_id);
  // every training consent-aware — require consent chain
  if(policy.require_consent_for.includes(input.scope) && !input.consent_chain.length){
    const j: FinetuneJob = { ...input, job_id: uid("ft"), status:"blocked_policy", policy_decision:"Consent required for scope", explainable:{ data_lineage: input.dataset_hashes, model_version: input.base_version }, tenant_isolated:true, created_at: nowIso() };
    jobs.set(j.job_id, j); return j;
  }
  if(input.dataset_hashes.join("").length/1e9 > policy.max_dataset_gb){
    const j: FinetuneJob = { ...input, job_id: uid("ft"), status:"blocked_policy", policy_decision:"Dataset exceeds max", explainable:{ data_lineage: input.dataset_hashes, model_version: input.base_version }, tenant_isolated:true, created_at: nowIso() };
    jobs.set(j.job_id, j); return j;
  }
  const job: FinetuneJob = {
    ...input, job_id: uid("ft"), status:"queued",
    explainable:{ data_lineage: input.dataset_hashes, model_version: input.base_version },
    tenant_isolated:true, // never cross-tenant — isolated
    created_at: nowIso()
  };
  jobs.set(job.job_id, job); return job;
}
export function getFinetuneJob(job_id:string){ return jobs.get(job_id) ?? null; }
export function listFinetuneJobs(tenant_id?:string){ const arr=[...jobs.values()]; return tenant_id? arr.filter(j=> j.tenant_id===tenant_id): arr; }
export function advanceFinetune(job_id:string, status:FinetuneJob["status"]){
  const j=jobs.get(job_id); if(!j) throw new Error("Job not found");
  j.status=status;
  if(status==="ready"){
    const m: PrivateModel = {
      model_id: uid("pmodel"), tenant_id: j.tenant_id, finetune_job_id: j.job_id, version:`${j.base_version}-ft-${Date.now().toString(36)}`,
      scope: j.scope, weights_hash:`sha256:ft_${j.job_id}`, c2pa_manifest:`c2pa:ft_${j.job_id}`, spdx_bom:`SPDX:ft_${j.job_id}`, status:"active", created_at: nowIso()
    };
    models.set(m.model_id, m); return { job: j, model: m };
  }
  return { job: j };
}
export function listPrivateModels(tenant_id?:string){ const arr=[...models.values()]; return tenant_id? arr.filter(m=> m.tenant_id===tenant_id): arr; }
export function getPrivateModel(model_id:string){ return models.get(model_id) ?? null; }
export function clearForTests(){ jobs.clear(); models.clear(); policies.clear(); }
