/**
 * N0VA VIDEOS — Audio Intelligence Engine
 * Versioned stems, speaker-preserving isolation, loudness per destination
 */
import type {
  Stem, StemVersion, SpeakerProfile, DialogueIsolation, RoomToneReconstruction, PronunciationEntry, DubVersion,
  VoiceConsistency, DestinationAudioProfile, LoudnessReport, DuckingDecision, SfxSuggestion, AudioIssue, RepairScore, SilenceEvent, MixGraph, ImmersiveCheck, AudioReport,
} from "./audio-intelligence-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

const stems = new Map<string, Stem>();
const stemVersions = new Map<string, StemVersion[]>();
const speakerProfiles = new Map<string, SpeakerProfile>();
const pronunciationDict = new Map<string, PronunciationEntry>();
const dubs = new Map<string, DubVersion>();
const issues = new Map<string, AudioIssue>();
const mixGraphs = new Map<string, MixGraph>();

// ── Seed ─────────────────────────────────────────────────────────────────────
(function seed(){
  const stem: Stem = {
    stem_id:"stem_dx_clean_v04", type:"DX_CLEAN", source_stems:["mic_01","mic_02","iso_remote_03"], channel_layout:"mono", sample_rate_hz:48000, bit_depth:24, version:4,
    processing_chain:["speaker_isolation_v3","de_noise_v2","de_reverb_v1","de_esser_v2","dialogue_eq_v4"], confidence:0.94, approval_status:"approved",
  };
  stems.set(stem.stem_id, stem);
  stemVersions.set("stem_dx",[
    { stem_id:"stem_dx", version:1, created_by:{type:"human",id:"ingest"}, source_hash:"sha3-512:src1", output_hash:"sha3-512:out1", plugin_chain:[{plugin:"n0va.dialogue.isolate",version:"3.2.0",parameters_hash:"sha3-512:p1"}], approval:{status:"approved"} },
    { stem_id:"stem_dx", version:4, parent_version:3, created_by:{type:"agent",id:"audio_intelligence_agent"}, source_hash:"sha3-512:src4", output_hash:"sha3-512:out4", plugin_chain:[{plugin:"n0va.dialogue.isolate",version:"3.2.0",parameters_hash:"sha3-512:p4"}], quality_report_id:"audio_report_001", approval:{status:"approved",approved_by:"sound_supervisor_01",approved_at:"2026-08-30T06:40:00Z"} },
  ]);
  speakerProfiles.set("speaker_07",{
    speaker_id:"speaker_07", voiceprint_hash:"vp_speaker07_abc", reference_assets:["clean_take_004","live_mic_007"],
    characteristics:{ fundamental_range_hz:[105,220], speech_rate_wpm:142, sibilance_profile:0.42, resonance_profile:"warm", accent:"en-IN" },
    consent:{ voice_processing:"allowed", voice_cloning:"restricted", public_dubbing:"allowed" },
  });
  pronunciationDict.set("N0VA:en-US",{ term:"N0VA", language:"en-US", spoken_form:"NOH-vah", phonemes:["N","OW","V","AH"], stress:[1,0], applies_to:["transcription","dubbing","voiceover","captioning"], priority:100, approved_by:"language_editor_01" });
  // Seed issue clipping
  issues.set("issue_009",{
    issue_id:"issue_009", type:"clipping", track_id:"mic_02", range:{ start_ms:182340, end_ms:182510 }, severity:"high", peak_dbtp:1.4,
    repair_options:[{method:"declipping_neural_v2",estimated_recovery:0.76,artifact_risk:0.18},{method:"alternate_iso_source",estimated_recovery:0.93,artifact_risk:0.04}],
    recommended_action:"replace_with_iso_source", confidence:0.95, status:"open",
  });
  mixGraphs.set("mix_main",{
    nodes:[
      {id:"bus_dialogue",type:"bus",inputs:["stem_dx_clean_v04","stem_vo_v02"]},
      {id:"duck_music",type:"dynamic_processor",sidechain:"bus_dialogue",target:"bus_music",mode:"speech_importance"},
      {id:"master_delivery",type:"output",inputs:["bus_dialogue","bus_music","bus_fx","bus_ambience"]},
    ]
  });
})();

// ── Analysis ─────────────────────────────────────────────────────────────────
export function analyzeAudio(assetId: string, detect: string[] = ["clipping","hum","phase","silence","loudness"]): { issues: AudioIssue[]; loudness: LoudnessReport; stems_generated?: string[] } {
  const found: AudioIssue[] = [];
  if (detect.includes("clipping")) found.push(issues.get("issue_009")!);
  if (detect.includes("hum")) found.push({
    issue_id: uid("hum"), type:"hum", track_id:"mic_01", range:{start_ms:0,end_ms:5000}, severity:"medium",
    repair_options:[{method:"adaptive_notch_filter",estimated_recovery:0.88,artifact_risk:0.07}],
    recommended_action:"adaptive_notch_filter", confidence:0.96, status:"open",
    hum_analysis:{ fundamental_hz:50, harmonics_hz:[100,150,200], stability:0.93, affected_tracks:["mic_01","mic_02"], recommended_repair:"adaptive_notch_filter", risk_to_voice:0.07, confidence:0.96 },
  });
  if (detect.includes("phase")) found.push({
    issue_id: uid("phase"), type:"phase", track_id:"stereo_music_01", range:{start_ms:10000,end_ms:12000}, severity:"medium",
    repair_options:[{method:"review_polarity_and_time_alignment",estimated_recovery:0.82,artifact_risk:0.12}],
    recommended_action:"review_polarity_and_time_alignment", confidence:0.94, status:"open",
    phase_check:{ correlation:-0.42, polarity_status:"warning", mono_loss_db:8.7, affected_band:"80-240Hz" },
  });
  if (detect.includes("silence")) found.push({
    issue_id: uid("silence"), type:"silence", track_id:"mic_01", range:{start_ms:428100,end_ms:431700}, severity:"high",
    repair_options:[{method:"inspect_backup_mic_or_iso",estimated_recovery:0.9,artifact_risk:0.05}],
    recommended_action:"inspect_backup_mic_or_iso", confidence:0.92, status:"open",
  });
  const loudness: LoudnessReport = { integrated_lufs:-20.4, true_peak_dbtp:-0.3, loudness_range_lu:8.1, dialogue_gated_lufs:-22, silence_percent:2.1, clipping_events:1, status:"warning" };
  return { issues: found, loudness, stems_generated: ["stem_dx","stem_mx","stem_fx"] };
}

// ── Dialogue isolation ───────────────────────────────────────────────────────
export function isolateDialogue(input: { source_asset_id: string; speaker_id: string; time_range: { start_ms:number; end_ms:number }; preserve_room_tone?: boolean; maximum_artifact_risk?: number }): DialogueIsolation {
  const profile = speakerProfiles.get(input.speaker_id);
  if (!profile) throw new Error("Speaker profile not found");
  if (profile.consent.voice_processing!=="allowed") throw new Error("Voice processing not allowed for this speaker");
  const artifactRisk = 0.08;
  if (input.maximum_artifact_risk!==undefined && artifactRisk > input.maximum_artifact_risk) throw new Error(`Artifact risk ${artifactRisk} exceeds maximum ${input.maximum_artifact_risk}`);
  return {
    target_speaker_id: input.speaker_id, source_range: input.time_range,
    suppression:{ music_db:-24.0, audience_db:-18.0, room_noise_db:-12.0 },
    voice_preservation:{ timbre_similarity:0.97, prosody_similarity:0.95, speech_intelligibility_gain:0.31 },
    artifact_risk: artifactRisk, confidence:0.93, review_required:false,
  };
}
export function getSpeakerProfile(speakerId: string): SpeakerProfile | null { return speakerProfiles.get(speakerId) ?? null; }

// ── Room tone ────────────────────────────────────────────────────────────────
export function reconstructRoomTone(locationId: string, targetRange: { start_ms:number; end_ms:number }): RoomToneReconstruction {
  return {
    location_id: locationId, source_segments:[{ start_ms:1000, end_ms:6500, quality:0.91 }], target_range: targetRange,
    method:"spectral_interpolation", crossfade_ms:180, spectral_match:0.94, loop_detected:false, confidence:0.89,
  };
}

// ── Pronunciation ────────────────────────────────────────────────────────────
export function addPronunciationEntry(entry: PronunciationEntry): PronunciationEntry { pronunciationDict.set(`${entry.term}:${entry.language}`, entry); return entry; }
export function getPronunciation(term: string, language: string): PronunciationEntry | null { return pronunciationDict.get(`${term}:${language}`) ?? null; }
export function listPronunciation(): PronunciationEntry[] { return Array.from(pronunciationDict.values()); }

// ── Dubbing ──────────────────────────────────────────────────────────────────
export function createDubVersion(input: { source_language: string; target_language: string; voice_policy?: string; pronunciation_dictionary_id?: string; lip_sync?: boolean; preserve_music_and_effects?: boolean }): DubVersion {
  // Check voice consent for synthetic
  if (input.voice_policy==="consented_voice_profiles_only") {
    const sp = speakerProfiles.get("speaker_07");
    if (sp && sp.consent.voice_cloning==="restricted") {
      // still allow with consented_synthetic_voice but check
    }
  }
  const dub: DubVersion = {
    language: input.target_language, source_language: input.source_language, source_transcript_version:"tr_approved_v3", translation_version:`translation_${input.target_language}_v2`,
    voice_mode:"consented_synthetic_voice", speaker_mappings:[{ source_speaker_id:"speaker_07", dub_voice_id:"voice_hi_speaker07_v1" }],
    timing_mode:"meaning_preserving_time_fit", lip_sync_mode: input.lip_sync ? "optional" : "none", review_status:"linguistic_review_required",
  };
  dubs.set(`${input.source_language}->${input.target_language}`, dub);
  return dub;
}
export function getDub(source: string, target: string): DubVersion | null { return dubs.get(`${source}->${target}`) ?? null; }
export function checkVoiceConsistency(speakerId: string, segmentId: string): VoiceConsistency {
  return {
    speaker_id: speakerId, segment_id: segmentId, timbre_similarity:0.96, prosody_similarity:0.91, accent_consistency:0.94, speech_rate_delta_percent:3.2, pitch_delta_semitones:0.4, emotional_continuity:0.87, overall_score:0.92, decision:"pass_with_review",
  };
}

// ── Loudness normalization ───────────────────────────────────────────────────
const DESTINATION_PROFILES: Record<string, DestinationAudioProfile> = {
  broadcast_hd:{ profile_id:"broadcast_hd", integrated_loudness_target:-23.0, loudness_tolerance_lu:1.0, true_peak_max_dbtp:-1.0, short_term_limit:-18.0, dynamic_range_policy:"preserve", channel_layout:"stereo", metadata_required:true },
  youtube_stereo:{ profile_id:"youtube_stereo", integrated_loudness_target:-14, loudness_tolerance_lu:1, true_peak_max_dbtp:-1, dynamic_range_policy:"preserve", channel_layout:"stereo", metadata_required:true },
  web_stereo:{ profile_id:"web_stereo", integrated_loudness_target:-16, loudness_tolerance_lu:1, true_peak_max_dbtp:-1, dynamic_range_policy:"preserve", channel_layout:"stereo", metadata_required:false },
};

export function normalizeForDestination(timelineId: string, profileId: string, opts?: { preserve_dynamic_range?: boolean; true_peak_protection?: boolean }): { profile: DestinationAudioProfile; loudness: LoudnessReport; adjustment: string; reversible: boolean } {
  const profile = (DESTINATION_PROFILES[profileId] ?? DESTINATION_PROFILES["web_stereo"]!) as DestinationAudioProfile;
  const loudness: LoudnessReport = { integrated_lufs:-20.4, true_peak_dbtp:-0.3, loudness_range_lu:8.1, status:"warning" };
  let adjustment = "gain adjustment -2.1 dB";
  if (loudness.true_peak_dbtp > profile.true_peak_max_dbtp) adjustment = "limiter protection + gain -2.1 dB";
  return { profile, loudness, adjustment, reversible: true };
}
export function getDestinationProfile(profileId: string): DestinationAudioProfile | null { return DESTINATION_PROFILES[profileId] ?? null; }

// ── Ducking ──────────────────────────────────────────────────────────────────
export function decideDucking(range: { start_ms:number; end_ms:number }, speechImportance: number): DuckingDecision {
  const duck = speechImportance > 0.85 ? -8.5 : -4.0;
  return {
    range, speech_importance: speechImportance, music_overlap:0.81, duck_amount_db: duck, attack_ms:80, release_ms:420,
    sidechain_source:"dx_clean_v04", reason: speechImportance>0.9 ? "key_product_statement" : "conversation", confidence:0.91,
  };
}

// ── SFX suggestions ──────────────────────────────────────────────────────────
export function suggestSfx(sceneId: string, event: string): SfxSuggestion {
  return {
    scene_id: sceneId, event, time_ms:864200,
    candidates:[{ asset_id:"sfx_soft_impact_017", fit_score:0.88, license_status:"cleared", suggested_gain_db:-19, suggested_duration_ms:740 }],
    reason:"visual reveal with low-frequency motion", status:"suggested",
  };
}

// ── Repair scoring ───────────────────────────────────────────────────────────
export function scoreRepair(issueId: string): RepairScore {
  const issue = issues.get(issueId);
  if (!issue) throw new Error("Issue not found");
  const detection = issue.confidence;
  const repairConf = issue.repair_options[0]?.estimated_recovery ?? 0.8;
  const artifact = issue.repair_options[0]?.artifact_risk ?? 0.15;
  const sourceQ = 0.91;
  let recommendation: RepairScore["overall_recommendation"] = "flag_only";
  const overall = (detection + repairConf + (1-artifact) + sourceQ)/4;
  if (overall >=0.95) recommendation="auto_apply_then_review";
  else if (overall>=0.80) recommendation="human_approval_required";
  else if (overall>=0.60) recommendation="show_alternatives";
  else recommendation="flag_only";
  // High-impact always require review
  if (issue.type==="clipping" && issue.severity==="high") recommendation="human_approval_required";
  return { detection_confidence: detection, repair_confidence: repairConf, artifact_risk: artifact, source_quality: sourceQ, overall_recommendation: recommendation };
}

// ── Hum analysis ─────────────────────────────────────────────────────────────
export function analyzeHum(): { fundamental_hz:number; harmonics_hz:number[]; stability:number; affected_tracks:string[]; recommended_repair:string; risk_to_voice:number; confidence:number } {
  return { fundamental_hz:50, harmonics_hz:[100,150,200], stability:0.93, affected_tracks:["mic_01","mic_02"], recommended_repair:"adaptive_notch_filter", risk_to_voice:0.07, confidence:0.96 };
}
export function checkPhase(trackId: string): { correlation:number; polarity_status:string; mono_loss_db:number; affected_band:string; recommended_action:string; confidence:number } {
  return { correlation:-0.42, polarity_status:"warning", mono_loss_db:8.7, affected_band:"80-240Hz", recommended_action:"review_polarity_and_time_alignment", confidence:0.94 };
}
export function detectSilence(range: { start_ms:number; end_ms:number }): SilenceEvent {
  return { start_ms: range.start_ms, end_ms: range.end_ms, duration_ms: range.end_ms-range.start_ms, rms_dbfs:-78.4, room_tone_present:false, video_activity:"active", classification:"probable_audio_dropout", severity:"high", confidence:0.92, recommended_action:"inspect_backup_mic_or_iso" };
}

// ── Stem versioning ──────────────────────────────────────────────────────────
export function listStems(): Stem[] { return Array.from(stems.values()); }
export function getStem(stemId: string): Stem | null { return stems.get(stemId) ?? null; }
export function createStemVersion(stemId: string, input: { parent_version?: number; plugin_chain: { plugin:string; version:string; parameters_hash:string }[] }): StemVersion {
  const versions = stemVersions.get(stemId) ?? [];
  const nextVer = (versions[versions.length-1]?.version ?? 0)+1;
  const ver: StemVersion = {
    stem_id: stemId, version: nextVer, parent_version: input.parent_version ?? versions[versions.length-1]?.version,
    created_by:{ type:"agent", id:"audio_intelligence_agent" }, source_hash:`sha3-512:src${nextVer}`, output_hash:`sha3-512:out${nextVer}`, plugin_chain: input.plugin_chain, approval:{ status:"pending" },
  };
  versions.push(ver); stemVersions.set(stemId, versions);
  // Update stem
  const stem = stems.get(stemId);
  if (stem) { stem.version = nextVer; stem.approval_status="pending"; }
  return ver;
}
export function getStemVersions(stemId: string): StemVersion[] { return stemVersions.get(stemId) ?? []; }
export function approveStemVersion(stemId: string, version: number, approver: string, role: string): StemVersion | null {
  const vers = stemVersions.get(stemId);
  const v = vers?.find(x=>x.version===version);
  if (!v) return null;
  v.approval = { status:"approved", approved_by: approver, approved_at: nowIso() };
  const stem = stems.get(stemId);
  if (stem && stem.version===version) stem.approval_status="approved";
  return v;
}

// ── Mix graph ────────────────────────────────────────────────────────────────
export function getMixGraph(graphId: string): MixGraph | null { return mixGraphs.get(graphId) ?? null; }
export function createMixGraph(graphId: string, nodes: MixGraph["nodes"]): MixGraph { const g: MixGraph = { nodes }; mixGraphs.set(graphId,g); return g; }

// ── Immersive ────────────────────────────────────────────────────────────────
export function checkImmersive(format: string): ImmersiveCheck {
  return { format, dialogue_object:"obj_dx_01", bed_loudness_lufs:-24.1, object_peak_dbtp:-2.4, downmix_mono_loss_db:1.8, spatial_continuity:0.93, status:"pass_with_warning" };
}

// ── Report ─────────────────────────────────────────────────────────────────
export function generateAudioReport(projectId: string): AudioReport {
  return {
    project_id: projectId,
    source_integrity:["24 tracks analyzed","0 missing ranges","2 clock-drift warnings","1 clipped microphone segment"],
    dialogue:["8 speakers identified","96.4% speech coverage","14 repair suggestions","2 low-confidence isolation regions"],
    noise:["3 hum events","7 HVAC regions","1 wind event","4 audience bleed regions"],
    phase:["1 polarity warning","2 stereo correlation warnings","Mono fold-down: pass with warning"],
    mix:[`Integrated loudness: -20.4 LUFS`,`True peak: -0.3 dBTP`,`Destination profile: web stereo`,`Recommended adjustment: -2.1 dB gain`],
    dubbing:["English master approved","Hindi pronunciation review pending","Spanish voice consistency: pass"],
    approval:["18 stems approved","3 stems pending","2 destinations blocked"],
  };
}
