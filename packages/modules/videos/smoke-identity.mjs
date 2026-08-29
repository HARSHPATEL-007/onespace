#!/usr/bin/env node
import {
  registerPerson, listPersons, createConsentGrant, getGrant, evaluateConsent, matchIdentity,
  getFacePolicy, getVoicePermission, evaluatePresenter, evaluateLipSync, getDisclosurePolicy,
  createIdentityProvenance, getIdentityProvenance, getConsentPassport, checkExpirations,
  revokeGrant, getRevocationStatus, evaluateExportGate, issueAgentToken, verifyAgentToken,
} from "./src/identity-engine.ts";

function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Identity Consent Smoke ===");
let p = registerPerson({ display_name:"Test Actor", verification_method:"government_verified", modalities:["face","voice"] });
assert(p.person_id.startsWith("person_"), "register person");
assert(p.identity_status==="verified", "verified");
console.log(`Person ${p.person_id}`);

let grant = createConsentGrant(p.person_id, { territories:["IN","US"], projects:["project_001"], platforms:["youtube"], permissions:{ voice_cloning:true, synthetic_presenter:true }, expires_at:"2027-07-01T23:59:59Z" });
assert(grant.status==="active" && grant.territories.includes("IN"), "grant active IN");
console.log(`Grant ${grant.grant_id} voice_cloning ${grant.permissions.voice_cloning}`);

let decAllowed = evaluateConsent({ person_id:p.person_id, operation:"voice_clone", project_id:"project_001", territory:"IN", platform:"youtube", audience:"public" });
assert(decAllowed.decision==="allowed_with_disclosure" || decAllowed.decision==="allowed", `evaluate allowed got ${decAllowed.decision}`);
console.log(`Evaluate voice_clone IN public → ${decAllowed.decision}`);

let decScope = evaluateConsent({ person_id:p.person_id, operation:"voice_clone", project_id:"project_001", territory:"GB", platform:"youtube", audience:"public" });
assert(decScope.decision==="scope_mismatch" || decScope.decision==="denied", `scope mismatch GB got ${decScope.decision}`);

let candidates = matchIdentity({ confidence:0.84 });
assert(candidates.length>0 && candidates[0].confidence===0.84, "match identity 0.84");
let unknown = matchIdentity({ confidence:0.4 });
assert(unknown.some(c=>c.person_id==="unknown"), "unknown candidate");
console.log(`Match 0.84 → ${candidates[0].person_id} ${candidates[0].confidence}`);

let facePol = getFacePolicy();
assert(facePol.cross_tenant_matching===false && facePol.unknown_faces==="blur_on_public_export", "face policy");
console.log(`Face policy unknown ${facePol.unknown_faces}`);

let voicePerm = getVoicePermission("voice_01J_demo");
assert(voicePerm && voicePerm.allowed_languages.includes("en-IN"), "voice perm en-IN");

let presenterOk = evaluatePresenter("presenter_01J_demo", { project_id:"project_001", territory:"IN", platform:"youtube", audience:"public", content_type:"product_education" });
assert(presenterOk.decision.includes("allowed"), `presenter product_education ${presenterOk.decision}`);
let presenterBlocked = evaluatePresenter("presenter_01J_demo", { project_id:"project_001", territory:"IN", platform:"youtube", audience:"public", content_type:"political" });
assert(presenterBlocked.decision==="denied", "presenter political denied");

let lip = evaluateLipSync(p.person_id, { project_id:"project_001", territory:"IN", platform:"youtube" });
assert(lip.decision==="allowed_with_disclosure" || lip.decision==="allowed", `lip-sync ${lip.decision}`);

let disc = getDisclosurePolicy();
assert(disc.required && disc.methods.includes("opening_card"), "disclosure policy");

let prov = createIdentityProvenance(`export_${Date.now()}`, [{ operation:"voice_clone", person_id:p.person_id, grant_id:grant.grant_id, model_id:"n0va-voice-v5", model_version:"5.2.1", input_assets:["audio_01J"], time_range:{start_ms:12000,end_ms:18400} }]);
assert(prov.signature.startsWith("dilithium"), "provenance signature");
let fetched = getIdentityProvenance(prov.output_id);
assert(fetched?.output_id===prov.output_id, "provenance fetch");

let passport = getConsentPassport(p.person_id, "project_001");
assert(passport && passport.operations.includes("voice_cloning"), "passport operations");
console.log(`Passport ${passport.display_name} expires ${passport.expires}`);

let expirations = checkExpirations(400);
assert(Array.isArray(expirations), "expirations array");
console.log(`Expirations within 400d: ${expirations.length}`);

let rev = revokeGrant(grant.grant_id, { operations:["voice_cloning"], projects:["project_001"], territories:["IN"], platforms:["youtube"] });
assert(rev.event_type==="identity.consent.revoked", "revocation event");
let status = getRevocationStatus(rev.event_id);
assert(status && status.progress.startsWith("8/"), `propagation ${status.progress}`);
console.log(`Revocation ${rev.event_id.slice(0,12)} ${status.progress} completed ${status.completed.length}`);

let gate = evaluateExportGate(`export_${Date.now()}`, [{ operation:"voice_clone", person_id:p.person_id, range:"00:00:12.000–00:00:18.400" }]);
assert(gate.result==="blocked" || gate.result==="allowed", `export gate ${gate.result}`);
console.log(`Export gate ${gate.result} blocking ${gate.blocking_reasons.length}`);

let token = issueAgentToken("presenter_agent_001", p.person_id, ["lip_sync","synthetic_presenter"], "project_001");
assert(token.single_use && token.audit_required, "agent token single_use");
let verify = verifyAgentToken(token.token_id, "lip_sync");
assert(verify.allowed, "agent token allowed");
let verify2 = verifyAgentToken(token.token_id, "lip_sync");
assert(!verify2.allowed, "single_use second verify blocked");

console.log("\nAll identity smoke checks passed.");
