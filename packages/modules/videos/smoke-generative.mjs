#!/usr/bin/env node
import {
  createOriginalAsset, createGeneratedAsset, promoteToEditorial, clearGenerativeStores, createTextToVideoJob, listJobs, createImageToVideoJob, createObjectRemovalOp, checkBackgroundExtension, generateCameraVariations, createProductAnchor, createCharacterAnchor, checkAnchorCompliance, createStoryboardCards, createContinuationJob, suggestBroll, getProvenance, getSegmentProvenance, getPromptHistory, addPromptVersion, checkUsage, createConsent, revokeConsent, runSafetyChecks, complianceReport, approveAsset, processingRoute, listAssets
} from "./src/generative-engine.ts";

function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Generative Workspace Smoke ===");
clearGenerativeStores();

// workspace separation
const orig = createOriginalAsset("A003C004_001.R3D");
assert(orig.domain==="ORIGINALS" && orig.badge==="Original" && orig.status==="immutable", "Originals immutable Original badge");
const gen = createGeneratedAsset("prompt_01", 841992);
assert(gen.domain==="GENERATED_WORKSPACE" && gen.badge==="Generated", "Generated marked at ingestion");
const promo = promoteToEditorial(gen.asset_id);
assert(promo?.domain==="EDITORIAL_DERIVATIVES" && promo.badge==="GEN", "Promote to editorial derivatives");
console.log(`Domains ${orig.asset_id} Original → ${gen.asset_id} Generated → ${promo.asset_id} Editorial`);

// text-to-video reproducible job
const job = createTextToVideoJob({ prompt:"A close product shot on a studio table with warm lighting, slow lateral camera move", duration_ms:5000, seed:841992, model_id:"n0va-video-gen-pro", reference_assets:["product_nova_phone_01"], policy_profile:"commercial_brand_safe" });
assert(job.generation_job.seed===841992 && job.generation_job.model_id==="n0va-video-gen-pro", "text-to-video seed+model");
assert(job.prompt_hash.startsWith("sha3-512:"), "prompt hash");
assert(job.output_asset_id && job.status==="generated", "generated output");
assert(job.generation_job.negative_prompt.includes("warped logo"), "negative prompt");
console.log(`Job ${job.job_id} output ${job.output_asset_id}`);

// image-to-video preserves original as controlling reference
const img = createOriginalAsset("reference_image_01.jpg");
const iv = createImageToVideoJob(img.asset_id, "start_frame");
assert(iv.control_map.includes("animated=start_frame") && iv.control_map.includes("preserved=background"), "image-to-video control map preserves original");
console.log(`Image-to-video control ${iv.control_map}`);

// generative fill non-destructive
const op = createObjectRemovalOp({ source_asset_id:"asset_004", range:{start_ms:1200,end_ms:4800} });
assert(op.type==="object_removal" && op.mask_details?.stabilized===true && op.preserve.includes("cast shadow"), "object removal mask frame-accurate + preserve");
assert(op.output_mode==="new_derived_asset", "new derived asset, original recoverable");
console.log(`Fill op mask ${op.mask_id} feather ${op.mask_details.feather}`);

// background extension warnings
const bgWarn = checkBackgroundExtension({type:"horizontal", perspective_aware:false});
assert(bgWarn.warnings.length>0, "background extension warnings");

// camera variations — simulated vs synthetic distinction
const vars = generateCameraVariations(job.output_asset_id, 4);
assert(vars.length===4, "4 variations");
assert(vars.some(v=>v.generation_method==="camera_simulation"), "camera simulation present");
assert(vars.some(v=>v.generation_method==="synthetic_regeneration"), "synthetic regeneration present");
console.log(`Variations ${vars.map(v=>v.generation_method).join(", ")}`);

// anchors
const pa = createProductAnchor({ anchor_id:"product_nova_phone_01" });
assert(pa.constraints.preserve_logo===true, "product anchor preserve_logo");
const ca = createCharacterAnchor();
assert(ca.consent.permitted_use==="commercial", "character consent");
const anchorCheck = checkAnchorCompliance(job.output_asset_id, pa.anchor_id);
assert(typeof anchorCheck.passed==="boolean" && anchorCheck.confidence===0.92, "anchor check");
console.log(`Anchor check passed:${anchorCheck.passed} warnings:${anchorCheck.warnings.join(",")||"none"}`);

// storyboard
const cards = createStoryboardCards(["Designed for creators","Place product on table","Reveal hinge"]);
assert(cards.length===3 && cards[0].generation_status==="exploratory", "storyboard exploratory not final");
assert(cards[0].reference==="product_nova_phone_01", "storyboard reference anchor");
console.log(`Storyboard ${cards.map(c=>`${c.scene} ${c.shot} ${c.framing}`).join(" | ")}`);

// continuation preserves identity
const cont = createContinuationJob({ source_clip_id:"clip_021", extend_by_ms:2400 });
assert(cont.preserve.includes("subject_identity") && cont.temporal_consistency_target===0.92, "continuation preserves identity");
console.log(`Continuation ${cont.source_clip_id} +${cont.extend_by_ms}ms`);

// B-roll as branch
const broll = suggestBroll({ product_anchor:"product_nova_phone_01" });
assert(broll.length>=2 && broll[0].source==="generated" && broll[0].brand_risk==="low", "B-roll generated low brand risk");
assert(broll[0].suggested_insertion==="00:01:14.200", "B-roll insertion point");
console.log(`B-roll ${broll[0].concept} @${broll[0].suggested_insertion}`);

// provenance — machine + visible + segment
const prov = getProvenance(job.output_asset_id);
assert(prov?.integrity.signature==="signed-manifest..." && prov.model.model_id==="n0va-video-gen-pro", "machine provenance signed manifest");
assert(prov?.usage_restrictions.territories.includes("IN"), "usage territories");
const seg = getSegmentProvenance("tl001");
assert(seg?.segments.some(s=>s.status==="ai_generated"), "segment provenance ai_generated");
console.log(`Provenance asset ${prov.asset_id} hash ${prov.integrity.asset_hash.slice(0,16)}`);
console.log(`Segments ${seg.segments.map(s=>`${s.status}:${s.start_ms}-${s.end_ms}`).join(" | ")}`);

// prompt history versioned like code, field-encrypted
const hist = getPromptHistory(job.prompt_id);
assert(hist && hist.length===1 && hist[0].version===1, "prompt history v1");
const v2 = addPromptVersion(job.prompt_id, { prompt:"A close product shot on studio table, remove unapproved text", user_id:"user_003" });
assert(v2?.version===2, "prompt history v2");
console.log(`Prompt history ${hist.length} versions → v${v2.version}`);

// usage restrictions at generate/insert/publish
const usageCheck = checkUsage(job.output_asset_id, "publish");
assert(["allowed","blocked"].includes(usageCheck.result), "usage check");
const blocked = checkUsage("restricted_gen_01", "publish");
assert(blocked.result==="blocked" && blocked.reasons.length>0, "blocked territory");
console.log(`Usage check publish ${usageCheck.result}, blocked demo ${blocked.result}`);

// consent revocation
const cons = createConsent({ subject:"character_hero_01", rights_owner:"talent_01", permitted_use:"commercial" });
assert(cons.revocation_status==="active", "consent active");
const rev = revokeConsent(cons.consent_id);
assert(typeof rev.affected_assets==="object", "revocation affected assets");
console.log(`Consent ${cons.consent_id} → revoked, affected ${rev.affected_assets.length}`);

// safety checks
const safety = runSafetyChecks(job.output_asset_id);
assert(safety.length>=10 && safety.some(s=>s.check==="logo deformation"), "safety checks 10+");
console.log(`Safety ${safety.filter(s=>!s.passed).length} failed of ${safety.length}`);

// compliance report
const rep = complianceReport("tl001");
assert(rep.total_segments>=3 && rep.provenance.present>=1, "compliance report");
assert(rep.export_status==="blocked", "export blocked initially");
console.log(`Compliance total ${rep.total_segments} fully ${rep.fully_generated} export ${rep.export_status} issues: ${rep.issues.join(" | ")}`);

// approval with disclosure mode
const appr = approveAsset(job.output_asset_id, "approved_for_editorial", "segment_label_and_manifest", { commercial:true, territories:["IN","US"], expires_at:"2027-08-28T00:00:00Z" });
assert(appr.decision==="approved_for_editorial" && appr.disclosure_mode==="segment_label_and_manifest", "approval with disclosure");
console.log(`Approved ${appr.asset_id} ${appr.decision} disclosure ${appr.disclosure_mode}`);

// on-prem route
const route = processingRoute(true);
assert(route.location.includes("Mumbai") && route.cloud_fallback===false, "on-prem Mumbai no fallback");
console.log(`Processing route ${route.location} fallback ${route.cloud_fallback}`);

// timeline tracks V1/V3 badges - check via listAssets domains
const allAssets = listAssets();
assert(allAssets.some(a=>a.domain==="ORIGINALS"), "has originals");
assert(allAssets.some(a=>a.domain==="GENERATED_WORKSPACE"||a.domain==="EDITORIAL_DERIVATIVES"), "has generated");
console.log(`Assets ${allAssets.map(a=>`${a.asset_id}:${a.domain}:${a.badge}`).slice(0,3).join(" | ")}`);

console.log("\nAll generative smoke checks passed.");
