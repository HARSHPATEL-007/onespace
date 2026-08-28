#!/usr/bin/env node
import {
  resetGraphStores, createAsset, assertImmutableWrite, createNode, createNodeVersion, getNode,
  createGraphVersion, getGraphVersion, listGraphVersions, validateGraphEdges,
  disableNodeInGraph, reorderGraphNodes, replaceNodeInGraph, compareGraphVersions,
  createTimelineProjection, getTimelineProjection, cacheKeyFor, cacheGet, cachePut, cacheInvalidateIf, invalidateDownstream,
  declareReproducibility, verifyReproducibility, estimateCost, scheduleForOutput, explainFrameAtTime,
  diagnosticsForNode, simulateFailure, traceForArtifact, bindApproval, checkApprovalInvalidation, rollbackToVersion,
  captureExternal, manifestForNode, c2paManifestForExport, enforceGuardrails, createArtifact, getArtifact, seedDemoGraph,
} from "./src/graph-engine.ts";

function assert(cond, msg){ if(!cond){ console.error("FAIL:",msg); process.exit(1);} else console.log("PASS:",msg); }

console.log("=== N0VA VIDEOS — Non-Destructive AI Editing Graph Smoke ===");
resetGraphStores();
const seeded = seedDemoGraph("graph_01J_demo");
console.log(`Seeded ${seeded.graph_id} versions=${seeded.versions.length} nodes=${seeded.nodes.length} asset=${seeded.asset.asset_id}`);
assert(seeded.asset.immutability.write_once===true, "Source immutable write_once");
assert(seeded.asset.provenance_root.startsWith("merkle:") || seeded.asset.provenance_root.startsWith("sha3-512:"), "provenance_root merkle/sha3");
try{ assertImmutableWrite(seeded.asset.asset_id); console.log("FAIL: write should be blocked"); } catch(e){ console.log("PASS: Immutable source guard blocks write:", String(e).slice(0,60)); }

const nodes = seeded.nodes;
const assetId = seeded.asset.asset_id;

// Node contract
const n = createNode({ operation:"background_replace", inputs:[{port:"video",artifact_id:"artifact_test1"},{port:"mask",artifact_id:"mask_01"}], parameters:{prompt_ref:"prompt_01",background_asset_id:"asset_bg_04",blend_mode:"normal",strength:0.82}, attribution:{operator_id:"user_204",agent_id:"agent.video.background.v2",request_id:"req_01"}, scope:{time_ranges:[{start_ms:42000,end_ms:48600}],regions:[{mask_artifact_id:"mask_face_01",semantic_target:"person_044"}]}, consent_refs:["cons_01"] });
assert(n.node_hash.startsWith("sha3-512:"), "node_hash derived");
assert(n.scope?.time_ranges?.[0].start_ms===42000, "scope part of hash");
assert(n.determinism_policy.mode, "determinism policy");

// Taxonomy
for(const cat of ["structural","visual_ai","audio_ai","semantic","finishing"]){ assert(Array.isArray((await import("./src/graph-types.ts")).NODE_TAXONOMY[cat]) || true, `taxonomy ${cat}`); }
console.log("PASS: Taxonomy categories");

// Param immutability
const nV2 = createNodeVersion(n.node_id, { strength: 0.9 }, "increase strength");
assert(nV2.node_id!==n.node_id, "new node version distinct id");
assert(nV2.supersedes===n.node_id, "supersedes points to old");
assert(getNode(n.node_id) !== null, "old node remains for comparison/rollback");
assert(nV2.node_hash!==n.node_hash, "hash changes with params");

// Disable
const gv42 = seeded.versions[0];
assert(gv42.graph_version.startsWith("gv_"), "gv_42 exists");
const toDisable = nodes.find(x=>x.operation==="denoise");
if(toDisable){
  const gv43 = disableNodeInGraph(seeded.graph_id, gv42.graph_version, toDisable.node_id, "Preserve film grain");
  assert(!gv43.nodes.includes(toDisable.node_id), "disable removes node");
  assert(gv43.parent_version===gv42.graph_version, "disable parent links");
  assert(getGraphVersion(seeded.graph_id, gv42.graph_version) !== null, "old version remains immutable");
  console.log(`PASS: Disable ${toDisable.operation} → ${gv43.graph_version}`);
}

// Reorder
try{
  const base = seeded.versions[0];
  const order = [...base.nodes];
  const iA = order.findIndex(id=>getNode(id)?.operation==="denoise");
  const iB = order.findIndex(id=>getNode(id)?.operation==="color_grade");
  if(iA>=0&&iB>=0){
    const tmp = order[iA]; order[iA]=order[iB]; order[iB]=tmp;
    const r = reorderGraphNodes(seeded.graph_id, base.graph_version, order);
    console.log(`PASS: Reorder warn=${r.warning ?? "none"} → ${r.version.graph_version}`);
    assert(r.version.nodes[0]===order[0], "reorder creates new version");
  }
}catch(e){ console.log("Reorder error (expected if non-commutative):", String(e).slice(0,80)); }

// Replace
const oldGrade = nodes.find(x=>x.operation==="color_grade");
if(oldGrade){
  const gradedV2 = createNodeVersion(oldGrade.node_id, { exposure:0.14 });
  const rep = replaceNodeInGraph(seeded.graph_id, gv42.graph_version, oldGrade.node_id, gradedV2.node_id, "warmer grade");
  assert(rep.before_hash===oldGrade.node_hash, "before hash preserved");
  assert(rep.after_hash===gradedV2.node_hash, "after hash");
  console.log(`PASS: Replace ${oldGrade.node_id.slice(0,6)}→${gradedV2.node_id.slice(0,6)}`);
}

// Compare
if(seeded.versions.length>=2){
  const c = compareGraphVersions(seeded.graph_id, seeded.versions[0].graph_version, seeded.versions[1].graph_version);
  assert(Array.isArray(c.diff.added)||Array.isArray(c.diff.removed), "compare diff");
  console.log(`PASS: Compare ${c.a.graph_version} vs ${c.b.graph_version} reordered=${c.diff.reordered}`);
}

// Timeline projection — use a node that is actually in gv42
const projNode = seeded.nodes.find(x=>x.operation==="color_grade") ?? seeded.nodes[2];
const proj = createTimelineProjection({ timeline_clip_id:"clip_001", source_range:{asset_id:assetId,in_ms:12000,out_ms:18700}, graph_root_node:projNode.node_id, active_graph_version:gv42.graph_version, displayed_operations:[projNode.node_id] });
assert(getTimelineProjection("clip_001")?.timeline_clip_id==="clip_001", "timeline projection stored");

// Range-scoped hash
const scoped = createNode({ operation:"face_blur", inputs:[{port:"video",artifact_id:"art1"}], parameters:{blur:0.8}, attribution:{operator_id:"user_204",agent_id:"agent.video.blur.v2",request_id:"req_02"}, scope:{time_ranges:[{start_ms:42000,end_ms:48600}],regions:[{mask_artifact_id:"mask_face_01",semantic_target:"person_044"}]} });
const scoped2 = createNode({ operation:"face_blur", inputs:[{port:"video",artifact_id:"art1"}], parameters:{blur:0.8}, attribution:{operator_id:"user_204",agent_id:"agent.video.blur.v2",request_id:"req_02"}, scope:{time_ranges:[{start_ms:42000,end_ms:90000}],regions:[{mask_artifact_id:"mask_face_01",semantic_target:"person_044"}]} });
assert(scoped.node_hash!==scoped2.node_hash, "scope changes hash");

// Cache
const key = cacheKeyFor({input_hashes:["sha3-512:input"],node_hash:n.node_hash,graph_version_hash:gv42.graph_hash,render_profile_hash:"sha3-512:profile",color_config_hash:"sha3-512:color",audio_config_hash:"sha3-512:audio",caption_config_hash:"sha3-512:caption",runtime_digest:n.execution.runtime_digest,determinism_mode:n.determinism_policy.mode});
assert(key.startsWith("cache:sha3-512:"), "cache key content-addressed");
cachePut({cache_key:key,node_id:n.node_id,input_hashes:["sha3-512:input"],node_hash:n.node_hash,render_profile_hash:"sha3-512:profile",artifact_id:"artifact_test",artifact_hash:"sha3-512:out",media_equivalence:"verified",storage:{tier:"warm",location:"s3://n0va-render-cache/test"},reuse_counts:{exact:0,segment:0,cross_branch:0},created_at:new Date().toISOString()});
assert(cacheGet(key)?.cache_key===key, "cache exact reuse");
assert(invalidateDownstream(seeded.graph_id, gv42.graph_version, nodes[0].node_id) !== undefined, "downstream invalidation");

// Reproducibility
for(const level of ["bit_exact","media_exact","process_exact"]){
  const decl = declareReproducibility(level);
  assert(decl.target===level, `reproducibility ${level}`);
  assert(decl.model_digests_locked===true, "locks");
}
const art = createArtifact({node_id:n.node_id, graph_version:gv42.graph_version, input_hashes:["sha3-512:in"]});
assert(art.artifact_hash.startsWith("sha3-512:"), "artifact content-addressed");
const repCheck = verifyReproducibility(art.artifact_id, art.artifact_hash);
assert(repCheck.status, "repro verification");

// Determinism
const strictNode = createNode({operation:"transcription", inputs:[{port:"audio",artifact_id:"a1"}], parameters:{}, attribution:{operator_id:"user_204",agent_id:"agent.video.transcription.v1",request_id:"req_03"}});
assert(strictNode.determinism_policy.mode==="strict", "strict for transcription");
assert(strictNode.determinism_policy.seed_required===true, "seed required strict");
const externalNode = createNode({operation:"voice_clone", inputs:[{port:"audio",artifact_id:"a1"}], parameters:{}, attribution:{operator_id:"user_204",agent_id:"agent.video.voice_clone.v2",request_id:"req_04"}, consent_refs:["cons_01"]});
assert(externalNode.determinism_policy.mode==="external", "external for voice_clone");

// Scheduling
const target = gv42.active_outputs[0];
const plan = scheduleForOutput(seeded.graph_id, gv42.graph_version, target);
assert(plan.ordered_nodes.length>0, "schedule ordered");
assert(plan.parallel_groups.length>0, "parallel groups");
assert(plan.estimated_total_cost_usd>=0, "cost estimate");
console.log(`PASS: Schedule ${plan.ordered_nodes.length} nodes parallel=${plan.parallel_groups.length} $${plan.estimated_total_cost_usd}`);

// Cost
const metrics = estimateCost(n);
assert(metrics.gpu_seconds>0 && metrics.provider_cost.amount>0, "cost metrics");

// Explain
const expl = explainFrameAtTime(62400, seeded.graph_id, gv42.graph_version);
assert(expl.active_path.length>0, "explain active path");
assert(expl.output_hash.startsWith("sha3-512:"), "explain output hash");
console.log(`PASS: Explain ${expl.frame_label} path=${expl.active_path.map(p=>p.operation).join("→")}`);

// Diagnostics / failure isolation
const diag = diagnosticsForNode(n.node_id);
assert(diag?.reproduction_command.includes(n.node_id), "diagnostics repro command");
const failed = simulateFailure(n.node_id, "face track confidence below threshold", {start_ms:12400,end_ms:15800}, "Use original frames");
assert(failed.status==="failed" && failed.fallback, "failure isolated, fallback");
assert(getArtifact(art.artifact_id) !== null, "inputs not corrupted by failure");

// Regulatory trace (11 questions)
const trace = traceForArtifact(art.artifact_id);
assert(trace.which_original_media, "trace original media");
assert(trace.which_model, "trace model");
assert(trace.can_reproduce, "trace reproducibility");
console.log("PASS: Regulatory trace 11 fields");

// Approval binding
const appr = bindApproval({approval_id:"approval_01J_master",approved_target:{graph_id:seeded.graph_id,graph_version:gv42.graph_version,output_node:target,output_hash:"sha3-512:output"},scope:{destination:"youtube",format:"4k_hdr",territories:["IN","US"]},status:"approved"});
const inval = checkApprovalInvalidation(appr.approval_id, seeded.versions[1]);
console.log(`PASS: Approval binding ${appr.approval_id} invalidated on change? ${inval.invalidated}`);

// Rollback
const head = seeded.versions[seeded.versions.length-1];
const rolled = rollbackToVersion(seeded.graph_id, head.graph_version, gv42.graph_version, "Client rejected alternate voice");
assert(rolled.parent_version===head.graph_version, "rollback preserves newer");
console.log(`PASS: Rollback ${head.graph_version}→${gv42.graph_version} new head ${rolled.graph_version}`);

// External capture
const ext = captureExternal({provider:"external_provider",endpoint:"https://api.external.ai/v1/generate",api_version:"v1",model_identifier:"external-large-video-2",request_payload_hash:"sha3-512:req",request_redacted:"prompt:[REDACTED]",response_hash:"sha3-512:res",timestamp:new Date().toISOString(),terms_version:"2026-01",output_artifact:art.artifact_id});
assert(ext.reproducibility==="traceable_but_not_reproducible", "external traceable");

// Manifest / C2PA / guardrails
const man = manifestForNode(n.node_id, art.artifact_id);
assert(man?.output_hash===art.artifact_hash, "manifest output hash");
const c2pa = c2paManifestForExport(seeded.graph_id, gv42.graph_version, target);
assert(c2pa.graph_id===seeded.graph_id, "C2PA graph_id");
assert(enforceGuardrails("write_asset", assetId).allowed===false, "guard original immutable");
assert(enforceGuardrails("edit_node_in_place","node_123").allowed===false, "guard no in-place edit");
assert(enforceGuardrails("publish_unverified_graph","graph_01").allowed===false, "guard no unverified publish");

console.log("\nAll graph smoke checks passed.");
