/**
 * N0VA VIDEOS — Accessibility Automation Engine
 * Parallel layer: analysis → generation → destination validation → auditable approval
 */
import type {
  AccessibilityEvent, CaptionCue, CaptionPosition, CaptionQuality, CaptionDensityWarning,
  AudioDescriptionEvent, AudioDescriptionScript, SignWindow, AccessibleGraphic, ColorAccessibility, FlashRisk,
  TimelineA11yNode, AccessibilityProfile, DestinationA11yReport, AccessibilityManifest, DestinationProfileId, A11yStatus,
} from "./accessibility-automation-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

// Stores
const captionCues = new Map<string, CaptionCue>();
const captionPositions = new Map<string, CaptionPosition>();
const adEvents = new Map<string, AudioDescriptionEvent>();
const adScripts = new Map<string, AudioDescriptionScript>();
const signWindows = new Map<string, SignWindow>();
const graphics = new Map<string, AccessibleGraphic>();
const timelineNodes = new Map<string, TimelineA11yNode>();

(function seed(){
  const cue: CaptionCue = { cue_id:"cue_088", start_ms:842100, end_ms:845400, speaker_id:"speaker_07", speaker_label:"Aarav:", text:"The system protects every production boundary.", caption_type:"dialogue", confidence:0.97, display_style:"speaker_label_plus_standard_text" };
  captionCues.set(cue.cue_id, cue);
  captionCues.set("cue_091",{ cue_id:"cue_091", start_ms:90000, end_ms:92100, speaker_id:"speaker_07", speaker_label:"Aarav:", text:"This is a very long caption that exceeds reading speed limits and should be split into two cues for better readability on mobile devices", caption_type:"dialogue", confidence:0.88, display_style:"standard" });
  captionPositions.set("cue_088",{ cue_id:"cue_088", candidate_positions:[{region:"bottom_center",occlusion_score:0.42,reading_score:0.91,brand_conflict:0.08},{region:"top_center",occlusion_score:0.11,reading_score:0.86,brand_conflict:0.14}], selected_region:"top_center", reason:"bottom area contains product interface labels", confidence:0.89, review_required:true });
  adEvents.set("ad_021",{ event_id:"ad_021", time_range:{start_ms:52100,end_ms:54800}, description:"A diagram shows three production layers connected to a central control plane.", source_visuals:["slide_14","graphic_07"], importance:0.92, narration_space_ms:2700, confidence:0.88, status:"review_required", mode:"standard" });
  adScripts.set("en-US",{ version:3, language:"en-US", narrator:"narrator_01", segments:[{ start_ms:52100, end_ms:54800, text:"A diagram shows three production layers connected to a central control plane.", source_events:["slide_14","graphic_07"], approved:false }], style:"concise_neutral", speech_rate_wpm:145 });
  signWindows.set("asl_window_01",{ window_id:"asl_window_01", source_asset_id:"interpreter_iso_01", time_range:{start_ms:0,end_ms:124500}, position:{x:0.70,y:0.08,width:0.26,height:0.40}, minimum_face_height_percent:12, minimum_hand_visibility:0.94, background_contrast_score:0.92, occlusion_score:0.08, status:"pass" });
  graphics.set("graphic_07",{ graphic_id:"graphic_07", role:"process_diagram", text_content:["Ingest","Production","Distribution"], reading_order:["title","left_to_right_nodes","connector_relationships"], description:"Three production layers connect to a central control plane.", decorative:false, screen_reader_label:"Production architecture diagram" });
  timelineNodes.set("tl_node_0042",{ node_id:"tl_node_0042", start_ms:842100, end_ms:914800, role:"spoken_content", label:"CTO explains security architecture", description:"The CTO explains how production boundaries are protected.", tracks:[{type:"video",label:"Camera 2 close-up"},{type:"audio",label:"CTO dialogue"},{type:"caption",label:"Verified English caption"}], warnings:["Caption positioning overlaps product diagram"], actions:["Open source range","Move caption","Generate audio description","Review color accessibility"] });
})();

// ── Analysis ─────────────────────────────────────────────────────────────────
export function analyzeAccessibility(timelineId: string, checks: string[], destinations: DestinationProfileId[]): { events: AccessibilityEvent[]; caption_cues: CaptionCue[]; flash_risks: FlashRisk[] } {
  const events: AccessibilityEvent[] = [
    { event_id:"a11y_0042", time_range:{ start_ms:842100, end_ms:914800 }, visual_priority:[{type:"speaker",id:"speaker_07",importance:0.94},{type:"product_diagram",id:"graphic_12",importance:0.89}], caption_safe_regions:[{x:0.08,y:0.74,width:0.84,height:0.16,confidence:0.91}], audio_description_required:true, sign_window_safe_region:{x:0.68,y:0.10,width:0.27,height:0.38}, source_timeline_version:8, language:"en-US", generator:"n0va-a11y-v4", model_version:"n0va-a11y-v4", confidence:0.92, human_review_state:"review_required", validation:"pending" },
  ];
  return { events, caption_cues: Array.from(captionCues.values()), flash_risks: detectFlashRisk() };
}
function detectFlashRisk(): FlashRisk[] {
  return [{ range:{start_ms:214500,end_ms:217200}, flash_events:11, affected_frame_area_percent:82, peak_frequency_hz:5.1, red_flash_component:0.34, risk_level:"high", suggested_actions:["reduce_flash_intensity","insert_transition","replace_sequence","add_content_warning"], confidence:0.96 }];
}

// ── Caption positioning optimizer ────────────────────────────────────────────
export function optimizeCaptionPosition(cueId: string): CaptionPosition | null {
  return captionPositions.get(cueId) ?? null;
}
export function evaluateCaptionQuality(language: string = "en-US"): CaptionQuality {
  return { language, word_accuracy_estimate:0.985, speaker_attribution:0.96, timing_alignment:0.94, terminology_accuracy:0.99, reading_speed_score:0.88, position_safety:0.91, sound_description_coverage:0.76, overall_score:0.93, decision:"pass_with_review" };
}
export function checkReadingSpeed(cueId: string): CaptionDensityWarning | null {
  const cue = captionCues.get(cueId);
  if (!cue) return null;
  const duration = cue.end_ms - cue.start_ms;
  const chars = cue.text.length;
  const cps = chars / (duration/1000);
  const density = cps>30 ? "critical" : cps>20 ? "warning" : "ok";
  return { cue_id: cueId, duration_ms: duration, characters: chars, characters_per_second: Number(cps.toFixed(1)), recommended_max_cps:30, density, suggested_actions:["split_into_two_cues","extend_duration_if_editorially_safe","shorten_nonessential_phrase"], review_required: density!=="ok", profile:"general adult" };
}

// ── Speaker-identified captions ──────────────────────────────────────────────
export function shouldUseSpeakerLabel(context: { speaker_count: number; off_screen: boolean; overlapping: boolean; single_visible: boolean }): boolean {
  if (context.speaker_count>=2) return true;
  if (context.off_screen) return true;
  if (context.overlapping) return true;
  if (context.single_visible) return false;
  return false;
}

// ── Audio description ────────────────────────────────────────────────────────
export function generateAudioDescription(language: string, style: string, include: string[]): AudioDescriptionEvent[] {
  const existing = adEvents.get("ad_021")!;
  return [{ ...existing, description: style==="concise_neutral" ? existing.description : existing.description }];
}
export function getAudioDescriptionScript(language: string): AudioDescriptionScript | null { return adScripts.get(language) ?? null; }
export function approveAdSegment(scriptLang: string, startMs: number): void {
  const script = adScripts.get(scriptLang);
  if (!script) return;
  const seg = script.segments.find(s=>s.start_ms===startMs);
  if (seg) seg.approved = true;
}

// ── Sign window ──────────────────────────────────────────────────────────────
export function getSignWindow(windowId: string): SignWindow | null { return signWindows.get(windowId) ?? null; }
export function validateSignWindow(windowId: string): { warnings: string[]; status: string } {
  const w = signWindows.get(windowId);
  if (!w) return { warnings:["not found"], status:"fail" };
  const warnings: string[] = [];
  if (w.minimum_hand_visibility<0.9) warnings.push("hands leaving frame");
  if (w.occlusion_score>0.3) warnings.push("captions covering interpreter");
  return { warnings, status: warnings.length?"warning":"pass" };
}

// ── Graphics ─────────────────────────────────────────────────────────────────
export function getAccessibleGraphic(graphicId: string): AccessibleGraphic | null { return graphics.get(graphicId) ?? null; }
export function checkColorAccessibility(graphicId: string): ColorAccessibility {
  return {
    graphic_id: graphicId, contrast_score:0.94, color_only_encoding:true,
    simulations:{
      protanopia:{ distinguishable_categories:0.61, status:"fail" },
      deuteranopia:{ distinguishable_categories:0.64, status:"fail" },
      tritanopia:{ distinguishable_categories:0.91, status:"pass" },
      grayscale:{ distinguishable_categories:0.48, status:"fail" },
    },
    suggested_actions:["add_pattern_encoding","add_direct_labels","add_shape_difference"], status:"review_required",
  };
}
export function detectFlashForTimeline(): FlashRisk[] { return detectFlashRisk(); }

// ── Timeline semantic view ───────────────────────────────────────────────────
export function getSemanticTimeline(timelineId: string): TimelineA11yNode[] { return Array.from(timelineNodes.values()); }

// ── Destination profiles ─────────────────────────────────────────────────────
const PROFILES: Record<DestinationProfileId, AccessibilityProfile> = {
  web_player_wcag_aa:{ profile_id:"web_player_wcag_aa", destination:"n0va_web_player", required:["captions","keyboard_controls","screen_reader_player_labels","audio_description_option","accessible_chapters"], recommended:["sign_language_track","transcript","reduced_motion_mode"], validation:["caption_sync","contrast","focus_order","aria_metadata","flash_risk","audio_description_coverage"] },
  broadcast:{ profile_id:"broadcast", destination:"broadcast", required:["captions","audio_description","safe_area_validation","flash_risk_review"], recommended:[], validation:["caption_sync"] },
  social_vertical:{ profile_id:"social_vertical", destination:"social_vertical", required:["burned_in_captions","mobile_safe_placement"], recommended:[], validation:["reading_speed","color_simulation","flash_scan"] },
  internal_training:{ profile_id:"internal_training", destination:"internal_training", required:["captions","transcript","chapters","audio_description"], recommended:[], validation:[] },
  cinema_dcp:{ profile_id:"cinema_dcp", destination:"cinema_dcp", required:["dcp_captions","descriptive_audio"], recommended:[], validation:[] },
};
export function getProfile(profileId: DestinationProfileId): AccessibilityProfile | null { return PROFILES[profileId] ?? null; }
export function listProfiles(): AccessibilityProfile[] { return Object.values(PROFILES); }

export function generateDestinationReport(output: string, version: string, profileId: DestinationProfileId): DestinationA11yReport {
  const isBlocked = profileId==="social_vertical";
  return {
    output, version, status: isBlocked ? "blocked" : "pass_with_warnings",
    captions:{ present:true, speaker_identification:true, reading_speed: isBlocked?"warning at 00:18":"pass", safe_area:"pass", terminology:"pass" },
    visual_accessibility:{ color_blind: isBlocked?"fail":"pass", contrast:"pass", flash_risk:"pass", reduced_motion:"recommended" },
    audio_description:{ included: false, visual_events_lack: isBlocked?2:0 },
    sign_language:{ included: false, source_cropped: isBlocked },
    keyboard_and_metadata:{ applicable:false },
    required_actions: isBlocked ? ["Fix chart color encoding.","Add accessible alternative for cropped interpreter track.","Review dense caption cue."] : [],
  };
}

export function generateManifest(assetId: string, timelineVersion: number, profileId: DestinationProfileId): AccessibilityManifest {
  return {
    asset_id: assetId, timeline_version: timelineVersion, destination_profile: profileId,
    tracks:{
      captions:[{ language:"en-US", format:"WebVTT", version:4, status:"approved" }],
      audio_description:[{ language:"en-US", format:"AAC", version:2, status:"approved" }],
      sign_language:[{ language:"ase", layout:"picture_in_picture", version:1, status:"review_required" }],
      transcript:[{ language:"en-US", speaker_identified:true, status:"approved" }],
    },
    visual_checks:{ caption_positioning:"pass", color_blind:"warning", flash_risk:"pass", contrast:"pass" },
    interaction_checks:{ keyboard_navigation:"pass", screen_reader_metadata:"pass" },
    overall_status:"pass_with_warnings",
  };
}

// ── Agent routing ────────────────────────────────────────────────────────────
export function routeToAgent(check: string): string {
  if (["speaker_captions","caption_quality","reading_speed"].includes(check)) return "Caption Agent";
  if (["audio_description"].includes(check)) return "Audio Description Agent";
  if (["sign_language"].includes(check)) return "Sign Language Agent";
  if (["color_blindness","flash_risk"].includes(check)) return "Visual Safety Agent";
  if (["screen_reader_metadata","keyboard"].includes(check)) return "Interaction Agent";
  return "Compliance Agent";
}
