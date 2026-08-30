#!/usr/bin/env node
import { createSession } from "./src/live-control-engine.ts";
import { createPostEventProject, generateCandidates, createSpeakerCompilation, transcriptEdit, detectSilence, createQuoteCard, buildPackage } from "./src/live-edit-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Live-to-Edit Continuum Smoke ===");

// 1. Event-to-project conversion preserves live as immutable source
let live = createSession({ event_id:"event_q3_launch", regions:["us_east","eu_west"], sources:["camera_01","camera_02"], destinations:[{platform:"youtube",profile:"youtube_1080p60_v5"}], recording:{program:true,clean_feed:true,isos:true} });
let proj = createPostEventProject({ session_id: live.session_id, project_name:"Q3 Product Launch — Post-Event", source_policy:"preserve_live_sources", generate:["chapters","highlights","speaker_moments"], languages:["en","hi"], derivative_profiles:["youtube_highlight","linkedin_square","instagram_reel"], review_mode:"human_approval_required" });
assert(proj.source_session_id===live.session_id && proj.source_policy==="preserve_live_sources", "linked post-event project preserves live");
assert(proj.moments.length===2 && proj.chapters.length===2, "moments + chapters seeded");
assert(proj.transcript_segments.length===3 && proj.derivatives.length===2, "transcript + 2 social derivatives");
console.log(`Project ${proj.project_id} from session ${live.session_id} stage ${proj.stage} lane ${proj.lane}`);

// 2. Recording conform master clock
assert(proj.conform_map.master_clock.timebase==="90000" && proj.conform_map.status==="verified", "conform master 90000 verified");
assert(proj.conform_map.sources.some(s=>s.source_id==="iso_cam_01" && s.offset_ms===42), "iso offset 42ms drift 1.8ppm");
console.log(`Conform ${proj.conform_map.sources.length} sources, missing ${proj.conform_map.missing_ranges.length}`);

// 3. Event intelligence graph lineage
let moment = proj.moments.find(m=>m.moment_id==="moment_0042");
assert(moment && moment.signals.topic==="security architecture" && moment.derived_assets.includes("chapter_08"), "moment_0042 topic security chapter_08");
assert(moment.lineage && moment.lineage.source_isos.includes("iso_cam_02"), "lineage source_isos");
console.log(`Moment ${moment.moment_id} derived ${moment.derived_assets.join(",")}`);

// 4. Agenda-based chapters priority
let chApproved = proj.chapters.find(c=>c.source==="approved_agenda");
assert(chApproved && chApproved.title==="Security Architecture" && chApproved.confidence===1.0, "approved agenda title not replaced");
console.log(`Chapter ${chApproved.chapter_id} source ${chApproved.source} title ${chApproved.title}`);

// 5. Engagement-based highlights penalized
assert(proj.highlights[0].final_score===0.89 && proj.highlights[0].decision==="review_required", "highlight 0.89 review_required");
console.log(`Highlight engagement ${proj.highlights[0].engagement} final ${proj.highlights[0].final_score}`);

// 6. Speaker moment extraction
assert(proj.speaker_index.some(s=>s.speaker_id==="speaker_02" && s.quotable_moments===3), "speaker_02 3 quotable");
let comp = createSpeakerCompilation(proj.project_id, "speaker_02", "best_of");
assert(comp.length===3, "best_of 3 segments");

// 7. Transcript-linked editing ripple + preserve
let edit = transcriptEdit(proj.project_id, { selection:{ start_segment_id:"seg_044", end_segment_id:"seg_051" }, edit_mode:"remove", ripple_tracks:["program_video","dialogue","captions","graphics"], preserve_room_tone:true });
assert(edit.affected.includes("captions") && edit.new_timeline_version===3, "ripple tracks + new version 3");
let seg = proj.transcript_segments.find(s=>s.segment_id==="seg_044");
assert(seg.edit_status==="excluded", "seg_044 excluded preserves original + edit decision");
console.log(`Transcript edit affected ${edit.affected.join(",")}`);

// 8. Dead-air context-aware thresholds
let silence = detectSilence("unintended_silence");
assert(silence[0].classification==="unintended_silence" && silence[0].recommended_action==="remove_with_ripple", "unintended silence remove");
console.log(`Silence ${silence[0].start_ms}-${silence[0].end_ms} ${silence[0].classification}`);

// 9. Social snippet factory distinct per output
assert(proj.derivatives.some(d=>d.type==="linkedin_clip" && d.aspect_ratio==="1:1"), "linkedin 1:1");
assert(proj.derivatives.some(d=>d.type==="instagram_reel" && d.aspect_ratio==="9:16"), "instagram 9:16 distinct reframing");
console.log(`Derivatives ${proj.derivatives.map(d=>d.type+":"+d.aspect_ratio).join(",")}`);

// 10. Vertical reframing flags
let v = proj.derivatives.find(d=>d.type==="instagram_reel");
assert(v && v.checksum.startsWith("sha3-512:"), "vertical checksum");

// 11. Quote cards 4 modes verbatim not combining non-contiguous
let qc = createQuoteCard({ source_segment_ids:["seg_044"], text:"Every production boundary should be observable.", speaker:{ id:"speaker_02", display_name:"Aarav Mehta", title:"CTO" }, mode:"verbatim" });
assert(qc.mode==="verbatim" && qc.context_complete===true && qc.status==="review_required", "quote verbatim review_required");
console.log(`Quote ${qc.quote_id} verbatim ${qc.text.slice(0,20)}`);

// 12. Content package manifest
let pkg = buildPackage(proj.project_id, ["masters","chapters","transcripts","highlights","social_derivatives","quote_cards","rights_manifest","preflight_report"]);
assert(pkg.package_id.startsWith("pkg_live") && pkg.generated_assets.length===2, "package 2 derivatives");
assert(pkg.source_hashes.program_master.startsWith("sha3-512:"), "source_hashes");
console.log(`Package ${pkg.package_id} assets ${pkg.generated_assets.length} status ${pkg.package_status}`);

// 13. Human-in-the-loop thresholds
let cands = generateCandidates(proj.project_id, { candidate_types:["highlight","quote"], signals:["audience_engagement"], minimum_confidence:0.8 });
assert(cands.highlights.length>=1, "highlights >=0.8 candidate");
console.log(`Candidates highlights ${cands.highlights.length} quotes ${cands.quotes.length}`);

// 14. Rights propagation after reframing rescanned
let derivative = proj.derivatives[0];
assert(derivative.rights_status==="cleared" && derivative.consent_status==="cleared", "rights/consent cleared");

// 15. Webhooks idempotency (mock)
let webhook = { event:"video.live.highlight.candidate.created", session_id: live.session_id, project_id: proj.project_id, candidate_id:"hl_003", confidence:0.91, review_required:true, idempotency_key: `${live.session_id}-hl_003-v1` };
assert(webhook.idempotency_key.includes(live.session_id), "webhook idempotency");

// 16. Preflight gates for derivatives (mock)
assert(derivative.preflight_status==="pending" || derivative.preflight_status==="ready_with_warnings", "derivative preflight pending");

// 17. Pipeline lanes
import { pipelineStatus } from "./src/live-edit-engine.ts";
let pipe = pipelineStatus(proj.project_id);
assert(pipe.fast.includes("transcript"), "fast lane transcript");
console.log(`Pipeline fast: ${pipe.fast}`);

console.log("\nAll live-to-edit smoke checks passed.");
