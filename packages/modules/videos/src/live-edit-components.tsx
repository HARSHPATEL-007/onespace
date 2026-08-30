"use client";
import { useState, useMemo } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createPostEventProject, getPostEventProject, generateCandidates, createSpeakerCompilation,
  transcriptEdit, detectSilence, createQuoteCard, buildPackage, pipelineStatus,
} from "./live-edit-engine";

export function LiveEditContinuumPanel({ projectId }: { projectId: string }) {
  const [postProjects, setPostProjects] = useState(() => {
    const p = createPostEventProject({ session_id: "live_20260830_001", project_name: "Q3 Product Launch — Post-Event", source_policy:"preserve_live_sources", generate:["chapters","highlights"], languages:["en","hi"], derivative_profiles:["youtube_highlight","linkedin_square","instagram_reel"], review_mode:"human_approval_required" });
    return [p];
  });
  const active = postProjects[0] ?? null;
  const [selectedMoment, setSelectedMoment] = useState(active?.moments[0]?.moment_id ?? "moment_0042");

  if (!active) return <div>No post-event project — create from live session</div>;

  const candidates = useMemo(() => generateCandidates(active.project_id, { candidate_types:["highlight","quote","chapter","social_clip"], signals:["audience_engagement","producer_markers"], minimum_confidence:0.8 }), [active]);
  const pipeline = useMemo(() => pipelineStatus(active.project_id), [active]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>LIVE-TO-EDIT CONTINUUM — ONE LIVE MOMENT → MANY GOVERNED DERIVATIVES</div>
        <div style={{ fontSize:14, fontWeight:900, marginTop:4 }}>Live event is the beginning, not the end — immutable source → linked non-destructive derivatives</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Live session → Post-Event Workspace → Editorial timeline → Derivative package</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Preserve live master, edit derivatives</span>
        </div>
        <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, fontSize:11 }}>
          <div style={{ background:"rgba(16,185,129,0.12)", padding:8, borderRadius:8 }}><div style={{ fontWeight:700 }}>Fast lane</div>Transcript · Chapters · Highlights · Search · Social candidates (minutes)</div>
          <div style={{ background:"rgba(14,165,233,0.12)", padding:8, borderRadius:8 }}><div style={{ fontWeight:700 }}>Editorial lane</div>Multi-cam conform · Dead-air · Speaker comps · Caption correction · Audio cleanup</div>
          <div style={{ background:"rgba(251,191,36,0.12)", padding:8, borderRadius:8 }}><div style={{ fontWeight:700 }}>Finishing lane</div>Color · Graphics · Brand · A11y · Rights · Final exports</div>
        </div>
        <div style={{ fontSize:10, opacity:0.7, marginTop:6 }}>Pipeline: LIVE_SESSION_ENDED → RECORDINGS_VERIFIED → MEDIA_CONFORM → TRANSCRIPT_RECONCILIATION → SPEAKER/SCENE → MOMENT_DETECTION → DERIVATIVE_PLAN → AI_ROUGH_CUTS → EDITORIAL_REVIEW → PREFLIGHT → EXPORT</div>
      </div>

      {/* Conversion & Conform */}
      <div style={{ display:"grid", gridTemplateColumns:"0.9fr 1.1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Event-to-Project Conversion <Badge tone="success">immutable source</Badge></div>
          <div style={{ marginTop:8, fontSize:11, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
            <div style={{ fontWeight:700 }}>Live session live_20260830_001</div>
            <div>├── Program recording · Clean feed · 8 ISOs · 6 audio stems</div>
            <div>├── Live captions → Corrected captions · Transcript · Speaker map</div>
            <div>├── Scene map · Live markers · Audience/chat timeline</div>
            <div>├── Failover events · Rights/consent snapshot · Destination records</div>
            <div>└── Post-Event Workspace project {active.project_id.slice(0,8)} · {active.project_name}</div>
          </div>
          <div style={{ marginTop:6, display:"flex", gap:6 }}>
            <Button size="sm" onClick={()=>{
              const p = createPostEventProject({ session_id:"live_20260830_001", project_name:"Q3 Product Launch — Post-Event (2)", source_policy:"preserve_live_sources" });
              setPostProjects([p, ...postProjects]);
            }}>Create post-event project</Button>
            <Badge tone="primary">Stage {active.stage} · Lane {active.lane}</Badge>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Pipeline status: Fast {pipeline.fast} · Editorial {pipeline.editorial} · Finishing {pipeline.finishing}</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Recording Conform — master clock 90000</div>
          <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>master_clock timebase 90000 start 01:00:00:00 wall 2026-08-30T04:00:00Z</div>
            <div>iso_cam_01 offset 42ms drift 1.8ppm conf 0.98 · iso_cam_02 -17ms 2.1ppm 0.97 · program 0ms — missing_ranges [] status verified</div>
            <div style={{ marginTop:4, color:"#a5b4fc" }}>Accounts for encoder failovers, region switches, reconnection gaps, drift, caption delay, replay, remote latency, program-vs-ISO offsets — uncertain alignment visible to editor</div>
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Chain-of-custody preserved, no destructive alteration of broadcast master</div>
        </Card>
      </div>

      {/* Intelligence Graph + Chapters */}
      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Event Intelligence Graph — one searchable graph</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>moment_0042 842100-914800</div>
              <div>signals: speaker_07 topic security architecture scene product_demo audience 0.88 chat 0.74 marker true transcript 0.96 visual 0.81</div>
              <div>derived: chapter_08 highlight_003 social_clip_003 quote_card_011</div>
              <div>Timecode → transcript/speaker/camera/scene/slide/audience/marker/caption/audio/visual/consent/rights/derived</div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
              {active.moments.map(m=>(
                <button key={m.moment_id} onClick={()=>setSelectedMoment(m.moment_id)} style={{ padding:"4px 8px", borderRadius:999, fontSize:11, fontWeight:700, background: selectedMoment===m.moment_id?"#0ea5e9":"var(--nv-color-surface-2)", color: selectedMoment===m.moment_id?"#fff":"var(--nv-color-text-muted)", border:"1px solid var(--nv-color-border)", cursor:"pointer" }}>{m.moment_id} {m.time_range.start_ms}-{m.time_range.end_ms}</button>
              ))}
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Editor selects transcript phrase/audience spike/speaker → sees every associated frame & derivative lineage</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Agenda-Based Chapters — hierarchy</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {active.chapters.map(ch=>(
              <div key={ch.chapter_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginBottom:6 }}>
                <div style={{ fontWeight:700 }}>{ch.title} <Badge tone={ch.source==="approved_agenda"?"success":"neutral"}>{ch.source}</Badge> <span style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>{ch.start_ms}ms conf {ch.confidence}</span></div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>End: {ch.end_condition} · status {ch.status} · thumb {ch.thumbnail_frame_ms}</div>
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Hierarchy: Q3 Product Launch → Opening → Product Overview → Pricing → Q&A → Closing · Priority: agenda → marker → topic → fallback · Sources: slide/presenter/topic/pause/scene/lower-third</div>
          </div>
        </Card>
      </div>

      {/* Highlights / Speaker / Transcript */}
      <div style={{ display:"grid", gridTemplateColumns:"0.9fr 1.1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Engagement-Based Highlights — penalize incomplete</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div style={{ fontWeight:700 }}>Score: engagement 0.84 × editorial 0.91 × narrative 0.88 × technical 0.96 × rights 1.0 × caption 0.94 = final 0.89 review_required</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Penalized: incomplete sentence/weak opening/dead air/caption uncertainty/private audience/unlicensed music/consent mismatch/platform-incompatible</div>
              <div style={{ marginTop:4 }}>Classes: Editorial · Audience · Product · Executive quote · Emotional · Educational</div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
              {candidates.highlights.slice(0,2).map((h,i)=><Badge key={i} tone="primary">Highlight {h.final_score.toFixed(2)} {h.decision}</Badge>)}
            </div>
          </div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ fontWeight:700 }}>Speaker Moments</div>
            {active.speaker_index.map(sp=>(
              <div key={sp.speaker_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:4 }}>
                <div style={{ fontWeight:700 }}>{sp.display_name} — {Math.round(sp.total_ms/60000)} min · {sp.segments.length} segments · quotable {sp.quotable_moments}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>{sp.segments.slice(0,2).map(s=>s.text.slice(0,20)).join(" | ")}</div>
                <Button size="sm" variant="ghost" onClick={()=>{
                  const comp = createSpeakerCompilation(active.project_id, sp.speaker_id, "best_of");
                  alert(`Compilation ${sp.speaker_id} best_of ${comp.length} segments`);
                }}>Best-of compilation</Button>
              </div>
            ))}
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Filters: speaker/topic/language/sentiment/product/confidence/destination/time — query with rights scope for LinkedIn 45s no interruption</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Transcript-Linked Editing — editable timeline representation</div>
          <div style={{ marginTop:8, fontSize:11, maxHeight:240, overflow:"auto" }}>
            {active.transcript_segments.map(seg=>(
              <div key={seg.segment_id} style={{ display:"flex", gap:6, alignItems:"center", padding:"4px 0", borderBottom:"1px solid var(--nv-color-border)", opacity: seg.edit_status==="excluded" ? 0.5 : 1 }}>
                <Badge tone={seg.edit_status==="included"?"success":seg.edit_status==="excluded"?"warning":"neutral"}>{seg.edit_status}</Badge>
                <span style={{ fontFamily:"var(--nv-font-mono)", fontSize:10 }}>{seg.start_ms}-{seg.end_ms}</span>
                <span style={{ flex:1 }}>{seg.text.slice(0,50)}</span>
                <span style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>{seg.speaker_id} · {seg.confidence} · rights {seg.rights_status}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
            <Button size="sm" onClick={()=>{
              const res = transcriptEdit(active.project_id, { selection:{ start_segment_id:"seg_044", end_segment_id:"seg_051" }, edit_mode:"remove", ripple_tracks:["program_video","dialogue","captions","graphics"], preserve_room_tone:true });
              alert(`Transcript edit ripple ${res.affected.join(",")} new version ${res.new_timeline_version}`);
            }}>Delete sentence seg_044→051 ripple</Button>
            <Badge tone="neutral">Affects cuts/captions/graphics/music/chapter/speaker/claims</Badge>
          </div>
          <div style={{ marginTop:6, fontSize:11 }}>
            <div style={{ fontWeight:700 }}>Dead-Air Removal — context-aware</div>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:10 }}>
              <div>Silence 428100-431700 3600ms unintended_silence conf 0.92 → remove_with_ripple preserve ambience, thresholds: internal 1.8s / keynote 2.5s / interview technical only / testimony never auto</div>
              <Button size="sm" variant="ghost" onClick={()=>{
                const s = detectSilence("unintended_silence");
                const first = s[0];
                alert(`Silence ${first?.start_ms}-${first?.end_ms} ${first?.classification} ${first?.recommended_action}`);
              }}>Detect silence</Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Multi-Camera / Social / Vertical / Quote */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Multi-Camera Re-Edit & Social Snippet Factory</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Modes: Preserve broadcast · Editorial polish · Speaker focus · Audience reaction · Presentation clean · Social punch — every AI change suggested until approved</div>
            <div style={{ marginTop:6, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
              <div>One moment → YouTube highlight · LinkedIn 1:1 · Instagram 9:16 · TikTok vertical · X short · Website teaser (each independent duration/aspect/hook/caption/safe areas/template/thumbnail/CTA/rights/a11y)</div>
              <div>Derivative plan: linkedin_clip 45s 1:1 question burned_in_plus_sidecar · instagram_reel 30s 9:16 statement burned_in — distinct reframing per output, not universal crop</div>
            </div>
            <div style={{ marginTop:6 }}>
              <div style={{ fontWeight:700 }}>Vertical Reframing — tracked subjects</div>
              <div style={{ fontSize:10, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>Face/object tracking + safe title + pan-and-scan + split-screen + slide crop — flags face cropping/product loss/text truncation/logo violation/caption obstruction/privacy exposure</div>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Quote Cards — verbatim/compressed/paraphrased/headline</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div style={{ fontWeight:700 }}>"Every production boundary should be observable." — Aarav Mehta, CTO</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>source seg_044+045 182340-191200 context_complete true confidence 0.97 brand pending template brand_quote_card_2026_v2 review_required · Never combine non-contiguous without label, never remove qualifying language</div>
              <Button size="sm" variant="ghost" onClick={()=>{
                const qc = createQuoteCard({ source_segment_ids:["seg_044"], text:"Every production boundary should be observable.", speaker:{ id:"speaker_02", display_name:"Aarav Mehta", title:"CTO" }, mode:"verbatim" });
                alert(`Quote ${qc.quote_id} ${qc.mode} ${qc.text.slice(0,20)}`);
              }}>Create verbatim quote</Button>
            </div>
            <div style={{ marginTop:6, fontSize:10 }}>
              <div>Captioned short-form: burned-in + sidecar + transcript + speaker labels + translation — live captions reconciled against verified ISO audio, not auto-promoted</div>
              <div style={{ background:"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:4 }}>Audio cleanup: noise 8dB de-reverb 0.22 level dialogue preserve room-tone reversible — Video stabilization only when beneficial, preserve authenticity</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Package + Review */}
      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Post-Event Content Package — structured, not folder dump</div>
          <div style={{ marginTop:8, background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
            <div>Q3 Product Launch — Post-Event Package</div><div>├── 01_master program/clean/stems</div><div>├── 02_transcripts verified/en/hi + speaker index</div><div>├── 03_chapters list.json/thumbnails/manifest</div><div>├── 04_highlights editorial/audience/product</div><div>├── 05_social vertical/square/landscape</div><div>├── 06_quotes cards + manifest</div><div>└── manifest.json package hashes + rights/consent/preflight</div>
          </div>
          <div style={{ marginTop:6, display:"flex", gap:6 }}>
            <Button size="sm" onClick={()=>{
              const pkg = buildPackage(active.project_id, ["masters","chapters","transcripts","highlights","social_derivatives","quote_cards","rights_manifest","preflight_report"]);
              alert(`Package ${pkg.package_id} ${pkg.generated_assets.length} derivatives checksum ${pkg.source_hashes.program_master.slice(0,12)}`);
            }}>Build package</Button>
            <Badge tone="neutral">Manifest: {active.derivatives.length} derivatives · {active.chapters.length} chapters · {active.moments.length} moments</Badge>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Every derivative inherits source restrictions — Instagram Reel blocked if internal-only consent, reframing rescanned for background faces/screens before publish</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Review Workspace — post-event edit board</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Sources: Program master · 8 ISOs · 6 stems · 4 remote feeds</div>
            <div>Intelligence: {active.chapters.length} chapters · {active.moments.length} highlights · {active.speaker_index.reduce((a,b)=>a+b.segments.length,0)} speaker moments · {candidates.quotes.length} quotes · {active.derivatives.length} social plans</div>
            <div>Review status: 17 approved · 9 rejected · 21 awaiting · 3 blocked by rights/consent</div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
              <Badge tone="success">Confidence ≥0.95 auto-prepared (policy still gates)</Badge>
              <Badge tone="warning">0.80-0.94 candidate review required</Badge>
              <Badge tone="neutral">0.60-0.79 suggestion uncertain</Badge>
              <Badge tone="neutral">&lt;0.60 no auto derivative</Badge>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>One live moment → verified source range → transcript → editorial decision → derivative timeline → caption/graphics → rights/consent → export → publication + analytics — confidence never authorizes publish if restricted</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
