"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createCanonicalTimeline, createInterchangePackage, cameraRawExample, lutExample, generateRelinkMap,
  simulateRelink, storageProfileExample, audioLayoutExample, atmosStatusExample, validateBroadcast,
  roundtripValidate, effectTransferForFormat, interchangeProfileExample, lossReportForPackage, EXPORT_PROFILES, aiGraphInterchange,
} from "./interchange-engine";
import type { ExportProfileId, InterchangeFormat } from "./interchange-types";

export function InterchangePanel({ timelineId, graphVersion }: { timelineId: string; graphVersion: string }) {
  const [profile, setProfile] = useState<ExportProfileId>("avid_editorial_aaf");
  const [handleFrames, setHandleFrames] = useState(48);
  const [mediaMode, setMediaMode] = useState<"proxy_only" | "original_only" | "proxy_with_relink_map" | "camera_original_conform">("proxy_with_relink_map");
  const [pkg, setPkg] = useState(() => createInterchangePackage({ timelineId, graphVersion, profile: "avid_editorial_aaf", mediaMode: "proxy_with_relink_map", handleFrames: 48, validateRoundtrip: true }));
  const [relinkResult, setRelinkResult] = useState<ReturnType<typeof simulateRelink> | null>(null);
  const canonical = useMemo(() => createCanonicalTimeline(timelineId, graphVersion), [timelineId, graphVersion]);
  const cameraRaw = useMemo(() => cameraRawExample(), []);
  const lut = useMemo(() => lutExample(), []);
  const relinkMap = useMemo(() => generateRelinkMap(timelineId), [timelineId]);
  const audioLayout = useMemo(() => audioLayoutExample(), []);
  const broadcast = useMemo(() => validateBroadcast("uhd_hdr_delivery"), []);
  const storage = useMemo(() => storageProfileExample(), []);

  const create = () => {
    const p = createInterchangePackage({ timelineId, graphVersion, profile, mediaMode, handleFrames, validateRoundtrip: true });
    setPkg(p);
  };
  const doRelinkSim = () => {
    const res = simulateRelink(relinkMap.entries, ["nfs://proxy/A003C004_001.mov", "s3://camera-originals/A003C004_001.R3D", "/Volumes/Production/Camera/A003C004_001.R3D"]);
    setRelinkResult(res);
  };
  const roundtrip = useMemo(() => {
    try { return roundtripValidate(pkg.package_id, pkg.profile); } catch { return null; }
  }, [pkg.package_id]);
  const loss = useMemo(() => lossReportForPackage(pkg.package_id), [pkg.package_id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — strategy */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>PROFESSIONAL INTERCHANGE — CANONICAL → COMPILER → VALIDATED PACKAGE</div>
        <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>One canonical timeline, format-specific compilers — interchange describes, package delivers.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>AAF XML EDL OMF FCPXML — not converted between each other</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Package = timeline + media + metadata + validation + provenance</span>
        </div>
      </div>

      {/* Profile selector */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Export Profiles</span>
          <Badge tone="primary">{pkg.format} primary</Badge>
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>AAF Avid/Resolve audio, XML editorial/color, EDL single-track, OMF audio turnover, FCPXML Final Cut — each with validation</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8, marginTop: 10 }}>
          {EXPORT_PROFILES.map(p => (
            <button key={p.id} onClick={() => setProfile(p.id)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: profile === p.id ? "2px solid #0ea5e9" : "1px solid var(--nv-color-border)", background: profile === p.id ? "rgba(14,165,233,0.08)" : "var(--nv-color-surface-2)", cursor: "pointer" }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{p.label} <Badge tone="neutral">{p.format}</Badge></div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{p.target} — {p.description}</div>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 11 }}>Handles <input type="number" value={handleFrames} onChange={e => setHandleFrames(parseInt(e.target.value) || 0)} style={{ width: 70 }} className="nv-input" /> frames</label>
          <select value={mediaMode} onChange={e => setMediaMode(e.target.value as never)} className="nv-input" style={{ fontSize: 11 }}>
            <option value="proxy_with_relink_map">proxy_with_relink_map</option>
            <option value="proxy_only">proxy_only</option>
            <option value="original_only">original_only</option>
            <option value="camera_original_conform">camera_original_conform</option>
          </select>
          <Button size="sm" onClick={create}>Create Interchange Package</Button>
          <Badge tone="neutral">{pkg.package_id.slice(0, 12)}</Badge>
        </div>
      </Card>

      {/* Canonical */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Canonical Timeline — authoritative N0VA model</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Timeline/sequence identity, track order, source/record timecode, reel, clip names, handles, speed, transitions, multicam, audio channels, effects, LUT refs, RAW metadata, proxy-original, captions, graph nodes, provenance</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8, maxHeight: 200, overflow: "auto" }}>
            <div>timeline {canonical.timeline_id} seq {canonical.sequence_id} {canonical.frame_rate} graph {canonical.graph_version}</div>
            <div>tracks: {canonical.tracks.map(t => `${t.track_id}(${t.kind})`).join(", ")}</div>
            {canonical.clips.map(c => (
              <div key={c.clip_id} style={{ borderTop: "1px solid #222", padding: "4px 0" }}>
                {c.clip_id} {c.reel.reel} {c.clip_name} src {c.source_range.in_tc}→{c.source_range.out_tc} rec {c.record_range.in_tc}→{c.record_range.out_tc} handles {c.handles.head_frames}/{c.handles.tail_frames} {c.effects?.length ? `effects ${c.effects.join(",")}` : ""} LUT {c.lut_ref} RAW {c.camera_raw_ref}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge tone="primary">{canonical.clips.length} clips</Badge>
            <Badge tone="neutral">Handles {handleFrames}</Badge>
            <Badge tone="neutral">{canonical.frame_rate} {canonical.timecode.drop_frame ? "DF" : "NDF"}</Badge>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Package Explorer — NOVA_INTERCHANGE/</div>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8, lineHeight: 1.6 }}>
            <div>timeline/canonical-timeline.json</div>
            <div>timeline/project.aaf/xml/edl/omf/fcpxml</div>
            <div>media/proxies/ + camera-original-references/ + audio-turnover/ + graphics/</div>
            <div>metadata/camera-raw.json • lut-registry.json • clip-reel-map.csv • relink-map.json • channel-layout.json</div>
            <div>validation/interchange-report.html • warnings.json • roundtrip-report.json</div>
            <div>provenance/manifest.json • c2pa-manifest.json • graph-version.json</div>
            <div>README.md — preserved/approximated/flattened/omitted per destination</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <span style={{ fontWeight: 700 }}>Preservation:</span> {Object.entries(pkg.preservation).slice(0, 4).map(([k, v]) => <Badge key={k} tone={v === "preserved" ? "success" : v === "flattened" ? "warning" : "neutral"}>{k.split(":")[0]} {v}</Badge>)}
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>AAF preferred for Avid/Pro Tools, FCPXML for Final Cut/Resolve color, EDL single-track, OMF audio stems — differences exposed before export.</div>
        </Card>
      </div>

      {/* AAF etc handling */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Effect Transfer — preserve | render | omit | flatten <Badge tone="primary">AAF/FCPXML/EDL/OMF</Badge></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 8, marginTop: 8, fontSize: 11 }}>
          {(["AAF", "FCPXML", "EDL", "OMF"] as InterchangeFormat[]).map(fmt => {
            const et = effectTransferForFormat("node_background_replace_04", fmt);
            return <div key={fmt} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>{fmt} — {et.result}</div><div style={{ fontFamily: "var(--nv-font-mono)", color: "var(--nv-color-text-muted)" }}>{JSON.stringify(et).slice(0, 90)}…</div><div style={{ color: et.provenance_preserved ? "#16a34a" : "#ef4444" }}>{et.provenance_preserved ? "provenance preserved" : "provenance lost"}</div></div>;
          })}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["AAF", "FCPXML"].map(f => {
            const prof = interchangeProfileExample(f as InterchangeFormat, f === "AAF" ? "Avid Media Composer" : "Final Cut Pro");
            return <Badge key={f} tone="neutral">{f} {prof.schema_version} → {prof.target_application} {prof.target_version}</Badge>;
          })}
          <Badge tone="warning">EDL companion: picture.edl + audio_*.edl + reel-map.csv</Badge>
        </div>
      </Card>

      {/* RAW / timecode / LUT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Camera RAW Preservation</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            <div>{cameraRaw.format} {cameraRaw.camera} ISO {cameraRaw.iso} {cameraRaw.white_balance_kelvin}K tint {cameraRaw.tint} shutter {cameraRaw.shutter_angle}°</div>
            <div>lens {cameraRaw.lens?.manufacturer} {cameraRaw.lens?.model} {cameraRaw.lens?.focal_length_mm}mm T{cameraRaw.lens?.t_stop}</div>
            <div>debayer {cameraRaw.debayer.method} {cameraRaw.debayer.version} look CDL {cameraRaw.look.cdl} LUT {cameraRaw.look.lut} status {cameraRaw.status}</div>
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Referenced vs baked — rendered ProRes never described as RAW-preserving if baked.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Timecode & Reel Identity</div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)", marginTop: 8 }}>
            <div>Rate {canonical.timecode.rate} {canonical.timecode.drop_frame ? "DF" : "NDF"} src {canonical.timecode.source_start} rec {canonical.timecode.record_start}</div>
            <div>Reel {canonical.clips[0]?.reel.reel ?? "A003C004"} roll {canonical.clips[0]?.reel.roll ?? "A003"} card {canonical.clips[0]?.reel.camera_card ?? "CARD_04"}</div>
            <div>Validates: duplicate reel+TC, clip name conflict, DF mismatch, VFR in CFR, discontinuity</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11 }}><Badge tone="success">23.976 progressive</Badge> <Badge tone="neutral">A003C004_001.R3D</Badge></div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>LUT & Color</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            <div>{lut.name} {lut.format} {lut.input_color_space}→{lut.output_color_space} intensity {lut.intensity} mode {lut.applied_mode} baked {String(lut.baked_into_export)}</div>
            <div>Working ACEScct display transform CDL {lut.scope} pipeline {lut.color_pipeline_version}</div>
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Referenced vs baked vs neutral+LUT vs both graded+ungraded</div>
        </Card>
      </div>

      {/* Relink + storage + audio */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Relink Map — deterministic precedence <Badge tone="primary">never filename alone</Badge></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Chain: n0va_asset_id → media_fingerprint → reel_timecode → clip_name_duration → file_name → manual</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            {relinkMap.entries.map(e => <div key={e.n0va_asset_id}>{e.n0va_asset_id} | proxy {e.proxy_path} | orig {e.original_path} | shared {e.shared_path} | reel {e.reel} fp {e.media_fingerprint.slice(0, 12)}…</div>)}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <Button size="sm" variant="ghost" onClick={doRelinkSim}>Simulate Relink</Button>
            <Badge tone="neutral">Proxy-only / Original-only / Proxy+map / Conform package</Badge>
          </div>
          {relinkResult && <div style={{ fontSize: 11, marginTop: 6 }}>Relinked {relinkResult.relinked} ambiguous {relinkResult.ambiguous} missing {relinkResult.missing} — {relinkResult.details.join(" | ")}</div>}
          <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)" }}>
            <div style={{ fontWeight: 700 }}>Storage Profile — {storage.name} {storage.protocol}</div>
            <div>originals {storage.mounts.originals} ({storage.permissions.originals}) • proxies {storage.mounts.proxies}</div>
            <div>macOS {storage.path_mapping.macos} • Windows {storage.path_mapping.windows} • Linux {storage.path_mapping.linux}</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Audio & Atmos</div>
          <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)", marginTop: 8 }}>
            <div>Layout {audioLayout.format} {audioLayout.channels.map(c => c.label).join(" ")} {audioLayout.sample_rate}Hz {audioLayout.bit_depth}bit</div>
            <div>Docs: track identity, channel order, sample rate, bit depth, timecode, clip gain, pan, bus, stem, role, sync</div>
            <div style={{ marginTop: 6 }}>Atmos: {atmosStatusExample().status} — {atmosStatusExample().details}</div>
            <div style={{ fontFamily: "var(--nv-font-mono)", fontSize: 10, color: "var(--nv-color-text-muted)" }}>If flattened: channel-bed + ADM package + channel map + metadata-loss warning</div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11 }}><Badge tone="primary">7.1.4</Badge> <Badge tone="neutral">OMF embedded vs referenced</Badge> <Badge tone="neutral">WAV fallback</Badge></div>
        </Card>
      </div>

      {/* Validation + roundtrip + loss */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Broadcast-Safe Validation</div>
          <div style={{ background: broadcast.result === "blocked" ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11, marginTop: 8 }}>
            <div>Profile {broadcast.profile} — <Badge tone={broadcast.result === "blocked" ? "warning" : "success"}>{broadcast.result}</Badge></div>
            {Object.entries(broadcast.checks).map(([k, v]) => <span key={k} style={{ display: "inline-block", margin: "4px 6px 0 0", padding: "2px 6px", borderRadius: 999, background: v === "passed" ? "#dcfce7" : v === "warning" ? "#fef3c7" : "#fee2e2", fontSize: 10 }}>{k} {v}</span>)}
            <div style={{ marginTop: 6, fontFamily: "var(--nv-font-mono)", fontSize: 10 }}>{broadcast.issues.map(i => `${i.type} max ${i.maximum_dbtp}dBTP limit ${i.limit_dbtp}`).join(" | ")}</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Round-Trip Validation</div>
          {roundtrip ? (
            <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)", marginTop: 8 }}>
              <div>{roundtrip.format} → {roundtrip.target} — <Badge tone={roundtrip.result === "passed" ? "success" : "warning"}>{roundtrip.result}</Badge></div>
              <div>Clips {String(roundtrip.timeline.clip_count_match)} duration {String(roundtrip.timeline.duration_match)} timecode {String(roundtrip.timeline.timecode_match)}</div>
              <div>Losses: {roundtrip.losses.map(l => `${l.feature}:${l.handling}`).join(", ")}</div>
            </div>
          ) : <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 8 }}>Run round-trip: canonical → interchange → import → reconstruct → compare clip count/order/ranges/duration/tracks/channels/timecode/reel/transitions/LUT/graph flatten/relink</div>}
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--nv-color-text-faint)" }}>Canonical → Generate → Import → Reconstruct → Compare</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Loss Report & AI Graph</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            <div>Preserved: {loss.preserved.slice(0, 4).join(", ")}</div>
            <div>Rendered: {loss.rendered.slice(0, 3).join(", ")}</div>
            <div>Not represented: {loss.not_represented.slice(0, 2).join(", ")}</div>
            <div>Companion: {loss.companion_files.join(", ")}</div>
            <div style={{ marginTop: 6 }}>Native ref: {JSON.stringify(aiGraphInterchange("node_background_04", "native")).slice(0, 80)}…</div>
            <div>Flattened: {JSON.stringify(aiGraphInterchange("node_background_04", "flattened")).slice(0, 80)}…</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
