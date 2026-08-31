import type { SyncLink, WorkspaceSyncState, SyncPolicy, SyncEntity } from "./workspace-sync-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const links = new Map<string, SyncLink>();
const states = new Map<string, WorkspaceSyncState>(); // project_id → state

export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  allow_cross_module_write:true, require_approval_for:["approval" as SyncEntity], conflict_strategy:"manual_merge", audit_every_link:true
};

export function linkEntities(input: Omit<SyncLink,"link_id"|"status"|"last_synced_at">): SyncLink {
  const l: SyncLink = { ...input, link_id: uid("link"), status:"pending", provenance:{ ...input.provenance, policy_version:"sync-v1" } };
  links.set(l.link_id, l);
  const st=states.get(input.source.id) ?? { project_id: input.source.id, tenant_id: input.tenant_id, links:[], crdt_clock:{}, pending_events:0, conflicts:0, last_sync_at: nowIso() };
  st.links.push(l); st.pending_events++; states.set(input.source.id, st);
  return l;
}
export function syncLink(link_id:string, strategy?: SyncLink["conflict"]){
  const l=links.get(link_id); if(!l) throw new Error("Link not found");
  if(strategy){ l.conflict=strategy; l.status="conflict"; } else { l.status="synced"; l.last_synced_at=nowIso(); }
  return l;
}
export function getSyncState(project_id:string){ return states.get(project_id) ?? null; }
export function listLinks(tenant_id?:string){ const arr=[...links.values()]; return tenant_id? arr.filter(l=> l.tenant_id===tenant_id): arr; }
export function resolveConflict(link_id:string, winner:"source"|"target"){
  const l=links.get(link_id); if(!l || !l.conflict) throw new Error("No conflict");
  l.status="synced"; l.last_synced_at=nowIso(); l.conflict=undefined; return l;
}
export function getMetrics(tenant_id?:string){
  const arr=listLinks(tenant_id);
  return { total: arr.length, synced: arr.filter(l=> l.status==="synced").length, conflicts: arr.filter(l=> l.status==="conflict").length, pending: arr.filter(l=> l.status==="pending").length };
}
export function clearForTests(){ links.clear(); states.clear(); }
