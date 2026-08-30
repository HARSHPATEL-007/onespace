#!/usr/bin/env node
import { analyzeAudio, isolateDialogue, reconstructRoomTone, createDubVersion, checkVoiceConsistency, normalizeForDestination, decideDucking, suggestSfx, scoreRepair, analyzeHum, checkPhase, detectSilence, listStems, createStemVersion, approveStemVersion, getMixGraph, checkImmersive, generateAudioReport } from "./src/audio-intelligence-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Audio Intelligence Smoke ===");

// 1. Stem model canonical 12 + immersive
let stems = listStems();
assert(stems.some(s=>s.stem_id==="stem_dx_clean_v04" && s.type==="DX_CLEAN" && s.sample_rate_hz===48000 && s.bit_depth===24), "stem DX_CLEAN v04 48k 24-bit");
assert(stems[0].processing_chain.includes("speaker_isolation_v3"), "processing chain speaker_isolation");
console.log(`Stem ${stems[0].stem_id} ${stems[0].type} chain ${stems[0].processing_chain.join("→")}`);

// 2. Signal analysis 5 planes
let analysis = analyzeAudio("asset_001",["clipping","hum","phase","silence","loudness"]);
assert(analysis.issues.some(i=>i.type==="clipping" && i.track_id==="mic_02"), "clipping issue mic_02");
assert(analysis.issues.some(i=>i.type==="hum" && i.hum_analysis.fundamental_hz===50), "hum 50Hz");
assert(analysis.loudness.integrated_lufs===-20.4 && analysis.loudness.true_peak_dbtp===-0.3, "loudness -20.4 / -0.3");
console.log(`Analysis ${analysis.issues.length} issues loudness ${analysis.loudness.integrated_lufs}`);

// 3. Speaker-preserving isolation
let iso = isolateDialogue({ source_asset_id:"asset_001", speaker_id:"speaker_07", time_range:{start_ms:842100,end_ms:914800}, preserve_room_tone:true, maximum_artifact_risk:0.15 });
assert(iso.suppression.music_db===-24.0 && iso.suppression.audience_db===-18.0, "suppression music -24 audience -18");
assert(iso.voice_preservation.timbre_similarity===0.97 && iso.voice_preservation.prosody_similarity===0.95, "timbre 0.97 prosody 0.95");
assert(iso.artifact_risk===0.08 && iso.confidence===0.93, "artifact 0.08 conf 0.93");
console.log(`Isolation speaker ${iso.target_speaker_id} intelligibility gain ${iso.voice_preservation.speech_intelligibility_gain}`);

// 4. Speaker identity protection
import { getSpeakerProfile } from "./src/audio-intelligence-engine.ts";
let profile = getSpeakerProfile("speaker_07");
assert(profile && profile.consent.voice_cloning==="restricted", "voice_cloning restricted");
console.log(`Speaker ${profile.speaker_id} accent ${profile.characteristics.accent} consent cloning ${profile.consent.voice_cloning}`);

// 5. Room-tone reconstruction
let rt = reconstructRoomTone("venue_main_hall",{start_ms:428100,end_ms:431700});
assert(rt.location_id==="venue_main_hall" && rt.method==="spectral_interpolation" && rt.crossfade_ms===180, "room tone spectral 180ms");
assert(rt.spectral_match===0.94 && rt.confidence===0.89, "spectral 0.94");
console.log(`Room tone ${rt.location_id} ${rt.source_segments[0].start_ms}-${rt.source_segments[0].end_ms}`);

// 6. Dubbing branching
let dub = createDubVersion({ source_language:"en-US", target_language:"hi-IN", voice_policy:"consented_voice_profiles_only", pronunciation_dictionary_id:"dict_project_001", lip_sync:true, preserve_music_and_effects:true });
assert(dub.language==="hi-IN" && dub.voice_mode==="consented_synthetic_voice" && dub.review_status==="linguistic_review_required", "dub hi-IN consented synthetic");
console.log(`Dub ${dub.language} voice ${dub.voice_mode} lip ${dub.lip_sync_mode}`);

// 7. Pronunciation layered dictionaries
import { addPronunciationEntry, getPronunciation } from "./src/audio-intelligence-engine.ts";
let entry = addPronunciationEntry({ term:"N0VA", language:"en-US", spoken_form:"NOH-vah", phonemes:["N","OW","V","AH"], stress:[1,0], applies_to:["transcription","dubbing"], priority:100, approved_by:"language_editor_01" });
assert(entry.spoken_form==="NOH-vah" && entry.phonemes.length===4, "pronunciation N0VA");
let fetched = getPronunciation("N0VA","en-US");
assert(fetched && fetched.priority===100, "fetch N0VA priority 100");
console.log(`Pronunciation ${fetched.term} → ${fetched.spoken_form}`);

// 8. Voice consistency checks
let vc = checkVoiceConsistency("speaker_07","dub_hi_0042");
assert(vc.timbre_similarity===0.96 && vc.overall_score===0.92 && vc.decision==="pass_with_review", "voice consistency pass_with_review");
console.log(`Voice consistency timbre ${vc.timbre_similarity} overall ${vc.overall_score}`);

// 9. Destination loudness normalization separate from intent
let norm = normalizeForDestination("tl_001","broadcast_hd",{preserve_dynamic_range:true});
assert(norm.profile.integrated_loudness_target===-23.0 && norm.profile.true_peak_max_dbtp===-1.0, "broadcast -23 LUFS -1 dBTP");
assert(norm.adjustment.includes("-2.1 dB") && norm.reversible===true, "gain -2.1 reversible");
let normYT = normalizeForDestination("tl_001","youtube_stereo");
assert(normYT.profile.integrated_loudness_target===-14, "youtube -14");
console.log(`Loudness broadcast ${norm.profile.integrated_loudness_target} → ${norm.adjustment}`);

// 10. Speech-importance ducking
let duck = decideDucking({start_ms:842100,end_ms:914800},0.94);
assert(duck.speech_importance===0.94 && duck.duck_amount_db===-8.5 && duck.sidechain_source==="dx_clean_v04", "key statement -8.5dB sidechain dx_clean");
assert(duck.reason==="key_product_statement", "reason key_product_statement");
console.log(`Ducking ${duck.duck_amount_db}dB attack ${duck.attack_ms} reason ${duck.reason}`);

// 11. SFX suggestions rights-checked
let sfx = suggestSfx("scene_021","product_reveal");
assert(sfx.candidates[0].fit_score===0.88 && sfx.candidates[0].license_status==="cleared", "sfx fit 0.88 cleared");
console.log(`SFX ${sfx.event} fit ${sfx.candidates[0].fit_score}`);

// 12. Repair detection
assert(analysis.issues[0].repair_options[0].method==="declipping_neural_v2", "repair declipping");

// 13. Repair confidence scoring
let score = scoreRepair("issue_009");
assert(score.detection_confidence===0.95 && score.overall_recommendation==="human_approval_required", `repair ${score.overall_recommendation} high-impact requires review`);
console.log(`Repair detection ${score.detection_confidence} artifact ${score.artifact_risk} → ${score.overall_recommendation}`);

// 14. Hum analysis 50Hz harmonics
let hum = analyzeHum();
assert(hum.fundamental_hz===50 && hum.harmonics_hz.includes(100) && hum.stability===0.93, "hum 50Hz harmonics");
console.log(`Hum ${hum.fundamental_hz}Hz stability ${hum.stability} risk ${hum.risk_to_voice}`);

// 15. Phase check
let phase = checkPhase("stereo_music_01");
assert(phase.correlation===-0.42 && phase.mono_loss_db===8.7, "phase -0.42 mono loss 8.7dB");
console.log(`Phase corr ${phase.correlation} mono loss ${phase.mono_loss_db}dB`);

// 16. Silence detection correlated with video
let sil = detectSilence({start_ms:428100,end_ms:431700});
assert(sil.classification==="probable_audio_dropout" && sil.severity==="high", "silence dropout high");
console.log(`Silence ${sil.start_ms}-${sil.end_ms} ${sil.classification} action ${sil.recommended_action}`);

// 17. Stem versioning branch/compare/revert
let v5 = createStemVersion("stem_dx",{ parent_version:4, plugin_chain:[{plugin:"n0va.dialogue.isolate",version:"3.2.0",parameters_hash:"sha3-512:p5"}] });
assert(v5.version===5 && v5.parent_version===4, "stem v05 parent 4");
let approved = approveStemVersion("stem_dx",5,"sound_supervisor_01","mix_engineer");
assert(approved && approved.approval.status==="approved", "approved by sound_supervisor");
console.log(`Stem v${v5.version} approved ${approved.approval.approved_by}`);

// 18. Mix graph
let graph = getMixGraph("mix_main");
assert(graph && graph.nodes.some(n=>n.id==="bus_dialogue" && n.inputs?.includes("stem_dx_clean_v04")), "mix graph dialogue bus");
assert(graph.nodes.some(n=>n.id==="duck_music" && n.sidechain==="bus_dialogue"), "duck sidechain");
console.log(`Mix graph ${graph.nodes.length} nodes`);

// 19. Immersive Atmos
let imm = checkImmersive("dolby_atmos_7_1_4");
assert(imm.format==="dolby_atmos_7_1_4" && imm.bed_loudness_lufs===-24.1 && imm.spatial_continuity===0.93, "Atmos 7.1.4 bed -24.1");
console.log(`Immersive ${imm.format} downmix loss ${imm.downmix_mono_loss_db}dB ${imm.status}`);

// 20. Audio report
let report = generateAudioReport("project_001");
assert(report.source_integrity[0].includes("24 tracks") && report.dialogue.length>0, "report source integrity");
console.log(`Report ${report.project_id} dialogue ${report.dialogue[0]}`);

console.log("\nAll audio intelligence smoke checks passed.");
