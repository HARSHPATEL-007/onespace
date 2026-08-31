import type { LegalHold, RetentionPolicy, RegulatedAudit, RegulatedDomain } from "./regulated-controls-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const holds = new Map<string, LegalHold>();
const policies = new Map<string, RetentionPolicy>();
const audits: RegulatedAudit[] = [];

function audit(a: RegulatedAudit){ audits.push(a); if(audits.length>5000) audits.splice(0,1000); return a; }

export function placeHold(input: Omit<LegalHold,"hold_id"|"status"|"created_at"|"provenance"> & { actor:string; correlation_id:string }): LegalHold {
  // every hold consent-aware? No, but every hold is auditable and explainable
  const h: LegalHold = { ...input, hold_id: uid("hold"), status:"active", created_at: nowIso(), provenance:{ actor: input.actor, correlation_id: input.correlation_id, policy_version:"regulated-v1" } };
  holds.set(h.hold_id, h);
  audit({ audit_id: uid("audit"), tenant_id: input.tenant_id, domain: input.domain, action:"legal_hold.place", asset_id: input.asset_id, actor: input.actor, decision:"allow", policy_version:"regulated-v1", explainable:true, timestamp: nowIso() });
  return h;
}
export function releaseHold(hold_id:string, actor:string){
  const h=holds.get(hold_id); if(!h) throw new Error("Hold not found");
  h.status="released";
  audit({ audit_id: uid("audit"), tenant_id: h.tenant_id, domain: h.domain, action:"legal_hold.release", asset_id: h.asset_id, actor, decision:"allow", policy_version:"regulated-v1", explainable:true, timestamp: nowIso() });
  return h;
}
export function listHolds(tenant_id?:string){ const arr=[...holds.values()]; return tenant_id? arr.filter(h=> h.tenant_id===tenant_id): arr; }
export function isUnderHold(asset_id:string){ return [...holds.values()].some(h=> h.asset_id===asset_id && h.status==="active"); }

export function setRetentionPolicy(input: Omit<RetentionPolicy,"policy_id"|"created_at">): RetentionPolicy {
  const p: RetentionPolicy = { ...input, policy_id: uid("ret"), created_at: nowIso() };
  policies.set(p.policy_id, p);
  audit({ audit_id: uid("audit"), tenant_id: input.tenant_id, domain: input.domain, action:"retention.set", actor:"system", decision:`worm=${input.worm} days=${input.days}`, policy_version:"regulated-v1", explainable:true, timestamp: nowIso() });
  return p;
}
export function listRetentionPolicies(tenant_id?:string){ const arr=[...policies.values()]; return tenant_id? arr.filter(p=> p.tenant_id===tenant_id): arr; }
export function canDeleteAsset(asset_id:string, tenant_id:string): { allowed:boolean; reason?: string }{
  if(isUnderHold(asset_id)) return { allowed:false, reason:"Legal hold active — disposition requires approval" };
  const pol=[...policies.values()].find(p=> p.tenant_id===tenant_id && p.retention_class==="worm");
  if(pol && pol.worm) return { allowed:false, reason:`WORM retention ${pol.days} days — disposition requires approval` };
  return { allowed:true };
}
export function listAudits(tenant_id?:string, domain?:RegulatedDomain){ let arr=[...audits]; if(tenant_id) arr=arr.filter(a=> a.tenant_id===tenant_id); if(domain) arr=arr.filter(a=> a.domain===domain); return arr.slice(-100).reverse(); }
export function clearForTests(){ holds.clear(); policies.clear(); audits.length=0; }
