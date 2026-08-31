/**
 * N0VA VIDEOS — Privacy-Preserving Processing Engine
 * Detect → Classify → Transform → Verify → Review → Share derivative → Retain → Delete with evidence
 */
import type {
  PrivacyAsset, FacePrivacyRule, PlatePrivacyEvent, DocumentRedaction, VoicePrivacy, SpeechPiiFinding,
  PrivacyScore, RetentionPolicy, EmbeddingLineage, DeletionCertificate, ExternalShareReview,
  PolicyDefinition, PolicyContext, PolicyDecision, PrivacyDashboardMetrics,
} from "./privacy-preserving-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

const privacyAssets = new Map<string, PrivacyAsset>();
const deletionCerts = new Map<string, DeletionCertificate>();
const embeddingLineages = new Map<string, EmbeddingLineage>();
const scanFindings = new Map<string, unknown[]>();

const POLICIES = new Map<string, PolicyDefinition>([
  ["eu-client-delivery-v7", {
    policy_id:"eu-client-delivery-v7", name:"eu-client-delivery", version:7,
    scope:{ regions:["EU"], destinations:["client-portal","broadcast"] },
    require:["valid_likeness_consent","captions","copyright_scan","brand_review","privacy_scan"],
    prohibit:["public_download","unapproved_voice_clone","raw_source_external_share","unredacted_pii_export"],
    retention:{ source_media:"365d", review_exports:"90d", derived_embeddings:"30d" },
    privacy:{ blur_unknown_faces:true, blur_license_plates:true, redact_medical_data:true, redact_financial_data:true, anonymize_sensitive_voices:"required" },
    approval:{ external_share:{ required_roles:["privacy_officer","project_owner"] }, unwatermarked_export:{ required_roles:["security_officer","producer"] } },
  }],
]);

export function scanPrivacy(assetId: string, detectors: string[], regions: string[] = ["EU"], createSuggestions=true): { findings: unknown[]; suggestions: string[] } {
  const findings: unknown[] = [];
  if (detectors.includes("faces")) findings.push({ type:"face", count:14, unconsented:2, confidence:0.96 });
  if (detectors.includes("license_plates")) findings.push({ type:"license_plate", count:3, confidence:0.97 });
  if (detectors.includes("ocr_pii")) findings.push({ type:"ocr_pii", entities:[{type:"bank_account_number",confidence:0.96},{type:"customer_email",confidence:0.93}] });
  if (detectors.includes("speech_pii")) findings.push({ type:"speech_pii", entity:"medical_information", confidence:0.94, range:{start_ms:921400,end_ms:924100} });
  if (detectors.includes("medical_data")) findings.push({ type:"medical", count:2, confidence:0.88 });
  if (detectors.includes("financial_data")) findings.push({ type:"financial", count:1, confidence:0.91 });
  scanFindings.set(assetId, findings);
  const suggestions = createSuggestions ? ["face_blur","license_plate_blur","document_redaction","voice_anonymization"] : [];
  return { findings, suggestions };
}

export function createPrivacyDerivative(assetId: string, transformations: string[], profile: string, postRenderVerification=true): PrivacyAsset {
  const asset: PrivacyAsset = {
    asset_id: `${assetId}_privacy_${uid("v").slice(-2)}`, source_asset_id: assetId, privacy_state:"external_safe",
    transformations: transformations as PrivacyAsset["transformations"], policy_id: profile, review_status:"pending", created_at: nowIso(),
  };
  // Verify post-render
  if (postRenderVerification) {
    // mock re-run OCR after transform
  }
  privacyAssets.set(asset.asset_id, asset);
  return asset;
}

export function getFacePrivacyRule(): FacePrivacyRule {
  return {
    default:"blur_unknown_faces",
    known_subjects:{ talent_007:"retain", customer_014:"blur", minor_002:"solid_mask" },
    tracking:{ minimum_detection_confidence:0.92, maximum_untracked_frames:2, reidentification_check:true },
    review_required_if:["face_occluded","identity_uncertain","motion_blur","multiple_overlapping_faces"],
  };
}
export function detectPlates(): PlatePrivacyEvent {
  return {
    event_id:"plate_019", vehicle_track_id:"vehicle_12", time_range:{ start_ms:201400, end_ms:208900 },
    detected_region:{ x:0.61, y:0.44, width:0.09, height:0.04 }, transformation:"adaptive_pixelation", confidence:0.97, reveal_check:"pass",
  };
}
export function redactDocument(): DocumentRedaction {
  return {
    event_id:"redact_0042", time_range:{ start_ms:884200, end_ms:891300 }, region:{ x:0.18, y:0.22, width:0.61, height:0.48 },
    detected_entities:[{type:"bank_account_number",confidence:0.96},{type:"customer_email",confidence:0.93}], method:"opaque_mask", post_render_verification:"pass",
  };
}
export function anonymizeVoice(speakerId: string, mode: VoicePrivacy["mode"] = "high_transformation"): VoicePrivacy {
  return {
    source_speaker_id: speakerId, mode,
    preserve: mode==="high_transformation" ? ["language","speech_content","approximate_emotion"] : ["language"],
    remove: ["voiceprint","speaker_identity","biometric_characteristics"],
    reidentification_risk: mode==="high_transformation"?0.06:0.12, quality_score:0.89, review_required:true,
  };
}
export function detectSpeechPii(): SpeechPiiFinding {
  return { range:{ start_ms:921400, end_ms:924100 }, speaker_id:"speaker_014", entity_type:"medical_information", confidence:0.94, action:"mute_and_replace", replacement_text:"[medical information removed]", review_status:"pending" };
}

export function evaluatePrivacyScore(detection: number, classification: number, coverage: number, exposure: number, reid: number): PrivacyScore {
  let overall: PrivacyScore["overall_status"] = "pass";
  if (exposure>0.15 || reid>0.15) overall="blocked";
  else if (exposure>0.05 || reid>=0.07) overall="pass_with_review";
  else if (detection<0.8) overall="escalate";
  return { detection_confidence:detection, classification_confidence:classification, transformation_coverage:coverage, residual_exposure_risk:exposure, reidentification_risk:reid, overall_status:overall };
}

export function getRetentionPolicy(policyId: string, region="EU"): RetentionPolicy | null {
  const base = POLICIES.get(policyId);
  if (!base) return null;
  return {
    policy_id: policyId, region,
    asset_classes:{
      source_media:{ retention:"365d", basis:"contractual_production" },
      review_exports:{ retention:"90d", basis:"client_review" },
      derived_embeddings:{ retention:"30d", basis:"temporary_search" },
      privacy_reports:{ retention:"730d", basis:"compliance_audit" },
    },
    legal_hold_override:true,
  };
}

export function createEmbeddingLineage(assetId: string, type: string, stores: string[]): EmbeddingLineage {
  const e: EmbeddingLineage = { embedding_id: uid("embedding"), source_asset_id: assetId, source_ranges:[{start_ms:0,end_ms:124500}], embedding_type: type, stores, deletion_status:"active" };
  embeddingLineages.set(e.embedding_id, e);
  return e;
}
export function deleteEmbeddingsByAsset(assetId: string): EmbeddingLineage[] {
  const affected = Array.from(embeddingLineages.values()).filter(e=>e.source_asset_id===assetId);
  for (const e of affected) e.deletion_status="pending";
  return affected;
}
export function deleteEmbeddingsByPerson(personId: string): EmbeddingLineage[] {
  // mock: find voice embeddings for person
  const affected = Array.from(embeddingLineages.values()).filter(e=>e.embedding_type==="speaker_voiceprint");
  for (const e of affected) e.deletion_status="pending";
  return affected;
}

export function requestDeletion(input: { asset_id?: string; subject_id?: string; scope: { tenant_id: string; asset_ids?: string[]; derived_types?: string[] }; reason: string; verify_replicas?: boolean }): DeletionCertificate {
  const assetId = input.asset_id ?? input.scope.asset_ids?.[0] ?? "asset_001";
  // Legal hold check mock: none
  const cert: DeletionCertificate = {
    request_id: uid("delete"), asset_id: assetId, requested_at: nowIso(),
    deleted_components:["original","proxy","thumbnail","audio_stems","captions","ocr_output","visual_embeddings","voice_embeddings","search_index_entries","cdn_cache_objects","review_links"],
    replicas_checked:["region_eu_1","region_eu_2","region_us_1"], cache_invalidation:"verified", key_destruction:"completed",
    verification_method:"cryptographic_manifest_and_storage_scan", status:"verified",
    evidence_hashes:{ pre_manifest:`sha3-512:pre_${assetId}`, post_manifest:`sha3-512:post_${assetId}` },
  };
  // Handle derived embeddings lineage
  if (input.scope.derived_types) {
    for (const t of input.scope.derived_types) {
      const lin = createEmbeddingLineage(assetId, t, ["semantic_index_01"]);
      lin.deletion_status="verified";
    }
  }
  deletionCerts.set(cert.request_id, cert);
  return cert;
}
export function getDeletionCertificate(requestId: string): DeletionCertificate | null { return deletionCerts.get(requestId) ?? null; }

export function reviewExternalShare(assetId: string, destination: string, recipientDomain: string, policyId: string): ExternalShareReview {
  const destinat = destination;
  const findings = {
    faces:{ detected:14, unconsented:2, status: "blocked" },
    license_plates:{ detected:3, redacted:3, status:"pass" },
    speech_pii:{ detected:1, redacted:1, status:"pass" },
    ocr_pii:{ detected:0, status:"pass" },
    embeddings:{ external_inclusion:false, status:"pass" },
  };
  const blocked = findings.faces.status==="blocked";
  return {
    destination: destinat, recipient_domain: recipientDomain, asset_id: assetId, findings,
    decision: blocked ? "blocked" : "allow",
    required_actions: blocked ? ["resolve_likeness_consent_for_two_faces"] : [],
  };
}

export function evaluatePolicy(context: PolicyContext, policyId?: string): PolicyDecision {
  const pid = policyId ?? "eu-client-delivery-v7";
  const policy = POLICIES.get(pid);
  const reasonCodes: string[] = [];
  const requiredActions: string[] = [];
  let decision: "allow"|"deny" = "allow";
  // Check prohibit: public_download
  if (context.destination==="public-link" && policy?.prohibit.includes("public_download")) { reasonCodes.push("public_download_prohibited"); decision="deny"; }
  // Check privacy: unredacted PII
  if (context.privacy_state!=="external_safe" && context.destination==="client_portal_acme") {
    // needs privacy scan
  }
  // Check likeness consent incomplete
  if (context.consent_status==="partial") { reasonCodes.push("likeness_consent_incomplete"); decision="deny"; requiredActions.push("obtain_consent_for_face_014","obtain_consent_for_face_015"); }
  // Check brand pending
  if (context.brand_status==="pending") { reasonCodes.push("brand_review_pending"); decision="deny"; requiredActions.push("complete_brand_review"); }
  // Check high-risk domain
  if (context.asset_classification==="confidential" && context.destination==="public-link") { reasonCodes.push("unredacted_pii_present"); decision="deny"; }
  if (reasonCodes.length===0) reasonCodes.push("policy_allowed");
  if (decision==="deny" && requiredActions.length===0) requiredActions.push("resolve_policy_violation");
  return {
    decision_id: uid("decision"), policy_id: pid, event: context.event, decision, reason_codes: reasonCodes, required_actions: requiredActions,
    evaluated_at: nowIso(), expires_at: new Date(Date.now()+10*60000).toISOString(),
  };
}

export function testPolicySimulation(policyId: string, event: string, assetId: string, destination: string): PolicyDecision {
  return evaluatePolicy({ event, tenant_id:"tenant_001", asset_id: assetId, principal_id:"user_017", region:"EU", destination, asset_classification:"confidential", privacy_state:"raw_restricted", consent_status:"partial", caption_status:"approved", copyright_status:"approved", brand_status:"pending", requested_actions:["export","share"] }, policyId);
}

export function getPrivacyDashboard(): PrivacyDashboardMetrics {
  return {
    assets_under_processing: 18420, external_share_pending:37, unconsented_faces:12, unredacted_pii:4, voice_reviews:8,
    embeddings_pending_deletion:0, deletion_certificates:214, replica_verifications_pending:2, failed_policy_tests:1, blocked_assets:19, retention_expiries_30d:482,
  };
}

export function getPolicyDefinition(policyId: string): PolicyDefinition | null { return POLICIES.get(policyId) ?? null; }
export function listPrivacyAssets(): PrivacyAsset[] { return Array.from(privacyAssets.values()); }
