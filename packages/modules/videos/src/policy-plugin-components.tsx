"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  evaluatePolicy, composePolicies, getPolicyEvidence, runPolicyTests, failSafeDecision, listPolicies,
  registerPlugin, enablePluginForTenant, grantPluginMediaAccess, executePlugin, getPluginHealth, revokePlugin,
} from "./policy-plugin-engine";
import type { PluginManifest } from "./policy-plugin-types";

export function PolicyPluginPanel({ projectId }: { projectId: string }) {
  const policies = useMemo(()=>listPolicies(),[]);
  const [testResults, setTestResults] = useState(() => runPolicyTests());
  const health = useMemo(()=>getPluginHealth("com.example.n0va.scene-enhancer"),[]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>POLICY & PLUGIN PLATFORM — EVERYTHING IS A PLUGIN · NOTHING TRUSTED BY DEFAULT</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Policy-as-code governs what may happen · Plugin SDK governs how capabilities are added</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Every capability declared · Every permission scoped · Every execution sandboxed</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Every output versioned · Every action policy-evaluated · Every sensitive operation auditable</span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Canonical Policy — eu-client-delivery v7</div>
          <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>name eu-client-delivery v7 priority 80 status active scope tenant_acme EU client_delivery → client_portal,broadcast</div>
            <div>require valid_likeness/captions/copyright/brand/privacy/accessibility — prohibit public_download/raw_external/unapproved_clone/unredacted_pii — allow watermarked_review</div>
            <div>retention source 365d proxies 180d embeddings 30d — privacy blur faces/plates medical/financial voice required — approvals external_share privacy_officer+owner</div>
            <div>enforcement on_violation block on_uncertainty require_review on_missing_data defer</div>
          </div>
          <div style={{ marginTop:6, display:"flex", gap:6 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const d = evaluatePolicy({ event:"export_requested", tenant_id:"tenant_acme", project_id:"project_001", asset_ids:["asset_001"], principal_id:"user_017", region:"EU", destination:"client_portal", quality:{ brand_review:"pending" } as never, requested_actions:["render","share"] }, "eu-client-delivery-v7");
              alert(`${d.decision} reasons ${d.reason_codes.join(",")} controls ${d.controls?.join(",")}`);
            }}>Evaluate export (brand pending → deny)</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const comp = composePolicies(["eu-client-delivery-v7","project-social-preview-v2"]);
              alert(`Winner ${comp.winner} conflict ${comp.conflict?.resolution ?? "none"}`);
            }}>Compose with project policy</Button>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Lifecycle: ingest→editing→AI→review→approval→export→delivery→playback→archival→deletion — Precedence Legal hold→Platform→Regional→Tenant→Client→Project→User</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Policy Evidence & Testing</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const d = evaluatePolicy({ event:"export_requested", tenant_id:"tenant_acme", project_id:"project_001", asset_ids:["asset_001"], principal_id:"user_017", region:"EU", destination:"client_portal", requested_actions:["render"] }, "eu-client-delivery-v7");
              const ev = getPolicyEvidence(d.decision_id);
              alert(`Evidence ${ev?.checks.length} checks hash ${ev?.policy_hash.slice(0,12)}`);
            }}>Get evidence bundle</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const tests = runPolicyTests("eu-client-delivery-v7");
              alert(`Tests ${tests.length} pass ${tests.filter(t=>t.result?.pass).length} fail ${tests.filter(t=>!t.result?.pass).length}`);
              setTestResults([...tests]);
            }}>Run policy tests</Button>
            <div style={{ marginTop:6, maxHeight:100, overflow:"auto", background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              {testResults.slice(0,3).map(t=>(
                <div key={t.name} style={{ fontSize:10, padding:"2px 0", borderBottom:"1px solid var(--nv-color-border)" }}>{t.name} → {t.result?.pass ? "PASS" : "FAIL"} actual {t.result?.actual?.decision}</div>
              ))}
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Fail-safe: preview low-risk may continue cached, external share deny, unwatermarked export deny, key release deny, deletion queue — never interpret outage as permission</div>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Plugin SDK — manifest → sandbox → execution → policy reevaluation</div>
        <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
          <div>plugin com.example.n0va.scene-enhancer v2.4.1 publisher Example Media Labs type effect sdk 2.3</div>
          <div>permissions media read proxy_video write derived_video metadata scene_boundaries storage 2GB isolation wasm_or_microvm attestation required</div>
          <div>resources cpu 4 mem 8192 gpu 4096 max 600s output 10GB — categories: effect/codec/demuxer/color/audio/transcription/translation/ai_model/storage/review/export/player/metadata/compliance/agent/watermark</div>
        </div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:11 }}>
          <div>
            <div style={{ fontWeight:700 }}>Permission Model — capability-based</div>
            <div>media.read.proxy / media.read.original (elevated) / metadata.read.face_identity (elevated) / network.outbound (elevated) — minimum data for declared function</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const grant = grantPluginMediaAccess("com.example.n0va.scene-enhancer","asset_001","proxy","scene_effect_preview");
                alert(`Grant ${grant.access.level} watermarked ${grant.access.watermarked} expires ${grant.expires_at.slice(11,16)}`);
              }}>Grant proxy access</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                try{
                  const grant = grantPluginMediaAccess("com.example.n0va.scene-enhancer","asset_001","original_full_asset","test");
                  alert(`Grant ${grant.access.level}`);
                }catch(e){ alert(`Denied: ${(e as Error).message}`); }
              }}>Request original (should deny if not tenant-approved)</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Media tiers: metadata only → thumbnail → proxy watermarked → derived stem → original range → original full (attested short-lived) — no shared keys, no ambient FS</div>
          </div>
          <div>
            <div style={{ fontWeight:700 }}>Sandbox Options</div>
            <div>WASM deterministic effects · MicroVM codecs/AI · GPU enclave confidential · Restricted container low-risk · Remote connector proxied — no FS/network/host/device, ephemeral storage, quotas, syscall restrictions</div>
            <div style={{ marginTop:6, display:"flex", gap:6 }}>
              <Button size="sm" onClick={()=>{
                const exec = executePlugin("com.example.n0va.scene-enhancer","analyze",["asset_001"],"tl_v08","scene_analysis");
                alert(`Executed ${exec.plugin_id} ${exec.status} attestation ${exec.attestation} policy ${exec.policy_decision_id?.slice(0,8)}`);
              }}>Execute plugin analyze</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const rev = revokePlugin("com.example.n0va.scene-enhancer");
                alert(`Revoked ${rev?.status} trust ${rev?.trust_level}`);
              }}>Revoke plugin</Button>
            </div>
          </div>
        </div>
        <div style={{ marginTop:8, fontSize:10, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
          Runtime contract VideoEffectPlugin manifest/analyze/render/validate + PluginContext jobId/tenant/asset/timeline/policyDecision/log/emitProgress/requestCapability — versioned output with SBOM, no internal DB/creds exposure
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Plugin Health & Trust Levels</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {health && (
              <div style={{ background: health.status==="healthy_with_warnings"?"rgba(251,191,36,0.08)":"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <div>{health.plugin_id} v{health.version} executions {health.executions_24h} success {(health.success_rate*100).toFixed(1)}% p95 {health.p95_latency_ms}ms policy denials {health.policy_denials}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>quality regressions {health.quality_regressions} network blocked {health.network_attempts_blocked} → {health.status}</div>
              </div>
            )}
            <div style={{ fontSize:10, marginTop:6 }}>Trust: Platform-signed → Verified publisher → Tenant-approved → Experimental → Quarantined → Revoked — only platform-signed or tenant-approved process sensitive media — canary/tenant-specific rollback with output comparison</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Combined Governance — plugin request flow</div>
          <div style={{ marginTop:8, fontSize:10, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>Plugin request → Signature/security → Permissions → Asset sensitivity → Tenant/regional policy → Purpose/destination → Attestation → Approval → Sandbox → Output validation → Policy reevaluation</div>
            <div>Example: transcription plugin needs dialogue audio → policy checks tenant EU, training false, retention 30d, speaker identity → human review? → restricted if unknown</div>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Everything is a plugin · Nothing trusted by default · Every capability declared · Every permission scoped · Every execution sandboxed · Every output versioned · Every action policy-evaluated · Every sensitive operation auditable</div>
        </Card>
      </div>
    </div>
  );
}
