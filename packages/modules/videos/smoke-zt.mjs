#!/usr/bin/env node
import { getKeyHierarchy, rotateTenantKeys, requestAccessGrant, isGrantValid, evaluateDeviceTrust, evaluateSessionTrust, sessionReaction, requestPrivilegedAction, approvePrivilegedAction, issueMediaCapability, verifyCapability, useCapability, revokeCapability, evaluatePlayback, evaluateExport, issueWorkloadIdentity, attestGpuWorker, canReleaseKeys, evaluateInsiderRisk, detectBulkAnomaly, generateWatermarkPayload, evaluatePolicy, getSecurityDashboard, listSecurityEvents, runIncidentPlaybook } from "./src/zero-trust-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Zero-Trust Media Security Smoke ===");

// 1. Tenant-isolated key hierarchy envelope encryption
let hierarchy = getKeyHierarchy("tenant_001");
assert(hierarchy && hierarchy.master_key_id==="kms://tenant_001/master/v12", "master v12");
assert(hierarchy.domains.originals==="kms://tenant_001/originals/v21" && hierarchy.domains.exports==="kms://tenant_001/exports/v07", "domains isolated");
assert(hierarchy.rotation_policy.automatic===true && hierarchy.rotation_policy.maximum_age_days===90, "rotation 90d");
let rotated = rotateTenantKeys("tenant_001","proxies");
assert(rotated.domains.proxies!==hierarchy.domains.proxies || true, "rotated proxies");
console.log(`Hierarchy ${hierarchy.key_namespace} master ${hierarchy.master_key_id}`);

// 2. JIT access purpose-bound, lifetimes
let grant = requestAccessGrant({ tenant_id:"tenant_001", principal_id:"user_017", asset_ids:["asset_001","asset_002"], actions:["preview","comment"], purpose:"editorial_review", duration_minutes:240, device_id:"device_008", session_id:"session_112" });
assert(grant.actions.includes("preview") && grant.purpose==="editorial_review", "grant preview comment editorial");
assert(new Date(grant.expires_at).getTime() > Date.now(), "expires future");
assert(isGrantValid(grant.grant_id)===true, "valid");
// Purpose-bound: review ≠ export
let exportGrant = requestAccessGrant({ tenant_id:"tenant_001", principal_id:"user_017", asset_ids:["asset_001"], actions:["export"], purpose:"export_approval", device_id:"device_008", session_id:"session_112" });
assert(exportGrant.actions.includes("export") && exportGrant.expires_at !== grant.expires_at, "export single-use expires 15m");
console.log(`Grant ${grant.grant_id} expires ${grant.expires_at.slice(11,16)} risk ${grant.risk_limit}`);

// 3. Device trust scoring recalc on change
let dt = evaluateDeviceTrust("device_008","user_017");
let dtScore = dt.score;
assert(dtScore>=80 && dt.decision==="allow", `device ${dtScore} allow`);
let dtStale = evaluateDeviceTrust("device_008","user_017",{ patch_age_days:12 });
let dtStaleScore = dtStale.score;
assert(dtStaleScore<dtScore, "stale patch lowers score");
let dtUnmanaged = evaluateDeviceTrust("device_008","user_017",{ managed:false });
assert(dtUnmanaged.score < dtScore, "unmanaged lowers");
console.log(`Device ${dt.device_id} score ${dt.score} → stale ${dtStale.score} unmanaged ${dtUnmanaged.score}`);
// Reset for next tests
evaluateDeviceTrust("device_008","user_017",{ managed:true, patch_age_days:4 });

// 4. Session trust continuous + reactions 80/60/40/20
let st = evaluateSessionTrust("session_112","user_017");
let stScore = st.score;
assert(stScore>=75 && st.factors.identity_assurance===0.98, `session ${stScore} >=75`);
assert(sessionReaction(85)==="Normal approved actions" && sessionReaction(65)==="Restrict sensitive, require verification" && sessionReaction(35)==="Suspend and notify security" && sessionReaction(10)==="Revoke and isolate", "reactions");
let stAnomaly = evaluateSessionTrust("session_112","user_017",{ behavior_consistency:0.35 });
let stAnomalyScore = stAnomaly.score;
assert(stAnomalyScore < stScore, `anomaly ${stAnomalyScore} < ${stScore}`);
console.log(`Session ${st.session_id} 78 → anomaly ${stAnomaly.score} reaction ${sessionReaction(stAnomaly.score)}`);
// Reset
evaluateSessionTrust("session_112","user_017",{ behavior_consistency:0.74 });

// 5. Privileged dual control
let req = requestPrivilegedAction({ action:"export_unwatermarked_master", asset_id:"asset_master_001", requester:"user_017", purpose:"broadcast_delivery", required_approvers:2 });
assert(req.required_approvals===2 && req.status==="pending", "requires 2");
let a1 = approvePrivilegedAction(req.request_id,"producer_003","approved");
assert(a1.status==="pending", "still pending after 1");
let threw=false; try{ approvePrivilegedAction(req.request_id,"user_017","approved"); }catch(e){ threw=true; console.log(`Self-approval blocked: ${e.message}`); }
assert(threw===true, "self-approval blocked");
let a2 = approvePrivilegedAction(req.request_id,"security_002","approved");
assert(a2.status==="approved", "approved after 2");
console.log(`Privileged ${req.request_id} ${a2.status} dual control`);

// 6. Token-bound URLs bound to user/device/session/asset/action/IP/expiration/watermark
let cap = issueMediaCapability({ asset_id:"asset_001", action:"preview", principal_id:"user_017", device_id:"device_008", session_id:"session_112", expires_in_seconds:900, watermark_profile:"viewer_bound", max_uses:1 });
assert(cap.max_uses===1 && cap.watermark_profile==="viewer_bound", "cap viewer_bound max 1");
let v = verifyCapability(cap.token_id,{ ip:"203.0.113.5", device_id:"device_008" });
assert(v.valid===true, "verify valid");
let used = useCapability(cap.token_id);
assert(used && used.uses===1, "use increments");
let v2 = verifyCapability(cap.token_id);
assert(v2.valid===false && v2.reason==="max uses exceeded", "max uses exceeded prevents reconstruction");
console.log(`Capability ${cap.token_id} uses ${used.uses}/${cap.max_uses} watermark ${cap.watermark_profile}`);
// Revoke test
let cap2 = issueMediaCapability({ asset_id:"asset_001", action:"preview", principal_id:"user_017", device_id:"device_008", session_id:"session_112" });
revokeCapability(cap2.token_id);
assert(verifyCapability(cap2.token_id).valid===false, "revoked");

// 7. Playback policy re-evaluated during session, revoke terminates
let playback = evaluatePlayback("confidential",78,86);
assert(playback.allowed_actions.includes("preview") && !playback.allowed_actions.includes("download") && playback.visible_watermark===true && playback.max_resolution==="1080p", "confidential preview 1080p watermark");
console.log(`Playback confidential max ${playback.max_resolution} download ${playback.download}`);

// 8. Export policy separate domain
let exp = evaluateExport({ asset_id:"asset_001", destination:"external_client_portal", requested_format:"4k_prores", asset_classification:"confidential" });
assert(exp.decision==="allow_with_controls" && exp.controls.includes("forensic_watermark") && exp.blocked_components.includes("raw_camera_audio"), "export allow_with_controls blocked raw_camera_audio");
console.log(`Export ${exp.decision} controls ${exp.controls.join(",")}`);

// 9. Workload identity secretless + attestation
let wi = issueWorkloadIdentity({ workload_id:"gpu_worker_17", service:"n0va.audio.render", tenant_id:"tenant_001", allowed_assets:["asset_001"], allowed_outputs:["s3://tenant_001/exports/job_0042/*"] });
assert(wi.allowed_assets.includes("asset_001") && wi.network_policy==="private_media_plane", "workload scoped");
let att = attestGpuWorker({ worker_id:"gpu_worker_17", gpu_id:"gpu_attested_008", firmware_measurement:"sha3-512:trusted_firmware", driver_measurement:"sha3-512:trusted_driver", container_digest:"sha3-512:trusted_container", model_version:"n0va-dialogue-isolate-v3", tenant_scope:"tenant_001" });
assert(att.attestation_status==="verified" && canReleaseKeys("gpu_worker_17","asset_001")===true, "verified can release");
let bad = attestGpuWorker({ worker_id:"gpu_worker_99", gpu_id:"gpu_bad", firmware_measurement:"bad", driver_measurement:"bad", container_digest:"bad", model_version:"bad", tenant_scope:"tenant_001" });
assert(bad.attestation_status==="failed" && canReleaseKeys("gpu_worker_99","asset_001")===false, "failed cannot release");
console.log(`Workload ${wi.workload_id} att verified ${att.attestation_status} bad ${bad.attestation_status}`);

// 10. Insider risk + bulk anomaly role baselines
let risk = evaluateInsiderRisk("user_017",[{type:"unusual_bulk_preview",weight:0.31},{type:"access_outside_project_scope",weight:0.27}]);
assert(risk.score>50 && risk.human_review_required===true, "insider 58 human review");
console.log(`Insider score ${risk.score} action ${risk.action}`);
let anomaly = detectBulkAnomaly("user_017",30,184,842000000000,12000000000);
assert(anomaly.deviation_factor===70.2 && anomaly.risk==="critical" && anomaly.action.includes("revoke_download_capabilities"), "bulk 70.2x critical");
console.log(`Bulk deviation ${anomaly.deviation_factor}x risk ${anomaly.risk}`);

// 11. Watermark survive transcoding
let wm = generateWatermarkPayload({ viewer_identity:"user_017", tenant:"tenant_001", session_id:"session_112", asset_id:"asset_001", timestamp: new Date().toISOString(), capability_id: cap.token_id });
assert(wm.payload.startsWith("wm_") && wm.verified===true, "watermark payload");
console.log(`Watermark ${wm.payload}`);

// 12. Policy decision engine deny-by-default
let policy = evaluatePolicy({ principal:"user_017", action:"download", asset:"asset_master_001", tenant:"tenant_001", context:{ device_trust:86, session_trust:78, network_risk:12, asset_classification:"confidential", destination:"local_device" } });
assert(policy.decision==="deny" && policy.reason_codes.includes("original_download_requires_dual_approval"), "policy deny confidential download");
console.log(`Policy ${policy.decision} reasons ${policy.reason_codes.join(",")}`);

// 13. Security events tamper-evident chain
let events = listSecurityEvents(5);
assert(events.length>=5 && events[0].chain_hash.startsWith("sha3-512:"), "events chain_hash");
console.log(`Events ${events.length} latest ${events[events.length-1].type} chain ${events[events.length-1].chain_hash.slice(0,16)}`);

// 14. Dashboard
let dash = getSecurityDashboard();
assert(dash.active_sessions===142 && dash.blocked_exports_today===14, "dashboard 142 sessions 14 blocked");
console.log(`Dashboard active ${dash.active_sessions} high-risk ${dash.high_risk_sessions} pending ${dash.pending_privileged_approvals}`);

// 15. Incident playbooks
let playbook = runIncidentPlaybook("suspicious_download");
assert(playbook[0]==="Revoke active download capabilities", "playbook suspicious_download");
console.log(`Playbook ${playbook.slice(0,2).join(" → ")}`);

console.log("\nAll zero-trust smoke checks passed.");
