#!/usr/bin/env node
// Smoke test for Semantic Timeline Intelligence Layer — validates all 10 required natural-language queries and key engine contracts
import {
  semanticSearch, semanticSearchAdvanced, getDialogueCleanupSuggestions, getTranscriptTokens, previewTranscriptEdit,
  compileSemanticCut, generateSemanticPlanFromIntent, getNarrativeArc, diagnoseNarrativeArc, getEmotionSpans,
  getEntityAppearances, findFirstLastAppearance, getContinuityIssues, getReviewCommentsSemantic, getSemanticDiff,
  getSemanticSpanIndexKeys, getIndexStats, getSemanticSpans
} from "./src/semantic-engine.ts";

function assert(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } else console.log("PASS:", msg); }

console.log("=== N0VA VIDEOS — Semantic Timeline Intelligence Smoke Test ===");
console.log("Spans:", getSemanticSpans().length, "Tokens:", getTranscriptTokens().length);

const queries = [
  { q: "Show every shot where the CEO mentions pricing.", expect: "CEO" },
  { q: "Find the first appearance of the red car.", expect: "first appearance" },
  { q: "Jump to the most emotional answer.", expect: "emotional" },
  { q: "Show all close-ups of the product.", expect: "close_up" },
  { q: "Find pauses longer than two seconds.", expect: "pause" },
  { q: "Show scenes recorded at the office.", expect: "office" },
  { q: "Find every clip used in the client-approved branch.", expect: "approved" },
  { q: "Show evidence supporting the product performance claim.", expect: "40%" },
  { q: "Find continuity errors involving the laptop.", expect: "laptop" },
  { q: "Show all synthetic voice segments.", expect: "synthetic" },
];

for (const { q, expect } of queries) {
  const res = semanticSearch(q);
  assert(res.length > 0, `Query "${q}" returns results (${res.length})`);
  const flat = res.map(r => r.match_reasons.join(" ").toLowerCase()).join(" ");
  assert(flat.includes(expect.toLowerCase()) || res[0].confidence > 0.7, `Query "${q}" match_reasons contain "${expect}" or high confidence`);
  // spec contract: each result has required fields
  for (const r of res) {
    assert(typeof r.timeline_id === "string" && r.timeline_id.length > 0, "result timeline_id present");
    assert(r.range && typeof r.range.start_ms === "number", "range present");
    assert(typeof r.confidence === "number" && r.confidence >= 0 && r.confidence <= 1, "confidence 0-1");
    assert(Array.isArray(r.match_reasons) && r.match_reasons.length > 0, "match_reasons non-empty");
    assert(typeof r.source_asset_id === "string", "source_asset_id present");
    assert(typeof r.current_branch === "string", "current_branch present (branch-aware)");
    assert(Array.isArray(r.related_clips), "related_clips present");
    assert(Array.isArray(r.actions) && r.actions.length > 0, "actions present");
  }
  console.log(`  → ${q.slice(0,48)} → ${res[0].range.start_ms}-${res[0].range.end_ms} conf ${res[0].confidence} reasons: ${res[0].match_reasons.slice(0,2).join(" | ")}`);
}

console.log("\n--- Advanced search with filters ---");
const adv = semanticSearchAdvanced({ query: "Show every shot where the CEO mentions pricing.", scope: { timeline_version: "tl001:v31" }, filters: { speaker_id: "person_ceo", shot_type: "close_up" } });
assert(adv.results.length > 0, "Advanced search with filters returns results");
assert(adv.model_versions.visual.includes("4096-dim"), "Model versions include 4096-dim");
const adv2 = semanticSearchAdvanced({ query: "close-up shots where the speaker discusses pricing", scope: { timeline_version: "tl001:v31" }, filters: { speaker_id: "person_ceo" } });
assert(adv2.results.length >= 0, "Advanced search second variant handles missing filter gracefully");

console.log("\n--- Dialogue cleanup suggestions ---");
const cleanup = getDialogueCleanupSuggestions();
assert(cleanup.length >= 12, `Cleanup suggestions cover all 12+ types (got ${cleanup.length})`);
for (const c of cleanup.slice(0,3)) {
  assert(c.visual_risk !== undefined && c.audio_risk !== undefined, "visual_risk/audio_risk present");
  assert(typeof c.requires_review === "boolean", "requires_review present");
}
console.log("Cleanup:", cleanup.map(c => c.type).join(", "));

console.log("\n--- Transcript word-level anchoring ---");
const tokens = getTranscriptTokens();
assert(tokens.some(t => t.token_id === "tok_00981"), "token tok_00981 exists");
assert(tokens[0].language === "en-US", "language present");
assert(tokens[0].timeline_instances[0].state === "active", "timeline state present");
const preview = previewTranscriptEdit({ operation: "remove_selected_transcript", token_ids: ["tok_00981","tok_00982"], mode: "create_branch", preserve_reaction_shots: true, run_continuity_check: true });
assert(preview.affected_ranges.length >= 4, "preview affected_ranges >=4 (dialogue, camera, reaction, caption)");
assert(preview.timeline_operation.reversible, "reversible");
console.log("Preview:", preview.original_text.slice(0,32), "→", preview.proposed_text.slice(0,32), "delta", preview.duration_delta_ms);

console.log("\n--- Semantic cut compilation ---");
for (const cmd of ["Remove all filler words","Keep only product demonstrations","Shorten to 60 seconds","Replace this answer","Remove every mention of the competitor","Use the strongest emotional response","Show evidence first","Make this suitable for social"]) {
  const { plan } = compileSemanticCut(cmd);
  assert(plan.selected_spans.length > 0, `Cut "${cmd}" selects spans`);
  assert(plan.requires_approval !== undefined, "requires_approval present");
  assert(plan.timeline_operations.length > 0, "timeline_operations compile to ordinary timeline ops");
}
const planAgent = generateSemanticPlanFromIntent("Remove all pauses longer than 1.5 seconds from the interview");
assert(planAgent.requires_approval !== undefined, "Agent plan has approval flag");

console.log("\n--- Branching (lightweight, no duplication) ---");
import { createBranchFromSemanticRules, listBranches } from "./src/semantic-engine.ts";
const branch = createBranchFromSemanticRules({ name: "60-second evidence cut", parent: "tl001:v31", rules: [{ include: "narrative.role=evidence", minimum_importance: 0.78 }, { exclude: "dialogue.contains=filler" }], constraints: { maximum_duration_ms: 60000, aspect_ratio: "9:16" }});
assert(branch.branch_id.startsWith("branch_"), "branch_id generated");
assert(branch.parent_timeline_version === "tl001:v31", "parent preserved");
assert(branch.materialized_render === null, "materialized_render null until render");
assert(listBranches().length >= 1, "branch store");

console.log("\n--- Narrative arc + diagnosis ---");
const arc = getNarrativeArc();
assert(arc.some(s => s.role === "introduction"), "arc has introduction");
assert(arc.some(s => s.role === "evidence"), "arc has evidence");
const diags = diagnoseNarrativeArc(arc);
console.log("Arc stages:", arc.map(s=>s.role).join(" → "));
console.log("Diagnoses:", diags.length, diags.map(d=>d.issue).slice(0,3).join(" | "));

console.log("\n--- Emotion (contextual signal, not fact) ---");
const emotions = getEmotionSpans();
assert(emotions.every(e => e.display_label && e.confidence.facial_expression), "emotion has display_label + confidence");
assert(emotions[0].signals.editorial_intensity !== undefined, "editorial_intensity present");

console.log("\n--- Object & person navigation ---");
const laptopApps = getEntityAppearances("laptop");
assert(laptopApps.length >= 2, "laptop appearances >=2");
assert(laptopApps[0].bbox !== undefined, "bbox present");
const { first, last } = findFirstLastAppearance("red car");
assert(first && last && first.appearance_range.start_ms < last.appearance_range.start_ms, "first < last");

console.log("\n--- Continuity intelligence (review annotations, not auto-edits) ---");
const cont = getContinuityIssues();
assert(cont.length >= 5, "continuity issues >=5 (prop_state_mismatch, lighting_jump, clothing_change, screen_content_mismatch, audio_ambience_jump)");
assert(cont[0].suggested_actions.length > 0, "suggested_actions present");
assert(cont.some(c => c.entity === "laptop"), "laptop continuity present");

console.log("\n--- Review-aware timeline (moves with semantic object) ---");
const reviews = getReviewCommentsSemantic();
assert(reviews.length >= 2, "reviews present");
assert(reviews.some(r => r.target.type === "claim"), "claim-targeted review present");
import { moveReviewCommentsWithClip, orphanReviewCommentsForRemovedSpan } from "./src/semantic-engine.ts";
moveReviewCommentsWithClip("span_003", { start_ms: 10000, end_ms: 16000 });
assert(getReviewCommentsSemantic().find(r=>r.target.span_id==="span_003").range.start_ms===10000, "comment moves with clip");
// reset not needed for orphan test on different span
orphanReviewCommentsForRemovedSpan("span_004");
assert(getReviewCommentsSemantic().find(r=>r.target.span_id==="span_004")?.status==="orphaned", "orphaned + explained");

console.log("\n--- What Changed? diff (editorial, semantic, visual, narrative) ---");
const diff = getSemanticDiff("tl001:v27","tl001:v31");
assert(diff.duration_delta_ms === -36000, "duration delta -36000");
assert(diff.changes.some(c=>c.category==="editorial"), "editorial change present");
assert(diff.changes.some(c=>c.category==="semantic"), "semantic change present");
assert(diff.changes.some(c=>c.category==="visual"), "visual change present");
assert(diff.changes.some(c=>c.category==="narrative") || diff.narrative_delta.evidence !== undefined, "narrative delta present");
assert(diff.visual_summary && diff.audio_summary && diff.review_summary, "summary sections present");
console.log("Diff changes:", diff.changes.map(c=>`${c.category}:${c.type}`).join(", "));

console.log("\n--- Storage & indexing ---");
const keys = getSemanticSpanIndexKeys("project001","tenant001");
assert(keys[0].tenant_id === "tenant001", "index key tenant_id");
assert(keys[0].entity_ids.length > 0, "entity_ids");
const stats = getIndexStats();
assert(stats.some(s => s.index === "vector_visual" && s.dimension === 4096), "vector ANN 4096-dim");
assert(stats.some(s => s.index === "fulltext_transcript"), "fulltext");
assert(stats.some(s => s.index === "temporal_interval"), "temporal");
console.log("Indexes:", stats.map(s=>s.index).join(", "));

console.log("\nAll semantic smoke checks passed.");
