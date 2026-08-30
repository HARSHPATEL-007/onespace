"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  analyzeAudio, isolateDialogue, reconstructRoomTone, createDubVersion, checkVoiceConsistency,
  normalizeForDestination, decideDucking, suggestSfx, scoreRepair, analyzeHum, checkPhase, detectSilence,
  listStems, createStemVersion, approveStemVersion, getMixGraph, checkImmersive, generateAudioReport,
} from "./audio-intelligence-engine";

export function AudioIntelligencePanel({ projectId }: { projectId: string }) {
  const [analysis, setAnalysis] = useState(() => analyzeAudio("asset_001", ["clipping","hum","phase","silence","loudness"]));
  const stems = useMemo(() => listStems(), []);
  const mixGraph = useMemo(() => getMixGraph("mix_main"), []);
  const [dubLang, setDubLang] = useState("hi-IN");

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>AUDIO INTELLIGENCE — VERSIONED, EXPLAINABLE PRODUCTION SYSTEM</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Source → Speaker-aware analysis → Immutable stems → Explainable repair → Versioned mix graph → Destination delivery</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Stems DX/DX-CLEAN/MX/FX/AMB/RT 48kHz 24-bit</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Neural separation + voice preservation 0.97 timbre</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Destination profiles broadcast/YouTube/social/podcast/Atmos 9.1.6</span>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Stem Model — canonical 12 + immersive objects</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {stems.slice(0,2).map(s=>(
              <div key={s.stem_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginBottom:6 }}>
                <div style={{ fontWeight:700 }}>{s.stem_id} {s.type} v{s.version} {s.channel_layout} {s.sample_rate_hz}Hz {s.bit_depth}-bit conf {s.confidence} {s.approval_status}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Sources {s.source_stems.join(",")} · chain {s.processing_chain.join(" → ")}</div>
              </div>
            ))}
            <div style={{ fontSize:10, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
              <div>Dialogue object · Music bed · Audience reaction · FX environmental · Narration — immersive tracking + downmix validation</div>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Signal Analysis — speaker & loudness</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Issues: {analysis.issues.length} · Loudness integrated {analysis.loudness.integrated_lufs} LUFS true peak {analysis.loudness.true_peak_dbtp} dBTP {analysis.loudness.status}</div>
            <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}>
              {analysis.issues.slice(0,3).map(iss=>(
                <Badge key={iss.issue_id} tone={iss.severity==="high"?"warning":"neutral"}>{iss.type} {iss.severity} {iss.track_id}</Badge>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const iso = isolateDialogue({ source_asset_id:"asset_001", speaker_id:"speaker_07", time_range:{start_ms:842100,end_ms:914800}, preserve_room_tone:true, maximum_artifact_risk:0.15 });
              alert(`Isolation music ${iso.suppression.music_db}dB timbre ${iso.voice_preservation.timbre_similarity} artifact ${iso.artifact_risk} conf ${iso.confidence}`);
            }}>Isolate speaker_07 (A/B audition)</Button>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Speaker Preservation + Room Tone</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Voiceprint speaker_07 warm en-IN fundamental 105-220Hz sibilance 0.42 — consent voice_processing allowed, cloning restricted</div>
            <div style={{ marginTop:6, display:"flex", gap:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const rt = reconstructRoomTone("venue_main_hall", {start_ms:428100,end_ms:431700});
                alert(`Room tone ${rt.location_id} spectral ${rt.spectral_match} method ${rt.method} crossfade ${rt.crossfade_ms}ms`);
              }}>Reconstruct room tone venue_main_hall</Button>
              <Badge tone="neutral">HVAC signature preserved · synthetic labeled for legal</Badge>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Multilingual Dubbing — branching</div>
          <div style={{ marginTop:8, fontSize:11, display:"flex", gap:6, alignItems:"center" }}>
            <select value={dubLang} onChange={e=>setDubLang(e.target.value)} className="nv-input" style={{ width:120 }}>
              <option value="hi-IN">hi-IN</option><option value="es-ES">es-ES</option><option value="de-DE">de-DE</option>
            </select>
            <Button size="sm" onClick={()=>{
              const d = createDubVersion({ source_language:"en-US", target_language:dubLang, voice_policy:"consented_voice_profiles_only", pronunciation_dictionary_id:"dict_project_001", lip_sync:true, preserve_music_and_effects:true });
              alert(`Dub ${d.language} voice ${d.voice_mode} lip ${d.lip_sync_mode} review ${d.review_status}`);
            }}>Create dub {dubLang}</Button>
            <Button size="sm" variant="ghost" onClick={()=>{
              const vc = checkVoiceConsistency("speaker_07","dub_hi_0042");
              alert(`Voice consistency timbre ${vc.timbre_similarity} prosody ${vc.prosody_similarity} overall ${vc.overall_score} ${vc.decision}`);
            }}>Voice consistency</Button>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Pronunciation layered: Global → Org → Project → Speaker → Scene · N0VA → NOH-vah phonemes · Do not clone without documented authorization</div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Destination Loudness — separate intent from normalization</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ display:"flex", gap:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const n = normalizeForDestination("tl_001","broadcast_hd",{preserve_dynamic_range:true});
                alert(`${n.profile.profile_id} target ${n.profile.integrated_loudness_target} tolerance ${n.profile.loudness_tolerance_lu} adjustment ${n.adjustment} reversible ${n.reversible}`);
              }}>Normalize broadcast_hd -23 LUFS</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const n = normalizeForDestination("tl_001","youtube_stereo");
                alert(`YouTube -14 LUFS true peak -1 dBTP ${n.adjustment}`);
              }}>YouTube -14</Button>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Profiles: broadcast -23 · OTT · YouTube -14 · social · podcast · cinema · Dolby Atmos · gain vs compression vs limiter — logged reversible</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Ducking — speech importance, not just VAD</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <Button size="sm" onClick={()=>{
              const d = decideDucking({start_ms:842100,end_ms:914800},0.94);
              alert(`Duck ${d.duck_amount_db}dB attack ${d.attack_ms} release ${d.release_ms} reason ${d.reason} sidechain ${d.sidechain_source}`);
            }}>Key product statement ducking 0.94 importance</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Modes: conversation gentle · key statement strong fast · emotional preserve bed · narration voice-first · trailer rhythmic — look-ahead phrase-aware, avoid pumping</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Repair Detection + Hum/Phase/Silence</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const hum = analyzeHum(); alert(`Hum ${hum.fundamental_hz}Hz harmonics ${hum.harmonics_hz.join(",")} risk ${hum.risk_to_voice}`);
              }}>Hum 50Hz analysis</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const ph = checkPhase("stereo_music_01"); alert(`Phase corr ${ph.correlation} mono loss ${ph.mono_loss_db}dB ${ph.polarity_status}`);
              }}>Phase check</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const sil = detectSilence({start_ms:428100,end_ms:431700}); alert(`Silence ${sil.classification} ${sil.severity} ${sil.recommended_action}`);
              }}>Silence dropout</Button>
            </div>
            <div style={{ marginTop:6 }}>
              {analysis.issues.map(iss=>(
                <div key={iss.issue_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:6, marginBottom:4 }}>
                  <div style={{ fontWeight:700 }}>{iss.type} {iss.track_id} {iss.range.start_ms}-{iss.range.end_ms} severity {iss.severity} peak {iss.peak_dbtp ?? ""} dBTP</div>
                  <div style={{ fontSize:10 }}>Repair {iss.repair_options[0]!.method} recovery {iss.repair_options[0]!.estimated_recovery} artifact {iss.repair_options[0]!.artifact_risk} → {iss.recommended_action}</div>
                  <Button size="sm" variant="ghost" onClick={()=>{
                    const sc = scoreRepair(iss.issue_id); alert(`Repair score detection ${sc.detection_confidence} repair ${sc.repair_confidence} artifact ${sc.artifact_risk} → ${sc.overall_recommendation}`);
                  }}>Score repair</Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Stem Versioning + Mix Graph + Immersive</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Stem DX v01 Original → v04 De-reverberated → v05 Editor approved (branch/compare/revert/lock)</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Button size="sm" variant="ghost" onClick={()=>{
                const v = createStemVersion("stem_dx",{ parent_version:4, plugin_chain:[{plugin:"n0va.dialogue.isolate",version:"3.2.0",parameters_hash:"sha3-512:p5"}] });
                alert(`Stem v${v.version} parent ${v.parent_version} approval ${v.approval.status}`);
              }}>Create v05</Button>
              <Button size="sm" variant="ghost" onClick={()=>{
                const v = approveStemVersion("stem_dx",5,"sound_supervisor_01","mix_engineer"); alert(`Approved ${v?.approval.status} by ${v?.approval.approved_by}`);
              }}>Approve v05</Button>
            </div>
            <div style={{ marginTop:6, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>Mix graph: Mic tracks → Dialogue bus (isolation/EQ/compression) → Music bus sidechain speech_importance → Master bus loudness/limiter → Delivery</div>
              <div>Nodes: bus_dialogue inputs stem_dx_clean_v04 · duck_music sidechain bus_dialogue → bus_music</div>
            </div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const im = checkImmersive("dolby_atmos_7_1_4"); alert(`Immersive ${im.format} bed ${im.bed_loudness_lufs} downmix loss ${im.downmix_mono_loss_db}dB ${im.status}`);
            }}>Immersive Atmos 7.1.4 check</Button>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>SFX Suggestions + Audio Report</div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:11 }}>
          <div>
            <Button size="sm" onClick={()=>{
              const s = suggestSfx("scene_021","product_reveal"); const cand = s.candidates[0]!; alert(`${s.event} fit ${cand.fit_score} gain ${cand.suggested_gain_db}dB ${cand.license_status}`);
            }}>Suggest SFX product_reveal</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Visual+motion+scene meaning → candidate → rights check → editor preview — genre/brand/mood/spatial considered</div>
          </div>
          <div style={{ background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
            <div>AUDIO INTELLIGENCE REPORT Q3 Product Launch — 24 tracks 0 missing 2 clock-drift · Dialogue 8 speakers 96.4% coverage · Hum 3 events · Phase 1 warning</div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const r = generateAudioReport(projectId); alert(`${r.source_integrity[0]} · ${r.dialogue[0]} · ${r.mix[0]}`);
            }}>Generate report</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
