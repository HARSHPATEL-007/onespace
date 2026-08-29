#!/usr/bin/env node
import { compileBrandDocuments, approveCompiledRule, runBrandScan, getBrandFindings, explainFinding, generateProposal, evaluateBrandGate, getBrandDashboard, createWaiver, listWaivers, getLogoRegistry } from "./src/brand-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Brand Intelligence Smoke ===");
let compiled = compileBrandDocuments({ brandbook_v7:"Brand Book v7"});
assert(compiled.length>=2, "compiled 2 rules");
let approved = approveCompiledRule(compiled[0].rule_id, "brand_director_001");
assert(approved?.status==="approved", "approve rule");
console.log(`Compiled ${compiled[0].rule_id} approved`);

let findings = runBrandScan({ timeline_id:"tl001", graph_version:"gv42", region:"IN", platforms:["youtube","instagram_reels"], checks:["logos","fonts","colors","voice","products","disclaimers","lower_thirds","music","terminology","regional_rules"] });
assert(findings.length>=8, `scan findings >=8 got ${findings.length}`);
assert(findings.every(f=>f.rule_id && f.category && f.severity && f.range), "findings have rule/category/severity/range");
console.log(`Findings ${findings.map(f=>f.rule_id).slice(0,4).join(", ")}`);
let first = findings[0];
let exp = explainFinding(first.finding_id);
assert(exp && exp.rule.includes(first.rule_id), "explain finding");
console.log(`Explain ${exp.rule.slice(0,60)} source ${exp.source}`);

let prop = generateProposal(first.finding_id, ["timing"]);
assert(prop && prop.requires_approval!==undefined, "proposal requires_approval");
console.log(`Proposal ${prop.proposal_id} operation ${prop.operation}`);

let dash = getBrandDashboard("tl001","IN","youtube_4k_hdr");
assert(dash.summary.critical>=0 && dash.export_status, "dashboard");
console.log(`Dashboard ${dash.policy} ${dash.region} ${dash.export_status} critical=${dash.summary.critical} high=${dash.summary.high}`);

let gate = evaluateBrandGate({ timeline_id:"tl001", graph_version:"gv42", export_profile:"youtube_4k_hdr", brand_policy:"brand_nova_2026.08", region:"IN" });
assert(gate.result==="blocked" || gate.result==="ready", "gate result");
console.log(`Gate ${gate.gate_id} result=${gate.result} blocking=${gate.blocking_findings.length}`);

let waiver = createWaiver({ finding_id:first.finding_id, approved_by:"creative_director_001", reason:"Campaign intentionally uses monochrome logo", scope:{ platforms:["cinema_master"], regions:["worldwide"] }, expires_at:"2026-12-31T23:59:59Z" });
assert(waiver.waiver_id.startsWith("waiver_"), "waiver created");
console.log(`Waiver ${waiver.waiver_id} for ${waiver.finding_id}`);

let logos = getLogoRegistry();
assert(logos.has("logo_primary_horizontal"), "logo registry");
console.log(`Logos ${Array.from(logos.keys()).join(",")}`);

let waivers = listWaivers();
assert(waivers.length>=1, "waivers list");

console.log("\nAll brand smoke checks passed.");
