"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import { LAYERS } from "./semantic-types";
import type { TimelineLayer } from "./semantic-types";
import {
  semanticSearch, getTranscriptTokens, getDialogueCleanupSuggestions,
  createBranchFromSemanticRules, getNarrativeArc, getEmotionSpans, getContinuityIssues,
  getReviewCommentsSemantic, getSemanticDiff,
} from "./semantic-engine";

function msTc(ms: number) {
  const m = Math.floor(ms / 60000); const s = Math.floor((ms % 60000) / 1000); const f = Math.floor((ms % 1000) / 33);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

export function SemanticTimelinePanel({ timelineId, projectId }: { timelineId: string; projectId: string }) {
  const [layers, setLayers] = useState<Set<TimelineLayer>>(new Set<TimelineLayer>(["media","transcript","scenes","review"]));
  const [query, setQuery] = useState("Show every shot where the CEO mentions pricing.");
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [branchName, setBranchName] = useState("60-second evidence cut");
  const [fromV, setFromV] = useState("tl001:v27");
  const [toV, setToV] = useState("tl001:v31");

  const results = useMemo(() => semanticSearch(query, { timeline_version: timelineId }), [query, timelineId]);
  const tokens = getTranscriptTokens();
  const cleanup = getDialogueCleanupSuggestions();
  const arc = getNarrativeArc();
  const emotions = getEmotionSpans();
  const continuity = getContinuityIssues();
  const reviews = getReviewCommentsSemantic();
  const diff = useMemo(() => getSemanticDiff(fromV, toV), [fromV, toV]);

  const toggleLayer = (id: TimelineLayer) => {
    const n = new Set(layers);
    if (n.has(id)) n.delete(id); else n.add(id);
    setLayers(n);
  };
  const toggleWord = (id: string) => {
    const n = new Set(selectedWords);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelectedWords(n);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1e1b4b 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>SEMANTIC TIMELINE INTELLIGENCE — QUERYABLE WORKSPACE</div>
        <div style={{ fontSize:18, fontWeight:900, marginTop:4 }}>Timeline is semantic, not just clips — one interaction model, reversible, explainable</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11, opacity:0.8 }}>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Editorial ↔ Semantic synchronized</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Shared immutable source graph → many lightweight branches</span>
          <span style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>Vector ANN + temporal interval + entity indexes</span>
        </div>
      </div>

      {/* Unified surface — layer toggles */}
      <Card padded>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontWeight:800 }}>Unified Editor Surface — Semantic Overlays</span>
          <Badge tone="primary">Show/hide without changing edit</Badge>
          <span style={{ marginLeft:"auto", fontSize:11, color:"var(--nv-color-text-faint)" }}>Chain: Editorial Timeline ↔ Semantic Timeline (people/objects/dialogue/scenes/narrative/review/continuity/provenance)</span>
        </div>
        <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
          {LAYERS.map(l => (
            <button key={l.id} onClick={()=>toggleLayer(l.id)} style={{ padding:"6px 10px", borderRadius:999, fontSize:11, fontWeight:700, cursor:"pointer", background: layers.has(l.id) ? l.color : "var(--nv-color-surface-2)", color: layers.has(l.id) ? "#fff" : "inherit", border:"1px solid var(--nv-color-border)" }} title={l.desc}>
              <span style={{ width:8, height:8, borderRadius:999, background: layers.has(l.id) ? "#fff" : l.color, display:"inline-block", marginRight:6 }} />{l.label}
            </button>
          ))}
        </div>
        {/* Mock lane visualization */}
        <div style={{ marginTop:10, background:"#0f0f12", borderRadius:8, padding:10, border:"1px solid #222", display:"flex", flexDirection:"column", gap:6 }}>
          {[
            ["Media", "V1 [00:00:08–00:00:15] Welcome…  A1 dialogue  G1 caption", layers.has("media")],
            ["Transcript", "Welcome(44200) to(44230) our(44300) Q3(44400) product…  pricing(44200-44530)  um(22100)", layers.has("transcript")],
            ["Speakers", "person_044 ████████  person_ceo ████░░░░  confidence 0.96", layers.has("speakers")],
            ["Scenes", "interview_setup_01 [00:00:08 00:01:00]  office [00:00:44 00:00:51]", layers.has("scenes")],
            ["Objects", "laptop ████  red car █░  face_044", layers.has("objects")],
            ["Emotion", "high-energy positive 0.76 █████░░", layers.has("emotion")],
            ["Narrative", "introduction 0-18s → evidence 42-94s → climax 94-110s", layers.has("narrative")],
            ["Review", "comment_01J_001 on claim 40% → open (client_007)", layers.has("review")],
            ["Continuity", "prop_state_mismatch laptop 41-46s medium", layers.has("continuity")],
            ["Provenance", "AI-generated voice 48-56s synthetic_voice approved", layers.has("provenance")],
          ].map(([label, preview, on]) => (
            <div key={label as string} style={{ display:"flex", gap:8, alignItems:"center", opacity: on ? 1 : 0.35 }}>
              <span style={{ width:70, fontSize:10, fontWeight:800, color: LAYERS.find(l=>l.label===label)?.color }}>{label as string}</span>
              <div style={{ flex:1, height:18, background: on ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", borderRadius:6, display:"flex", alignItems:"center", padding:"0 8px", fontSize:10, color:"#a5b4fc", fontFamily:"var(--nv-font-mono)", overflow:"hidden" }}>{preview as string}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Semantic navigation */}
      <Card padded>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontWeight:800 }}>Semantic Navigation — one common language</span>
          <Badge tone="primary">transcript + visual + audio + objects + faces + location + shot type + emotion + narrative</Badge>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <input className="nv-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Show every shot where the CEO mentions pricing." style={{ flex:1, fontSize:13 }} />
          <Button size="sm" onClick={()=>setQuery(query)}>Search</Button>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
          {["Show every shot where the CEO mentions pricing.","Find the first appearance of the red car.","Jump to the most emotional answer.","Find pauses longer than two seconds.","Show continuity errors involving the laptop."].map(q => (
            <button key={q} onClick={()=>setQuery(q)} style={{ fontSize:11, background: q===query ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)", color: q===query ? "#fff":"inherit", border:"1px solid var(--nv-color-border)", padding:"4px 8px", borderRadius:999, cursor:"pointer", maxWidth:280, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{q}</button>
          ))}
        </div>
        <div style={{ marginTop:10, border:"1px solid var(--nv-color-border)", borderRadius:8, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"180px 160px 1fr 90px 110px", gap:0, background:"var(--nv-color-surface-2)", padding:"6px 10px", fontSize:11, fontWeight:800, color:"var(--nv-color-text-faint)" }}>
            <span>Range</span><span>Confidence / Why</span><span>Source / Branch</span><span>Actions</span><span>Timeline</span>
          </div>
          {results.map((r,i) => (
            <div key={i} style={{ display:"grid", gridTemplateColumns:"180px 160px 1fr 90px 110px", gap:8, padding:"8px 10px", borderTop:"1px solid var(--nv-color-border)", fontSize:11, alignItems:"start" }}>
              <span style={{ fontFamily:"var(--nv-font-mono)" }}>{msTc(r.range.start_ms)}–{msTc(r.range.end_ms)}<br/><span style={{ color:"var(--nv-color-text-faint)" }}>{r.timeline_id}</span></span>
              <span><Badge tone={r.confidence>0.9 ? "success" : "primary"}>{r.confidence.toFixed(2)}</Badge><div style={{ marginTop:4 }}>{r.match_reasons.join(" • ")}</div></span>
              <span style={{ color:"var(--nv-color-text-muted)" }}>{r.source_asset_id} • {r.timeline_id} • related clips: span_002, span_003</span>
              <span style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{r.actions.map(a => <Badge key={a} tone="neutral">{a}</Badge>)}</span>
              <span style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Jump to source asset & branch; add_to_alt_cut creates lightweight branch</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Transcript-driven editing — word-level anchoring */}
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Transcript — first-class editing surface <Badge tone="primary">word-level anchoring</Badge></div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Select word→cut, sentence→remove, drag passage→reorder, replace with another take, convert to new sequence, preserve pauses/reaction, preview before commit.</div>
          <div style={{ marginTop:8, background:"#0f0f12", color:"#e2e8f0", borderRadius:8, padding:10, border:"1px solid #222", lineHeight:1.8, fontSize:13 }}>
            {[
              { t:"Welcome", id:"tok_a" }, { t:"to", id:"tok_b" }, { t:"our", id:"tok_c" }, { t:"Q3", id:"tok_d" }, { t:"product", id:"tok_e" }, { t:"launch", id:"tok_f" },
              { t:"—", id:"tok_g" }, { t:"We", id:"tok_h" }, { t:"launched", id:"tok_i" }, { t:"the", id:"tok_j" }, { t:"product", id:"tok_k" }, { t:"last", id:"tok_l" }, { t:"year…", id:"tok_m" },
            ].map(w => (
              <span key={w.id} onClick={()=>toggleWord(w.id)} style={{ padding:"2px 4px", borderRadius:4, cursor:"pointer", background: selectedWords.has(w.id) ? "rgba(129,140,248,0.3)" : "transparent", border: selectedWords.has(w.id) ? "1px solid #818cf8" : "1px solid transparent" }}>{w.t}</span>
            ))}
            <span style={{ color:"#94a3b8" }}> </span>
            <span style={{ background:"rgba(16,185,129,0.18)", padding:"2px 6px", borderRadius:6, border:"1px solid rgba(16,185,129,0.3)" }}>pricing</span>
            <span> at </span>
            <span style={{ background:"rgba(245,158,11,0.18)", padding:"2px 6px", borderRadius:6 }}>00:00:44.200</span>
            <span> — um, basically, what we wanted to say was we improved performance.</span>
          </div>
          <div style={{ marginTop:8, background:"rgba(129,140,248,0.08)", border:"1px solid rgba(129,140,248,0.25)", borderRadius:8, padding:8, fontSize:12 }}>
            <div><strong>Selected:</strong> “We launched the product last year…” • Command: <em>Remove filler and repeated context</em></div>
            <div style={{ marginTop:4 }}>N0VA proposes: <strong>“We launched the product…”</strong></div>
            <div style={{ marginTop:4, fontSize:11, color:"var(--nv-color-text-muted)" }}>Affected: Dialogue 00:01:12.400–00:01:18.900 • Camera 00:01:12.400–00:01:18.900 • Reaction 00:01:18.900–00:01:20.100 • Caption track updated • Music ducking recalculated</div>
            <div style={{ marginTop:6, display:"flex", gap:6 }}><Button size="sm">Preview</Button><Button size="sm" variant="secondary">Apply to branch</Button><Button size="sm" variant="ghost">Apply to current</Button></div>
          </div>
          <div style={{ marginTop:8, fontSize:10, color:"var(--nv-color-text-faint)", fontFamily:"var(--nv-font-mono)" }}>Token tok_00981 pricing start 4810 end 5140 speaker person_044 asset001 timeline tl001 44200-44530 active confidence 0.99</div>
          <div style={{ marginTop:8, display:"flex", gap:4, flexWrap:"wrap" }}>{tokens.map(t => <span key={t.token_id} style={{ fontSize:10, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", padding:"2px 6px", borderRadius:999 }}>{t.text} {msTc(t.start_ms)}→{msTc(t.end_ms)} {t.speaker_id}</span>)}</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Automatic Dialogue Cleanup — classified, previewed</div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Filler, false starts, duplicates, stutters, long pauses, cross-talk, low-confidence, terminology, off-topic — with waveform/visual continuity + replacement take check.</div>
          <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6 }}>
            {cleanup.map(s => (
              <div key={s.suggestion_id} style={{ border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, background: s.requires_review ? "rgba(245,158,11,0.06)" : "var(--nv-color-surface-2)" }}>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}><Badge tone={s.requires_review ? "warning" : "success"}>{s.type}</Badge><span style={{ fontFamily:"var(--nv-font-mono)", fontSize:11 }}>{msTc(s.range.start_ms)}–{msTc(s.range.end_ms)}</span><Badge tone="neutral">conf {s.confidence.toFixed(2)}</Badge><span style={{ marginLeft:"auto", fontSize:10, color:"var(--nv-color-text-faint)" }}>visual {s.visual_risk.toFixed(2)} • audio {s.audio_risk.toFixed(2)}</span></div>
                <div style={{ fontSize:11, marginTop:4 }}><span style={{ textDecoration:"line-through", color:"#ef4444" }}>{s.original}</span> → <span style={{ color:"#10b981", fontWeight:700 }}>{s.proposed}</span></div>
                <div style={{ marginTop:4, fontSize:10, color:"var(--nv-color-text-muted)" }}>Never silently remove from approved timeline — proposal or policy-authorized only. Affects narrative arc: {s.type==="remove_filler" ? "no" : "check"}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Each suggestion: original/proposed, range, confidence, waveform/visual impact, replacement take, narrative impact.</div>
        </Card>
      </div>

      {/* Semantic cut + branches */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Semantic Cut Operations — compile to ordinary timeline ops</div>
          <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontSize:11 }}>
            {[
              ["Remove all filler words","Ripple delete dialogue ranges"],
              ["Keep only product demonstrations","New branch from matching segments"],
              ["Shorten to 60 seconds","High-value spans → alternate cut"],
              ["Replace this answer","Match another take by speaker"],
              ["Remove every mention of competitor","Delete dialogue + reaction spans"],
              ["Use strongest emotional response","Rank candidates, substitute range"],
              ["Show evidence first","Reorder approved evidence into branch"],
              ["Make suitable for social","Platform-specific alternate sequence"],
            ].map(([sem,tim]) => <div key={sem} style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)" }}><div style={{ fontWeight:700 }}>{sem}</div><div style={{ color:"var(--nv-color-text-muted)" }}>→ {tim}</div></div>)}
          </div>
          <div style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:6, fontFamily:"var(--nv-font-mono)", fontSize:11, border:"1px solid #222" }}>
            Proposed: “Remove all pauses &gt;1.5s” → Affected: 14 dialogue gaps, 3 reaction shots, 2 music transitions, 1 caption region • Duration -00:02:18 • [Preview] [Apply to branch] [Apply to current]
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Alternate Cuts Without Duplication <Badge tone="primary">lightweight branches</Badge></div>
          <div style={{ marginTop:6, background:"#0f0f12", color:"#e2e8f0", borderRadius:8, padding:10, border:"1px solid #222", fontSize:11, fontFamily:"var(--nv-font-mono)", lineHeight:1.5 }}>
            <div>Shared Source and Analysis Graph → Main Timeline</div>
            <div>├── Social Cut • Executive Cut • Evidence Cut</div>
            <div>└── 60-Second Cut (constraints: max_duration 60000, 9:16)</div>
          </div>
          <div style={{ marginTop:8, background:"var(--nv-color-surface-2)", padding:8, borderRadius:6, fontSize:11, border:"1px solid var(--nv-color-border)" }}>
            <div style={{ fontWeight:700 }}>Branch branch_social_01 parent tl001:v27</div>
            <div>include narrative.role=evidence (importance≥0.78), exclude dialogue filler, constraints max_duration 60000 aspect 9:16</div>
            <div style={{ marginTop:4, display:"flex", gap:6 }}><Button size="sm" onClick={() => {
              const b = createBranchFromSemanticRules({ name: branchName, parent: "tl001:v27", rules: [{ include: "narrative.role=evidence", minimum_importance: 0.78 }, { exclude: "dialogue.contains=filler" }], constraints: { maximum_duration_ms: 60000, aspect_ratio: "9:16" }});
              setBranchName(b.branch_id);
            }}>Generate branch</Button><span style={{ fontSize:10, color:"var(--nv-color-text-faint)", lineHeight:"28px" }}>{branchName}</span></div>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Stores parent version, included/excluded spans, ordering, branch effects/captions/narrative target/duration — no duplicate media.</div>
        </Card>
      </div>

      {/* Narrative + Emotion */}
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Narrative-Arc Visualization <Badge tone="primary">weaknesses visible</Badge></div>
          <div style={{ marginTop:8, height:70, background:"#0f0f12", borderRadius:8, border:"1px solid #222", position:"relative", overflow:"hidden", display:"flex", alignItems:"flex-end", padding:"0 8px", gap:4 }}>
            {arc.map(s => (
              <div key={s.role} style={{ flex: s.end_ms - s.start_ms, background: s.role==="evidence" ? "#10b981" : s.role==="climax" ? "#8b5cf6" : s.role==="introduction" ? "#0ea5e9" : "var(--nv-color-surface-2)", borderRadius:"6px 6px 0 0", height: `${20 + s.emotional_intensity*60}%`, display:"flex", alignItems:"flex-end", justifyContent:"center", paddingBottom:4, fontSize:9, fontWeight:700, color: s.role==="evidence"||s.role==="climax"||s.role==="introduction" ? "#fff" : "inherit" }}>{s.role.slice(0,4)}</div>
            ))}
          </div>
          <div style={{ marginTop:6, display:"flex", gap:4, overflowX:"auto" }}>
            {arc.map(s => <span key={s.role} style={{ fontSize:10, background:"var(--nv-color-surface-2)", padding:"4px 6px", borderRadius:6, border:"1px solid var(--nv-color-border)", whiteSpace:"nowrap" }}><strong>{s.role}</strong> {msTc(s.start_ms)}–{msTc(s.end_ms)} conf {s.confidence.toFixed(2)} • {s.summary.slice(0,28)}… • intensity {s.emotional_intensity.toFixed(2)}</span>)}
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Inferred from transcript semantics, scene transitions, emotional intensity, speaker turns, music, visual emphasis, claims. Missing introduction / late conflict / weak evidence / missing conclusion flagged.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Emotion & Rhythm Track — contextual signal, not fact</div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Observed expression, vocal energy, dialogue sentiment, editorial intensity + confidence — avoid presenting as definitive.</div>
          {emotions.map(e => (
            <div key={e.start_ms} style={{ marginTop:8, background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, border:"1px solid var(--nv-color-border)", fontSize:11 }}>
              <div style={{ display:"flex", gap:6 }}><Badge tone="primary">{e.display_label}</Badge><span style={{ marginLeft:"auto", fontFamily:"var(--nv-font-mono)", fontSize:10 }}>{msTc(e.start_ms)}–{msTc(e.end_ms)}</span></div>
              <div style={{ marginTop:4, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4, fontSize:10 }}>
                <span>facial {e.signals.facial_expression} c{e.confidence.facial_expression.toFixed(2)}</span>
                <span>vocal {e.signals.vocal_energy.toFixed(2)} c{e.confidence.vocal_energy.toFixed(2)}</span>
                <span>sentiment {e.signals.dialogue_sentiment.toFixed(2)} c{e.confidence.dialogue_sentiment.toFixed(2)}</span>
              </div>
              <div style={{ marginTop:4, height:6, background:"var(--nv-color-border)", borderRadius:999, overflow:"hidden" }}><div style={{ width:`${e.signals.editorial_intensity*100}%`, height:"100%", background:"#8b5cf6" }} /></div>
            </div>
          ))}
        </Card>
      </div>

      {/* Objects / Continuity / Diff / Review */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Continuity Intelligence — review annotations, not auto-edits</div>
          {continuity.map(c => (
            <div key={c.continuity_issue_id} style={{ marginTop:8, border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, background: c.severity==="high" ? "rgba(239,68,68,0.06)" : "var(--nv-color-surface-2)" }}>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}><Badge tone={c.severity==="high" ? "warning" : "neutral"}>{c.severity}</Badge><span style={{ fontWeight:700, fontSize:12 }}>{c.type} • {c.entity}</span><span style={{ marginLeft:"auto", fontSize:10, color:"var(--nv-color-text-faint)" }}>conf {c.confidence.toFixed(2)}</span></div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-muted)", marginTop:4 }}>{c.explanation}</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>{c.ranges.map(r=>`${msTc(r.start_ms)}–${msTc(r.end_ms)}`).join(" • ")}</div>
              <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>{c.suggested_actions.map(a => <Badge key={a} tone="neutral">{a}</Badge>)}</div>
            </div>
          ))}
        </Card>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>What Changed? <Badge tone="primary">Semantic diff</Badge></div>
          <div style={{ display:"flex", gap:6, marginTop:6, alignItems:"center" }}>
            <input className="nv-input" value={fromV} onChange={e=>setFromV(e.target.value)} style={{ fontSize:11 }} placeholder="from tl001:v27" />
            <span>→</span>
            <input className="nv-input" value={toV} onChange={e=>setToV(e.target.value)} style={{ fontSize:11 }} placeholder="to tl001:v31" />
            <Badge tone="neutral">{diff.duration_delta_ms>0?"+":""}{Math.round(diff.duration_delta_ms/1000)}s</Badge>
          </div>
          <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:6, fontSize:11 }}>
            {diff.changes.map((ch,i) => <div key={i} style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)" }}><strong>{ch.type}</strong> {ch.range_from ? `${msTc(ch.range_from.start_ms)}–${msTc(ch.range_from.end_ms)}` : ""} {ch.semantic_reason ? `• ${ch.semantic_reason}` : ""} {ch.narrative_effect ? `• ${ch.narrative_effect}` : ""}</div>)}
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{Object.entries(diff.narrative_delta).map(([k,v])=> <Badge key={k} tone={Number(v)>0 ? "success" : "neutral"}>{k} {Number(v)>0?"+":""}{v.toFixed(2)}</Badge>)}</div>
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Links back to exact affected ranges and underlying timeline events.</div>
        </Card>
      </div>

      {/* Review-aware + Agent + APIs */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Review-Aware Timeline — comment moves with semantic object</div>
          {reviews.map(c => (
            <div key={c.comment_id} style={{ marginTop:8, border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, background: c.status==="orphaned" ? "rgba(239,68,68,0.06)" : "var(--nv-color-surface-2)" }}>
              <div style={{ display:"flex", gap:6 }}><Badge tone={c.status==="open" ? "warning" : c.status==="orphaned" ? "warning" : "success"}>{c.status}</Badge><span style={{ fontWeight:700, fontSize:12 }}>{c.target.entity ?? c.target.type} • {c.target.claim_text?.slice(0,32)}</span><span style={{ marginLeft:"auto", fontSize:10, color:"var(--nv-color-text-faint)" }}>{msTc(c.range.start_ms)} • {c.reviewer}</span></div>
              <div style={{ fontSize:11, marginTop:4 }}>{c.content}</div>
              {c.status==="orphaned" && <div style={{ fontSize:10, color:"#ef4444", marginTop:4 }}>Orphaned: target removed — explains why (semantic span deleted)</div>}
            </div>
          ))}
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Targets: word, sentence, speaker, object, face, scene, narrative stage, claim, version diff, suggestion — moves with clip, or orphaned + explained.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Semantic Editing APIs & Storage</div>
          <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222", lineHeight:1.5, marginTop:6 }}>
            <div>POST /v1/video-projects/{`{projectId}`}/semantic-search • POST /v1/timelines/{`{timelineId}`}/branches • GET /v1/timelines/{`{timelineId}`}/diff?from=v27&to=v31&detail=semantic • POST /v1/timelines/{`{timelineId}`}/semantic-edits</div>
            <div style={{ marginTop:6 }}>Indexes: full-text (transcripts) • vector ANN (visual/audio/multimodal) • temporal interval • entity • geospatial • graph • version • review • narrative • provenance • semantic_span_index_key {`{tenant,project,timeline,start_ms,end_ms,entity_ids,scene_id,narrative_role}`}</div>
          </div>
          <div style={{ marginTop:6, fontSize:11, display:"flex", flexDirection:"column", gap:4 }}>
            <span><strong>Confidence + human control:</strong> every inference: model version, confidence, evidence type, range, correction state, verification time, edit/approval required — high-impact (face/voice/legal claims/narrative/consent/publication) requires confirmation</span>
            <span style={{ color:"var(--nv-color-text-faint)", fontSize:10 }}>Coherent experience: search “strongest customer proof” → semantic matches + thumbnails → highlighted lanes → “Create 90-second proof cut” → non-destructive branch with flags → version panel “what changed” → provenance panel lineage</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
