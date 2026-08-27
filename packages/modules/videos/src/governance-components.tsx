"use client";
import { useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import type { CapabilityToken, ApprovalObject, GovernanceSession, LedgerEvent, RiskAssessmentGov, IntentScope } from "./governance-types";
import { ATOMIC_CAPABILITIES, AUTONOMY_PROFILES, EXAMPLE_POLICY } from "./governance-types";
import {
  createGovernanceSession, validateIntentScope, evaluatePolicy, assessRiskGov,
  createApprovalObject, issueCapabilityToken, verifyCapabilityToken, shouldSuspendAgent,
  makeVersionArtifact, createLedgerEvent, readyToPublishChecklist,
} from "./governance-engine";

// — Sample data for demo —
const DEMO_SESSION: GovernanceSession = {
  session_id: "sess_01J9abc", tenant_id: "tenant_001", human_principal: "user_204",
  agent_id: "agent.video.export.v3", intent_id: "int_01J9abc", project_id: "proj_q3_launch",
  environment: "production", model_version: "n0va-color-v4", prompt_policy_version: "color-policy-v6",
  started_at: "2026-08-27T17:04:00+05:30", expires_at: "2026-08-27T18:00:00+05:30", status: "active", parent_session_id: null,
  workflow_trigger: "human",
};
const DEMO_TOKEN: CapabilityToken = {
  token_id: "cap_01J9xyz", token_type: "n0va_capability", subject: "agent.video.export.v3", human_principal: "user_204",
  tenant_id: "tenant_001", project_id: "proj_q3_launch",
  asset_scope: ["approved_branch:tl_07", "derived:captions_en", "derived:thumbnail_set_02"],
  allowed_operations: ["export.derivative.create","destination.review.upload"] as CapabilityToken["allowed_operations"],
  allowed_destinations: ["review_portal"],
  constraints: { max_exports: 3, max_duration_seconds: 180, max_gpu_minutes: 30, max_file_size_bytes: 5000000000 },
  source_hash: "sha3-512:timeline_hash_abc123", policy_version: "video-governance-v4", approval_id: "apr_01J9",
  issued_at: "2026-08-27T17:05:00Z", expires_at: "2026-08-27T18:00:00Z",
  revocation_uri: "https://governance.n0va.io/revoke/cap_01J9xyz", signature: "KMS:abc123",
};
const DEMO_APPROVAL: ApprovalObject = {
  approval_id: "apr_01J9", proposal_id: "prop_01J9", proposal_hash: "sha3-512:proposal_hash",
  requested_agent: "agent.video.distribution.v3", operation: "destination.youtube.publish",
  asset_id: "export_044", timeline_hash: "sha3-512:timeline_hash", destinations: ["youtube","website"],
  risk_level: "critical", required_roles: ["creative_director","brand_owner","compliance_officer"],
  approvals: [
    { role: "creative_director", principal: "user_301", decision: "approved", approved_at: "2026-08-27T17:20:00Z" },
    { role: "brand_owner", principal: "", decision: "pending" },
    { role: "compliance_officer", principal: "", decision: "pending" },
  ],
  decision: "pending", expires_at: "2026-08-28T12:00:00Z", status: "active",
  invalidation_triggers: ["timeline change","asset substitution","destination change","consent expiration"],
  policy_version: "video-governance-v4", created_at: "2026-08-27T17:10:00Z",
};

export function GovernanceControlCenter({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<"live" | "map" | "approvals" | "incidents" | "tokens" | "policy" | "ledger" | "metrics">("live");
  const [intent, setIntent] = useState("prepare upload to review portal (approved_branch:tl_07, duration 120s, captions en,es)");
  const [pdpResult, setPdpResult] = useState<ReturnType<typeof evaluatePolicy> | null>(null);
  const [risk, setRisk] = useState<RiskAssessmentGov | null>(null);
  const [tokenCheck, setTokenCheck] = useState<{ valid: boolean; reason?: string } | null>(null);

  const runIntentCheck = () => {
    const { scope, valid, errors } = validateIntentScope({
      intent_id: "int_demo", requested_operation: "destination.review.upload",
      project_scope: ["marketing/q3-launch"], asset_scope: ["approved_branch:tl_07"], destination_scope: ["review_portal"],
      requested_by: "user_204", requested_parameters: { duration_limit_seconds: 120, caption_languages: ["en","es"] },
      user_request: intent,
    } as unknown as IntentScope & { user_request: string });
    if (!valid) {
      setPdpResult({ decision: "deny", reason_codes: errors, required_action: "refine_intent", policy_id: EXAMPLE_POLICY.id, policy_version: EXAMPLE_POLICY.version, evaluated_dimensions: { project:{allowed:false,reason:errors[0]}, asset:{allowed:false,reason:errors[0]}, operation:{allowed:false,reason:errors[0]}, destination:{allowed:false,reason:errors[0]} } } as unknown as ReturnType<typeof evaluatePolicy>);
      return;
    }
    const pdp = evaluatePolicy({ operation: scope.requested_operation, project_id: projectId, project_tags: ["production","external"], tenant_id: "tenant_001", asset_ids: scope.asset_scope, destination: scope.destination_scope[0], consent_status: "granted", legal_hold: false });
    setPdpResult(pdp);
    const r = assessRiskGov({ operation: scope.requested_operation, factors: ["approved_or_locked_assets"], mitigations: ["creative_approval"] });
    setRisk(r);
  };
  const checkToken = () => setTokenCheck(verifyCapabilityToken(DEMO_TOKEN, "destination.review.upload", "proj_q3_launch", "approved_branch:tl_07", "review_portal"));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Governance plane header */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a1a2e 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>GOVERNED AGENT OPERATING SYSTEM — PROJECT {projectId.slice(0,8).toUpperCase()}</div>
        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>Policy Decision Point is external & deterministic — LLM never authorizes</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, fontFamily: "var(--nv-font-mono)", opacity: 0.8 }}>
          {["Human/Workflow Trigger → Intent Gateway → Session Broker → Scope Resolver → PDP → Risk/Consent → Approval Orchestrator → Capability Token Service → Agent Sandbox → Tool Gateway → N0VA10/Media → Target"].map(s => <span key={s} style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>{s}</span>)}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="primary">Deny-by-default</Badge><Badge tone="neutral">Tenant isolation</Badge><Badge tone="neutral">Short-lived tokens</Badge><Badge tone="success">Signed ledger</Badge><Badge tone="warning">Revocable</Badge>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(["live","map","approvals","incidents","tokens","policy","ledger","metrics"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer", background: tab===t ? "var(--nv-color-primary)" : "var(--nv-color-surface)", color: tab===t ? "#fff" : "inherit", border: "1px solid var(--nv-color-border)" }}>{t.toUpperCase()}</button>
        ))}
      </div>

      {/* LIVE */}
      {tab==="live" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
          <Card padded>
            <div style={{ fontWeight: 800, display: "flex", gap: 8, alignItems: "center" }}>Live Operations <Badge tone="success">Active session</Badge><span style={{ marginLeft:"auto", fontSize:11, color:"var(--nv-color-text-faint)" }}>Chain: user_204 → Orchestrator → Caption Agent → Transcription Tool</span></div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "140px 1fr", gap: 6, fontSize: 12, fontFamily: "var(--nv-font-mono)" }}>
              <span style={{ color:"var(--nv-color-text-faint)" }}>Session</span><span>{DEMO_SESSION.session_id} • {DEMO_SESSION.agent_id} • model {DEMO_SESSION.model_version} • prompt {DEMO_SESSION.prompt_policy_version}</span>
              <span style={{ color:"var(--nv-color-text-faint)" }}>Human principal</span><span>{DEMO_SESSION.human_principal} (accountable) • tenant {DEMO_SESSION.tenant_id} • project {DEMO_SESSION.project_id}</span>
              <span style={{ color:"var(--nv-color-text-faint)" }}>Operation</span><span>timeline.branch.write • assets [asset_01, asset_02] • token {DEMO_TOKEN.token_id.slice(0,12)}… • cost 2.4/30 gpu-min</span>
              <span style={{ color:"var(--nv-color-text-faint)" }}>Delegation</span><span>Caption Agent → Transcription Tool (depth 2/2, max_risk moderate, credential_forwarding false, human_accountability user_204)</span>
            </div>
            <div style={{ marginTop: 8, display:"flex", gap:6, flexWrap:"wrap" }}><Badge tone="primary">Cost 2.4/30</Badge><Badge tone="neutral">Batch 2/100</Badge><Badge tone="neutral">Risk moderate</Badge><Badge tone="success">Token valid 42m left</Badge></div>
            <div style={{ marginTop: 8, background:"#0f0f12", color:"#a5b4fc", borderRadius:8, padding:8, fontFamily:"var(--nv-font-mono)", fontSize:11 }}>Tool calls: render.preview → timeline.apply • delegation: CaptionAgent→TranscriptionTool • input_hash sha3-512:abc → output_hash sha3-512:def • rollback snap_… • external_effects []</div>
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Card padded>
              <div style={{ fontWeight:800 }}>Intent & Scope Validator — try it</div>
              <input className="nv-input" value={intent} onChange={e=>setIntent(e.target.value)} placeholder="publish the video everywhere" style={{ marginTop:8, fontSize:12 }} />
              <div style={{ display:"flex", gap:6, marginTop:8 }}><Button size="sm" onClick={runIntentCheck}>Validate → PDP → Risk</Button><Button size="sm" variant="secondary" onClick={checkToken}>Verify token</Button></div>
              {pdpResult && <div style={{ marginTop:8, fontSize:11, background: pdpResult.decision==="deny" ? "rgba(239,68,68,0.08)" : pdpResult.decision==="allow_with_approval" ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)", border:`1px solid ${pdpResult.decision==="deny" ? "rgba(239,68,68,0.25)" : pdpResult.decision==="allow_with_approval" ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)"}`, padding:8, borderRadius:8 }}>
                <div style={{ fontWeight:800 }}>{pdpResult.decision.toUpperCase()} • {pdpResult.reason_codes.join(", ")} • {pdpResult.policy_id} v{pdpResult.policy_version}</div>
                <div style={{ color:"var(--nv-color-text-muted)" }}>Dimensions: project {pdpResult.evaluated_dimensions.project.allowed?"✓":"✗"} • asset {pdpResult.evaluated_dimensions.asset.allowed?"✓":"✗"} • op {pdpResult.evaluated_dimensions.operation.allowed?"✓":"✗"} • dest {pdpResult.evaluated_dimensions.destination.allowed?"✓":"✗"}</div>
                {pdpResult.required_action && <div style={{ color:"#b45309" }}>Next: {pdpResult.required_action}</div>}
              </div>}
              {risk && <div style={{ marginTop:6, fontSize:11, background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)" }}>Risk: {risk.inherent_risk} → residual {risk.residual_risk} • factors: {risk.risk_factors.join(", ")||"—"} • mitigations: {risk.mitigations.join(", ")} • approval: {risk.required_approval}</div>}
              {tokenCheck && <div style={{ marginTop:6, fontSize:11, background: tokenCheck.valid ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", padding:6, borderRadius:6 }}>Token: {tokenCheck.valid ? "✓ valid (every call verifies)" : `✗ ${tokenCheck.reason}`}</div>}
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Rejects: “Publish everywhere” “Clean up old assets” “Use speaker’s voice” “Send to client” “Make compliance go away” → requires exact project/asset version/operation/destination/approval context.</div>
            </Card>
            <Card padded>
              <div style={{ fontWeight:800 }}>Final Governing Contract — 12 questions</div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-muted)", lineHeight:1.6, marginTop:4 }}>
                Who authorized? Which human accountable? What exact operation? Which versions? Where will result go? Is consent valid? Consequence if wrong? Which policy permits? Which human must approve? Can it be reversed? How will drift be detected? Can N0VA prove what happened?
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* PERMISSION MAP */}
      {tab==="map" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Card padded>
            <div style={{ fontWeight:800 }}>Atomic Capabilities — 4 dimensions: Project × Asset × Operation × Destination</div>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>“Video access” is too broad. Colorist on one project ≠ all videos.</div>
            <div style={{ marginTop:8, display:"flex", flexWrap:"wrap", gap:4, maxHeight:220, overflowY:"auto" }}>{ATOMIC_CAPABILITIES.map(c => <span key={c} style={{ fontSize:10, fontFamily:"var(--nv-font-mono)", background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", padding:"3px 6px", borderRadius:999 }}>{c}</span>)}</div>
            <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
              {["Project: which projects","Asset: which media","Operation: what action","Destination: where output"].map(d => <span key={d} style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)", textAlign:"center" }}>{d}</span>)}
            </div>
          </Card>
          <Card padded>
            <div style={{ fontWeight:800 }}>Autonomy Profiles (customer-specific)</div>
            {AUTONOMY_PROFILES.map(p => (
              <div key={p.profile_id} style={{ marginTop:8, border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, background:"var(--nv-color-surface-2)" }}>
                <div style={{ fontWeight:800, fontSize:12 }}>{p.label} <span style={{ fontWeight:400, color:"var(--nv-color-text-faint)" }}>• {p.profile_id}</span></div>
                <div style={{ fontSize:11, marginTop:4 }}><span style={{ color:"#10b981" }}>allow: {p.allowed_operations.join(", ")}</span></div>
                <div style={{ fontSize:11 }}><span style={{ color:"#ef4444" }}>block: {p.blocked_operations.join(", ")}</span></div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>max batch {p.max_batch_assets} • max external {p.max_external_destinations} • TTL {p.approval_ttl_hours}h • recert {p.recertification_interval_days}d</div>
              </div>
            ))}
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:8 }}>Fully autonomous = pre-approved autonomy within constrained envelope, not unrestricted.</div>
          </Card>
        </div>
      )}

      {/* APPROVALS */}
      {tab==="approvals" && (
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 0.7fr", gap:12 }}>
          <Card padded>
            <div style={{ fontWeight:800, display:"flex", gap:8 }}>Approval Queue <Badge tone="warning">1 pending • dual control</Badge><Badge tone="neutral">TTL 24h</Badge></div>
            <div style={{ marginTop:8, border:"1px solid var(--nv-color-border)", borderRadius:8, overflow:"hidden" }}>
              <div style={{ padding:10, background:"var(--nv-color-surface-2)", display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ width:8, height:8, borderRadius:999, background:"#f59e0b" }} />
                <span style={{ fontWeight:800, fontSize:12 }}>{DEMO_APPROVAL.operation} → {DEMO_APPROVAL.destinations.join(", ")}</span>
                <Badge tone="warning">{DEMO_APPROVAL.risk_level}</Badge>
                <span style={{ marginLeft:"auto", fontSize:11, color:"var(--nv-color-text-faint)" }}>expires {new Date(DEMO_APPROVAL.expires_at).toLocaleString()}</span>
              </div>
              <div style={{ padding:10, display:"flex", flexDirection:"column", gap:6, fontSize:12 }}>
                <div>Proposal {DEMO_APPROVAL.proposal_id.slice(0,12)} • hash {DEMO_APPROVAL.proposal_hash.slice(0,16)}… • timeline {DEMO_APPROVAL.timeline_hash.slice(0,16)}… • asset {DEMO_APPROVAL.asset_id}</div>
                {DEMO_APPROVAL.approvals.map(a => (
                  <div key={a.role} style={{ display:"flex", gap:8, alignItems:"center", padding:6, background: a.decision==="approved" ? "rgba(16,185,129,0.08)" : "var(--nv-color-surface-2)", borderRadius:6, border:"1px solid var(--nv-color-border)" }}>
                    <Badge tone={a.decision==="approved" ? "success" : "warning"}>{a.role}</Badge>
                    <span style={{ fontSize:11 }}>{a.principal || "— pending"}</span>
                    <span style={{ marginLeft:"auto", fontSize:11, color:"var(--nv-color-text-faint)" }}>{a.decision} {a.approved_at ? `• ${new Date(a.approved_at).toLocaleString()}` : ""}</span>
                  </div>
                ))}
                <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Invalidated by: {DEMO_APPROVAL.invalidation_triggers.join(" • ")}</div>
                <div style={{ display:"flex", gap:6 }}><Button size="sm">Approve (creative_director)</Button><Button size="sm" variant="secondary">Reject</Button><Badge tone="neutral">Dual control required</Badge></div>
              </div>
            </div>
            <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)" }}>Approval binds proposal+hash, asset version, timeline hash, destination, export params, compliance/consent evidence, approver/role/reason/expiry/policy version. Material change invalidates.</div>
          </Card>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Card padded>
              <div style={{ fontWeight:800 }}>Mandatory Gates</div>
              <div style={{ marginTop:6, fontSize:11, lineHeight:1.5 }}>
                <div><strong>Publish:</strong> timeline hash • asset version • creative+brand+client approval • copyright/compliance/privacy/PII • captions • consent • legal holds • destination policy • thumbnail/metadata • watermark • visibility • rollback</div>
                <div style={{ marginTop:6 }}><strong>Voice clone:</strong> verified identity • explicit consent+purpose/territory/language/expiry • disclosure • human review → linked consent record, blocked after revocation (confidence ≠ consent)</div>
                <div style={{ marginTop:6 }}><strong>Face:</strong> detect/track (low) → match/label (higher) → replace/likeness.generate (highest) — progressive authorization</div>
                <div style={{ marginTop:6 }}><strong>Deletion:</strong> Request → Policy → Legal hold → Dependency → Retention → Quarantine → Human approval → Purge → Cross-system confirm (soft vs cryptographic)</div>
              </div>
            </Card>
            <Card padded>
              <div style={{ fontWeight:800 }}>Blocked Voice — safe UX</div>
              <div style={{ marginTop:6, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", padding:8, borderRadius:8, fontSize:12 }}>
                <div style={{ fontWeight:800 }}>Blocked: Voice clone cannot run</div>
                <div style={{ color:"var(--nv-color-text-muted)", marginTop:4 }}>Reason: No active consent for synthetic voice.</div>
                <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:4, fontSize:11 }}>
                  <span>• Choose a consented voice</span><span>• Request consent</span><span>• Use original audio</span><span>• Request Legal exception (documented)</span>
                </div>
                <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Every denial: what blocked, why, which policy, missing evidence, next safe action.</div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* INCIDENTS */}
      {tab==="incidents" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Card padded>
            <div style={{ fontWeight:800 }}>Incidents — policy denials, attempts, suspensions</div>
            <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6, fontSize:12 }}>
              {[
                ["Policy denial", "destination.youtube.publish without private draft first", "13:04"],
                ["Unauthorized attempt", "agent.video.export requested asset.master.write", "13:12"],
                ["Consent failure", "face.match on revoked consent face_02", "13:18"],
                ["Scope expansion", "Colorist accessed proj_other", "13:22"],
                ["Suspension", "agent.video.export suspended — token revoked, queue stopped", "13:23"],
              ].map((r) => { const [k,v,t] = r as [string,string,string]; return <div key={k+v} style={{ display:"flex", gap:8, padding:6, background:"var(--nv-color-surface-2)", borderRadius:6, border:"1px solid var(--nv-color-border)" }}><Badge tone={k==="Suspension" ? "warning" : "neutral"}>{k}</Badge><span style={{ flex:1 }}>{v}</span><span style={{ color:"var(--nv-color-text-faint)", fontSize:11 }}>{t}</span></div>; })}
            </div>
            <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
              {["Tool calls","Asset reads/writes","Prompt/context changes","Delegation","Destination changes","Batch size/rate","Cost/GPU","Model/connector changes","Retry","Policy denials","Cross-tenant attempts","Approval mismatches"].map(s => <span key={s} style={{ background:"var(--nv-color-surface-2)", padding:4, borderRadius:6, border:"1px solid var(--nv-color-border)", textAlign:"center" }}>{s}</span>)}
            </div>
          </Card>
          <Card padded>
            <div style={{ fontWeight:800 }}>Suspension triggers → revoke tokens, stop queue, preserve evidence, notify owner/governance</div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6, fontSize:11 }}>
              {["Un-granted capability","Scope expansion","Cross-tenant access","Destination change after approval","Unapproved sub-agent","Cost/duration/volume limit","Locked asset","Revoked consent","Legal hold","Anomalous tool calls","Retry denied"].map(s => <span key={s} style={{ background:"rgba(239,68,68,0.06)", border:"1px solid rgba(239,68,68,0.18)", padding:6, borderRadius:6 }}>{s}</span>)}
            </div>
            <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:6, fontFamily:"var(--nv-font-mono)" }}>Monitor: tool calls, asset R/W, prompt changes, delegation, destination, batch, rate, cost/GPU, model changes, retry, policy denials, cross-tenant, approval mismatches.</div>
          </Card>
        </div>
      )}

      {/* TOKENS */}
      {tab==="tokens" && (
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12 }}>
          <Card padded>
            <div style={{ fontWeight:800, display:"flex", gap:8 }}>Capability Token <Badge tone="primary">{DEMO_TOKEN.token_id}</Badge><Badge tone={new Date(DEMO_TOKEN.expires_at).getTime() < Date.now() ? "warning" : "success"}>expires {new Date(DEMO_TOKEN.expires_at).toLocaleTimeString()}</Badge></div>
            <div style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", borderRadius:8, padding:10, fontFamily:"var(--nv-font-mono)", fontSize:11, lineHeight:1.5, border:"1px solid #222" }}>
              <div>token_type: {DEMO_TOKEN.token_type} • subject: {DEMO_TOKEN.subject} • human: {DEMO_TOKEN.human_principal}</div>
              <div>tenant {DEMO_TOKEN.tenant_id} • project {DEMO_TOKEN.project_id} • policy {DEMO_TOKEN.policy_version} • approval {DEMO_TOKEN.approval_id}</div>
              <div>asset_scope: {DEMO_TOKEN.asset_scope.join(", ")}</div>
              <div>allowed_operations: {DEMO_TOKEN.allowed_operations.join(", ")}</div>
              <div>allowed_destinations: {DEMO_TOKEN.allowed_destinations.join(", ")}</div>
              <div>constraints: max_exports {DEMO_TOKEN.constraints.max_exports} • duration {DEMO_TOKEN.constraints.max_duration_seconds}s • gpu {DEMO_TOKEN.constraints.max_gpu_minutes}m • size {(DEMO_TOKEN.constraints.max_file_size_bytes! / 1e9).toFixed(1)}GB</div>
              <div>source_hash: {DEMO_TOKEN.source_hash.slice(0,24)}… • signature: {DEMO_TOKEN.signature.slice(0,24)}… • revocation: {DEMO_TOKEN.revocation_uri.slice(0,32)}…</div>
              <div style={{ marginTop:6, color:"#fbbf24" }}>Audience-bound, project-bound, asset-bound, operation-bound, non-transferable, short-lived (55m), revocable, invalidated when source_hash changes materially. Verified on every tool call, not just workflow start.</div>
            </div>
            <div style={{ marginTop:8, display:"flex", gap:6 }}><Button size="sm" variant="secondary" onClick={()=>window.open(DEMO_TOKEN.revocation_uri)}>Revoke</Button><Badge tone="neutral">Verify on every privileged tool call</Badge></div>
          </Card>
          <Card padded>
            <div style={{ fontWeight:800 }}>Delegation & Sub-Agent Control</div>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Chain: user_204 → Orchestrator → Caption Agent → Transcription Tool (min context)</div>
            <div style={{ marginTop:8, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontFamily:"var(--nv-font-mono)", fontSize:11 }}>
              <div>delegation_allowed: true</div><div>allowed_sub_agents: ["agent.transcription.v2"]</div><div>max_depth: 2 • max_cumulative_risk: moderate • credential_forwarding: false</div><div>separate_approval_required: false • human_accountability: user_204</div>
            </div>
            <div style={{ marginTop:8, fontSize:11, background:"rgba(16,185,129,0.08)", padding:6, borderRadius:6, border:"1px solid rgba(16,185,129,0.25)" }}>Caption Agent receives transcript+caption perms only — no publish/CRM/deletion/voice/compliance-override. Every delegated action retains original human principal + parent session + delegation chain.</div>
          </Card>
        </div>
      )}

      {/* POLICY */}
      {tab==="policy" && (
        <div style={{ display:"grid", gridTemplateColumns:"1.3fr 0.7fr", gap:12 }}>
          <Card padded>
            <div style={{ fontWeight:800, display:"flex", gap:8 }}>Policy-as-Code <Badge tone="primary">{EXAMPLE_POLICY.id} v{EXAMPLE_POLICY.version}</Badge><Badge tone="warning">default: {EXAMPLE_POLICY.default}</Badge></div>
            <pre style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:10, borderRadius:8, fontSize:11, overflowX:"auto", border:"1px solid #222" }}>{`policy:
  id: ${EXAMPLE_POLICY.id}
  default: ${EXAMPLE_POLICY.default}
  scope: tenant ${EXAMPLE_POLICY.scope.tenant}, tags ${EXAMPLE_POLICY.scope.project_tags.join(",")}
  deny: [${EXAMPLE_POLICY.deny.map(d=> (d as {operation:string}).operation).join(", ")}]
  require_approval: [${EXAMPLE_POLICY.require_approval.map(r=>r.operation).join(", ")}]
  allow_autonomous: [${EXAMPLE_POLICY.allow_autonomous.map(r=>r.operation).join(", ")}]
  constraints: batch ${EXAMPLE_POLICY.constraints.max_batch_assets}, dest ${EXAMPLE_POLICY.constraints.max_external_destinations}, TTL ${EXAMPLE_POLICY.constraints.approval_ttl_hours}h`}</pre>
            <div style={{ marginTop:8, background:"rgba(239,68,68,0.06)", padding:6, borderRadius:6, fontSize:11, border:"1px solid rgba(239,68,68,0.18)" }}>Decision: deny reason_codes [CONSENT_MISSING, DESTINATION_NOT_ALLOWED] required_action request_consent policy video-publish-production-v4 v4 — natural language explains, machine-readable enforces.</div>
          </Card>
          <Card padded>
            <div style={{ fontWeight:800 }}>Version & Drift Governance</div>
            <div style={{ marginTop:6, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:6, fontFamily:"var(--nv-font-mono)", fontSize:11, border:"1px solid #222" }}>
              {(() => { const v=makeVersionArtifact("agent.video.colorist.v2"); return `${v.agent_id}\n${v.release_id}\nmodel ${v.model_version} • prompt ${v.prompt_policy_version}\ntool ${v.tool_manifest_hash.slice(0,24)}…\n${v.evaluation_status} • ${v.red_team_status} • recert ${v.owner_recertification.slice(0,10)} • rollback ${v.rollback_version}`; })()}
            </div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-muted)", lineHeight:1.5 }}>Change in model/prompt/connector/tool → regression evaluation, permission review, risk review, recertification, possible approval invalidation, canary, rollback readiness. Not promoted merely because model scores higher.</div>
          </Card>
        </div>
      )}

      {/* LEDGER */}
      {tab==="ledger" && (
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Signed Action Ledger — append-only, Merkle-root, KMS-signed <Badge tone="success">Provenance complete</Badge></div>
          <pre style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:10, borderRadius:8, fontSize:11, overflowX:"auto", border:"1px solid #222" }}>{JSON.stringify(createLedgerEvent({
            tenant_id: "tenant_001", human_principal: "user_204", agent_id: "agent.video.colorist.v2", session_id: DEMO_SESSION.session_id, parent_session_id: null,
            intent_id: "int_01J9", proposal_id: "prop_01J9", capability_token_id: DEMO_TOKEN.token_id, operation: "timeline.branch.write",
            project_id: "proj_q3_launch", asset_ids: ["asset_01","asset_02"], policy_decision: "allow_with_approval",
            approval_id: DEMO_APPROVAL.approval_id, tool_calls: ["render.preview","timeline.apply"],
            model_version: "n0va-color-v4", human_decision: "approved", rollback_reference: "snap_abc", external_effects: [],
            input: { grade: "warm" }, output: { branch: "ai_draft_07" },
          }), null, 2)}</pre>
          <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)" }}>Answers: Who initiated? Which agent/model/tools? What accessed? Which policy allowed/denied? Which human approved? What changed? Which external systems? How to reverse? Built on immutable audit chain, Merkle-root, cryptographic signatures, cross-application logs.</div>
        </Card>
      )}

      {/* METRICS */}
      {tab==="metrics" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Card padded>
            <div style={{ fontWeight:800 }}>Governance Metrics — by tenant/project/agent/model/operation</div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, fontSize:11 }}>
              {[
                ["Authorized completion","98.2%"],["Policy denials","4.1%"],["Unauthorized attempts","0.02%"],
                ["Approval p50","2.3h"],["Expiry rejections","1.8%"],["Consent blocks","2.4%"],
                ["Rollbacks","0.7%"],["Human correction","0.12"],["External failures","0.3%"],
                ["Autonomous in-scope","96%"],["MTT suspend","47s"],["MTT revoke","12s"],
                ["Provenance complete","99.1%"],["Permission used","38%"],["Overprivileged","3"],["Model drift","0"],["Delegation violations","0"],["Cross-tenant","0"],
              ].map(([k,v]) => <span key={k} style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)", display:"flex", justifyContent:"space-between" }}><span>{k}</span><strong>{v}</strong></span>)}
            </div>
            <div style={{ marginTop:8, background:"linear-gradient(135deg,#0f0f12,#1e1a3a)", color:"#fff", padding:8, borderRadius:8, fontSize:11, textAlign:"center" }}>Primary success: <strong>Safe completion within authorized scope + low human correction + complete provenance + reversible external effects</strong></div>
          </Card>
          <Card padded>
            <div style={{ fontWeight:800 }}>Roadmap — 5 phases</div>
            <div style={{ marginTop:6, fontSize:11, lineHeight:1.6 }}>
              <div><strong>1 Permission Foundation:</strong> registry, durable identities, atomic perms, project/asset scopes, PDP, capability tokens, signed ledger, deny-by-default gateway</div>
              <div><strong>2 Approval Governance:</strong> proposal-bound, role-based, dual control, separation of duties, expiring, invalidation, draft-only branches, mandatory gates</div>
              <div><strong>3 Runtime Enforcement:</strong> sandboxed runtime, per-call token verify, delegation controls, rate/cost/batch limits, anomaly, auto-suspend, consent revocation, cross-app monitoring</div>
              <div><strong>4 Enterprise Governance:</strong> policy editor, dashboard, legal hold, residency, autonomy profiles, N0VA10 orchestration, evaluation, red-team, incident response</div>
              <div><strong>5 Controlled Autonomy:</strong> low-risk recurring workflows, time-bound policies, drift monitoring, recertification, permission minimization, rollback testing, retirement</div>
            </div>
            <div style={{ marginTop:8, background:"rgba(16,185,129,0.08)", padding:6, borderRadius:6, fontSize:11, border:"1px solid rgba(16,185,129,0.25)" }}>Safe governance UX: Ready to publish ✓ vs Blocked voice clone ✗ — every denial shows what/why/which policy/missing evidence/next safe action.</div>
          </Card>
        </div>
      )}
    </div>
  );
}
