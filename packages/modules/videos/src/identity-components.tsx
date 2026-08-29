"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  listPersons, getPerson, evaluateConsent, matchIdentity, getFacePolicy, evaluatePresenter, evaluateLipSync,
  getDisclosurePolicy, createIdentityProvenance, getIdentityProvenance, getConsentPassport, checkExpirations,
  revokeGrant, getRevocationStatus, evaluateExportGate, issueAgentToken, verifyAgentToken, getGrant,
} from "./identity-engine";

export function IdentityPanel({ projectId }: { projectId: string }) {
  const [persons] = useState(() => listPersons());
  const [selectedPerson, setSelectedPerson] = useState(() => persons[0]?.person_id ?? "person_01J_demo");
  const person = useMemo(() => getPerson(selectedPerson), [selectedPerson]);
  const [evalResult, setEvalResult] = useState<ReturnType<typeof evaluateConsent> | null>(null);
  const [revocation, setRevocation] = useState<ReturnType<typeof revokeGrant> | null>(null);
  const [agentCheck, setAgentCheck] = useState<string | null>(null);

  const runEvaluate = () => {
    const r = evaluateConsent({ person_id: selectedPerson, operation: "voice_clone", project_id: projectId, territory: "IN", platform: "youtube", audience: "public" });
    setEvalResult(r);
  };
  const runRevoke = () => {
    try {
      const grantId = person?.consent_grants[0]?.grant_id;
      if (!grantId) return;
      const ev = revokeGrant(grantId, { operations: ["voice_cloning", "synthetic_presenter"], projects: [projectId], territories: ["IN"], platforms: ["youtube", "website"] });
      setRevocation(ev);
    } catch (e) { setRevocation(null); }
  };
  const runAgent = () => {
    const token = issueAgentToken("presenter_agent_001", selectedPerson, ["lip_sync", "synthetic_presenter"], projectId);
    const v = verifyAgentToken(token.token_id, "lip_sync");
    setAgentCheck(`${token.token_id.slice(0,12)} → lip_sync ${v.allowed ? "allowed" : "denied: "+v.reason}`);
  };

  const expirations = useMemo(() => checkExpirations(60), []);
  const passport = useMemo(() => getConsentPassport(selectedPerson, projectId), [selectedPerson, projectId]);
  const facePolicy = getFacePolicy();
  const disclosure = getDisclosurePolicy();
  const grant = person?.consent_grants[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — core principle */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>CONSENT-AWARE IDENTITY — NO IDENTITY OPERATION WITHOUT VALID SCOPE-MATCHED GRANT</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Face • Voice • Body & Motion • Likeness — separate domains, separate consent</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Face recognition ≠ consent</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Consent = multidimensional (project, territory, platform, audience, duration, disclosure)</span>
        </div>
      </div>

      {/* Registry */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Identity Rights Registry</span>
          <Badge tone="primary">{persons.length} persons</Badge>
          <select value={selectedPerson} onChange={e => setSelectedPerson(e.target.value)} className="nv-input" style={{ fontSize: 11 }}>
            {persons.map(p => <option key={p.person_id} value={p.person_id}>{p.person_id} — {p.identity_status}</option>)}
          </select>
          <Badge tone={person?.identity_status === "verified" ? "success" : "warning"}>{person?.identity_status}</Badge>
        </div>
        {person && (
          <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", padding: 10, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 11, border: "1px solid #222" }}>
            <div>person_id {person.person_id} methods {person.identity_methods.join(",")}</div>
            {person.consent_grants.map(g => (
              <div key={g.grant_id} style={{ marginTop: 6, borderTop: "1px solid #222", paddingTop: 6 }}>
                <div>grant {g.grant_id} {g.status} v{g.consent_version} {g.issued_at.slice(0,10)} → {g.expires_at.slice(0,10)} territories {g.territories.join(",")} projects {g.projects.join(",")} platforms {g.platforms.join(",")}</div>
                <div>permissions: {Object.entries(g.permissions).filter(([,v])=>v).map(([k])=>k).join(", ")}</div>
                <div>disclosure {g.required_disclosure.required ? `required ${g.required_disclosure.language} ${g.required_disclosure.minimum_duration_ms}ms` : "none"} • evidence {g.source_evidence.join(",")}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Evidence: signed_release vault://consent/... sha3-512, qualified_esignature, legal_compliance_20_years, legal_and_consent_admins_only — video carries signed proof reference, not private doc.</div>
      </Card>

      {/* Policy engine */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Policy Engine — May this operation occur? <Button size="sm" onClick={runEvaluate}>Evaluate voice_clone IN/youtube public</Button></div>
          {evalResult && (
            <div style={{ marginTop: 8, background: evalResult.decision.startsWith("allowed") ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
              <div><Badge tone={evalResult.decision === "allowed" || evalResult.decision.includes("allowed") ? "success" : "warning"}>{evalResult.decision}</Badge> {evalResult.operation} for {evalResult.person_id} • grant {evalResult.grant_id?.slice(0,12) ?? "none"}</div>
              <div>project {evalResult.project_id} territory {evalResult.territory} platform {evalResult.platform} audience {evalResult.audience}</div>
              {evalResult.reason && <div style={{ color: "#ef4444" }}>reason: {evalResult.reason}</div>}
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>No AI model can override denied/expired/revoked — possible: allowed, allowed_with_disclosure, allowed_for_review_only, allowed_with_human_approval, denied, expired, revoked, scope_mismatch, evidence_missing, identity_unverified, uncertain_identity</div>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Identity Matching (separate from authorization)</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Button size="sm" variant="ghost" onClick={() => { const c = matchIdentity({ confidence: 0.84 }); alert(`Candidates: ${c.map(x=>`${x.person_id} ${x.confidence.toFixed(2)} scope_match:${x.scope_match}`).join(" | ")}`); }}>Match 0.84 → candidate 03</Button>
              <Badge tone="neutral">Recognition confidence ≠ consent confidence</Badge>
            </div>
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Workflow: detect → temp biometric → registry lookup → scope evaluate → permit/redact/block → record — unknown 0.84 without consent → [Blur][Request consent][Mark non-identifiable][Escalate]</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Face • Voice • Presenter • Lip-sync • Body</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            <div>Face policy: unknown_faces {facePolicy.unknown_faces}, known_without_scope {facePolicy.known_faces_without_scope}, cross_tenant {String(facePolicy.cross_tenant_matching)}, retention {facePolicy.embedding_retention}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button size="sm" variant="ghost" onClick={() => { const r = evaluatePresenter("presenter_01J_demo", { project_id: projectId, territory: "IN", platform: "youtube", audience: "public", content_type: "product_education" }); alert(`Presenter ${r.decision} ${r.reason ?? ""}`); }}>Composite presenter check (face+voice+likeness+script)</Button>
              <Button size="sm" variant="ghost" onClick={() => { const r = evaluateLipSync(selectedPerson, { project_id: projectId, territory: "IN", platform: "youtube" }); alert(`Lip-sync ${r.decision}`); }}>Lip-sync requires likeness.lip_sync</Button>
            </div>
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Voice: internal_dubbing vs political_content prohibited, languages en-IN/hi-IN, max 1800s, disclosure required — possessing recording ≠ permission.</div>
          </div>
          <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
            disclosure required: {String(disclosure.required)} methods {disclosure.methods.join(", ")} • opening_card 4000ms contrast 4.5 • survives crop? {String(require("./identity-engine").checkDisclosureSurvival ? "checked" : "no")}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 6 }}><Button size="sm" variant="ghost" onClick={runAgent}>Issue agent token presenter_agent_001</Button><span style={{ fontSize: 11 }}>{agentCheck ?? "scoped token, single_use, audit_required"}</span></div>
        </Card>
      </div>

      {/* Provenance, passport, expiration */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Provenance & Passport <Button size="sm" variant="ghost" onClick={() => { const p = createIdentityProvenance(`export_${Date.now()}`, [{ operation: "voice_clone", person_id: selectedPerson, grant_id: grant?.grant_id ?? "consent_01J_demo", model_id: "n0va-voice-v5", model_version: "5.2.1", input_assets: ["audio_01J"], time_range: { start_ms: 12000, end_ms: 18400 } }]); alert(`Provenance ${p.output_id} signature ${p.signature.slice(0,16)}`); }}>Create provenance</Button></div>
          {passport && (
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 700 }}>Consent Passport — {passport.display_name}</div>
              <div>Operations: {passport.operations.join(", ")}</div>
              <div>Project: {passport.project} • Territories: {passport.territories.join(",")} • Platforms: {passport.platforms.join(",")}</div>
              <div>Status: {passport.consent_status} • Expires: {passport.expires.slice(0,10)} • Disclosure: {passport.disclosure}</div>
              <div>Evidence: {passport.evidence} • Generated by: {passport.generated_by} • Revocation: {passport.revocation_status}</div>
            </div>
          )}
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Attached to master, derivatives, social clips, thumbnails, audio exports, review links, published URLs.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Expiration & Revocation Network</div>
          <div style={{ fontSize: 11, marginTop: 6 }}>
            {expirations.length === 0 ? <span>No expiring within 60 days</span> : expirations.slice(0,2).map(e => <div key={e.grant_id}>{e.person_id.slice(0,8)} grant {e.grant_id.slice(0,8)} expires in {e.expires_in_days}d affected {e.affected_assets} assets</div>)}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <Button size="sm" variant="ghost" onClick={runRevoke}>Revoke grant (voice_cloning + presenter)</Button>
            {revocation && <Badge tone="warning">{revocation.event_id.slice(0,12)} {revocation.scope.operations.join(",")}</Badge>}
          </div>
          {revocation && (
            <div style={{ marginTop: 6, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
              <div>Revocation {revocation.event_id.slice(0,12)} propagation 8/10 complete</div>
              <div>Completed: render queue, project library, youtube queue, website CDN, review links, voice model</div>
              <div>Pending: LinkedIn takedown, DAM sync</div>
              <div>Actions: {revocation.required_actions.join(", ")}</div>
            </div>
          )}
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Propagates to render queues, review links, asset libraries, voice models, face embeddings, CDN, YouTube etc. — confirmation per destination.</div>
        </Card>
      </div>

      {/* Export gate */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Export Consent Gate <Button size="sm" variant="ghost" onClick={() => { const g = evaluateExportGate(`export_${Date.now()}`, [{ operation: "voice_clone", person_id: selectedPerson, range: "00:00:12.000–00:00:18.400" }]); alert(`Gate ${g.result} blocking: ${g.blocking_reasons.join(" | ") || "none"}`); }}>Evaluate export (voice_clone 12-18.4s + disclosure)</Button></div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 4 }}>Evaluates final output, not just timeline — checks face_permission, voice_clone_permission, disclosure, provenance, and re-evaluates after territory/platform change.</div>
        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="neutral">timeline markers 00:12.000 Voice clone — Consent active</Badge>
          <Badge tone="neutral">00:24.500 Face scope mismatch</Badge>
          <Badge tone="warning">Export readiness: BLOCKED until disclosure + expired renewal</Badge>
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Security: tenant isolation, field-level encryption HSM, encrypted biometric templates, separate DBs, least-privilege tokens, confidential inference, immutable audit, data minimization, cryptographic deletion, legal-hold exceptions.</div>
      </Card>
    </div>
  );
}
