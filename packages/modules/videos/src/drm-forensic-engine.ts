import type { DrmLicense, WatermarkJob, ForensicTrace, PlaybackLease, ForensicPayload } from "./drm-forensic-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const licenses = new Map<string, DrmLicense>();
const watermarks = new Map<string, WatermarkJob>();
const traces = new Map<string, ForensicTrace>();
const leases = new Map<string, PlaybackLease>();

export function issueDrmLicense(input: Omit<DrmLicense,"license_id"|"key_id"|"key_server_url">): DrmLicense {
  const lic: DrmLicense = { ...input, license_id: uid("drm"), key_id: uid("key"), key_server_url:`https://drm.n0va.io/${input.tenant_id}/license/${uid("lic")}`, c2pa_bound:true };
  licenses.set(lic.license_id, lic); return lic;
}
export function getDrmLicense(license_id:string){ return licenses.get(license_id) ?? null; }

export function createWatermark(input: Omit<WatermarkJob,"watermark_id"|"content_hash"|"traceable"|"created_at">): WatermarkJob {
  // every watermark traceable, every playback forensic — consent-aware via payload
  const w: WatermarkJob = { ...input, watermark_id: uid("wm"), content_hash:`sha256:${input.asset_id}:${Date.now()}`, traceable:true, created_at: nowIso() };
  watermarks.set(w.watermark_id, w); return w;
}
export function getWatermark(watermark_id:string){ return watermarks.get(watermark_id) ?? null; }

export function issuePlaybackLease(input: Omit<PlaybackLease,"lease_id"|"watermark_id"|"revoked"> & { watermark_id?: string }): PlaybackLease {
  const lic=licenses.get(input.drm_license_id);
  if(!lic) throw new Error("DRM license not found");
  // forensic watermark per lease — tenant+user+session bound
  const payload: ForensicPayload = { tenant_id: input.tenant_id, user_id: input.user_id, session_id: uid("sess"), asset_id: input.asset_id };
  const wm=createWatermark({ tenant_id: input.tenant_id, asset_id: input.asset_id, kind:"forensic", forensic_payload: payload });
  const lease: PlaybackLease = { ...input, lease_id: uid("lease"), watermark_id: wm.watermark_id, revoked:false };
  leases.set(lease.lease_id, lease); return lease;
}
export function revokeLease(lease_id:string){ const l=leases.get(lease_id); if(l) l.revoked=true; return l ?? null; }

export function traceLeak(leaked_hash:string, watermark_hash:string): ForensicTrace | null {
  const wm=[...watermarks.values()].find(w=> w.content_hash===watermark_hash);
  if(!wm || !wm.forensic_payload) return null;
  const t: ForensicTrace = { trace_id: uid("trace"), watermark_id: wm.watermark_id, leaked_asset_hash: leaked_hash, matched_payload: wm.forensic_payload, confidence:0.99, detected_at: nowIso() };
  traces.set(t.trace_id, t); return t;
}
export function listTraces(tenant_id?:string){ const arr=[...traces.values()]; return tenant_id? arr.filter(t=> t.matched_payload.tenant_id===tenant_id): arr; }
export function clearForTests(){ licenses.clear(); watermarks.clear(); traces.clear(); leases.clear(); }
