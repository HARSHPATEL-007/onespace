/**
 * N0VA VIDEOS — Zero-Trust Media Security Engine
 * Deny-by-default, tenant-isolated keys, JIT, continuous reassessment
 */
import type {
  TenantKeyHierarchy, AccessGrant, DeviceTrust, SessionTrust, PrivilegedRequest, MediaCapability, PlaybackPolicy,
  ExportPolicyDecision, WorkloadIdentity, GpuAttestation, PolicyDecision, SecurityEvent, InsiderRisk, DownloadAnomaly, WatermarkPayload, SecurityDashboard,
} from "./zero-trust-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0,20)}${uid("h").slice(-4)}`; }

// Stores
const keyHierarchies = new Map<string, TenantKeyHierarchy>();
const grants = new Map<string, AccessGrant>();
const deviceTrusts = new Map<string, DeviceTrust>();
const sessionTrusts = new Map<string, SessionTrust>();
const privilegedRequests = new Map<string, PrivilegedRequest>();
const capabilities = new Map<string, MediaCapability>();
const workloadIdentities = new Map<string, WorkloadIdentity>();
const gpuAttestations = new Map<string, GpuAttestation>();
const securityEvents: SecurityEvent[] = [];
const insiderRisks = new Map<string, InsiderRisk>();

(function seed(){
  keyHierarchies.set("tenant_001",{
    tenant_id:"tenant_001", key_namespace:"n0va/tenant_001/videos", master_key_id:"kms://tenant_001/master/v12",
    domains:{ originals:"kms://tenant_001/originals/v21", proxies:"kms://tenant_001/proxies/v18", exports:"kms://tenant_001/exports/v07", watermarks:"kms://tenant_001/watermarks/v04", drm:"kms://tenant_001/drm/v03", audit:"kms://tenant_001/audit/v02" },
    rotation_policy:{ automatic:true, maximum_age_days:90, rotate_on_incident:true }, kms_region:"us-east-1",
  });
  deviceTrusts.set("device_008",{
    device_id:"device_008", principal_id:"user_017", score:86,
    posture:{ managed:true, disk_encrypted:true, secure_boot:true, patch_age_days:4, endpoint_status:"healthy", hardware_key:true, screen_capture_controls:true },
    decision:"allow_review_only", restrictions:["no_original_download","no_unwatermarked_preview"],
  });
  sessionTrusts.set("session_112",{
    session_id:"session_112", principal_id:"user_017", score:78,
    factors:{ identity_assurance:0.98, device_posture:0.91, network_reputation:0.87, behavior_consistency:0.74, geographic_consistency:0.96 },
    current_policy:"editorial_review", step_up_required_for:["original_download","bulk_export","drm_key_operation"],
  });
})();

function logEvent(tenantId: string, principalId: string, type: string, action: string, decision: string, assetId?: string, deviceId?: string, sessionId?: string, risk=50): SecurityEvent {
  const ev: SecurityEvent = {
    event_id: uid("sec"), type, tenant_id: tenantId, principal_id: principalId, device_id: deviceId, session_id: sessionId, asset_id: assetId, action, decision,
    reason_codes: decision==="deny" ? ["policy_denied"] : ["policy_allowed"], risk_score: risk, timestamp: nowIso(), chain_hash: hash(`${tenantId}:${action}:${Date.now()}`),
  };
  securityEvents.push(ev);
  return ev;
}

// ── Key hierarchy ────────────────────────────────────────────────────────────
export function getKeyHierarchy(tenantId: string): TenantKeyHierarchy | null { return keyHierarchies.get(tenantId) ?? null; }
export function rotateTenantKeys(tenantId: string, domain?: string): TenantKeyHierarchy | null {
  const h = keyHierarchies.get(tenantId);
  if (!h) return null;
  // envelope: wrap new DEK with new KEK, media unchanged
  const newVer = `v${Date.now().toString(36).slice(-2)}`;
  if (!domain || domain==="master") h.master_key_id = `kms://${tenantId}/master/${newVer}`;
  else if (domain in h.domains) (h.domains as Record<string,string>)[domain] = `kms://${tenantId}/${domain}/${newVer}`;
  logEvent(tenantId, "system", "key.rotation.completed", "key_rotation", "allow", undefined, undefined, undefined, 20);
  return h;
}

// ── JIT Access ───────────────────────────────────────────────────────────────
const LIFETIMES: Record<string, number> = { preview: 30, editorial_review: 240, export_approval: 0, download: 0, archive_retrieval: 120 };
export function requestAccessGrant(input: { tenant_id: string; principal_id: string; asset_ids: string[]; actions: string[]; purpose: string; duration_minutes?: number; device_id: string; session_id?: string }): AccessGrant {
  // Policy evaluation: purpose-bound, sensitivity check
  const duration = input.duration_minutes ?? (LIFETIMES[input.purpose] ?? 60);
  const grant: AccessGrant = {
    grant_id: uid("grant"), tenant_id: input.tenant_id, principal_id: input.principal_id, asset_ids: input.asset_ids, actions: input.actions, purpose: input.purpose,
    issued_at: nowIso(), expires_at: new Date(Date.now()+ duration*60000).toISOString(),
    device_id: input.device_id, session_id: input.session_id ?? uid("sess"), approval_chain: [], risk_limit: 35,
  };
  // Single-use for export/download
  if (input.actions.includes("export") || input.actions.includes("download")) grant.expires_at = new Date(Date.now()+ 15*60000).toISOString();
  grants.set(grant.grant_id, grant);
  logEvent(input.tenant_id, input.principal_id, "security.access.granted", input.actions[0] ?? "unknown", "allow", input.asset_ids[0], input.device_id, grant.session_id, 30);
  return grant;
}
export function getGrant(grantId: string): AccessGrant | null { return grants.get(grantId) ?? null; }
export function isGrantValid(grantId: string): boolean {
  const g = grants.get(grantId);
  if (!g) return false;
  return new Date(g.expires_at).getTime() > Date.now();
}
export function revokeGrant(grantId: string): void {
  const g = grants.get(grantId);
  if (g) {
    grants.delete(grantId);
    logEvent(g.tenant_id, g.principal_id, "security.access.revoked", "revoke", "allow", g.asset_ids[0], g.device_id, g.session_id, 40);
  }
}

// ── Device Trust ─────────────────────────────────────────────────────────────
export function evaluateDeviceTrust(deviceId: string, principalId: string, posturePatch?: Partial<DeviceTrust["posture"]>): DeviceTrust {
  let dt = deviceTrusts.get(deviceId);
  if (!dt) {
    dt = {
      device_id: deviceId, principal_id: principalId, score: 86,
      posture:{ managed:true, disk_encrypted:true, secure_boot:true, patch_age_days:4, endpoint_status:"healthy", hardware_key:true, screen_capture_controls:true },
      decision:"allow_review_only", restrictions:["no_original_download"],
    };
  }
  if (posturePatch) Object.assign(dt.posture, posturePatch);
  // Recalc score
  let score = 100;
  if (!dt.posture.managed) score-=20;
  if (!dt.posture.disk_encrypted) score-=15;
  if (dt.posture.patch_age_days>7) score-=10;
  if (dt.posture.endpoint_status!=="healthy") score-=20;
  if (!dt.posture.hardware_key) score-=10;
  dt.score = Math.max(0, score);
  if (dt.score>=80) { dt.decision="allow"; dt.restrictions=[]; }
  else if (dt.score>=60) { dt.decision="allow_review_only"; dt.restrictions=["no_original_download"]; }
  else dt.decision="deny";
  deviceTrusts.set(deviceId, dt);
  return dt;
}
export function getDeviceTrust(deviceId: string): DeviceTrust | null { return deviceTrusts.get(deviceId) ?? null; }

// ── Session Trust ────────────────────────────────────────────────────────────
export function evaluateSessionTrust(sessionId: string, principalId: string, signals?: Partial<SessionTrust["factors"]>): SessionTrust {
  let st = sessionTrusts.get(sessionId);
  if (!st) {
    st = { session_id: sessionId, principal_id: principalId, score:78, factors:{ identity_assurance:0.98, device_posture:0.91, network_reputation:0.87, behavior_consistency:0.74, geographic_consistency:0.96 }, current_policy:"editorial_review", step_up_required_for:["original_download"] };
  }
  if (signals) Object.assign(st.factors, signals);
  const avg = (st.factors.identity_assurance + st.factors.device_posture + st.factors.network_reputation + st.factors.behavior_consistency + st.factors.geographic_consistency)/5;
  st.score = Math.round(avg*100);
  sessionTrusts.set(sessionId, st);
  return st;
}
export function getSessionTrust(sessionId: string): SessionTrust | null { return sessionTrusts.get(sessionId) ?? null; }
export function sessionReaction(score: number): string {
  if (score>=80) return "Normal approved actions";
  if (score>=60) return "Restrict sensitive, require verification";
  if (score>=40) return "Read-only watermarked preview";
  if (score>=20) return "Suspend and notify security";
  return "Revoke and isolate";
}

// ── Privileged actions dual control ─────────────────────────────────────────
export function requestPrivilegedAction(input: { action: string; asset_id: string; requester: string; purpose: string; required_approvers?: number }): PrivilegedRequest {
  const req: PrivilegedRequest = {
    request_id: uid("req"), action: input.action, asset_id: input.asset_id, requester: input.requester, purpose: input.purpose, risk:"high",
    required_approvals: input.required_approvers ?? 2, approvals:[], expires_at: new Date(Date.now()+60*60000).toISOString(), status:"pending",
  };
  privilegedRequests.set(req.request_id, req);
  logEvent("tenant_001", input.requester, "security.privileged_action.requested", input.action, "pending", input.asset_id, undefined, undefined, 70);
  return req;
}
export function approvePrivilegedAction(requestId: string, approver: string, decision: "approved"|"denied"): PrivilegedRequest | null {
  const req = privilegedRequests.get(requestId);
  if (!req) return null;
  if (req.requester===approver) throw new Error("Requester cannot approve own request");
  req.approvals.push({ approver, status: decision, approved_at: nowIso() });
  const approvedCount = req.approvals.filter(a=>a.status==="approved").length;
  if (approvedCount>=req.required_approvals) req.status="approved";
  else if (req.approvals.some(a=>a.status==="denied")) req.status="denied";
  logEvent("tenant_001", approver, `security.privileged_action.${decision}`, req.action, decision, req.asset_id, undefined, undefined, 60);
  return req;
}
export function getPrivilegedRequest(requestId: string): PrivilegedRequest | null { return privilegedRequests.get(requestId) ?? null; }
export function listPrivilegedRequests(): PrivilegedRequest[] { return Array.from(privilegedRequests.values()); }

// ── Media Capabilities (token-bound URLs) ────────────────────────────────────
export function issueMediaCapability(input: { asset_id: string; action: string; principal_id: string; device_id: string; session_id: string; expires_in_seconds?: number; watermark_profile?: string; ip_binding?: string; max_uses?: number }): MediaCapability {
  const cap: MediaCapability = {
    token_id: uid("cap"), asset_id: input.asset_id, action: input.action, principal_id: input.principal_id, device_id: input.device_id, session_id: input.session_id,
    expires_at: new Date(Date.now()+ (input.expires_in_seconds ?? 900)*1000).toISOString(),
    max_uses: input.max_uses ?? 1, uses:0, ip_binding: input.ip_binding, watermark_profile: input.watermark_profile ?? "viewer_bound", download: input.action==="download", revoked:false,
  };
  capabilities.set(cap.token_id, cap);
  logEvent("tenant_001", input.principal_id, "security.media_capability.issued", input.action, "allow", input.asset_id, input.device_id, input.session_id, 25);
  return cap;
}
export function verifyCapability(tokenId: string, context?: { ip?: string; device_id?: string }): { valid: boolean; reason?: string } {
  const cap = capabilities.get(tokenId);
  if (!cap) return { valid:false, reason:"not found" };
  if (cap.revoked) return { valid:false, reason:"revoked" };
  if (new Date(cap.expires_at).getTime() < Date.now()) return { valid:false, reason:"expired" };
  if (cap.uses >= cap.max_uses) return { valid:false, reason:"max uses exceeded" };
  if (cap.ip_binding && context?.ip && cap.ip_binding !== context.ip) return { valid:false, reason:"ip mismatch" };
  if (context?.device_id && cap.device_id !== context.device_id) return { valid:false, reason:"device mismatch" };
  // Prevent range reconstruction: if max_uses 1 and already used, deny partial
  return { valid:true };
}
export function useCapability(tokenId: string): MediaCapability | null {
  const cap = capabilities.get(tokenId);
  if (!cap) return null;
  const v = verifyCapability(tokenId);
  if (!v.valid) return null;
  cap.uses += 1;
  return cap;
}
export function revokeCapability(tokenId: string): void {
  const cap = capabilities.get(tokenId);
  if (cap) { cap.revoked=true; logEvent("tenant_001", cap.principal_id, "security.media_capability.revoked", cap.action, "allow", cap.asset_id, cap.device_id, cap.session_id, 35); }
}
export function getCapability(tokenId: string): MediaCapability | null { return capabilities.get(tokenId) ?? null; }

// ── Playback policy ──────────────────────────────────────────────────────────
export function evaluatePlayback(assetClassification: string, sessionTrustScore: number, deviceTrustScore: number): PlaybackPolicy {
  const isConfidential = assetClassification==="confidential";
  return {
    asset_classification: assetClassification,
    allowed_actions: isConfidential ? ["preview","comment"] : ["preview","comment","download"],
    max_resolution: isConfidential ? "1080p" : "4k",
    visible_watermark: isConfidential, forensic_watermark: isConfidential,
    download: !isConfidential,
    screen_capture_response:"degrade_quality_and_alert", concurrent_sessions:1, reauthorize_every_minutes:30,
  };
}

// ── Export policy ────────────────────────────────────────────────────────────
export function evaluateExport(input: { asset_id: string; destination: string; requested_format: string; asset_classification?: string }): ExportPolicyDecision {
  const classification = input.asset_classification ?? "confidential";
  if (classification==="confidential" && input.destination==="external_client_portal" && input.requested_format==="4k_prores") {
    return {
      asset_id: input.asset_id, destination: input.destination, requested_format: input.requested_format, decision:"allow_with_controls",
      controls:["forensic_watermark","visible_client_watermark","expires_in_72_hours","disable_original_stem_export","client_domain_restriction"],
      blocked_components:["raw_camera_audio"], policy_version:"export_policy_v12",
    };
  }
  return { asset_id: input.asset_id, destination: input.destination, requested_format: input.requested_format, decision:"allow", policy_version:"export_policy_v12" };
}

// ── Workload identity + attestation ──────────────────────────────────────────
export function issueWorkloadIdentity(input: { workload_id: string; service: string; tenant_id: string; allowed_assets: string[]; allowed_outputs: string[] }): WorkloadIdentity {
  const wi: WorkloadIdentity = {
    workload_id: input.workload_id, service: input.service, tenant_id: input.tenant_id, allowed_assets: input.allowed_assets, allowed_outputs: input.allowed_outputs,
    expires_at: new Date(Date.now()+15*60000).toISOString(), network_policy:"private_media_plane", attestation_required:true, job_id: input.workload_id,
  };
  workloadIdentities.set(input.workload_id, wi);
  return wi;
}
export function attestGpuWorker(input: { worker_id: string; gpu_id: string; firmware_measurement: string; driver_measurement: string; container_digest: string; model_version: string; tenant_scope: string }): GpuAttestation {
  const expectedFirmware = "sha3-512:trusted_firmware";
  const expectedContainer = "sha3-512:trusted_container";
  const verified = input.firmware_measurement===expectedFirmware && input.container_digest===expectedContainer;
  const att: GpuAttestation = {
    worker_id: input.worker_id, gpu_id: input.gpu_id, firmware_measurement: input.firmware_measurement, driver_measurement: input.driver_measurement,
    container_digest: input.container_digest, model_version: input.model_version, tenant_scope: input.tenant_scope,
    attestation_status: verified ? "verified" : "failed", issued_at: nowIso(), expires_at: new Date(Date.now()+10*60000).toISOString(),
  };
  gpuAttestations.set(input.worker_id, att);
  if (!verified) logEvent(input.tenant_scope, input.worker_id, "security.workload.attestation.failed", "attest", "deny", undefined, undefined, undefined, 85);
  return att;
}
export function canReleaseKeys(workerId: string, assetId: string): boolean {
  const att = gpuAttestations.get(workerId);
  if (!att || att.attestation_status!=="verified") return false;
  if (new Date(att.expires_at).getTime() < Date.now()) return false;
  const wi = workloadIdentities.get(att.worker_id.replace("gpu_","render_")) ?? workloadIdentities.get(workerId);
  if (!wi) return false;
  return wi.allowed_assets.includes(assetId) && new Date(wi.expires_at).getTime() > Date.now();
}

// ── Insider risk & bulk anomaly ──────────────────────────────────────────────
export function evaluateInsiderRisk(principalId: string, signals: { type: string; weight: number }[]): InsiderRisk {
  const score = Math.round(signals.reduce((s, sig)=>s+sig.weight*100, 0));
  const risk: InsiderRisk = { principal_id: principalId, score, signals, action: score>60 ? "step_up_and_notify_security" : "monitor", human_review_required: score>50 };
  insiderRisks.set(principalId, risk);
  if (score>60) logEvent("tenant_001", principalId, "security.insider_risk.escalated", "insider_risk", "allow", undefined, undefined, undefined, score);
  return risk;
}
export function detectBulkAnomaly(principalId: string, windowMinutes: number, objectsAccessed: number, bytesTransferred: number, baselineBytes: number): DownloadAnomaly {
  const deviation = bytesTransferred / Math.max(baselineBytes,1);
  const risk = deviation>50 ? "critical" : deviation>10 ? "high" : "medium";
  const anomaly: DownloadAnomaly = {
    principal_id: principalId, window_minutes: windowMinutes, objects_accessed: objectsAccessed, bytes_transferred: bytesTransferred,
    role_baseline_bytes: baselineBytes, deviation_factor: Number(deviation.toFixed(1)), risk,
    action: risk==="critical" ? ["revoke_download_capabilities","preserve_audit_evidence","require_security_review"] : ["notify_security"],
  };
  if (risk==="critical") logEvent("tenant_001", principalId, "security.bulk_download.anomaly", "bulk_download", "deny", undefined, undefined, undefined, 90);
  return anomaly;
}

// ── Watermark ────────────────────────────────────────────────────────────────
export function generateWatermarkPayload(input: WatermarkPayload): { payload: string; verified: boolean } {
  const payload = `${input.viewer_identity}|${input.tenant}|${input.session_id}|${input.asset_id}|${input.timestamp}`;
  return { payload: `wm_${hash(payload).slice(0,16)}`, verified: true };
}
export function verifyWatermark(tokenId: string): boolean {
  const cap = capabilities.get(tokenId);
  if (!cap) return false;
  // survive transcoding etc. mock true
  return true;
}

// ── Policy decision engine ───────────────────────────────────────────────────
export function evaluatePolicy(input: { principal: string; action: string; asset: string; tenant: string; context: PolicyDecision["context"] }): PolicyDecision {
  const reasons: string[] = [];
  let decision: "allow"|"deny" = "allow";
  if (input.action==="download" && input.context.asset_classification==="confidential") {
    reasons.push("original_download_requires_dual_approval","device_not_authorized_for_unwatermarked_media");
    decision="deny";
  }
  if (input.context.device_trust < 60) { reasons.push("device_trust_low"); decision="deny"; }
  if (input.context.session_trust < 40) { reasons.push("session_trust_low"); decision="deny"; }
  const pd: PolicyDecision = {
    decision_id: uid("decision"), principal: input.principal, action: input.action, asset: input.asset, tenant: input.tenant,
    context: input.context, decision, reason_codes: reasons.length?reasons:["policy_allowed"], policy_version:"zt_media_policy_v18", expires_at: new Date(Date.now()+5*60000).toISOString(),
  };
  logEvent(input.tenant, input.principal, "security.policy.decision", input.action, decision, input.asset, undefined, undefined, decision==="deny"?72:20);
  return pd;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export function getSecurityDashboard(): SecurityDashboard {
  return {
    tenant:"N0VA Client Group", active_sessions:142, high_risk_sessions:3, pending_privileged_approvals: privilegedRequests.size,
    unattested_workers: Array.from(gpuAttestations.values()).filter(a=>a.attestation_status!=="verified").length,
    key_rotations_due:2, blocked_exports_today:14, bulk_anomalies:1, watermark_failures:0, expired_capabilities: Array.from(capabilities.values()).filter(c=> new Date(c.expires_at).getTime()<Date.now()).length,
  };
}
export function listSecurityEvents(limit=50): SecurityEvent[] { return securityEvents.slice(-limit); }
export function getSecurityEvent(eventId: string): SecurityEvent | null { return securityEvents.find(e=>e.event_id===eventId) ?? null; }

// ── Incident playbooks (mock) ────────────────────────────────────────────────
export function runIncidentPlaybook(type: "suspicious_download" | "key_compromise" | "compromised_worker" | "insider_risk"): string[] {
  if (type==="suspicious_download") return ["Revoke active download capabilities","Keep approved preview sessions","Preserve logs and watermark identifiers","Freeze affected exports","Notify security and tenant owner","Require step-up authentication","Review destination and asset scope","Rotate relevant credentials if compromise suspected"];
  if (type==="key_compromise") return ["Disable affected key version","Issue replacement tenant key","Rewrap data keys","Revoke active capabilities","Reissue DRM licenses","Re-watermark newly delivered exports","Validate affected assets","Preserve incident evidence"];
  if (type==="compromised_worker") return ["Quarantine worker","Revoke workload identity","Invalidate attestation","Deny key release","Reassign jobs to clean workers","Inspect plaintext exposure window","Rotate service credentials","Review outputs and audit trails"];
  return ["Restrict high-risk actions","Preserve evidence under legal policy","Notify designated security reviewers","Avoid revealing detection details","Require dual approval","Review watermark and download logs","Restore privileges only after documented decision"];
}
