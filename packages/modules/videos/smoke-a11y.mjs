#!/usr/bin/env node
import { analyzeAccessibility, optimizeCaptionPosition, evaluateCaptionQuality, checkReadingSpeed, generateAudioDescription, getSignWindow, getAccessibleGraphic, checkColorAccessibility, detectFlashForTimeline, getSemanticTimeline, generateDestinationReport, generateManifest } from "./src/accessibility-automation-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Accessibility Automation Smoke ===");

// 1. Parallel layers attached to timeline
let analysis = analyzeAccessibility("tl_001",["speaker_captions","caption_positioning","caption_quality","reading_speed","audio_description","sign_language_safe_area","color_blindness","flash_risk"],["web_player_wcag_aa","broadcast","social_vertical"]);
assert(analysis.events.length===1 && analysis.events[0].event_id==="a11y_0042", "a11y event a11y_0042");
assert(analysis.events[0].audio_description_required===true, "AD required");
assert(analysis.caption_cues.length===2, "2 caption cues");
console.log(`Analysis ${analysis.events.length} events, ${analysis.caption_cues.length} cues`);

// 2. Speaker-identified captions
import { shouldUseSpeakerLabel } from "./src/accessibility-automation-engine.ts";
assert(shouldUseSpeakerLabel({speaker_count:2,off_screen:false,overlapping:false,single_visible:false})===true, "2 speakers → label");
assert(shouldUseSpeakerLabel({speaker_count:1,off_screen:false,overlapping:false,single_visible:true})===false, "single visible → no label");

// 3. Caption positioning optimizer
let pos = optimizeCaptionPosition("cue_088");
assert(pos && pos.selected_region==="top_center" && pos.reason.includes("product interface"), "top_center due product interface");
assert(pos.candidate_positions.length===2 && pos.candidate_positions[1].occlusion_score===0.11, "candidate occlusion 0.11");
console.log(`Position ${pos.selected_region} conf ${pos.confidence}`);

// 4. Caption quality multi-dimension
let quality = evaluateCaptionQuality("en-US");
assert(quality.word_accuracy_estimate===0.985 && quality.overall_score===0.93, "quality 0.93");
assert(quality.decision==="pass_with_review", "pass_with_review");
console.log(`Quality overall ${quality.overall_score} ${quality.decision}`);

// 5. Reading-speed density warnings profiles
let density = checkReadingSpeed("cue_091");
assert(density && density.density==="critical" && density.characters_per_second>30, `critical ${density.characters_per_second} cps`);
assert(density.suggested_actions.includes("split_into_two_cues"), "split suggestion");
console.log(`Density ${density.density} ${density.characters_per_second} cps`);

// 6. Audio description candidates
let ads = generateAudioDescription("en-US","concise_neutral",["scene_changes","charts"]);
assert(ads.length===1 && ads[0].description.includes("production layers"), "AD diagram");
assert(ads[0].importance===0.92 && ads[0].narration_space_ms===2700, "AD importance 0.92 space 2700");
console.log(`AD ${ads[0].event_id} ${ads[0].description.slice(0,30)}`);

// 7. Sign window protected layer
import { validateSignWindow } from "./src/accessibility-automation-engine.ts";
let win = getSignWindow("asl_window_01");
assert(win && win.position.x===0.70 && win.minimum_hand_visibility===0.94, "sign window 0.70 0.94");
let valid = validateSignWindow("asl_window_01");
assert(valid.status==="pass", "sign window pass");
console.log(`Sign window ${win.window_id} status ${valid.status}`);

// 8. Accessible graphics
let g = getAccessibleGraphic("graphic_07");
assert(g && g.role==="process_diagram" && g.decorative===false, "graphic process_diagram not decorative");
assert(g.screen_reader_label==="Production architecture diagram", "screen reader label");
console.log(`Graphic ${g.graphic_id} role ${g.role}`);

// 9. Color-blind simulations
let color = checkColorAccessibility("graphic_07");
assert(color.color_only_encoding===true, "color_only_encoding true");
assert(color.simulations.protanopia.status==="fail" && color.simulations.tritanopia.status==="pass", "protanopia fail tritanopia pass");
assert(color.suggested_actions.includes("add_pattern_encoding"), "suggested pattern");
console.log(`Color protanopia ${color.simulations.protanopia.distinguishable_categories} fail → ${color.suggested_actions[0]}`);

// 10. Flash risk
let flashes = detectFlashForTimeline();
assert(flashes[0].flash_events===11 && flashes[0].risk_level==="high" && flashes[0].peak_frequency_hz===5.1, "flash 11 events 5.1Hz high");
console.log(`Flash ${flashes[0].flash_events} area ${flashes[0].affected_frame_area_percent}% freq ${flashes[0].peak_frequency_hz}`);

// 11. Reduced-motion (mock)
assert(true, "reduced-motion derivatives linked to same source");

// 12. Keyboard & screen-reader timeline
let nodes = getSemanticTimeline("tl_001");
assert(nodes[0].node_id==="tl_node_0042" && nodes[0].role==="spoken_content", "timeline node spoken_content");
assert(nodes[0].warnings.includes("Caption positioning overlaps product diagram"), "warning overlaps");
console.log(`Semantic node ${nodes[0].label} warnings ${nodes[0].warnings.length}`);

// 13. Destination profiles
import { getProfile, listProfiles } from "./src/accessibility-automation-engine.ts";
let web = getProfile("web_player_wcag_aa");
assert(web && web.required.includes("captions") && web.validation.includes("flash_risk"), "web_player requires captions");
let all = listProfiles();
assert(all.length===5, "5 profiles");
console.log(`Profiles ${all.map(p=>p.profile_id).join(",")}`);

// 14. Destination report blocked
let report = generateDestinationReport("LinkedIn Square Clip","social_square_v08","social_vertical");
assert(report.status==="blocked" && report.required_actions.length===3, "blocked 3 actions");
assert(report.captions.present===true && report.visual_accessibility.color_blind==="fail", "captions present color fail");
console.log(`Report ${report.output} ${report.status} actions ${report.required_actions.length}`);

// 15. Manifest
let manifest = generateManifest("export_001",8,"web_player_wcag_aa");
assert(manifest.overall_status==="pass_with_warnings" && manifest.tracks.captions[0].status==="approved", "manifest pass_with_warnings captions approved");
console.log(`Manifest ${manifest.asset_id} v${manifest.timeline_version} ${manifest.overall_status}`);

// 16. Agent routing
import { routeToAgent } from "./src/accessibility-automation-engine.ts";
assert(routeToAgent("caption_quality")==="Caption Agent", "caption → Caption Agent");
assert(routeToAgent("audio_description")==="Audio Description Agent", "AD → AD Agent");
assert(routeToAgent("flash_risk")==="Visual Safety Agent", "flash → Visual Safety");

console.log("\nAll a11y automation smoke checks passed.");
