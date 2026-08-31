import type { VolumetricAsset, ImmersiveSession, VolumetricMetrics } from "./volumetric-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const assets = new Map<string, VolumetricAsset>();
const sessions = new Map<string, ImmersiveSession>();

export function createVolumetricAsset(input: Omit<VolumetricAsset,"asset_id"|"spatial_hash"|"created_at">): VolumetricAsset {
  const a: VolumetricAsset = { ...input, asset_id: uid("vol"), spatial_hash:`spatial_${uid("hash")}`, created_at: nowIso() };
  assets.set(a.asset_id, a); return a;
}
export function getVolumetricAsset(asset_id:string){ return assets.get(asset_id) ?? null; }
export function listVolumetricAssets(tenant_id?:string){ const arr=[...assets.values()]; return tenant_id? arr.filter(a=> a.tenant_id===tenant_id): arr; }

export function startImmersiveSession(input: Omit<ImmersiveSession,"session_id"|"started_at">): ImmersiveSession {
  // every playback policy-validated — consent + DRM
  if(input.consent_required && !input.drm_license_id) throw new Error("Consent required — DRM license missing");
  const s: ImmersiveSession = { ...input, session_id: uid("ims"), started_at: nowIso() };
  sessions.set(s.session_id, s); return s;
}
export function getSession(session_id:string){ return sessions.get(session_id) ?? null; }
export function getMetrics(tenant_id?:string): VolumetricMetrics {
  const arr=listVolumetricAssets(tenant_id);
  return { assets: arr.length, sessions: [...sessions.values()].filter(s=> !tenant_id || s.tenant_id===tenant_id).length, avg_bytes_gb: arr.length? arr.reduce((sum,a)=>sum+a.bytes,0)/arr.length/1e9:0, policy_blocked: 0 };
}
export function clearForTests(){ assets.clear(); sessions.clear(); }
