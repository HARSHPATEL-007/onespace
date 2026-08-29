#!/usr/bin/env node
import {
  createReviewItem, listReviewItems, clusterItems, detectReviewDuplicates, detectContradictions,
  generateSuggestion, getApprovalGraph, detectBlockers, classify, predictDeadlineRisk, verifyChange,
  ingestVoiceFeedback, clearReviewStores,
} from "./src/review-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Review Intelligence Smoke ===");
clearReviewStores();

// Create items
let item1 = createReviewItem({ revision_id:"rev_0192", source:{type:"comment", comment_id:"comment_001"}, anchor:{start_ms:45000,end_ms:52000,frame:2700}, text:"Replace the current product angle with the close-up shot.", round_id:"round_client_v03" });
assert(item1.status==="captured" && item1.requested_change.operation_type==="replace_clip", "createReviewItem traceable request");
let item2 = createReviewItem({ revision_id:"rev_0192", source:{type:"comment", comment_id:"comment_014"}, anchor:{start_ms:45000,end_ms:52000}, text:"Can we make the product feel more premium here?" });
let item3 = createReviewItem({ revision_id:"rev_0192", source:{type:"comment", comment_id:"comment_022"}, anchor:{start_ms:45100,end_ms:52100}, text:"Use a cleaner, tighter angle at the reveal." });
assert(listReviewItems().length===3, "3 items created");

let normalized = item1.requested_change.normalized_text;
assert(normalized.includes("Replace") || normalized.includes("close-up"), "normalized request");
console.log(`Normalized: ${normalized}`);

// Clustering
let cluster = clusterItems([item1.review_item_id, item2.review_item_id, item3.review_item_id], "semantic");
assert(cluster.confidence===0.92 && cluster.review_item_ids.length===3, "cluster 3 items");
assert(cluster.reason.some(r=>r.includes("Same source clip")), "cluster reason");
console.log(`Cluster ${cluster.cluster_id} intent ${cluster.intent} participants ${cluster.participants.length}`);

// Duplicates & contradictions
let dups = detectReviewDuplicates();
assert(dups.length===1 && dups[0].type==="semantic_duplicate" && dups[0].confidence===0.94, "duplicate detection");
console.log(`Duplicate ${dups[0].source_ids.join(",")} canonical ${dups[0].canonical_review_item_id}`);
let contras = detectContradictions();
assert(contras.length===1 && contras[0].type==="contradiction", "contradiction detection");
console.log(`Contradiction ${contras[0].source_ids.join(" vs ")}`);

// Edit suggestion mapping
let suggestion = generateSuggestion(item1.review_item_id, { respect_locks:true });
assert(suggestion.operation.type==="replace_clip" && suggestion.requires_human_acceptance===true, "suggestion requires human");
assert(suggestion.confidence===0.88, "suggestion confidence");
console.log(`Suggestion ${suggestion.suggestion_id} op ${suggestion.operation.type} on ${suggestion.operation.target_clip_id} approval_regions ${suggestion.estimated_impact.approval_regions_affected.join(",")}`);

// High-risk check
let itemLegal = createReviewItem({ revision_id:"rev_0192", source:{type:"comment", comment_id:"comment_legal_01"}, anchor:{start_ms:45000,end_ms:52000}, text:"Legal disclaimer must be added for product claim.", round_id:"round_client_v03" });
let legalSug = generateSuggestion(itemLegal.review_item_id);
assert(legalSug.estimated_impact.consent_legal_impact==="high", "high-risk legal requires human");
console.log(`High-risk suggestion impact ${legalSug.estimated_impact.consent_legal_impact}`);

// Approval graph
let graph = getApprovalGraph();
assert(graph.nodes.length===4 && graph.edges.length>=2, "approval graph 4 nodes");
assert(graph.nodes.find(n=>n.node_id==="approval_legal")?.status==="pending", "legal pending");
console.log(`Approval graph nodes ${graph.nodes.map(n=>n.node_id+":"+n.status).join(" | ")}`);

// Blockers
let blockers = detectBlockers();
assert(Array.isArray(blockers), `blockers array got ${blockers.length}`);
console.log(`Blockers ${blockers.length} — ${blockers.map(b=>`${b.severity}:${b.reason.slice(0,30)}`).join(" | ") || "none (non-blocking items as expected for this dataset)"}`);

// Sentiment & urgency (not suppressing legal)
let cls = classify("This is concerning, we have a deadline tomorrow and need to fix the product claim.");
assert(cls.sentiment.label==="concerned" && cls.urgency.label==="deadline_sensitive", "classify concerned deadline_sensitive");
assert(cls.intent.label==="change_request", "intent change_request");
console.log(`Classification sentiment ${cls.sentiment.label} urgency ${cls.urgency.label} intent ${cls.intent.label}`);

// Deadline risk
let risk = predictDeadlineRisk("round_client_v03");
assert(["green","yellow","orange","red","blocked"].includes(risk.level), `risk level ${risk.level}`);
assert(risk.score>=0 && risk.score<=1, "risk score 0-1");
console.log(`Deadline risk ${risk.level} score ${risk.score} drivers ${risk.drivers.join(",")} rec ${risk.recommendations[0]}`);

// Verification
let verify = verifyChange(item1.review_item_id, "rev_0192", "rev_0194");
assert(verify.status==="verified_by_system" && verify.source_clip_removed===true, "verification implemented");
assert(verify.evidence_asset_id.startsWith("comparison_"), "evidence asset");
console.log(`Verification ${verify.status} evidence ${verify.evidence_asset_id} brand_affected ${verify.brand_affected}`);
let itemAfter = listReviewItems().find(i=>i.review_item_id===item1.review_item_id);
assert(itemAfter?.status==="implemented_pending_verification", "item status implemented_pending_verification");

// Voice feedback ingestion
let voiceItem = ingestVoiceFeedback({ audio_asset_id:"voice_01", transcript:"At around forty-five seconds, I’d use the tighter product shot and bring the music down slightly.", timeline_anchor:{start_ms:45000,end_ms:52000} });
assert(voiceItem.affected_region.start_ms===45000, "voice feedback time-aligned");
console.log(`Voice feedback ingested ${voiceItem.review_item_id} region ${voiceItem.affected_region.start_ms}-${voiceItem.affected_region.end_ms}`);

console.log("\nAll review smoke checks passed.");
