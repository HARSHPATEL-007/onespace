"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  scanPrivacy, createPrivacyDerivative, getFacePrivacyRule, detectPlates, redactDocument, anonymizeVoice, detectSpeechPii,
  evaluatePrivacyScore, getRetentionPolicy, createEmbeddingLineage, requestDeletion, reviewExternalShare, evaluatePolicy, testPolicySimulation, getPrivacyDashboard, getPolicyDefinition,
} from "./privacy-preserving-engine";

export function PrivacyPreservingPanel({ projectId }: { projectId: string }) {
  const dashboard = useMemo(()=>getPrivacyDashboard(),[]);
  const policy = useMemo(()=>getPolicyDefinition("eu-client-delivery-v7"),[]);
  const [scan, setScan] = useState(()=>scanPrivacy("asset_001",["faces","license_plates","ocr_pii","speech_pii","medical_data"], ["EU"], true));
  const [derivative, setDerivative] = useState(() => createPrivacyDerivative("asset_001",["face_blur","license_plate_blur","document_redaction","voice_anonymization"],"eu-client-delivery-v7",true));
  const faceRule = useMemo(()=>getFacePrivacyRule(),[]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1e293b 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>PRIVACY-PRESERVING PROCESSING — DETECT → CLASSIFY → TRANSFORM → VERIFY → REVIEW → SHARE DERIVATIVE → RETAIN → DELETE WITH EVIDENCE</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Non-destructive, policy-controlled, reversible where permitted, auditable</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Ingest → Discovery → Transform → Review → External review → Export → Retention → Deletion</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Original immutable, privacy-safe derivatives separate</span>
        </div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, fontSize:11 }}>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Under processing</div><div style={{ fontWeight:800 }}>{dashboard.assets_under_processing.toLocaleString()}</div></div>
          <div style={{ background:"rgba(251,191,36,0.15)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Unconsented faces</div><div style={{ fontWeight:800 }}>{dashboard.unconsented_faces}</div></div>
          <div style={{ background:"rgba(239,68,68,0.15)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Unredacted PII</div><div style={{ fontWeight:800 }}>{dashboard.unredacted_pii}</div></div>
          <div style={{ background:"rgba(16,185,129,0.08)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Deletion certs</div><div style={{ fontWeight:800 }}>{dashboard.deletion_certificates}</div></div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Privacy Asset Classes — explicit states</div>
          <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {[
              ["RAW_RESTRICTED","original max restrictions"],
              ["INTERNAL_PRIVACY_PROCESSED","transformed internal"],
              ["EXTERNAL_SAFE","approved external policy"],
              ["PUBLIC_SAFE","public release"],
              ["LEGAL_HOLD","deletion suspended"],
              ["DELETION_PENDING","scheduled removal"],
              ["DELETED_VERIFIED","cryptographically evidenced"],
            ].map(([s,d])=>(
              <div key={s as string} style={{ background: derivative.privacy_state=== (s as string).toLowerCase() ? "rgba(16,185,129,0.08)" : "var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <div style={{ fontWeight:700 }}>{s as string}</div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>{d as string}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:8, fontSize:11, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Asset {derivative.asset_id} source {derivative.source_asset_id} state {derivative.privacy_state} transformations {derivative.transformations.join(",")} policy {derivative.policy_id} review {derivative.review_status}</div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const d = createPrivacyDerivative("asset_001",["face_blur","license_plate_blur"],"eu_external_share",true);
              setDerivative(d); alert(`Derivative ${d.asset_id} ${d.privacy_state} burned-in, not overlay`);
            }}>Create privacy-safe derivative</Button>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Face & Plate Privacy — tracked</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>Face default {faceRule.default} talent_007 retain minor_002 solid_mask tracking conf 0.92 max untracked 2 reident check true · review if {faceRule.review_required_if.join(", ")}</div>
              <div>Plate plate_019 vehicle_12 201400-208900 region 0.61,0.44 adaptive_pixelation conf 0.97 reveal pass — includes reflections/thumbnails/proxies/exports</div>
              <div>Available: Gaussian blur/pixelation/soft anonymization/solid mask/texture/silhouette — high-risk use solid mask not blur</div>
            </div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const p = detectPlates(); alert(`Plate ${p.event_id} ${p.transformation} ${p.reveal_check} tracked through motion/cuts/reflections`);
              }}>Detect plate</Button>
              <Badge tone="neutral">Validate motion/thumbnail/resolution/AI no reconstruction</Badge>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Screen & Document Redaction — OCR + verification</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div>Redaction redact_0042 884200-891300 region 0.18,0.22 0.61×0.48 entities bank_account 0.96 customer_email 0.93 method opaque_mask post_render pass — burned into derivative</div>
              <Button size="sm" variant="ghost" onClick={()=>{
                const r = redactDocument(); alert(`Redaction ${r.event_id} ${r.method} verification ${r.post_render_verification}`);
              }}>Redact document</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Detect email/phone/address/gov IDs/cards/medical/legal/passwords/dashboards/source code — re-run OCR after crop/super-resolution/caption/export</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Voice Anonymization — 4 modes</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["low_transformation","moderate_transformation","high_transformation","full_anonymization"].map(m=>(
                <Badge key={m} tone="neutral">{m}</Badge>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const v = anonymizeVoice("speaker_014","high_transformation");
              alert(`Voice ${v.source_speaker_id} mode ${v.mode} reid ${v.reidentification_risk} quality ${v.quality_score} preserve ${v.preserve.join(",")}`);
            }}>Anonymize high_transformation</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Test voiceprint comparison/speaker verification/human/cross-segment/background leakage · Consider phrases/accent/rhythm/breathing — never confuse with cloning</div>
            <div style={{ marginTop:6, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div>Speech PII: medical_information 921400-924100 speaker_014 conf 0.94 action mute_and_replace "[medical information removed]" pending — treatments: mute/neutral tone/generic wording/voice-over/transcript-only/segment removal</div>
              <Button size="sm" variant="ghost" onClick={()=>{
                const s = detectSpeechPii(); alert(`Speech PII ${s.entity_type} ${s.action} ${s.replacement_text}`);
              }}>Detect speech PII</Button>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Privacy Confidence Scoring</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {[
              evaluatePrivacyScore(0.96,0.91,0.98,0.04,0.07),
              evaluatePrivacyScore(0.85,0.80,0.70,0.12,0.18),
            ].map((s,i)=>(
              <div key={i} style={{ display:"flex", gap:6, alignItems:"center", background: s.overall_status==="pass"?"rgba(16,185,129,0.08)":s.overall_status==="pass_with_review"?"rgba(251,191,36,0.08)":"rgba(239,68,68,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginBottom:6 }}>
                <Badge tone={s.overall_status==="pass"?"success":s.overall_status==="pass_with_review"?"warning":"neutral"}>{s.overall_status}</Badge>
                <span>detect {s.detection_confidence} class {s.classification_confidence} coverage {s.transformation_coverage} residual {s.residual_exposure_risk} reid {s.reidentification_risk}</span>
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Low→auto logged · Moderate→privacy review · High→block stronger transform · Unknown→preserve original escalate · Medical/financial stricter false-negatives worse</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Retention & Embeddings Lineage</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>Policy eu-client-delivery-v7 EU source_media 365d review_exports 90d derived_embeddings 30d privacy_reports 730d legal_hold override true</div>
              <div>Applies to originals/proxies/thumbnails/stems/captions/transcripts/OCR/embeddings/indexes/caches/render/review/DRM/watermark/logs/analytics/backups</div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const lin = createEmbeddingLineage("asset_001","speaker_voiceprint",["semantic_index_01","search_cache_07"]);
                alert(`Embedding ${lin.embedding_id} type ${lin.embedding_type} stores ${lin.stores.join(",")}`);
              }}>Create embedding lineage</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const cert = requestDeletion({ asset_id:"asset_001", scope:{ tenant_id:"tenant_001", asset_ids:["asset_001"], derived_types:["face_embeddings","voice_embeddings"] }, reason:"consent_withdrawal", verify_replicas:true });
                alert(`Deletion ${cert.request_id} verified ${cert.status} key ${cert.key_destruction}`);
              }}>Verified deletion</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Active deletion vs cryptographic deletion vs backup expiry vs verified purge — distinguish immutable backup guarantee</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>External-Share Review — privacy preflight</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" onClick={()=>{
              const r = reviewExternalShare("asset_001","client_portal_acme","acme.example","eu-client-delivery-v7");
              alert(`Review ${r.decision} faces ${r.findings.faces.unconsented} blocked required ${r.required_actions.join(",")}`);
            }}>Review external share client_portal_acme</Button>
            <div style={{ marginTop:6, background:"rgba(239,68,68,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div>Findings: faces 14 detected 2 unconsented blocked · plates 3/3 pass · speech_pii 1/1 pass · ocr 0 · embeddings false pass → decision blocked resolve_likeness</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Flow: select destination → resolve recipient → classify → scan → consent → transform → retention → export → human review → scoped capability — use privacy-safe derivative never raw</div>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Policy-as-Code — eu-client-delivery v7</div>
          <div style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
            <div>policy eu-client-delivery v7 scope EU client-portal/broadcast require valid_likeness/captions/copyright/brand/privacy_scan prohibit public_download/raw_external/unredacted_pii retention source 365d review 90d embeddings 30d privacy blur faces/plates/medical/financial voice required approval external_share privacy_officer+project_owner</div>
            <div>Precedence: Legal hold → Platform baseline → Regional → Tenant → Client contract → Project</div>
          </div>
          <div style={{ marginTop:6, display:"flex", gap:6 }}>
            <Button size="sm" variant="ghost" onClick={()=>{
              const d = evaluatePolicy({ event:"export_requested", tenant_id:"tenant_001", asset_id:"asset_001", principal_id:"user_017", region:"EU", destination:"client_portal_acme", asset_classification:"confidential", privacy_state:"external_safe", consent_status:"partial", caption_status:"approved", copyright_status:"approved", brand_status:"pending", requested_actions:["export","share"] }, "eu-client-delivery-v7");
              alert(`${d.decision} reasons ${d.reason_codes.join(",")} actions ${d.required_actions.join(",")}`);
            }}>Evaluate export policy</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const sim = testPolicySimulation("eu-client-delivery-v7","external_share","asset_001","public-link");
              alert(`Simulation ${sim.decision} reasons ${sim.reason_codes.join(",")}`);
            }}>Simulate public-link deny</Button>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Test unit: Given unconsented face When export Then blocked · Every decision versioned reproducible</div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Privacy-Preserving ML & Strongest Enhancement</div>
        <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div>Region-level tenant-isolated inference · short-lived plaintext · input minimization · redacted frames · separate sensitive embeddings · no training by default · differential privacy · deletion propagation</div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Model output tenant_scope training_use false retention 30d deletion_dependency delete_0091 provenance: n0va-privacy-detector-v5 asset_001 842100-914800 tenant_001</div>
          </div>
          <div style={{ background:"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div style={{ fontWeight:700 }}>Detect → Classify → Transform → Verify → Review → Share derivative → Retain → Delete with evidence</div>
            <div>Policy-as-code governs Ingest→Edit→Review→Export→Deliver→Archive→Delete — demonstrate what was detected, transformed, who approved, which policy allowed, how long retained, evidence of deletion</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
