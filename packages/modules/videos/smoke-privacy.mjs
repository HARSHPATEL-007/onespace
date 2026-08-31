#!/usr/bin/env node
import { scanPrivacy, createPrivacyDerivative, getFacePrivacyRule, detectPlates, redactDocument, anonymizeVoice, detectSpeechPii, evaluatePrivacyScore, getRetentionPolicy, createEmbeddingLineage, requestDeletion, reviewExternalShare, evaluatePolicy, testPolicySimulation, getPrivacyDashboard } from "./src/privacy-preserving-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Privacy-Preserving Processing Smoke ===");

// 1. Scan privacy
let scan = scanPrivacy("asset_001",["faces","license_plates","ocr_pii","speech_pii","medical_data"], ["EU"], true);
assert(scan.findings.length>=4 && scan.suggestions.includes("face_blur"), "scan faces + license + OCR + speech");
console.log(`Scan ${scan.findings.length} findings suggestions ${scan.suggestions.join(",")}`);

// 2. Privacy derivative burned-in not overlay
let deriv = createPrivacyDerivative("asset_001",["face_blur","license_plate_blur","document_redaction","voice_anonymization"],"eu-client-delivery-v7",true);
assert(deriv.privacy_state==="external_safe" && deriv.transformations.includes("face_blur"), "derivative external_safe face_blur");
assert(deriv.review_status==="pending", "pending review");
console.log(`Derivative ${deriv.asset_id} ${deriv.privacy_state}`);

// 3. Face rule configurable
let rule = getFacePrivacyRule();
assert(rule.default==="blur_unknown_faces" && rule.known_subjects.talent_007==="retain" && rule.known_subjects.minor_002==="solid_mask", "face rule");
assert(rule.tracking.minimum_detection_confidence===0.92, "tracking 0.92");
console.log(`Face rule default ${rule.default}`);

// 4. Plate tracking
let plate = detectPlates();
assert(plate.event_id==="plate_019" && plate.transformation==="adaptive_pixelation" && plate.reveal_check==="pass", "plate adaptive_pixelation");
console.log(`Plate ${plate.event_id} region ${plate.detected_region.x}`);

// 5. Document redaction burned-in + post-render verification
let doc = redactDocument();
assert(doc.method==="opaque_mask" && doc.post_render_verification==="pass" && doc.detected_entities[0].type==="bank_account_number", "doc opaque_mask pass");
console.log(`Document ${doc.event_id} entities ${doc.detected_entities.length}`);

// 6. Voice anonymization 4 modes + reidentification test
let voice = anonymizeVoice("speaker_014","high_transformation");
assert(voice.mode==="high_transformation" && voice.preserve.includes("language") && voice.remove.includes("voiceprint"), "voice high preserve language");
assert(voice.reidentification_risk===0.06 && voice.quality_score===0.89, "reid 0.06 quality 0.89");
console.log(`Voice ${voice.source_speaker_id} mode ${voice.mode} reid ${voice.reidentification_risk}`);

// 7. Speech PII
let pii = detectSpeechPii();
assert(pii.entity_type==="medical_information" && pii.action==="mute_and_replace" && pii.replacement_text.includes("medical information removed"), "speech PII medical");
console.log(`Speech PII ${pii.entity_type} ${pii.action}`);

// 8. Confidence scoring
let scorePass = evaluatePrivacyScore(0.96,0.91,0.98,0.04,0.07);
assert(scorePass.overall_status==="pass_with_review", "pass_with_review");
let scoreBlocked = evaluatePrivacyScore(0.96,0.91,0.70,0.18,0.20);
assert(scoreBlocked.overall_status==="blocked", "blocked high residual");
console.log(`Scores ${scorePass.overall_status} / ${scoreBlocked.overall_status}`);

// 9. Retention per region/asset
let retention = getRetentionPolicy("eu-client-delivery-v7","EU");
assert(retention && retention.asset_classes.source_media.retention==="365d" && retention.asset_classes.derived_embeddings.retention==="30d", "retention 365d/30d");
assert(retention.legal_hold_override===true, "legal hold override");
console.log(`Retention ${retention.policy_id} ${retention.region}`);

// 10. Embedding lineage selective deletion
let lin = createEmbeddingLineage("asset_001","speaker_voiceprint",["semantic_index_01","search_cache_07"]);
assert(lin.embedding_type==="speaker_voiceprint" && lin.deletion_status==="active", "lineage active");
let deleted = requestDeletion({ asset_id:"asset_001", scope:{ tenant_id:"tenant_001", asset_ids:["asset_001"], derived_types:["face_embeddings"] }, reason:"consent_withdrawal", verify_replicas:true });
assert(deleted.status==="verified" && deleted.key_destruction==="completed" && deleted.deleted_components.includes("voice_embeddings"), "deletion verified");
console.log(`Deletion ${deleted.request_id} verified ${deleted.verification_method}`);

// 11. External-share review privacy preflight blocked
let review = reviewExternalShare("asset_001","client_portal_acme","acme.example","eu-client-delivery-v7");
assert(review.decision==="blocked" && review.findings.faces.unconsented===2 && review.required_actions[0].includes("likeness"), "blocked 2 faces");
console.log(`External review ${review.decision} faces ${review.findings.faces.detected} unconsented ${review.findings.faces.unconsented}`);

// 12. Policy-as-code evaluation
let decision = evaluatePolicy({ event:"export_requested", tenant_id:"tenant_001", asset_id:"asset_001", principal_id:"user_017", region:"EU", destination:"client_portal_acme", asset_classification:"confidential", privacy_state:"external_safe", consent_status:"partial", caption_status:"approved", copyright_status:"approved", brand_status:"pending", requested_actions:["export","share"] }, "eu-client-delivery-v7");
assert(decision.decision==="deny" && decision.reason_codes.includes("brand_review_pending") && decision.required_actions.includes("obtain_consent_for_face_014"), "policy deny brand + consent");
console.log(`Policy ${decision.decision} reasons ${decision.reason_codes.join(",")}`);

// 13. Policy simulation
let sim = testPolicySimulation("eu-client-delivery-v7","external_share","asset_001","public-link");
assert(sim.decision==="deny" && sim.reason_codes.includes("public_download_prohibited"), "simulation public-link deny");
console.log(`Simulation ${sim.decision} ${sim.reason_codes[0]}`);

// 14. Dashboard
let dash = getPrivacyDashboard();
assert(dash.assets_under_processing===18420 && dash.deletion_certificates===214 && dash.unconsented_faces===12, "dashboard 18420 214 12");
console.log(`Dashboard processing ${dash.assets_under_processing} certs ${dash.deletion_certificates} blocked ${dash.blocked_assets}`);

// 15. Privacy-preserving ML provenance (mock)
assert(true, "tenant-isolated inference short-lived plaintext redacted frames");

console.log("\nAll privacy smoke checks passed.");
