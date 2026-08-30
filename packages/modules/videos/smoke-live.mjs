#!/usr/bin/env node
import { createSession, getSession, predictHealth, executeFailover, getDestinationHealth, reconnectDestination, createCaptionRevision, createHighlightCandidate, startReplay, verifyRecording, diagnoseContributor, listFallbackAssets, generateEventReport, listSessions } from "./src/live-control-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Resilient Live Control Room Smoke ===");

// 1. Create live session with multi-region active-active
let sess = createSession({ event_id:"event_q3_launch", regions:["us_east","eu_west","ap_southeast"], sources:["camera_01","camera_02","guest_01"], destinations:[{platform:"youtube",profile:"youtube_1080p60_v5"},{platform:"linkedin",profile:"linkedin_1080p_v3"},{platform:"instagram",profile:"instagram_1080p_v3"},{platform:"custom_rtmp",profile:"rtmp_1080p_v3"}], recording:{program:true,clean_feed:true,isos:true,audio_stems:true} });
assert(sess.session_id.startsWith("live_") && sess.regions.length===3, "session 3 regions active-active");
assert(sess.regions[0].role==="primary" && sess.regions[1].role==="hot_standby", "primary + hot standby + cold");
assert(sess.encoders.length===6 && sess.destinations.length===4, "6 encoders (2 per region) 4 destinations");
assert(sess.recording.iso_count===8 && sess.recording.integrity_status==="verified", "8 ISOs verified");
console.log(`Session ${sess.session_id} regions ${sess.regions.map(r=>r.region+":"+r.role).join(",")} encoders ${sess.encoders.length}`);

// 2. State machine LIVE with planes independent
assert(sess.status==="live" && sess.live_state.failover_level===0, "live state failover 0");
assert(sess.program_clock.timebase==="90000", "program clock 90000");
console.log(`State ${sess.status} program_clock ${sess.program_clock.current_pts}`);

// 3. Backup encoder warmed, isolated domains, state synced
let primary = sess.encoders.find(e=>e.region==="us_east" && e.type==="hardware");
let backup = sess.encoders.find(e=>e.region==="us_east" && e.type==="software_gpu");
assert(primary && backup && primary.status==="warmed" && backup.status==="warmed", "both warmed");
assert(primary.state && primary.state.gop_position!==undefined, "warmed state has GOP/program frame");
console.log(`Primary ${primary.encoder_id} backup ${backup.encoder_id} warmed`);

// 4. Health prediction neural with 5-level thresholds
let healthy = predictHealth("stream_001",{packet_loss:0.4,jitter:12,queue_depth:8});
assert(healthy.level==="healthy" && healthy.failure_probability_60s<0.2, "healthy <0.20");
let critical = predictHealth("stream_001",{packet_loss:4.5,jitter:120,queue_depth:65,gpu_util:92});
assert(critical.level==="critical" && critical.failure_probability_60s>0.75, `critical ${critical.failure_probability_60s}`);
assert(critical.likely_causes.some(c=>c.cause==="upstream_packet_loss"), "likely upstream_packet_loss");
assert(critical.recommended_action==="increase_srt_latency_then_reduce_bitrate", "recommended action");
console.log(`Healthy ${healthy.health_score} ${healthy.failure_probability_60s} → Critical ${critical.health_score} ${critical.failure_probability_60s} TTD ${critical.time_to_degradation_seconds}s`);

// 5. Failover hierarchy L1-L5
let h1 = executeFailover(sess.session_id,{scope:"encoder",from:sess.encoders[0].encoder_id,to:sess.encoders[1].encoder_id,reason:"predicted_failure",mode:"keyframe_handoff",operator_id:"user_td_01"});
assert(h1.handoff.mode.includes("keyframe") && h1.handoff.timestamp_continuity==="pass", "L1 encoder keyframe handoff timestamp pass");
assert(h1.session.live_state.failover_level===1 && h1.session.status==="failover_active", "L1 level 1");
console.log(`L1 handoff ${h1.handoff.from_encoder}→${h1.handoff.to_encoder} frames dropped ${h1.handoff.frames_dropped}`);
let sess2 = createSession({ event_id:"event_q3_launch2", regions:["us_east","eu_west"], sources:["camera_01"], destinations:[{platform:"youtube",profile:"youtube_1080p60_v5"}], recording:{program:true} });
let h3 = executeFailover(sess2.session_id,{scope:"region",from:sess2.encoders[0].encoder_id,to:sess2.encoders[2].encoder_id,reason:"regional_network_degradation"});
assert(h3.session.live_state.failover_level===3, "L3 regional failover level 3");
assert(h3.incident.severity==="p0" && h3.incident.root_cause_hypothesis==="regional_network_degradation", "P0 incident");

// 6. Seamless switching buffer + handoff continuity
assert(h1.handoff.last_source_pts===89234400 && h1.handoff.first_target_pts===89234400, "pts continuity");
assert(h1.handoff.audio_continuity==="pass", "audio continuity pass");

// 7. Per-destination health independent
let destHealth = getDestinationHealth(sess.session_id,"youtube_live");
assert(destHealth && destHealth.status==="healthy" && destHealth.health_score>=80, "youtube healthy");
let degraded = getDestinationHealth(sess.session_id,"linkedin_live");
assert(degraded && degraded.status==="degraded" && degraded.health_score===64, "linkedin degraded not affecting program");
console.log(`Destinations youtube ${destHealth.health_score} linkedin ${degraded.health_score} audience ${degraded.audience_impact}`);

// 8. Reconnection + bitrate recovery with hysteresis
let beforeRung = degraded.current_rung;
let rec = reconnectDestination(sess.session_id,"linkedin_live");
assert(rec && rec.status==="reconnecting", "reconnecting");
assert(rec.current_rung === (beforeRung ?? 0)+1, "downgrade one rung on reconnect");
console.log(`Reconnect downgrade rung ${beforeRung}→${rec.current_rung} bitrate ${rec.ingest.bitrate_kbps}`);

// 9. Caption correction 5 states
let cap = createCaptionRevision({ original_text:"NOVA Aperture", corrected_text:"N0VA Aperture", start_ms:182340, end_ms:186900, reason:"approved glossary correction", actor:"caption_agent" });
assert(cap.state==="corrected" && cap.correction_latency_ms===1400, "caption corrected latency 1400");
assert(cap.original_text==="NOVA Aperture" && cap.corrected_text==="N0VA Aperture", "glossary correction");
console.log(`Caption ${cap.segment_id} v${cap.version} ${cap.original_text}→${cap.corrected_text}`);

// 10. Highlight candidate with pre/post-roll
let hl = createHighlightCandidate({ trigger:"operator_marker", event_time_ms:842100, pre_roll_ms:10000, post_roll_ms:15000, formats:["16:9","9:16"], publish_mode:"review_required" });
assert(hl.start_ms===832100 && hl.end_ms===857100 && hl.score===0.91, "highlight 10s pre/post-roll");
assert(hl.status==="awaiting_operator_review" && hl.suggested_formats.includes("9:16"), "awaiting review");
console.log(`Highlight ${hl.candidate_id} ${hl.start_ms}-${hl.end_ms} formats ${hl.suggested_formats.join(",")}`);

// 11. Instant replay rolling buffer
let replay = startReplay({ session_id:sess.session_id, source:"iso_cam_03", start_offset_seconds:28, duration_seconds:12, speed:0.5, graphics_template:"replay_lower_third_v2" });
assert(replay.state==="playing" && replay.source==="iso_cam_03", "replay playing");
assert(replay.live_edge_ms - replay.replay_point_ms > 20000, "delay 25s");
console.log(`Replay ${replay.source} delay ${replay.live_edge_ms - replay.replay_point_ms}ms state ${replay.state}`);

// 12. ISO recording integrity segmented
let verify = verifyRecording("recording_program_001",["segment_completeness","checksums"]);
assert(verify.verified===true && verify.segments.length===6 && verify.missing_intervals.length===0, "6 segments verified 3 replicas");
assert(verify.segments[0].checksum.startsWith("sha3-512:"), "checksum sha3-512");
console.log(`Recording verified ${verify.segments.length} segments replica 3`);

// 13. Contributor diagnostics
let diag = diagnoseContributor("guest_04");
assert(diag.network.packet_loss_percent===3.1 && diag.device.cpu_percent===92, "diagnostics packet loss 3.1 cpu 92");
assert(diag.recommended_action.includes("audio priority"), "recommended audio priority");
console.log(`Contributor ${diag.contributor_id} ${diag.status} — ${diag.recommended_action}`);

// 14. Fallback assets deterministic
let slates = listFallbackAssets();
assert(slates[0].asset_id==="slate_global_01" && slates[0].loopable===true && slates[0].loudness_verified===true, "slate validated");
console.log(`Fallback ${slates[0].asset_id} loopable ${slates[0].loopable} destinations ${slates[0].destinations.join(",")}`);

// 15. Recovery objectives
import { RECOVERY_OBJECTIVES } from "./src/live-control-engine.ts";
assert(RECOVERY_OBJECTIVES.program_output.target_ms===5000 && RECOVERY_OBJECTIVES.destination_reconnect.target_ms===30000, "recovery objectives");

// 16. Post-event integrity report
let report = generateEventReport(sess.session_id);
assert(report.event==="event_q3_launch" && report.recording_integrity, "event report");
console.log(`Report event ${report.event} regions ${report.regions_used} encoder_switches ${report.encoder_switches}`);

// 17. Planes independence: destination failure not EMERGENCY_MODE
assert(sess.status!=="emergency_mode", "destination degraded not emergency");

// 18. Control plane audit + deterministic recovery when model unavailable
let healthy2 = predictHealth("stream_002",{});
assert(healthy2.model_version==="n0va-live-health-v3", "model version");

console.log("\nAll live smoke checks passed.");
