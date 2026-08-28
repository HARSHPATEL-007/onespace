#!/usr/bin/env node
import {
  runQualityAnalysis, getWarnings, getFindings, generateProposalsForFinding, applyProposal, resolveFinding, getDashboard, evaluateGate, recordFeedback, clearQualityStores, detectJumpCuts, detectAudioDrift
} from "./src/quality-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Quality Intelligence Smoke ===");
clearQualityStores();
let warnings = runQualityAnalysis({ timeline_id:"tl001", graph_version:"gv42", passes:["editorial_continuity","technical","visual_consistency","graphics_text","distribution"] });
assert(warnings.length>=10, `analysis produced >=10 warnings got ${warnings.length}`);
assert(warnings.every(w=>w.evidence && w.explanation && w.suggested_fixes.length), "warnings have evidence+explanation+fixes");
assert(warnings.every(w=>w.requires_approval!==undefined), "requires_approval present");
assert(warnings.every(w=>w.related_nodes || w.source_assets), "linked to graph/nodes/assets");
console.log(`Warnings: ${warnings.map(w=>w.type).slice(0,6).join(", ")}`);
let sevCounts = warnings.reduce((a,w)=>{a[w.severity]=(a[w.severity]||0)+1; return a;},{});
console.log("Severities", sevCounts);
assert(sevCounts.critical>=1, "critical exists (lower third mismatch)");
assert(sevCounts.high>=2, "high exists");

let findings = getFindings("tl001");
assert(findings.length===warnings.length, "findings mirror warnings");
let first = findings[0];
let props = generateProposalsForFinding(first.quality_finding_id);
assert(props.length>0, "proposals generated");
assert(props[0].mode==="preview_only" && props[0].requires_approval, "proposal non-destructive + approval");
console.log(`Proposal ${props[0].proposal_id} op ${props[0].operation.type}`);

let applied = applyProposal(props[0].proposal_id, "new_branch", "continuity fixes preview");
assert(applied.applied && applied.new_branch, "apply to new_branch");
console.log(`Applied to ${applied.new_branch} reanalysis ${applied.requires_reanalysis}`);

let resolved = resolveFinding(first.quality_finding_id, "intentional", "Jump cut is part of approved editorial style.");
assert(resolved?.human_resolution?.resolution==="intentional", "resolve intentional");
console.log(`Resolved intentional, feedback recorded`);

let dash = getDashboard("tl001");
assert(dash.open>=0, "dashboard open");
assert(dash.by_category.continuity>=1, "dashboard continuity");
assert(dash.export_readiness.master!==undefined, "export readiness");
console.log(`Dashboard open=${dash.open} byCategory`, dash.by_category);

let gate = evaluateGate("gv42","youtube_4k_hdr",{critical_warnings:"zero",high_warnings:"zero",lower_third_identity_mismatch:"zero",audio_sync_max_ms:40,unsafe_title_overflow_percent:0});
assert(gate.result==="blocked", `gate blocked due to high/critical, got ${gate.result}`);
console.log(`Gate ${gate.quality_gate_id} result=${gate.result} blocking=${gate.blocking_warnings.length}`);

let drift = detectAudioDrift()[0];
assert(drift.evidence.drift_rate_ms_per_minute!==undefined, "drift delta model");
assert(drift.type==="audio_drift", "audio drift type");
console.log("Drift", drift.evidence);

let fb = recordFeedback("Jump cuts are intentional in this series.", { project:"project001", warning_type:"jump_cut" });
assert(fb.statement.includes("Jump cuts"), "feedback stored");
let secondRun = runQualityAnalysis({ timeline_id:"tl001", graph_version:"gv42", passes:["editorial_continuity"]});
assert(!secondRun.some(w=>w.type==="jump_cut"), "feedback suppresses jump_cut style");

console.log("\nAll quality smoke checks passed.");
