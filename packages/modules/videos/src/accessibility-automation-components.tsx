"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  analyzeAccessibility, optimizeCaptionPosition, evaluateCaptionQuality, checkReadingSpeed,
  generateAudioDescription, getAudioDescriptionScript, getSignWindow, getAccessibleGraphic, checkColorAccessibility, detectFlashForTimeline, getSemanticTimeline, generateDestinationReport, generateManifest, listProfiles,
} from "./accessibility-automation-engine";

export function AccessibilityAutomationPanel({ projectId }: { projectId: string }) {
  const analysis = useMemo(() => analyzeAccessibility("tl_001", ["speaker_captions","caption_positioning","caption_quality","reading_speed","audio_description","sign_language_safe_area","color_blindness","flash_risk"], ["web_player_wcag_aa","broadcast","social_vertical"]), []);
  const [adLang, setAdLang] = useState("en-US");
  const script = useMemo(() => getAudioDescriptionScript(adLang), [adLang]);
  const positions = useMemo(() => optimizeCaptionPosition("cue_088"), []);
  const quality = useMemo(() => evaluateCaptionQuality("en-US"), []);
  const density = useMemo(() => checkReadingSpeed("cue_091"), []);
  const flash = useMemo(() => detectFlashForTimeline(), []);
  const semantic = useMemo(() => getSemanticTimeline("tl_001"), []);
  const report = useMemo(() => generateDestinationReport("LinkedIn Square Clip","social_square_v08","social_vertical"), []);
  const manifest = useMemo(() => generateManifest("export_001",8,"web_player_wcag_aa"), []);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1e293b 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>ACCESSIBILITY AUTOMATION — PARALLEL EDITORIAL LAYER · VERSIONED · DESTINATION-SPECIFIC</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>One timeline → many synchronized layers → destination validation → auditable approval</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Captions · Audio description · Sign language · Graphics · Keyboard · Screen-reader</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Visual importance · Text/graphics · Flash-risk · Color-contrast · Interaction maps</span>
        </div>
        <div style={{ marginTop:8, fontSize:11, background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}>
          Source timeline → Accessibility analysis (speech/visual/text/scene/flash/color/interaction) → Generation (captions/AD/sign/graphics/keyboard/screen-reader) → Destination validation → Report & approval
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Accessibility Asset Graph — visual frame linked</div>
          <div style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
            <div>Visual frame → Important object (product_diagram 0.89) → On-screen text → Speaker speaker_07 0.94 → Caption region 0.84×0.16 → AD event required → Sign window 0.27×0.38 → Screen-reader metadata</div>
            <div>Event a11y_0042 842100-914800 audio_description_required true sign safe 0.68,0.10 caption safe 0.08,0.74 confidence 0.91</div>
          </div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ fontWeight:700 }}>Speaker-Identified Captions</div>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:4 }}>
              <div>Cue cue_088 842100-845400 speaker Aarav: "The system protects every production boundary." dialogue conf 0.97 display speaker_label_plus_standard_text</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Use labels when 2+ speakers/off-screen/audience/overlap; avoid when single visible clearly established; approved directory, not raw diarization</div>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Caption Positioning — content-aware optimizer</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {positions && (
              <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <div>Candidates: bottom_center occlusion 0.42 reading 0.91 brand 0.08 vs top_center 0.11/0.86</div>
                <div>Selected: {positions.selected_region} — {positions.reason} conf {positions.confidence} review {String(positions.review_required)}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Evaluated faces/hands/slides/lower thirds/logos/product UI/charts/sign window/mobile safe areas</div>
              </div>
            )}
            <div style={{ marginTop:6 }}>
              <div style={{ fontWeight:700 }}>Caption Quality — multi-dimension</div>
              <div style={{ fontSize:10, background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
                <div>Language en-US word_accuracy 0.985 speaker 0.96 timing 0.94 terminology 0.99 reading 0.88 position 0.91 sound 0.76 overall 0.93 pass_with_review</div>
                <div>Quality {quality.overall_score} decision {quality.decision}</div>
              </div>
            </div>
            {density && (
              <div style={{ marginTop:6, background: density.density==="critical"?"rgba(239,68,68,0.08)":"rgba(251,191,36,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11 }}>
                <div style={{ fontWeight:700 }}>Reading-Speed Warning {density.density}</div>
                <div>{density.characters} chars {density.duration_ms}ms {density.characters_per_second} cps max {density.recommended_max_cps} → {density.suggested_actions.join(", ")}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Profiles: general 30cps · children stricter · technical longer · live latency · short-form mobile</div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Audio Description — candidates & script workflow</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Event ad_021 52100-54800 "A diagram shows three production layers..." importance 0.92 space 2700ms conf 0.88 review_required</div>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <select value={adLang} onChange={e=>setAdLang(e.target.value)} className="nv-input" style={{ width:100 }}><option value="en-US">en-US</option><option value="hi-IN">hi-IN</option></select>
              <Button size="sm" variant="ghost" onClick={()=>{
                const evs = generateAudioDescription(adLang,"concise_neutral",["scene_changes","charts"]);
                alert(`AD ${evs.length} events lang ${adLang} style concise_neutral`);
              }}>Generate AD {adLang}</Button>
            </div>
            {script && script.segments[0] && <div style={{ fontSize:10, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:6 }}>Script v{script.version} {script.language} narrator {script.narrator} {script.segments[0].text.slice(0,40)}… approved {String(script.segments[0].approved)}</div>}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Modes: standard/extended/chart/text/speaker/scene — workflow analysis→candidates→prioritization→gap detection→script→review→narration→mix→validation — never repeat dialogue</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Sign-Language Window — protected layer</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div>Window asl_window_01 0.70,0.08 0.26×0.40 face 12% hand 0.94 contrast 0.92 occlusion 0.08 status pass</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Optimizer: interpreter visibility, hands, graphics, slides, captions, lower thirds, vertical crop, contrast, size, consent, sync</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Warnings: hands leaving frame · face obscured · too small · low contrast · captions covering · hidden behind graphics · crop removes window · sync drift</div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:6 }}>
              <Badge tone="neutral">Interpreter window</Badge><Badge tone="neutral">Full-height side panel</Badge><Badge tone="neutral">Split-screen</Badge><Badge tone="neutral">PIP</Badge>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Accessible Graphics & Color-Blind Safety</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div>Graphic graphic_07 role process_diagram text Ingest/Production/Distribution reading order title→nodes→relationships description "Three layers..." decorative false label Production architecture diagram</div>
            </div>
            <Button size="sm" variant="ghost" onClick={()=>{
              const c = checkColorAccessibility("graphic_07");
              alert(`Contrast ${c.contrast_score} color_only ${c.color_only_encoding} protanopia ${c.simulations.protanopia?.status} → ${c.suggested_actions.join(",")}`);
            }}>Check color-blind simulations</Button>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Simulations: normal/protanopia 0.61 fail/deuteranopia 0.64 fail/tritanopia 0.91 pass/grayscale 0.48 fail — remediation add patterns/icons/labels, preserve brand</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Flash & Motion Safety</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {flash.map(f=>(
              <div key={f.range.start_ms} style={{ background:"rgba(239,68,68,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <div>Flash {f.flash_events} events {f.affected_frame_area_percent}% area {f.peak_frequency_hz}Hz red {f.red_flash_component} risk {f.risk_level} conf {f.confidence}</div>
                <div style={{ fontSize:10 }}>{f.suggested_actions.join(", ")}</div>
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Reduced-motion derivatives: standard / reduced-motion / static-slide / audio-first — never mask high risk with warning alone</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Keyboard-Only & Screen-Reader Timeline</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>Project Q3 2h04m — At 00:14:05 Video Camera2 CTO close-up · Audio CTO dialogue · Caption "The platform protects..." · Graphic Security diagram · Warning caption overlaps diagram</div>
              <div>Node tl_node_0042 role spoken_content label CTO explains security — tracks video/audio/caption — warnings caption overlaps — actions Open/Move/Generate/Review</div>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Global nav bins/viewer/timeline/inspector · Timeline frame/marker/track focus · Edit set in/out ripple split · Review approve/compare · Command palette: Move caption, Open next warning, Generate AD, Check color, Approve</div>
            <div style={{ marginTop:6 }}>
              {semantic.slice(0,2).map(n=>(
                <div key={n.node_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:6, marginBottom:4, fontSize:11 }}>
                  <div style={{ fontWeight:700 }}>{n.label} {n.start_ms}-{n.end_ms} role {n.role}</div><div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>{n.description}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Review Workspace & Destination Profiles</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Overall status 87% ready — Captions en approved hi terminology · AD 14 candidates 10 approved · Sign 2 warnings · Graphics 3 color fails · Motion 1 high-risk</div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {listProfiles().slice(0,4).map(p=>(
                <div key={p.profile_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:6 }}>
                  <div style={{ fontWeight:700 }}>{p.profile_id}</div><div style={{ fontSize:10 }}>Required: {p.required.slice(0,3).join(",")}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:6, background: report.status==="blocked"?"rgba(239,68,68,0.08)":"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div style={{ fontWeight:700 }}>Report {report.output} {report.version} {report.status}</div>
              <div style={{ fontSize:10 }}>{report.required_actions.join(" ")}</div>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Manifest {manifest.asset_id} v{manifest.timeline_version} {manifest.destination_profile} overall {manifest.overall_status} — overall PASS only if no blocking findings</div>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Accessibility Agent — 7 sub-agents + Governance</div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, fontSize:11 }}>
          {[
            ["Caption Agent","speaker labels, timing, density, terminology, positioning"],
            ["Audio Description Agent","visual-event, script, timing"],
            ["Sign Language Agent","window placement, sync, crop safety"],
            ["Visual Safety Agent","color blindness, contrast, flash, motion"],
            ["Interaction Agent","keyboard & screen-reader metadata"],
            ["Compliance Agent","destination reports & blocking"],
            ["Review Router","routes to specialist by confidence×severity"],
          ].map(([n,d])=>(
            <div key={n as string} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div style={{ fontWeight:700 }}>{n as string}</div><div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>{d as string}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>High conf low sev → auto-correct logged · High conf high sev → block/review · Low conf low sev → suggestion · Low conf high sev → escalate to specialist — preserve originals, never publish without approval</div>
      </Card>
    </div>
  );
}
