"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createSession, getSession, predictHealth, executeFailover, getDestinationHealth, reconnectDestination,
  createCaptionRevision, createHighlightCandidate, startReplay, verifyRecording, diagnoseContributor, listFallbackAssets, generateEventReport, listSessions,
} from "./live-control-engine";
import type { LiveSession } from "./live-control-types";

export function LiveControlRoomPanel({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<LiveSession[]>(() => listSessions().length ? listSessions() : [createSession({ event_id:"event_q3_launch", regions:["us_east","eu_west","ap_southeast"], sources:["camera_01","camera_02","guest_01"], destinations:[{platform:"youtube",profile:"youtube_1080p60_v5"},{platform:"linkedin",profile:"linkedin_1080p_v3"},{platform:"instagram",profile:"instagram_1080p_v3"},{platform:"custom_rtmp",profile:"rtmp_1080p_v3"}], recording:{program:true,clean_feed:true,isos:true,audio_stems:true} })]);
  const active = sessions[0] ?? null;
  const [pred, setPred] = useState(() => predictHealth("stream_001", { packet_loss: 2.8, jitter:96 }));
  const [captionText, setCaptionText] = useState("NOVA Aperture");

  if (!active) return <div>No live sessions</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#7c2d12 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>N0VA LIVE CONTROL ROOM — FAULT-TOLERANT BROADCAST OS · 5 PLANES · ACTIVE-ACTIVE</div>
        <div style={{ display:"flex", gap:12, alignItems:"center", marginTop:6, flexWrap:"wrap" }}>
          <div style={{ fontSize:18, fontWeight:900 }}>Event: Q3 Product Launch <span style={{ opacity:0.7 }}>Session: {active.session_id}</span> <Badge tone={active.status==="live"?"success":active.status==="degraded"?"warning":"primary"}>{active.status.toUpperCase()}</Badge></div>
          <div style={{ fontSize:11, opacity:0.8 }}>Duration: 01:42:18 · Regions {active.regions.length} · Encoders {active.encoders.length} · Destinations {active.destinations.length}</div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:8, fontSize:11 }}>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>PROGRAM</div><div style={{ fontWeight:800 }}>LIVE · 1080p60 · 6.1 Mbps · A/V sync +18 ms</div><div>Current scene: Product demonstration</div></div>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>SYSTEM HEALTH</div><div style={{ fontWeight:800 }}>Overall: {active.health_prediction.health_score}/100 · {active.health_prediction.level}</div><div>Prediction: stable for 47m · failovers 1 encoder</div></div>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>REGIONS</div><div>US-East HEALTHY · EU-West standby · APAC WATCH</div></div>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>RECORDING</div><div>Program master VERIFIED · ISOs 8/8 · Audio 6/6</div></div>
        </div>
      </div>

      {/* Health prediction */}
      <Card padded>
        <div style={{ fontWeight:800, display:"flex", gap:8 }}>Stream Health Prediction — neural <Badge tone={pred.level==="critical"?"warning":pred.level==="at_risk"?"warning":"success"}>{pred.level} {pred.health_score}</Badge><span style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>failure {Math.round(pred.failure_probability_60s*100)}% in 60s · TTD {pred.time_to_degradation_seconds ?? "—"}s · conf {(pred.confidence*100).toFixed(0)}% · {pred.model_version}</span></div>
        <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12, marginTop:8, fontSize:11 }}>
          <div style={{ background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>Packet loss {pred.likely_causes.find(c=>c.cause==="upstream_packet_loss")?.probability ?? 0} · Encoder queue {pred.likely_causes.find(c=>c.cause==="encoder_queue_growth")?.probability ?? 0} · RTT</div>
            <div>Recommended: {pred.recommended_action}</div>
            <div>Thresholds: Healthy &lt;0.20 · Watch 0.20-0.50 · At risk 0.50-0.75 · Critical &gt;0.75 — triggers recommendation first, autonomous only if policy allows</div>
          </div>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
            <Button size="sm" variant="ghost" onClick={()=>setPred(predictHealth("stream_001",{packet_loss:0.4,jitter:12}))}>Simulate healthy</Button>
            <Button size="sm" variant="ghost" onClick={()=>setPred(predictHealth("stream_001",{packet_loss:4.5,jitter:120,queue_depth:65}))}>Simulate critical</Button>
            <Badge tone="neutral">Deterministic thresholds + neural — deterministic recovers when model unavailable</Badge>
          </div>
        </div>
        <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Signals: packet loss/jitter/RTT/SRT retrans/ICE/encoder queue/GPU/CPU/frame-drop/keyframe/bitrate variance/decoder/CDN/destination/caption queue/regional anomalies</div>
      </Card>

      {/* Regions & encoders */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Multi-Region Active-Active · Global Control Plane</div>
          <div style={{ marginTop:8, fontSize:11, display:"flex", flexDirection:"column", gap:6 }}>
            {active.regions.map(r=>(
              <div key={r.region} style={{ display:"flex", gap:8, alignItems:"center", background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <Badge tone={r.role==="primary"?"primary":r.role==="hot_standby"?"success":"neutral"}>{r.role}</Badge>
                <span style={{ fontWeight:700 }}>{r.region}</span><span>{r.health}</span><span style={{ fontFamily:"var(--nv-font-mono)", fontSize:10 }}>{r.encoder_id} · {r.ingest_endpoint}</span>
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Replicated session config + graphics/emergency media + independent monitoring + cross-region heartbeat — no single DB txn during failure, media vs control separate paths</div>
            <div style={{ display:"flex", gap:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                try{
                  const from = active.encoders[0]?.encoder_id ?? ""; const to = active.encoders[1]?.encoder_id ?? "";
                  const res = executeFailover(active.session_id,{scope:"encoder",from,to,reason:"predicted_failure",mode:"keyframe_handoff",operator_id:"user_td_01"});
                  setSessions([...listSessions()]); alert(`Failover L1 encoder ${res.handoff.mode} ${res.handoff.timestamp_continuity} frames ${res.handoff.frames_dropped}`);
                }catch(e){ alert((e as Error).message); }
              }}>Level 1 Encoder failover (same region)</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                try{
                  const from = active.encoders[0]?.encoder_id ?? ""; const to = active.encoders[2]?.encoder_id ?? "";
                  const res = executeFailover(active.session_id,{scope:"region",from,to,reason:"regional_network_degradation",operator_id:"user_td_01"});
                  setSessions([...listSessions()]); alert(`L3 Regional ${res.session.live_state.active_program_path} level ${res.session.live_state.failover_level}`);
                }catch(e){ alert((e as Error).message); }
              }}>Level 3 Regional failover</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Hierarchy L0 Normal · L1 Encoder · L2 Ingest · L3 Regional · L4 Destination · L5 Emergency slate — max 15s, preserve program/caption clock, notify TD/producer/engineer</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Backup Encoders — warmed, isolated domains</div>
          <div style={{ marginTop:8, fontSize:11, maxHeight:220, overflow:"auto" }}>
            {active.encoders.slice(0,4).map(e=>(
              <div key={e.encoder_id} style={{ display:"flex", gap:6, alignItems:"center", background:e.status==="active"?"rgba(16,185,129,0.08)":e.status==="failed"?"rgba(239,68,68,0.08)":"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:6, marginBottom:4 }}>
                <Badge tone={e.status==="active"?"success":e.status==="failed"?"warning":"neutral"}>{e.status}</Badge>
                <span style={{ fontWeight:700, fontFamily:"var(--nv-font-mono)", fontSize:10 }}>{e.encoder_id}</span>
                <span>{e.type} · {e.region} · {e.profile}</span>
                <span style={{ marginLeft:"auto", fontSize:10 }}>queue {e.metrics?.queue_depth} gpu {e.metrics?.gpu_util}% bitrate {e.metrics?.bitrate_kbps}</span>
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Separated AZ/power/network/GPU/credentials/hosts/control connections — continuous frame/scene/audio/graphics/caption/GOP state — handoff modes: frame-accurate/keyframe/emergency media + short rolling buffer for timestamp continuity</div>
          </div>
        </Card>
      </div>

      {/* Destinations */}
      <Card padded>
        <div style={{ fontWeight:800, display:"flex", gap:8 }}>Per-Destination Monitoring — independent health <Badge tone="primary">{active.destinations.length} outputs</Badge></div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:8 }}>
          {active.destinations.map(d=>(
            <div key={d.id} style={{ background: d.status==="healthy"?"rgba(16,185,129,0.08)":d.status==="degraded"?"rgba(251,191,36,0.08)":"rgba(239,68,68,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11 }}>
              <div style={{ fontWeight:800 }}>{d.platform} <Badge tone={d.status==="healthy"?"success":d.status==="degraded"?"warning":"neutral"}>{d.status} {d.health_score}</Badge></div>
              <div>Ingest {d.ingest.bitrate_kbps}kbps loss {d.ingest.packet_loss_percent}% rtt {d.ingest.rtt_ms} jitter {d.ingest.jitter_ms}</div>
              <div>Media {d.media.video_fps}fps av_sync {d.media.av_sync_ms}ms caption {d.media.caption_delay_ms}ms</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Impact {d.audience_impact} · {d.action ?? "stable"} · ladder {(d.bitrate_ladder?.[d.current_rung ?? 0] ?? d.bitrate_ladder?.[0])?.profile ?? "—"}</div>
              <Button size="sm" variant="ghost" onClick={()=>{
                const rec = reconnectDestination(active.session_id, d.id);
                setSessions([...listSessions()]); alert(`Reconnect ${d.id} rung ${rec?.current_rung} bitrate ${rec?.ingest.bitrate_kbps}`);
              }}>Reconnect + bitrate recovery</Button>
            </div>
          ))}
        </div>
        <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Staged recovery: detect→freeze policy→transport recovery→SRT latency→reduce one rung→reconnect same identity→restore gradually with hysteresis (downgrade 10s/3 samples, upgrade 60s stable) — destination failure not EMERGENCY_MODE.</div>
      </Card>

      {/* Captions / Highlights / Replay */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Live Caption Correction — provisional → published</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ display:"flex", gap:6 }}><input value={captionText} onChange={e=>setCaptionText(e.target.value)} className="nv-input" style={{ flex:1 }} /><Button size="sm" onClick={()=>{
              const rev = createCaptionRevision({ original_text:"NOVA Aperture", corrected_text:captionText, start_ms:182340, end_ms:186900, reason:"approved glossary correction", actor:"caption_agent" });
              alert(`Caption rev ${rev.segment_id} v${rev.version} ${rev.original_text}→${rev.corrected_text} latency ${rev.correction_latency_ms}ms state ${rev.state}`);
            }}>Correct to {captionText}</Button></div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>States PROVISIONAL→CONFIDENT→CORRECTED→HUMAN_REVIEWED→PUBLISHED · glossary/product/speaker · fallback to backup engine, not silent inaccurate</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Highlight Clipping — candidate first</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" onClick={()=>{
              const hl = createHighlightCandidate({ trigger:"operator_marker", event_time_ms:842100, pre_roll_ms:10000, post_roll_ms:15000, formats:["16:9","9:16"], publish_mode:"review_required" });
              alert(`Highlight ${hl.candidate_id} ${hl.start_ms}-${hl.end_ms} score ${hl.score} formats ${hl.suggested_formats.join(",")}`);
            }}>Create highlight candidate</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Signals: marker/speech/chat/scene/score/camera/replay/hotkey/audio/face — pre/post-roll 10s to avoid cutting speech.</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Instant Replay — rolling buffer</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" onClick={()=>{
              const rb = startReplay({ session_id:active.session_id, source:"iso_cam_03", start_offset_seconds:28, duration_seconds:12, speed:0.5, graphics_template:"replay_lower_third_v2" });
              alert(`Replay ${rb.source} live edge ${rb.live_edge_ms} replay ${rb.replay_point_ms} delay ${rb.live_edge_ms - rb.replay_point_ms}ms state ${rb.state}`);
            }}>Start replay iso_cam_03 28s</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Frame-accurate in/out, variable speed, multi-angle, safe return LIVE→ARMED→PLAYING→RETURN→LIVE · live edge vs replay edge separate</div>
          </div>
        </Card>
      </div>

      {/* Recording + Contributor + Fallback */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>ISO Recording Integrity — segmented + checksums</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>rec_iso_cam_03 seg_000184 01:42:10:00→01:42:20:00 10s 300/300 frames 0 dropped 480000 samples 3 replicas sha3-512:… verified</div>
              <div>10s/30s segments + manifest + checksums + timecode map + recovery index — never claim complete if gap missing</div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const v = verifyRecording("recording_program_001", ["segment_completeness","checksums"]);
                alert(`Verified ${v.verified} segments ${v.segments.length} missing ${v.missing_intervals.length}`);
              }}>Verify recording</Button>
              <Badge tone="success">Primary Region A NVMe · Secondary Region B object · Tertiary on-premise — program backup independent</Badge>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Remote Contributor + Fallback</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div style={{ fontWeight:700 }}>Guest 04 DEGRADED — Network 4.2Mbps loss 3.1% RTT 188ms jitter 74ms · Device CPU 92% 720p 21fps · Environment echo/high noise/insufficient light</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Recommended: Switch to audio priority and request wired connection.</div>
              <Button size="sm" variant="ghost" onClick={()=>{
                const d = diagnoseContributor("guest_04"); alert(`${d.contributor_id} ${d.status} — ${d.recommended_action}`);
              }}>Diagnose guest_04</Button>
            </div>
            <div style={{ marginTop:6, fontSize:10, background:"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              Emergency slate_global_01 technical_difficulty 30s loopable captioned loudness+rights verified for youtube/linkedin — deterministic, never blank on AI failure
              <Button size="sm" variant="ghost" onClick={()=>{
                const assets = listFallbackAssets(); const first = assets[0]; alert(`Fallback ${first?.asset_id ?? "none"} valid ${String(first?.loopable)} destinations ${first?.destinations.join(",") ?? ""}`);
              }}>Validate slate</Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Control room dashboard extra */}
      <Card padded>
        <div style={{ fontWeight:800 }}>Control-Room Extras — loudness/color/incidents</div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div style={{ fontWeight:700 }}>Broadcast Loudness</div>
            <div>Integrated -23.4 LKFS target -23 · True peak -1.2 dBTP · Dialogue within · LU 8.1 · Phase 0.84 PASS</div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Warning 4.2s above target → suggest 1.5 dB dialogue bus reduction — bounded reversible logged</div>
          </div>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div style={{ fontWeight:700 }}>Color Scopes</div>
            <div>Waveform/RGB parade/vectorscope gamut 1.08 &gt;1.0 medium → apply source limiter (approval required)</div>
          </div>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div style={{ fontWeight:700 }}>Recovery Objectives</div>
            <div>Program &lt;5s visible &lt;2s · Destination &lt;30s · Caption &lt;3s · Recording zero gaps segment 10s</div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const rep = generateEventReport(active.session_id); alert(`Report ${JSON.stringify(rep).slice(0,120)}…`);
            }}>Post-event integrity report</Button>
          </div>
        </div>
        <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Alert prioritization P0 public failure auto+alarm · P1 major auto+confirm · P2 destination isolated · P3 recording · P4 advisory — correlation groups packet loss+retrans+bitrate+queue into regional degradation incident — autonomous boundaries: auto reconnect/switch/reduce vs confirm region/remove camera vs human stop/publish sensitive/bypass rights</div>
      </Card>
    </div>
  );
}
