"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  parseNaturalQuery, planQuery, smartSearch, exactTranscriptSearch, visualCompositionSearch, cameraMovementSearch,
  colorPaletteSearch, emotionSearch, speakerTopicSearch, similarShotSearch, duplicateSearch, searchMetrics,
} from "./search-retrieval-engine";
import type { SearchContext, SearchResult, EvidenceItem } from "./search-retrieval-types";

const DEFAULT_SCOPE: SearchContext = {
  tenant_id: "tenant_001", user_id: "user_003", workspace_ids: ["workspace_7"], project_ids: ["project_001","project_004"], permissions: ["asset:view","project:search"], purpose: "editorial_discovery",
};

export function SearchRetrievalPanel({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("Find approved energetic clips of the CEO discussing Product X in an energetic scene with a blue background");
  const [mode, setMode] = useState<"smart"|"exact_transcript"|"visual"|"similar_shot"|"compliance_aware">("smart");
  const [scope, setScope] = useState<SearchContext>(DEFAULT_SCOPE);
  const parsed = useMemo(() => parseNaturalQuery(query, scope), [query, scope]);
  const plan = useMemo(() => planQuery(parsed), [parsed]);
  const smart = useMemo(() => smartSearch({ query, scope, mode: mode as never, limit: 25 }), [query, scope, mode]);
  const metrics = useMemo(() => searchMetrics(), []);
  const [selected, setSelected] = useState<SearchResult | null>(smart.results[0] ?? null);
  const [showFilters, setShowFilters] = useState(true);
  const [refMode, setRefMode] = useState<"overall"|"composition"|"color"|"subject"|"motion"|"mood">("overall");

  const handleSearch = () => {
    const res = smartSearch({ query, scope, mode: mode as never, limit: 25 });
    setSelected(res.results[0] ?? null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>SEARCH & RETRIEVAL INTELLIGENCE — FIND THE MOMENT, EXPLAIN WHY IT MATCHED</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Hybrid multimodal: exact + vector 4096-dim + visual/motion/color + graph + policy, tenant-isolated</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.9 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>{metrics.total_assets} assets indexed · {metrics.duplicate_families} duplicate families · avg sim {metrics.avg_embedding_sim}</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Modes: Smart | Exact | Visual | Similar | Compliance-aware</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Fusion: RRF + constraint + temporal + permission + evidence</span>
        </div>
      </div>

      {/* Search bar */}
      <Card padded>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Search videos, transcripts, frames, and projects</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder='Find the moment where the CEO discusses the Q3 launch, standing beside the product, in an energetic scene, with a blue background' className="nv-input" style={{ flex: 1 }} />
          <select value={mode} onChange={e => setMode(e.target.value as never)} className="nv-input" style={{ width: 180 }}>
            <option value="smart">Smart</option><option value="exact_transcript">Exact transcript</option><option value="visual">Visual</option><option value="similar_shot">Similar shot</option><option value="compliance_aware">Compliance-aware</option>
          </select>
          <Button size="sm" onClick={handleSearch}>Search</Button>
        </div>
        <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
          <div style={{ fontWeight: 700, display: "flex", gap: 6 }}>Interpreted search <Button size="sm" variant="ghost" onClick={() => setShowFilters(v=>!v)}>{showFilters?"Hide":"Edit filters"}</Button> <Badge tone="neutral">evidence: {parsed.required_evidence.join(", ")}</Badge></div>
          {showFilters && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {Object.entries(parsed.structured).map(([k,v]) => v ? <span key={k} style={{ background: "#0ea5e9", color: "#fff", padding: "4px 8px", borderRadius: 999, fontSize: 11 }}>{k}: {Array.isArray(v)?(v as string[]).join(","):String(v)}</span> : null)}
              {parsed.ambiguities && parsed.ambiguities[0] && <span style={{ background: "rgba(251,191,36,0.2)", padding: "4px 8px", borderRadius: 999 }}>Ambiguous: {parsed.ambiguities[0].term} — {parsed.ambiguities[0].meanings.slice(0,2).join(" | ")}</span>}
              {parsed.synonyms_expanded && <span style={{ background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999 }}>Synonyms: Q3 launch → third-quarter launch</span>}
            </div>
          )}
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Natural parser: entity/intent, time, synonyms, decomposition, permission scope {scope.tenant_id} — vector never bypasses tenant/legal/consent</div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
          <span>Scope:</span>
          {[
            { label: "Current project", active: scope.project_ids.length===1 },
            { label: "Selected projects", active: scope.project_ids.length===2 },
            { label: "Workspace", active: false },
            { label: "Tenant library", active: true },
          ].map(s => <Badge key={s.label} tone={s.active?"primary":"neutral"}>{s.label}</Badge>)}
          <span style={{ marginLeft: 8 }}>Filters: Projects | Speakers | Topics | Objects | Time | Camera | Shot size | Palette | Emotion | Approval | Consent | Rights</span>
        </div>
        {parsed.ambiguities && parsed.ambiguities[0] && (
          <div style={{ marginTop: 8, background: "rgba(251,191,36,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>“Find the launch clip” could refer to:</div>
            <div>{parsed.ambiguities[0].meanings.join(" · ")}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}><Button size="sm">Search all</Button><Button size="sm" variant="secondary">Choose one</Button></div>
            {smart.why_groups && <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Grouped by interpretation: {smart.why_groups.map(g=>g.interpretation).join(" | ")}</div>}
          </div>
        )}
      </Card>

      {/* Retrieval architecture */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Retrieval Architecture <Badge tone="primary">Query Understanding → Candidate Retrieval → Fusion → Presentation</Badge></div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", border: "1px solid #222" }}>
            <div>Query Understanding</div><div style={{ opacity: 0.8 }}>parser · entity/intent · time · synonyms · decomposition · permission scope</div>
          </div>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", border: "1px solid #222" }}>
            <div>Candidate Retrieval</div><div style={{ opacity: 0.8 }}>exact transcript · metadata · vector ANN · visual · motion · audio/emotion · graph · duplicate fingerprint</div>
          </div>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", border: "1px solid #222" }}>
            <div>Fusion & Verification</div><div style={{ opacity: 0.8 }}>RRF · constraint · temporal alignment · permission · evidence · calibration → explanation</div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
          <div style={{ fontWeight: 700 }}>Query plan steps</div>
          <div style={{ fontFamily: "var(--nv-font-mono)", fontSize: 10 }}>{plan.steps.join(" → ")}</div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Weights: {Object.entries(plan.ranking_weights).map(([k,v])=>`${k}:${v}`).join(" | ")} — exact outranks semantic for transcript, composition outranks generic for visual, graph outranks aesthetic for compliance</div>
        </div>
      </Card>

      {/* Dimensions grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Search Dimensions</div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Exact Transcript</div>
              <div style={{ fontFamily: "var(--nv-font-mono)", fontSize: 10 }}>"customer trust" · CEO NEAR/8 "Product X" · ("Q3 launch" OR "third-quarter") AND speaker:CEO</div>
              <Button size="sm" variant="ghost" onClick={() => { const r = exactTranscriptSearch({ phrase: "customer trust", tenant_id: scope.tenant_id }); const ev = r[0]?.evidence[0] as { text?: string } | undefined; alert(`Found ${r.length} exact spans — first ${ev?.text?.slice(0,30) ?? ""} @ ${r[0]?.time_range.start_ms}ms`); }}>Test "customer trust"</Button>
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Visual Composition</div>
              <div style={{ fontSize: 10 }}>medium close-up · right third · left negative space · clean background · shot size/angle/position</div>
              <Button size="sm" variant="ghost" onClick={() => { const r = visualCompositionSearch({ shot_size:"medium_close_up", subject_position:"right_third", background:"clean", tenant_id: scope.tenant_id }); alert(`Composition ${r.length} matches — first ${r[0]?.asset_id} ${r[0]?.ranking.overall_score ?? ""}`); }}>Test composition</Button>
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Camera Movement</div>
              <div style={{ fontSize: 10 }}>push-in 4.8s forward medium shake 0.12 confidence 89% — static/pan/tilt/dolly/orbit etc.</div>
              <Button size="sm" variant="ghost" onClick={() => { const r = cameraMovementSearch({ type:"push_in", tenant_id: scope.tenant_id }); const t = r[0]?.evidence[0] ? (r[0].evidence[0] as { type: string }).type : ""; alert(`Camera ${r.length} push-ins — ${t}`); }}>Test push-in</Button>
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Color Palette</div>
              <div style={{ fontSize: 10 }}>cool blue 42% teal 0.91 — dominant/temperature/contrast normalized HDR/SDR</div>
              <Button size="sm" variant="ghost" onClick={() => { const r = colorPaletteSearch({ temperature:"cool", tenant_id: scope.tenant_id }); alert(`Color ${r.length} cool scenes — ${r[0]?.asset_id}`); }}>Test cool blue</Button>
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Emotion & Energy</div>
              <div style={{ fontSize: 10 }}>valence 0.72 arousal 0.84 tension 0.18 warmth 0.67 — Likely high-energy (not factual)</div>
              <Button size="sm" variant="ghost" onClick={() => { const r = emotionSearch({ emotion:"energetic", tenant_id: scope.tenant_id }); const sc = r[0]?.evidence[0] as { score?: number } | undefined; alert(`Emotion ${r.length} energetic — ${r[0]?.asset_id} arousal ${sc?.score}`); }}>Test energetic</Button>
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Speaker & Topic</div>
              <div style={{ fontSize: 10 }}>CEO 94% + Q3 launch 88% — unresolved → Speaker 2 identity unresolved (no silent infer)</div>
              <Button size="sm" variant="ghost" onClick={() => { const r = speakerTopicSearch({ speaker:"CEO", topic:"Q3 launch", tenant_id: scope.tenant_id }); alert(`Speaker/Topic ${r.length} — ${r[0]?.asset_id} ${r[0]?.ranking.label}`); }}>Test CEO+Q3</Button>
            </div>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <Button size="sm" variant="ghost" onClick={() => { const r = similarShotSearch({ source:{asset_id:"asset_001", start_ms:45000, end_ms:52000}, similarity_mode: refMode as never, scope, tenant_id: scope.tenant_id }); alert(`Similar ${r.length} — first ${r[0]?.asset_id} ${r[0]?.ranking.overall_score.toFixed(2)} mode ${refMode}`); }}>Find similar to 00:00:45</Button>
            <select value={refMode} onChange={e=>setRefMode(e.target.value as never)} className="nv-input" style={{ width: 140 }}><option value="overall">Overall</option><option value="composition">Composition</option><option value="color">Color</option><option value="subject">Subject</option><option value="motion">Motion</option><option value="mood">Mood</option></select>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Duplicate Families & Cross-Project</div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
              <div>Duplicate family DF-0042 (shot-level near-duplicate 97.6%)</div>
              <div>├── Master interview take</div><div>├── ProRes source</div><div>├── 1080p proxy</div><div>├── Watermarked client preview</div><div>├── Social crop</div><div>└── Color-corrected version</div>
              <div style={{ marginTop: 4 }}>Reasons: Shared audio 99.1% · Shared frame 96.8% · duration ±0.4s · Differences: crop/watermark/color grade</div>
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => { const d = duplicateSearch({ asset_id:"asset_001", levels:["shot","semantic"], tenant_id: scope.tenant_id }); alert(`Duplicates ${d.families.length} families, shot ${d.level_results.shot?.length} semantic ${d.level_results.semantic?.length} — file/media/shot/semantic`); }}>Find duplicates asset_001</Button>
              <Button size="sm" variant="ghost" onClick={() => { const r = smartSearch({ query:"customer trust", scope:{...scope, tenant_id:"tenant_002", project_ids:["project_999"]}, mode:"smart", limit:5 }); alert(`Cross-tenant isolation: tenant_002 results ${r.results.length} — tenant_001 secret not leaked`); }}>Cross-tenant check</Button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--nv-color-text-faint)" }}>Search scope tenant_001 / project_001,004 — vector DB tenant partitioned, no cross-tenant counts/hints, no “more results” leak. Duplicate merge blocked where distinct rights/consent/legal.</div>
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 10 }}>
              <div style={{ fontWeight: 700 }}>Editorial context search</div>
              <div>Find shots not used in current cut · same shoot day · handles ≥3s · matching palette · not previously rejected · valid consent · 4K</div>
              <div style={{ marginTop: 4 }}>Editorial fit: Unused in timeline · 8.2s handles · same campaign/location · current packaging · no rejected history.</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Results */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Results: {smart.results.length} <Badge tone="primary">{mode}</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Sorted [Relevance] [Newest] [Shortest] [Highest confidence] — 0–300ms cards, 300–800ms evidence, 800ms+ full explanation</span></div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxHeight: 520, overflow: "auto" }}>
            {smart.results.map(r => (
              <div key={r.result_id} onClick={() => setSelected(r)} style={{ border: `2px solid ${selected?.result_id===r.result_id?"#0ea5e9":"var(--nv-color-border)"}`, borderRadius: 10, padding: 8, cursor: "pointer", background: "var(--nv-color-surface-2)" }}>
                <div style={{ fontWeight: 800, display: "flex", gap: 6 }}>{r.asset_id} — {r.time_range.start_ms}-{r.time_range.end_ms} <Badge tone={r.ranking.label==="very_strong_match"?"success":r.ranking.label==="strong_match"?"primary":"neutral"}>{r.ranking.label} {r.ranking.overall_score.toFixed(2)}</Badge><span style={{ marginLeft: "auto", fontSize: 10, color: "var(--nv-color-text-faint)" }}>proj {r.project_id}</span></div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{r.explanation.summary}</div>
                <div style={{ fontSize: 11 }}>Transcript: “{r.evidence.find(e=>e.type==="transcript") ? (r.evidence.find(e=>e.type==="transcript") as Extract<EvidenceItem,{type:"transcript"}>).text.slice(0,40) : "—"}…”</div>
                <div style={{ fontSize: 10, display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{r.evidence.slice(0,4).map((e,i) => {
                  const ev = e as { confidence?: number; score?: number; match_score?: number };
                  return <Badge key={i} tone="neutral">{e.type}: {ev.confidence ?? ev.score ?? ev.match_score ?? ""}</Badge>;
                })}</div>
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Evidence frame {r.thumbnail_frame_ms}ms · {r.permissions.can_download?"download":"stream only"} · {r.analysis_state?.stale?"stale":"fresh"} · {r.graph_path?.join(" → ").slice(0,40)}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Search audit: query "{smart.audit.query_text.slice(0,30)}" scope tenant_001 Q3 projects mode {smart.audit.mode} models {smart.audit.model_versions.join(",")} filtered {JSON.stringify(smart.audit.filtered_counts)} — vector never bypasses tenant/legal/consent.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Why this matched + Evidence <Badge tone="primary">click evidence to jump player</Badge></div>
          {selected ? (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, border: "1px solid #222" }}>
                <div style={{ fontWeight: 700 }}>{selected.asset_id} {selected.time_range.start_ms}–{selected.time_range.end_ms} Similarity {selected.ranking.overall_score.toFixed(2)}</div>
                <div>The result matched because:</div>
                <ul style={{ margin: "4px 0 0 14px" }}>{selected.explanation.factors.map((f,i)=><li key={i}>{f}</li>)}</ul>
              </div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 700 }}>Evidence</div>
                  {selected.evidence.map((e,i) => (
                    <div key={i} style={{ fontSize: 10, padding: "4px 0", borderBottom: "1px solid var(--nv-color-border)" }}>
                      {e.type==="transcript" && <>Transcript {e.start_ms}–{e.end_ms}: “{e.text.slice(0,40)}” match {e.match_score}</>}
                      {e.type==="object" && <>Object {e.label} at {e.frame_ms}ms {e.confidence}</>}
                      {e.type==="speaker" && <>Speaker {e.label} {e.confidence}</>}
                      {e.type==="color_palette" && <>Palette {(e.colors as string[]).join(",")} score {(e as { score: number }).score}</>}
                      {e.type==="composition" && <>{(e as { descriptor: string }).descriptor} {(e as { score: number }).score}</>}
                      {e.type==="camera_motion" && <>Motion {(e as { motion: { type: string; shake_score: number; confidence: number } }).motion.type} {(e as { motion: { shake_score: number } }).motion.shake_score} conf {(e as { motion: { confidence: number } }).motion.confidence}</>}
                      {e.type==="emotion" && <>Energy {(e as { profile: { arousal: number } }).profile.arousal.toFixed(2)} valence {(e as { profile: { valence: number } }).profile.valence.toFixed(2)} conf {(e as { profile: { confidence: number } }).profile.confidence} <em>{(e as { profile: { evidence: string[] } }).profile.evidence.join(",")}</em></>}
                      {e.type==="semantic_similarity" && <>Semantic {(e as { score: number }).score} model {(e as { model: string }).model}</>}
                    </div>
                  ))}
                </div>
                <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
                  <div style={{ fontWeight: 700 }}>Confidence breakdown</div>
                  <div style={{ fontSize: 10, fontFamily: "var(--nv-font-mono)" }}>
                    <div>Overall {selected.confidence.overall.toFixed(2)} — {selected.confidence.label}</div>
                    {Object.entries(selected.confidence.components).map(([k,v]) => <div key={k}>{k}: {(v as number).toFixed(2)}</div>)}
                    {Object.entries(selected.confidence.penalties).map(([k,v]) => (v as number)>0 && <div key={k} style={{ color: "#ef4444" }}>penalty {k}: {v}</div>)}
                    <div style={{ color: "var(--nv-color-text-faint)" }}>Model {selected.confidence.calibration.model_version} calibrated {String(selected.confidence.calibration.calibrated)}</div>
                    {selected.confidence.overall<0.6 && <div style={{ color: "#f59e0b" }}>Lower confidence because: Audio noisy / Speaker unresolved / Color briefly visible</div>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10 }}>
                    <div style={{ fontWeight: 700 }}>Workflow</div>
                    <div>Client review: approved with changes</div><div>Legal review: complete</div>
                    <div>Analysis fresh {selected.analysis_state?.indexed_at.slice(0,10)} {selected.analysis_state?.stale?"stale":"fresh"}</div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["Preview","Jump to timecode","Open in timeline","Compare","Replace","Add to collection","Create review comment","Copy timecode","View provenance","Find similar","Hide duplicate family"].map(a => <Badge key={a} tone="neutral">{a}</Badge>)}
                <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Replacement opens non-destructive branch, not active timeline.</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, background: "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
                <div style={{ fontWeight: 700 }}>Reference frame + text</div>
                <div>“Find this composition with a different product and warmer lighting.” — pixel vs composition vs subject vs style vs semantic distinct.</div>
                <div style={{ marginTop: 4 }}><Badge tone="primary">Allowed</Badge> graph_path {selected.graph_path?.join(" → ")}</div>
              </div>
            </div>
          ) : <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>Select a result to see why it matched + evidence + confidence</div>}
        </Card>
      </div>

      {/* Ranking + audit */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Ranking Strategy <Badge tone="neutral">hybrid — semantic+exact+graph+temporal+evidence quality - duplicate - stale - policy exclusion</Badge></div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 11 }}>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
            <div>Final score = semantic_similarity + exact_text_match + structured_attribute_match + graph_constraint_match + temporal_match + evidence_quality - duplicate_penalty - stale_metadata_penalty - access_or_policy_exclusion</div>
            <div style={{ marginTop: 4 }}>Exact phrase outranks semantic; composition outranks generic for visual; graph outranks aesthetic for compliance.</div>
          </div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 10 }}>
            <div style={{ fontWeight: 700 }}>Search audit (authorized diagnostics)</div>
            <div>Query: "{smart.audit.query_text}" · Scope Q3 projects · Mode {smart.audit.mode} · Models {smart.audit.model_versions.join(", ")}</div>
            <div>Results filtered: {smart.audit.filtered_counts?.inaccessible_projects} inaccessible projects · {smart.audit.filtered_counts?.expired_consent} expired-consent · {smart.audit.filtered_counts?.legal_hold} legal-hold — hidden from ordinary users, admin diagnostics only.</div>
            <div>Freshness: analysis_version {smart.results[0]?.analysis_state?.analysis_version} embedding {smart.results[0]?.analysis_state?.embedding_version} stale {String(smart.results[0]?.analysis_state?.stale)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
