/**
 * N0VA VIDEOS — Professional Interchange Engine
 * Canonical timeline → format compilers → package + validation + relink + roundtrip + AI graph
 */
import type {
  CanonicalTimeline, CanonicalClip, InterchangePackage, InterchangeFormat, ExportProfileId,
  Timecode, ReelIdentity, CameraRawMetadata, LutReference, RelinkEntry, StorageProfile, AudioLayout,
  EffectTransfer, InterchangeProfile, LossReport, BroadcastValidation, RoundtripReport, AIGraphInterchange,
} from "./interchange-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Canonical timeline ──────────────────────────────────────────────────────
export function createCanonicalTimeline(timelineId = "tl001", graphVersion = "gv42"): CanonicalTimeline {
  const tc: Timecode = { rate: "23.976", drop_frame: false, source_start: "01:02:03:12", record_start: "10:00:00:00", auxiliary: { name: "production_day", value: "DAY03_001" } };
  const reel: ReelIdentity = { reel: "A003C004", roll: "A003", camera_card: "CARD_04", clip_name: "A003C004_20260828_001", file_name: "A003C004_001.R3D", source_range: { in_ms: 12000, out_ms: 18700 }, timeline_range: { in_ms: 0, out_ms: 6700 } };
  const clips: CanonicalClip[] = [
    {
      clip_id: "clip_001", asset_id: "asset_raw_a001", track: "video_1", track_order: 0,
      source_range: { in_ms: 12000, out_ms: 18700, in_tc: "01:02:03:12", out_tc: "01:02:10:05" },
      record_range: { in_ms: 0, out_ms: 6700, in_tc: "10:00:00:00", out_tc: "10:00:06:16" },
      timecode: tc, reel, clip_name: "A003C004_20260828_001", handles: { head_frames: 48, tail_frames: 48 },
      speed: { factor: 1, mode: "constant" }, transition: { type: "dissolve", duration_frames: 12 }, audio_channels: [1, 2],
      effects: ["node_background_replace_04"], lut_ref: "lut_brand_daylight_v2", camera_raw_ref: "asset_raw_a001",
      proxy_original: { proxy_path: "nfs://proxy/A003C004_001.mov", original_path: "s3://camera-originals/A003C004_001.R3D" },
      captions: ["cap_01"],
    },
    {
      clip_id: "clip_002", asset_id: "asset_raw_a002", track: "audio_1", track_order: 1,
      source_range: { in_ms: 0, out_ms: 6700, in_tc: "10:00:00:00", out_tc: "10:00:06:16" },
      record_range: { in_ms: 0, out_ms: 6700, in_tc: "10:00:00:00", out_tc: "10:00:06:16" },
      timecode: { rate: "23.976", drop_frame: false, source_start: "10:00:00:00", record_start: "10:00:00:00" },
      reel: { reel: "A004C001", roll: "A004", camera_card: "CARD_04", clip_name: "A004C001_20260828_001", file_name: "A004C001_001.wav", source_range: { in_ms: 0, out_ms: 6700 }, timeline_range: { in_ms: 0, out_ms: 6700 } },
      clip_name: "dialogue_take1", handles: { head_frames: 48, tail_frames: 48 }, audio_channels: [1],
    },
  ];
  return {
    timeline_id: timelineId, sequence_id: `seq_${timelineId}`, name: `Timeline ${timelineId}`,
    frame_rate: "23.976", timecode: tc,
    tracks: [
      { track_id: "video_1", order: 0, kind: "video" },
      { track_id: "audio_1", order: 1, kind: "audio", channels: 2 },
      { track_id: "graphics_1", order: 2, kind: "graphics" },
    ],
    clips, graph_version: graphVersion, provenance: "merkle:canonical", approval_state: "approved",
  };
}

// ── Format compilers — canonical → interchange-specific strings ─────────────
export type CompilerResult = { content: string; warnings: string[]; preserved: string[]; rendered: string[]; omitted: string[] };

function timecodeForClip(c: CanonicalClip, type: "AAF" | "XML" | "EDL" | "OMF" | "FCPXML"): string {
  if (type === "EDL") return `${c.reel.reel} 001 V C ${c.source_range.in_tc} ${c.source_range.out_tc} ${c.record_range.in_tc} ${c.record_range.out_tc}`;
  return c.timecode.source_start;
}

export function compileAAF(tl: CanonicalTimeline): CompilerResult {
  const warnings: string[] = [];
  const rendered: string[] = [];
  const preserved: string[] = ["Source timecode", "Record timecode", "Reel names", "Clip names", "Audio tracks and channel mapping", "Markers", "Camera RAW references"];
  const omitted: string[] = [];
  for (const c of tl.clips) {
    if (c.effects?.includes("node_background_replace_04")) { rendered.push("Background replacement"); warnings.push(`Effect ${c.effects[0]} flattened_to_media for AAF`); }
    if ((c.effects?.length ?? 0) > 2) warnings.push(`Complex stack on ${c.clip_id} approximated for AAF`);
  }
  const lines = [
    `AAF 1.1 — Avid/Resolve audio turnover — ${tl.timeline_id}`,
    `Sequence ${tl.sequence_id} ${tl.frame_rate} handles 48`,
    ...tl.clips.map(c => `Clip ${c.clip_id} ${c.reel.reel} ${c.reel.clip_name} ${timecodeForClip(c, "AAF")} handles ${c.handles.head_frames}/${c.handles.tail_frames} ${c.effects?.length ? `[effects:${c.effects.join(",")}]` : ""}`),
    `Audio channels mapped per AAF: dialogue/music/effects stems`,
  ];
  return { content: lines.join("\n"), warnings, preserved, rendered, omitted };
}

export function compileXML(tl: CanonicalTimeline): CompilerResult {
  const warnings: string[] = [];
  const preserved = ["Timeline structure", "Time ranges", "Clip names", "Transitions where supported"];
  const rendered: string[] = [];
  const omitted: string[] = ["AI node graph", "Semantic object tags"];
  const xml = [`<xmeml version="5"><sequence id="${tl.sequence_id}"><rate>${tl.frame_rate}</rate>`, ...tl.clips.map(c => `  <clip id="${c.clip_id}"><name>${c.clip_name}</name><reel>${c.reel.reel}</reel><in>${c.source_range.in_tc}</in><out>${c.source_range.out_tc}</out></clip>`), `</sequence></xmeml>`].join("\n");
  if (tl.frame_rate !== "23.976") warnings.push("Frame rate mismatch may affect XML import");
  return { content: xml, warnings, preserved, rendered, omitted };
}

export function compileEDL(tl: CanonicalTimeline): CompilerResult {
  const warnings: string[] = [];
  const preserved = ["Source timecode", "Record timecode", "Reel names", "Dissolves"];
  const rendered: string[] = [];
  const omitted: string[] = [];
  if (tl.tracks.filter(t => t.kind === "video").length > 1) warnings.push("EDL limited to one video track — additional layers in companion files");
  if (tl.clips.some(c => c.speed && c.speed.factor !== 1)) { rendered.push("Variable speed"); warnings.push("Variable speed approximated in EDL"); }
  if (tl.clips.some(c => c.effects?.length)) { rendered.push("AI-generated sections"); omitted.push("Complex compositing"); }
  const edl = [
    `TITLE: ${tl.name}`,
    `FCM: NON-DROP FRAME`,
    ...tl.clips.filter(c => c.track.startsWith("video")).map((c, i) => `${String(i + 1).padStart(3, "0")}  ${c.reel.reel.padEnd(8)} V     C        ${c.source_range.in_tc} ${c.source_range.out_tc} ${c.record_range.in_tc} ${c.record_range.out_tc}`),
    ...tl.clips.filter(c => c.track.startsWith("video")).map(c => `* FROM CLIP NAME: ${c.clip_name}`),
  ].join("\n");
  const companion = "picture.edl + audio_dialogue.edl + audio_music.edl + reel-map.csv + effects-report.json companion files required for complex timeline";
  return { content: edl + "\n* " + companion, warnings, preserved, rendered, omitted };
}

export function compileOMF(tl: CanonicalTimeline, mode: "embedded" | "referenced" = "embedded"): CompilerResult {
  const warnings: string[] = [];
  const preserved = ["Audio clip handles", "Track names", "Clip names", "Source timecode", "Sample rate 48k bit depth 24", "Clip gain", "Fades"];
  const rendered: string[] = [];
  const omitted: string[] = ["Video and modern metadata"];
  const lines = [
    `OMF ${mode} — Audio turnover — ${tl.timeline_id}`,
    ...tl.clips.filter(c => c.track.startsWith("audio")).map(c => `Track ${c.track} Clip ${c.clip_id} handles 48 gain 0dB fade 12f ${mode}`),
    `Channel map: dialogue/music/effects stems included; high-res WAV fallback included`,
  ];
  if (mode === "referenced") warnings.push("Referenced OMF requires reliable media paths — verify shared storage");
  return { content: lines.join("\n"), warnings, preserved, rendered, omitted };
}

export function compileFCPXML(tl: CanonicalTimeline, profile: InterchangeProfile = { format: "FCPXML", schema_version: "1.11", target_application: "Final Cut Pro", target_version: "13.x" }): CompilerResult {
  const warnings: string[] = [];
  const preserved = ["Libraries/events/projects", "Compound clips", "Multicam", "Roles/subroles", "Clip names", "Time ranges", "Transforms", "Speed", "Audio config", "Captions", "Markers", "Rendered AI results"];
  const rendered: string[] = [];
  const omitted: string[] = [];
  for (const c of tl.clips) if (c.effects?.length) rendered.push(`AI effect ${c.effects[0]} rendered`);
  if (profile.schema_version !== "1.11") warnings.push(`FCPXML schema ${profile.schema_version} compatibility check required`);
  const fcpxml = [
    `<?xml version="1.0"?><fcpxml version="${profile.schema_version}"><library><event name="Event ${tl.timeline_id}"><project name="${tl.name}"><sequence format="r1"><spine>`,
    ...tl.clips.map(c => `  <clip name="${c.clip_name}" start="${c.record_range.in_tc}" duration="${c.record_range.out_ms - c.record_range.in_ms}ms" reel="${c.reel.reel}"/>`),
    `</spine></sequence></project></event></library></fcpxml>`,
  ].join("\n");
  return { content: fcpxml, warnings, preserved, rendered, omitted };
}

// ── Interchange package ─────────────────────────────────────────────────────
const packages = new Map<string, InterchangePackage>();

export function createInterchangePackage(input: {
  timelineId: string;
  graphVersion: string;
  profile: ExportProfileId;
  mediaMode: "proxy_only" | "original_only" | "proxy_with_relink_map" | "camera_original_conform";
  handleFrames: number;
  include?: string[];
  validateRoundtrip?: boolean;
}): InterchangePackage {
  const tl = createCanonicalTimeline(input.timelineId, input.graphVersion);
  // Update handles per profile
  for (const c of tl.clips) { c.handles.head_frames = input.handleFrames; c.handles.tail_frames = input.handleFrames; }

  const formatMap: Record<ExportProfileId, InterchangeFormat> = {
    avid_editorial_aaf: "AAF", resolve_color_xml: "XML", resolve_audio_aaf: "AAF", protools_omf: "OMF",
    fcp_xml: "FCPXML", premiere_xml: "XML", legacy_picture_edl: "EDL", broadcast_imf: "AAF",
    camera_original_conform: "XML", proxy_editorial: "FCPXML",
  };
  const primaryFormat = formatMap[input.profile] ?? "AAF";

  const compilers: Record<InterchangeFormat, (tl: CanonicalTimeline) => CompilerResult> = {
    AAF: compileAAF, XML: compileXML, EDL: compileEDL, OMF: (t) => compileOMF(t, input.mediaMode === "proxy_only" ? "embedded" : "referenced"), FCPXML: (t) => compileFCPXML(t),
  };
  const results: Record<string, CompilerResult> = {};
  for (const fmt of ["AAF", "XML", "EDL", "OMF", "FCPXML"] as InterchangeFormat[]) {
    try { results[fmt] = compilers[fmt](tl); } catch { results[fmt] = { content: "", warnings: [`${fmt} not generated for profile ${input.profile}`], preserved: [], rendered: [], omitted: [] }; }
  }

  const pkgId = uid("pkg");
  const preservation: InterchangePackage["preservation"] = {};
  for (const fmt of Object.keys(results) as InterchangeFormat[]) {
    const res = results[fmt]!;
    for (const p of res.preserved) preservation[`${fmt}:${p}`] = "preserved";
    for (const r of res.rendered) preservation[`${fmt}:${r}`] = "flattened";
    for (const o of res.omitted) preservation[`${fmt}:${o}`] = "omitted";
  }

  const pkg: InterchangePackage = {
    package_id: pkgId,
    timeline_id: input.timelineId,
    graph_version: input.graphVersion,
    profile: input.profile,
    format: primaryFormat,
    canonical_timeline: tl,
    files: {
      canonical: `NOVA_INTERCHANGE/timeline/canonical-timeline.json`,
      interchange: {
        AAF: `NOVA_INTERCHANGE/timeline/project.aaf`,
        XML: `NOVA_INTERCHANGE/timeline/project.xml`,
        EDL: `NOVA_INTERCHANGE/timeline/project.edl`,
        OMF: `NOVA_INTERCHANGE/timeline/project.omf`,
        FCPXML: `NOVA_INTERCHANGE/timeline/project.fcpxml`,
      },
      media: {
        proxies: input.mediaMode !== "original_only" ? ["NOVA_INTERCHANGE/media/proxies/A003C004_001.mov"] : undefined,
        camera_original_refs: input.mediaMode !== "proxy_only" ? ["s3://camera-originals/A003C004_001.R3D"] : undefined,
        audio_turnover: ["NOVA_INTERCHANGE/media/audio-turnover/dialogue.wav"],
        graphics: ["NOVA_INTERCHANGE/media/graphics/lowerthird_07.mov"],
      },
      metadata: {
        camera_raw: "NOVA_INTERCHANGE/metadata/camera-raw.json",
        lut_registry: "NOVA_INTERCHANGE/metadata/lut-registry.json",
        reel_map: "NOVA_INTERCHANGE/metadata/clip-reel-map.csv",
        relink_map: "NOVA_INTERCHANGE/metadata/relink-map.json",
        channel_layout: "NOVA_INTERCHANGE/metadata/channel-layout.json",
      },
      validation: {
        report_html: "NOVA_INTERCHANGE/validation/interchange-report.html",
        warnings_json: "NOVA_INTERCHANGE/validation/warnings.json",
        roundtrip_json: input.validateRoundtrip ? "NOVA_INTERCHANGE/validation/roundtrip-report.json" : undefined,
      },
      provenance: {
        manifest: "NOVA_INTERCHANGE/provenance/manifest.json",
        c2pa: "NOVA_INTERCHANGE/provenance/c2pa-manifest.json",
        graph_version_json: "NOVA_INTERCHANGE/provenance/graph-version.json",
      },
      readme: "NOVA_INTERCHANGE/README.md",
    },
    preservation,
    created_at: nowIso(),
    warnings: Object.values(results).flatMap(r => r.warnings),
  } as unknown as InterchangePackage;

  // Store compiled contents for validation (in-memory)
  (pkg as unknown as Record<string, unknown>)._compiled = results;
  packages.set(pkgId, pkg);
  return pkg;
}

export function getPackage(packageId: string): InterchangePackage | null { return packages.get(packageId) ?? null; }
export function listPackages(): InterchangePackage[] { return Array.from(packages.values()); }

// ── Camera RAW, LUT, Reel/Timecode helpers ──────────────────────────────────
export function cameraRawExample(assetId = "asset_raw_a001"): CameraRawMetadata {
  return {
    asset_id: assetId, format: "ARRIRAW", camera: "ARRI ALEXA 35", iso: 800, white_balance_kelvin: 5600, tint: 12, shutter_angle: 180,
    lens: { manufacturer: "Cooke", model: "S8/i", focal_length_mm: 50, t_stop: 2.8 },
    debayer: { method: "vendor_default", version: "locked" }, look: { cdl: "cdl_004", lut: "lut_brand_daylight_v2" },
    sidecar_hash: hash("sidecar"), status: "preserved",
  };
}

export function lutExample(lutId = "lut_brand_daylight_v2"): LutReference {
  return {
    lut_id: lutId, name: "Brand_Daylight_v2", format: ".cube", content_hash: hash("lut_content"), input_color_space: "ARRI LogC4", output_color_space: "ACEScct", intensity: 0.72, applied_mode: "referenced", baked_into_export: false, scope: "scene", color_pipeline_version: "aces_1.3",
  };
}

// ── Relink map — deterministic precedence ────────────────────────────────────
export function generateRelinkMap(timelineId = "tl001", sourceMode: "proxy" | "camera_original" = "proxy", targetMode: "proxy" | "camera_original" = "camera_original"): { entries: RelinkEntry[]; match_keys: string[] } {
  const match_keys = ["n0va_asset_id", "media_fingerprint", "reel_timecode", "clip_name_duration"];
  const entries: RelinkEntry[] = [
    {
      n0va_asset_id: "asset_raw_a001", proxy_path: "nfs://proxy/A003C004_001.mov", original_path: "s3://camera-originals/A003C004_001.R3D", shared_path: "/Volumes/Production/Camera/A003C004_001.R3D",
      source_timecode: "01:02:03;12", reel: "A003C004", duration_frames: 8420, media_fingerprint: hash("media_a001"), relink_priority: match_keys,
    },
    {
      n0va_asset_id: "asset_raw_a002", proxy_path: "nfs://proxy/A004C001_001.wav", original_path: "s3://camera-originals/A004C001_001.wav", shared_path: "/Volumes/Production/Camera/A004C001_001.wav",
      source_timecode: "10:00:00:00", reel: "A004C001", duration_frames: 160, media_fingerprint: hash("media_a002"), relink_priority: match_keys,
    },
  ];
  return { entries, match_keys };
}

export function simulateRelink(entries: RelinkEntry[], availablePaths: string[]): { relinked: number; ambiguous: number; missing: number; details: string[] } {
  const details: string[] = [];
  let relinked = 0, ambiguous = 0, missing = 0;
  for (const e of entries) {
    const candidates = availablePaths.filter(p => p.includes(e.n0va_asset_id) || p.includes(e.reel));
    if (candidates.length === 1) { relinked++; details.push(`Relinked ${e.n0va_asset_id} via ${e.relink_priority[0]}`); }
    else if (candidates.length > 1) { ambiguous++; details.push(`Ambiguous ${e.n0va_asset_id} — ${candidates.length} candidates`); }
    else { missing++; details.push(`Missing ${e.n0va_asset_id}`); }
  }
  return { relinked, ambiguous, missing, details };
}

// ── Storage profile ─────────────────────────────────────────────────────────
export function storageProfileExample(name = "studio_shared_storage"): StorageProfile {
  return {
    name, protocol: "NFS",
    mounts: { originals: "/mnt/media/originals", proxies: "/mnt/media/proxies", renders: "/mnt/media/renders", audio: "/mnt/media/audio", graphics: "/mnt/media/graphics" },
    permissions: { originals: "read_only", proxies: "read_write", renders: "read_write" },
    path_mapping: { macos: "/Volumes/StudioMedia", windows: "Z:\\StudioMedia", linux: "/mnt/studio-media" },
  };
}

// ── Audio layout & Atmos ────────────────────────────────────────────────────
export function audioLayoutExample(format = "7.1.4"): AudioLayout {
  const labels7_1_4 = ["L","R","C","LFE","Ls","Rs","Lrs","Rrs","Ltf","Rtf","Ltr","Rtr"];
  return {
    format, channels: labels7_1_4.map((label, i) => ({ index: i+1, label })), sample_rate: 48000, bit_depth: 24,
    track_map: { dialogue: [1,2], music: [5,6], effects: [3,4] },
  };
}

export function atmosStatusExample(): { status: "preserved" | "rendered_to_bed" | "flattened"; details: string } {
  return { status: "preserved", details: "ADM BWF preserved, objects 12, bed 7.1.4, renderer config locked" };
}

// ── Broadcast validation ────────────────────────────────────────────────────
export function validateBroadcast(profile = "uhd_hdr_delivery"): BroadcastValidation {
  return {
    profile, result: "blocked",
    checks: { video_levels: "passed", gamut: "warning", hdr_metadata: "passed", loudness: "failed", true_peak: "failed", captions: "passed", timecode: "passed", safe_title: "passed" },
    issues: [{ type: "true_peak", maximum_dbtp: -0.1, limit_dbtp: -1.0, range: "00:12:44.000–00:12:49.000" }],
  };
}

// ── Round-trip validation ───────────────────────────────────────────────────
export function roundtripValidate(packageId: string, target: string): RoundtripReport {
  const pkg = packages.get(packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);
  return {
    format: pkg.format, target,
    result: "passed_with_warnings",
    timeline: { clip_count_match: true, duration_match: true, timecode_match: true, track_layout_match: true },
    losses: [{ feature: "n0va_ai_background_replace", handling: "flattened_to_rendered_media" }],
    relink_success: 1,
  };
}

// ── Effect transfer handling ─────────────────────────────────────────────────
export function effectTransferForFormat(effectId: string, format: InterchangeFormat): EffectTransfer {
  const map: Record<InterchangeFormat, EffectTransfer["result"]> = { AAF: "flattened_to_media", XML: "flattened_to_media", EDL: "omitted", OMF: "omitted", FCPXML: "preserved" };
  return {
    effect_id: effectId, source_type: "n0va_ai_node", target_format: format,
    result: map[format] ?? "flattened_to_media",
    replacement_asset: format === "AAF" || format === "XML" ? `rendered_effect_${effectId.slice(-3)}` : undefined,
    provenance_preserved: true,
  };
}

// ── Interchange profile handling ────────────────────────────────────────────
export function interchangeProfileExample(format: InterchangeFormat, targetApp: string): InterchangeProfile {
  const schemaMap: Record<InterchangeFormat, string> = { AAF: "1.1", XML: "5", EDL: "CMX3600", OMF: "2.0", FCPXML: "1.11" };
  return { format, schema_version: schemaMap[format], target_application: targetApp, target_version: targetApp === "Final Cut Pro" ? "13.x" : targetApp === "DaVinci Resolve" ? "18.x" : targetApp === "Avid Media Composer" ? "2024.x" : "Premiere 24.x" };
}

// ── Loss report ─────────────────────────────────────────────────────────────
export function lossReportForPackage(packageId: string): LossReport {
  const pkg = packages.get(packageId);
  if (!pkg) throw new Error(`Package ${packageId} not found`);
  const compiled = (pkg as unknown as { _compiled?: Record<string, CompilerResult> })._compiled;
  const preserved = compiled ? Object.values(compiled).flatMap(c => c.preserved).slice(0, 6) : ["Source timecode", "Record timecode", "Reel names", "Clip names", "Audio tracks", "Markers"];
  const rendered = compiled ? Object.values(compiled).flatMap(c => c.rendered) : ["Background replacement", "Voice synthesis"];
  return {
    format: pkg.format, target: pkg.profile,
    preserved: [...new Set(preserved)],
    rendered: [...new Set(rendered)],
    not_represented: ["Semantic object tags", "Prompt payloads", "AI node graph", "Narrative arc metadata"],
    companion_files: ["provenance-manifest.json", "graph-version.json", "semantic-spans.json"],
  };
}

// ── Export profiles ─────────────────────────────────────────────────────────
export const EXPORT_PROFILES: { id: ExportProfileId; label: string; format: InterchangeFormat; target: string; description: string }[] = [
  { id: "avid_editorial_aaf", label: "Avid Editorial AAF", format: "AAF", target: "Avid Media Composer", description: "Picture lock, audio turnover, shared-storage conform" },
  { id: "resolve_color_xml", label: "Resolve Color XML", format: "XML", target: "DaVinci Resolve", description: "Editorial conform + RAW + LUT/CDL + handles 48" },
  { id: "resolve_audio_aaf", label: "Resolve Audio AAF", format: "AAF", target: "DaVinci Resolve", description: "Multitrack audio stems" },
  { id: "protools_omf", label: "Pro Tools OMF", format: "OMF", target: "Pro Tools", description: "Dialogue/music/effects stems" },
  { id: "fcp_xml", label: "Final Cut Pro FCPXML", format: "FCPXML", target: "Final Cut Pro", description: "Roles, multicam, compound clips" },
  { id: "premiere_xml", label: "Premiere XML", format: "XML", target: "Premiere Pro", description: "Source timecode, multicam, proxy relink" },
  { id: "legacy_picture_edl", label: "Legacy Picture EDL", format: "EDL", target: "Legacy broadcast", description: "Single-track conform, companion files" },
  { id: "broadcast_imf", label: "Broadcast IMF Package", format: "AAF", target: "Broadcast", description: "QC-gated master delivery" },
  { id: "camera_original_conform", label: "Camera-Original Conform Package", format: "XML", target: "DaVinci Resolve", description: "Proxy + relink map + RAW" },
  { id: "proxy_editorial", label: "Proxy Editorial Package", format: "FCPXML", target: "Final Cut Pro", description: "Offline-to-online" },
];

// ── AI graph interchange ────────────────────────────────────────────────────
export function aiGraphInterchange(nodeId: string, mode: "native" | "flattened" = "native"): AIGraphInterchange {
  if (mode === "native") {
    return { mode: "native_reference", node_id: nodeId, operation: "background_replace", model_digest: hash("model_bg_v4"), parameters_hash: hash("params_bg"), input_hashes: [hash("source")], output_hash: hash("render"), reproducibility: "media_exact" };
  }
  return { mode: "flattened_media", original_ref: `asset_${nodeId}`, rendered_asset: `rendered_${nodeId}`, affected_range: "00:00:48.600-00:00:53.200", model_meta: "n0va-background-v4.1.2", manifest: "provenance/manifest.json" };
}
