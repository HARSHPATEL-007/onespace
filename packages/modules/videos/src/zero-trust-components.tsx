"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  getKeyHierarchy, rotateTenantKeys, requestAccessGrant, evaluateDeviceTrust, evaluateSessionTrust, sessionReaction,
  requestPrivilegedAction, approvePrivilegedAction, issueMediaCapability, verifyCapability, useCapability, revokeCapability,
  evaluatePlayback, evaluateExport, issueWorkloadIdentity, attestGpuWorker, canReleaseKeys, evaluateInsiderRisk, detectBulkAnomaly,
  generateWatermarkPayload, evaluatePolicy, getSecurityDashboard, listSecurityEvents, runIncidentPlaybook,
} from "./zero-trust-engine";

export function ZeroTrustPanel({ projectId }: { projectId: string }) {
  const hierarchy = useMemo(()=>getKeyHierarchy("tenant_001"),[]);
  const dashboard = useMemo(()=>getSecurityDashboard(),[]);
  const [deviceScore, setDeviceScore] = useState(86);
  const [sessionScore, setSessionScore] = useState(78);
  const [grant, setGrant] = useState(() => requestAccessGrant({ tenant_id:"tenant_001", principal_id:"user_017", asset_ids:["asset_001","asset_002"], actions:["preview","comment"], purpose:"editorial_review", duration_minutes:240, device_id:"device_008", session_id:"session_112" }));
  const [cap, setCap] = useState(() => issueMediaCapability({ asset_id:"asset_001", action:"preview", principal_id:"user_017", device_id:"device_008", session_id:"session_112", expires_in_seconds:900, watermark_profile:"viewer_bound" }));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>ZERO-TRUST MEDIA SECURITY — NO PERMANENT TRUST · NO UNSCOPED CAPABILITY</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Identity → Device → Session → Policy → Scoped capability → Audited action → Continuous reassessment</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Deny-by-default · JIT · Envelope encryption · Dual control</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Tenant-isolated keys · HSM unwrapping · No raw keys in logs</span>
        </div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, fontSize:11 }}>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Active sessions</div><div style={{ fontWeight:800 }}>{dashboard.active_sessions}</div></div>
          <div style={{ background:"rgba(239,68,68,0.15)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>High-risk</div><div style={{ fontWeight:800 }}>{dashboard.high_risk_sessions}</div></div>
          <div style={{ background:"rgba(251,191,36,0.15)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Pending approvals</div><div style={{ fontWeight:800 }}>{dashboard.pending_privileged_approvals}</div></div>
          <div style={{ background:"rgba(16,185,129,0.08)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Blocked exports</div><div style={{ fontWeight:800 }}>{dashboard.blocked_exports_today}</div></div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Tenant-Isolated Key Hierarchy — envelope encryption</div>
          <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>{hierarchy?.master_key_id}</div>
            <div> originals {hierarchy?.domains.originals}</div>
            <div> proxies {hierarchy?.domains.proxies}</div>
            <div> exports {hierarchy?.domains.exports} · watermarks {hierarchy?.domains.watermarks}</div>
            <div>Rotation auto {String(hierarchy?.rotation_policy.automatic)} max 90d rotate_on_incident</div>
            <div>Encrypted data key wrapped by tenant KEK — media unchanged on rotation</div>
          </div>
          <Button size="sm" variant="ghost" onClick={()=>{
            const rotated = rotateTenantKeys("tenant_001","proxies");
            alert(`Rotated proxies → ${rotated?.domains.proxies}`);
          }}>Rotate proxies key (automatic overlap, revocation after incident)</Button>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Just-in-Time Access — purpose-bound</div>
          <div style={{ marginTop:8, fontSize:11, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Grant {grant.grant_id} {grant.purpose} {grant.actions.join(",")} expires {grant.expires_at.slice(11,16)} · risk limit {grant.risk_limit}</div>
            <div>Lifetimes: Preview 5-30m · Editorial 1-8h · Export single-use · Download single object · Archive limited · Admin minutes step-up</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" onClick={()=>{
                const g = requestAccessGrant({ tenant_id:"tenant_001", principal_id:"user_017", asset_ids:["asset_001"], actions:["preview"], purpose:"client_review", duration_minutes:60, device_id:"device_008" });
                setGrant(g); alert(`Grant ${g.grant_id} expires ${g.expires_at}`);
              }}>Request client_review 60m</Button>
              <Badge tone="neutral">Purpose-bound: review ≠ export</Badge>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Device Trust Scoring — recalculated on change</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Device device_008 score {deviceScore} → {deviceScore>=80?"allow":deviceScore>=60?"allow_review_only":"deny"} restrictions no_original_download</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const dt = evaluateDeviceTrust("device_008","user_017",{ patch_age_days:12 });
                setDeviceScore(dt.score); alert(`Device trust ${dt.score} decision ${dt.decision}`);
              }}>Simulate stale patch (12d)</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const dt = evaluateDeviceTrust("device_008","user_017",{ managed:false });
                setDeviceScore(dt.score); alert(`Unmanaged ${dt.score} ${dt.decision}`);
              }}>Unmanaged device</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Signals: managed/disk_encrypted/secure_boot/patch/endpoint/hardware_key/jailbreak/EDR/location/concurrent/screen-capture/external storage</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Session Trust — continuous</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Session session_112 score {sessionScore} factors identity 0.98 device 0.91 network 0.87 behavior 0.74 geo 0.96</div>
            <div>Reaction: {sessionReaction(sessionScore)}</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const st = evaluateSessionTrust("session_112","user_017",{ behavior_consistency:0.35 });
                setSessionScore(st.score); alert(`Session ${st.score} ${sessionReaction(st.score)} step-up for ${st.step_up_required_for.join(",")}`);
              }}>Anomaly behavior 0.35</Button>
              <Badge tone="neutral">80-100 normal · 60-79 step-up · 40-59 watermarked · 20-39 suspend · 0-19 revoke</Badge>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Privileged-Action Dual Control</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Privileged: ISO download, unwatermarked master, DRM disable, retention/legal hold, key rotation, voice cloning — dual control, requester cannot approve own</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" onClick={()=>{
                const req = requestPrivilegedAction({ action:"export_unwatermarked_master", asset_id:"asset_master_001", requester:"user_017", purpose:"broadcast_delivery", required_approvers:2 });
                alert(`Request ${req.request_id} requires 2 approvers`);
                const a1 = approvePrivilegedAction(req.request_id,"producer_003","approved");
                alert(`After 1 approver status ${a1?.status}`);
                try { approvePrivilegedAction(req.request_id,"user_017","approved"); } catch(e){ alert(`Self-approval blocked: ${(e as Error).message}`); }
                const a2 = approvePrivilegedAction(req.request_id,"security_002","approved");
                alert(`After 2 approvers status ${a2?.status}`);
              }}>Request unwatermarked master (dual approver)</Button>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Token-Bound Media URLs — capability-based</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Capability {cap.token_id} {cap.action} asset {cap.asset_id} max_uses {cap.max_uses} uses {cap.uses} watermark {cap.watermark_profile} expires {cap.expires_at.slice(11,16)}</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const v = verifyCapability(cap.token_id,{ ip:"203.0.113.5", device_id:"device_008" });
                alert(`Verify ${v.valid} ${v.reason ?? ""}`);
                const used = useCapability(cap.token_id);
                alert(`Use ${used?`uses ${used.uses}/${used.max_uses}`:"denied max uses"}`);
              }}>Verify + use (range-reconstruction prevented)</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                revokeCapability(cap.token_id); alert("Revoked");
              }}>Revoke</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Bound to user/device/session/asset/action/IP/expiration watermark — single-use download, playback separate, range-request controls prevent master reconstruction</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Playback & Export Policy</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const pol = evaluatePlayback("confidential",78,86);
              alert(`Playback confidential max ${pol.max_resolution} visible ${pol.visible_watermark} download ${pol.download} reauth ${pol.reauthorize_every_minutes}m`);
            }}>Evaluate confidential playback</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const exp = evaluateExport({ asset_id:"asset_001", destination:"external_client_portal", requested_format:"4k_prores", asset_classification:"confidential" });
              alert(`Export ${exp.decision} controls ${exp.controls?.join(",")} blocked ${exp.blocked_components?.join(",")}`);
            }}>Export to client portal 4k_prores</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Playback re-evaluated during session — revoke terminates player; export checks sensitivity/destination/resolution/stems/faces/voice/music/legal hold/geographic</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Workload Identity + GPU Attestation</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const wi = issueWorkloadIdentity({ workload_id:"render_job_0042", service:"n0va.audio.render", tenant_id:"tenant_001", allowed_assets:["asset_001"], allowed_outputs:["s3://tenant_001/exports/job_0042/*"] });
              alert(`Workload ${wi.workload_id} expires ${wi.expires_at.slice(11,16)} attestation required`);
              const att = attestGpuWorker({ worker_id:"gpu_worker_17", gpu_id:"gpu_attested_008", firmware_measurement:"sha3-512:trusted_firmware", driver_measurement:"sha3-512:trusted_driver", container_digest:"sha3-512:trusted_container", model_version:"n0va-dialogue-isolate-v3", tenant_scope:"tenant_001" });
              alert(`Attestation ${att.attestation_status} canRelease ${canReleaseKeys("gpu_worker_17","asset_001")}`);
              const bad = attestGpuWorker({ worker_id:"gpu_worker_99", gpu_id:"gpu_bad", firmware_measurement:"bad", driver_measurement:"bad", container_digest:"bad", model_version:"bad", tenant_scope:"tenant_001" });
              alert(`Bad attestation ${bad.attestation_status} canRelease ${canReleaseKeys("gpu_worker_99","asset_001")} (should be false)`);
            }}>Issue workload + attested GPU</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Worker attests identity → short-lived credential → scoped capability → processes → expires — cannot browse store — GPU verifies firmware/driver/TEE/image/tenant/boot before key release</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Insider-Risk & Bulk Anomaly</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const risk = evaluateInsiderRisk("user_017",[{type:"unusual_bulk_preview",weight:0.31},{type:"access_outside_project_scope",weight:0.27},{type:"new_external_destination",weight:0.18}]);
              alert(`Insider score ${risk.score} action ${risk.action} review ${risk.human_review_required}`);
            }}>Evaluate insider risk user_017</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const anom = detectBulkAnomaly("user_017",30,184,842000000000,12000000000);
              alert(`Bulk deviation ${anom.deviation_factor}x risk ${anom.risk} action ${anom.action.join(",")}`);
            }}>Bulk anomaly 70x baseline</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Role baselines: editor proxies, producer masters, archivist scheduled, reviewer watermarked — human review, not auto-punishment</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Watermark + DRM + Policy Decision</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const wm = generateWatermarkPayload({ viewer_identity:"user_017", tenant:"tenant_001", session_id:"session_112", asset_id:"asset_001", timestamp: new Date().toISOString(), capability_id:cap.token_id });
              alert(`Watermark ${wm.payload} survive transcoding/crop`);
              const pol = evaluatePolicy({ principal:"user_017", action:"download", asset:"asset_master_001", tenant:"tenant_001", context:{ device_trust:86, session_trust:78, network_risk:12, asset_classification:"confidential", destination:"local_device" } });
              alert(`Policy ${pol.decision} reasons ${pol.reason_codes.join(",")} policy ${pol.policy_version}`);
            }}>Watermark + Policy deny download confidential</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>DRM license includes device security/output protection/resolution/offline/expiry/concurrent/geo/watermark/revocation — never overrides export policy or legal hold</div>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Security Events & Incident Playbooks</div>
        <div style={{ marginTop:8, fontSize:11, maxHeight:200, overflow:"auto" }}>
          {listSecurityEvents(5).map(ev=>(
            <div key={ev.event_id} style={{ display:"flex", gap:6, padding:"4px 0", borderBottom:"1px solid var(--nv-color-border)", fontSize:10, fontFamily:"var(--nv-font-mono)" }}>
              <span>{ev.timestamp.slice(11,19)}</span><span>{ev.type}</span><span>{ev.principal_id}</span><span>{ev.decision}</span><span style={{ color: ev.decision==="deny"?"#ef4444":"#10b981" }}>{ev.reason_codes.join(",")}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:6, display:"flex", gap:6 }}>
          <Button size="sm" variant="ghost" onClick={()=>alert(runIncidentPlaybook("suspicious_download").join(" → "))}>Playbook suspicious_download</Button>
          <Button size="sm" variant="ghost" onClick={()=>alert(runIncidentPlaybook("key_compromise").join(" → "))}>key_compromise</Button>
          <Button size="sm" variant="ghost" onClick={()=>alert(runIncidentPlaybook("compromised_worker").join(" → "))}>compromised_worker</Button>
        </div>
        <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Audit append-only tamper-evident tenant-scoped chain_hash — deterministic explainable versioned revocable — webhooks security.*</div>
      </Card>
    </div>
  );
}
