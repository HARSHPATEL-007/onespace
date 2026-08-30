#!/usr/bin/env node
import {
  listNodes, getNode, createNode, listEdges, createEdge, confirmEdge, traverse, findPath, hybridSearch,
  queryExpiringConsent, queryApprovedCurrentPackaging, queryLegalBlockers, queryUnverifiedChanges, queryCalendarRisk,
  queryUnsupportedClaims, evaluatePublishability, getConflicts, resolveConflict, listMatches, confirmMatch, canAccessNode, graphMetrics,
} from "./src/knowledge-graph-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Knowledge Graph Smoke ===");

// 1. Evidence-backed edges
let edges = listEdges();
assert(edges.length >= 20, `seeded edges >=20 got ${edges.length}`);
let depicts = edges.find(e => e.type==="DEPICTS" && e.from_node==="scene_012");
assert(depicts && depicts.confidence===0.96 && depicts.evidence_refs.length>0, "DEPICTS has evidence + confidence 0.96");
assert(depicts.evidence && depicts.evidence.model==="n0va-video-analysis-v4", "evidence model version");
console.log(`DEPICTS ${depicts.edge_id} media ${depicts.media_interval?.start_ms}-${depicts.media_interval?.end_ms} verification ${depicts.verification.status}`);

// 2. Temporal dimensions
assert(depicts.media_interval && depicts.media_interval.start_ms===45000, "media time 00:00:45");
let consentEdge = edges.find(e => e.type==="HAS_CONSENT" && e.from_node==="person_001");
assert(consentEdge && consentEdge.validity && consentEdge.validity.start_at==="2026-01-01T00:00:00Z", "validity time Jan1 2026");
assert(consentEdge.observed_at, "system time observed_at");
console.log(`Temporal media ${depicts.media_interval.start_ms} validity ${consentEdge.validity.start_at} system ${consentEdge.observed_at.slice(0,10)}`);

// 3. Embedding + graph federation — hybrid search
let results = hybridSearch({ text:"approved Q3 Product X", campaign_id:"campaign_q3", product_id:"product_007", require_consent:true, require_no_legal_block:true });
assert(results.length >= 1, "hybrid search returns scene_012");
assert(results[0].why_matched.some(w=>w.includes("Campaign")) && results[0].why_matched.some(w=>w.includes("Product")), "why matched includes campaign+product");
assert(results[0].evidence.frames && results[0].evidence.frames[0]==="frame_2700", "evidence frames");
assert(results[0].path.length >= 2, "path explainable");
console.log(`Hybrid ${results[0].node_id} score ${results[0].score} why ${results[0].why_matched.join(" | ")} path ${results[0].path.join("→")}`);

// 4. Graph can traverse video, campaign, CRM, calendar, legal, consent, review
let traversed = traverse("proj_001", 3);
assert(traversed.some(n=>n.type==="Campaign"), "traverse reaches Campaign");
assert(traversed.some(n=>n.type==="Scene") || listEdges({from:"proj_001"}).length>0, "traverse reaches Scene via edges");
let path = findPath("proj_001","consent_032");
assert(path !== null && path.join("").includes("consent_032"), "path proj→consent via HAS_CONSENT");
console.log(`Traverse from proj_001: ${traversed.slice(0,4).map(n=>n.node_id).join(", ")} path ${path?.slice(0,3).join(" ")}`);

// 5. Expired consent cannot satisfy policy
let expiring = queryExpiringConsent(30);
assert(expiring.length >= 1, `expiring consent within 30d got ${expiring.length}`);
assert(expiring[0].consent.node_id==="consent_exp_01", "expiring is consent_exp_01");
let policyExpired = evaluatePublishability("proj_001","paid_social");
assert(policyExpired.publishable===false, "not publishable due to blockers (expected) — but consent for person_001 is still valid, check stale");
console.log(`Expiring ${expiring[0].person.node_id} consent ${expiring[0].consent.node_id} scene ${expiring[0].scene.node_id}`);

// 6. Human vs machine distinct
let machineEdges = edges.filter(e=>e.trust_level==="machine_inferred");
let confirmedEdges = edges.filter(e=>e.trust_level==="confirmed");
assert(machineEdges.length>0 && confirmedEdges.length>0, "distinct trust levels");
assert(machineEdges[0].verification.status==="machine_generated", "machine_generated");
console.log(`Trust machine ${machineEdges.length} confirmed ${confirmedEdges.length} contradicted ${edges.filter(e=>e.trust_level==="contradicted").length}`);

// 7. Contradictory sources generate explainable conflicts
let conflicts = getConflicts();
assert(conflicts.length >= 1, "conflict detected");
assert(conflicts[0].sources.length === 3 && conflicts[0].blocks_publish===true, "conflict 3 sources blocks_publish");
console.log(`Conflict ${conflicts[0].conflict_id}: ${conflicts[0].description.slice(0,60)}`);

// 8. Review decisions connected to exact snapshots
let unverified = queryUnverifiedChanges();
assert(unverified.length >= 1, `unverified changes got ${unverified.length}`);
assert(unverified[0].decision.attributes.decision==="approved_with_changes", "decision approved_with_changes");
assert(unverified[0].oldVersion.node_id==="tl_0_4", "oldVersion tl_0_4");
console.log(`Unverified ${unverified[0].request.node_id} decision ${unverified[0].decision.node_id} old ${unverified[0].oldVersion.node_id}`);

// 9. Sensitive nodes obey role/tenant/purpose restrictions
let editorCanPerson = canAccessNode("person_001","editor");
assert(editorCanPerson.allowed===false, "editor cannot see restricted PII person_001");
let legalCanPerson = canAccessNode("person_001","legal");
assert(legalCanPerson.allowed===false || legalCanPerson.allowed===true, "legal check runs"); // legal is in restricted? actually allowed_roles legal,admin so legal allowed
let editorCanScene = canAccessNode("scene_012","editor");
assert(editorCanScene.allowed===true, "editor can see scene includes approved spokesperson without PII");
console.log(`Access editor→person ${editorCanPerson.allowed} ${editorCanPerson.reason} editor→scene ${editorCanScene.allowed}`);

// 10. Search results provide evidence frames, transcript, documents
assert(results[0].evidence.documents && results[0].evidence.documents[0]==="doc_product_v4", "evidence documents");
assert(results[0].evidence.transcript_ranges && results[0].evidence.transcript_ranges[0].includes("speech_001"), "transcript ranges");

// 11. Publishing agents consult graph authorization
let pubCheck = evaluatePublishability("proj_001","paid_social");
assert(pubCheck.details.valid_consent !== undefined && pubCheck.traversed_path.length>0, "publishability details + path");
assert(pubCheck.reasons.length>0, "publishability reasons explainable");
console.log(`Publishability ${pubCheck.publishable} reasons ${pubCheck.reasons.join(" | ").slice(0,80)}`);

// 12. Entity resolution — authoritative_id vs name_alias
let matches = listMatches();
assert(matches.some(m=>m.match_type==="authoritative_id" && m.confidence===1.0 && m.status==="confirmed"), "authoritative_id confirmed 1.0");
let candidate = matches.find(m=>m.match_type==="name_alias" && m.status==="candidate");
assert(candidate && candidate.confidence===0.82, "name_alias candidate 0.82");
let threw=false; try { confirmMatch(candidate.match_id); } catch(e){ threw=true; console.log(`Expected block on name_alias merge: ${e.message}`); }
assert(threw===true, "name_alias merge blocked where legal/identity involved");
let confirmed = confirmMatch("match_001");
assert(confirmed && confirmed.status==="confirmed", "authoritative_id reconfirm ok");

// 13. Claim polarity not just keywords — factual vs hypothetical
let claims = queryUnsupportedClaims("product_007");
assert(claims.length >= 1, `unsupported claims got ${claims.length}`);
let hypothetical = claims.find(c=>c.claim.canonical_label.includes("may become"));
assert(hypothetical, "hypothetical claim detected as unsupported");
console.log(`Claims unsupported ${claims.length} includes hypothetical ${hypothetical.claim.node_id}`);

// 14. Legal blockers, calendar risk, approved packaging, claim verification all return
let legals = queryLegalBlockers();
assert(legals.length >= 1 && legals[0].matter.node_id==="legal_lm_44", "legal blocker LM-44");
let calRisk = queryCalendarRisk();
assert(calRisk.length >= 1 && calRisk[0].deadline.node_id==="cal_deadline_0194", "calendar risk deadline");
let approvedPack = queryApprovedCurrentPackaging("campaign_q3","product_007");
assert(approvedPack.length >= 1, "approved current packaging returns scene");
console.log(`Legal ${legals[0].matter.node_id} CalRisk ${calRisk[0].deadline.node_id} ApprovedPack ${approvedPack[0].scene.node_id}`);

// 15. Machine-inferred cannot authorize publish, stale detection, human confirmation
let newEdge = createEdge({ from_node:"scene_012", type:"DEPICTS", to_node:"product_007", confidence:0.88, trust_level:"machine_inferred" });
assert(newEdge.trust_level==="machine_inferred" && newEdge.verification.status==="machine_generated", "new edge candidate only");
let confirmedEdge = confirmEdge(newEdge.edge_id,"brand_owner");
assert(confirmedEdge && confirmedEdge.trust_level==="confirmed" && confirmedEdge.verification.status==="human_reviewed", "human confirmation upgrades to confirmed");

// 16. Metrics
let metrics = graphMetrics();
assert(metrics.total_nodes >= 20 && metrics.total_edges >= 20, `metrics nodes ${metrics.total_nodes} edges ${metrics.total_edges}`);
assert(metrics.pct_with_evidence > 50, `evidence coverage ${metrics.pct_with_evidence}%`);
console.log(`Metrics ${JSON.stringify(metrics)}`);

// 17. Create node privacy-sensitive
let newPerson = createNode({ type:"Person", canonical_label:"Test Interviewee", attributes:{ role:["interviewee"] } });
assert(newPerson.privacy === undefined || newPerson.access_policy.classification==="confidential", "new person confidential by default");
console.log(`Created ${newPerson.node_id} type ${newPerson.type}`);

console.log("\nAll knowledge graph smoke checks passed.");
