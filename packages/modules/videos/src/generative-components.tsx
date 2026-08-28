"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createTextToVideoJob, listJobs, getJob, createImageToVideoJob, createObjectRemovalOp, checkBackgroundExtension,
  generateCameraVariations, createProductAnchor, createCharacterAnchor, checkAnchorCompliance, createStoryboardCards,
  createContinuationJob, suggestBroll, getProvenance, getSegmentProvenance, getPromptHistory, checkUsage, createConsent, revokeConsent,
  runSafetyChecks, complianceReport, approveAsset, getApproval, processingRoute, listAssets, listAnchors,
} from "./generative-engine";

export function GenerativePanel({ projectId }: { projectId: string }) {
  const [jobs, setJobs] = useState(() => listJobs());
  const [prompt, setPrompt] = useState("A close product shot on a studio table with warm lighting, slow lateral camera move");
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const assets = useMemo(() => listAssets(), [jobs]);
  const anchors = useMemo(() => listAnchors(), [jobs]);
  const report = useMemo(() => complianceReport("tl001"), [jobs]);

  const runTextToVideo = () => {
    const j = createTextToVideoJob({ prompt, duration_ms: 5000, seed: 841992, model_id: "n0va-video-gen-pro" });
    setJobs([...listJobs()]);
    setSelectedAsset(j.output_asset_id ?? null);
  };
  const checkAnchor = () => {
    const pa = createProductAnchor();
    const res = checkAnchorCompliance(jobs[0]?.output_asset_id ?? "gen_01", pa.anchor_id);
    alert(`Anchor ${res.anchor_id} passed:${res.passed} warnings:${res.warnings.join(",")||"none"} confidence:${res.confidence}`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — workspace separation */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>CONTROLLED GENERATIVE WORKSPACE — HARD SEPARATION</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Originals (immutable Original) → Generated Workspace (Generated) → Editorial Derivatives → Deliverables</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Originals immutable, visually marked</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Generated marked at ingestion, even before timeline use</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Track V1 Original V3 Generated — badges [GEN][ASSIST][EXT][FILL]</span>
        </div>
      </div>

      {/* Domains */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {[
          ["ORIGINALS", "Camera originals, production audio, reference images", "#22c55e"],
          ["GENERATED WORKSPACE", "Prompts, seeds, masks, temp renders, rejected", "#f59e0b"],
          ["EDITORIAL DERIVATIVES", "Approved shots, composites, intermediates", "#0ea5e9"],
          ["DELIVERABLES", "Review/broadcast/social masters", "#a855f7"],
        ].map(([title, desc, col]) => (
          <Card key={title as string} padded>
            <div style={{ fontWeight: 800, fontSize: 12, color: col as string }}>{title as string}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 4 }}>{desc as string}</div>
            <div style={{ marginTop: 6 }}><Badge tone="neutral">{assets.filter(a=>a.domain===(title as string)).length || (title==="ORIGINALS"?2:jobs.length)} assets</Badge></div>
          </Card>
        ))}
      </div>

      {/* Generation modes */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Text-to-Video — reproducible job <Badge tone="primary">seed 841992 locked</Badge></div>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} style={{ width: "100%", marginTop: 8 }} className="nv-input" />
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Negative: warped logo, unreadable text, extra objects • 5000ms 24fps 1920x1080 16:9 guidance 7.5 policy commercial_brand_safe • reference_assets: product_anchor_nova_phone_01 • brand constraints</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}><Button size="sm" onClick={runTextToVideo}>Generate 3 variations (batch)</Button><Button size="sm" variant="secondary" onClick={checkAnchor}>Check anchor compliance</Button></div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflow: "auto" }}>
            {jobs.slice(0,3).map(j=>(
              <div key={j.job_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11 }}>
                <div style={{ display:"flex", gap:6 }}><Badge tone="primary">{j.generation_job.model_id} {j.generation_job.model_version}</Badge><span style={{ fontFamily:"var(--nv-font-mono)" }}>{j.job_id.slice(0,8)} seed {j.generation_job.seed}</span><Badge tone={j.status==="generated"?"success":"neutral"}>{j.status}</Badge></div>
                <div style={{ marginTop:4, fontFamily:"var(--nv-font-mono)", fontSize:10 }}>{JSON.stringify(j.generation_job).slice(0,120)}…</div>
                <div>Output {j.output_asset_id?.slice(0,8)} hash {j.output_hash?.slice(0,16)}… immutable on approval</div>
              </div>
            ))}
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Image-to-Video & Fill & Extension</div>
          <div style={{ fontSize: 11, color:"var(--nv-color-text-muted)", marginTop:4 }}>Start/end-frame, parallax, depth-aware • Mask frame-accurate + feather + tracking 0.92 stabilized • Background extension perspective-aware</div>
          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
            <Button size="sm" variant="ghost" onClick={()=>{ const r=createImageToVideoJob(assets[1]?.asset_id ?? "asset_001","start_frame"); alert(r.control_map); }}>Image→Video control map</Button>
            <Button size="sm" variant="ghost" onClick={()=>{ const op=createObjectRemovalOp({source_asset_id:"asset_004", range:{start_ms:1200,end_ms:4800}}); alert(`${op.type} mask ${op.mask_id} preserve ${op.preserve.join(",")}`); }}>Object removal mask</Button>
            <Button size="sm" variant="ghost" onClick={()=>{ const w=checkBackgroundExtension({type:"horizontal"}); alert(w.warnings.join(",")||"no warnings"); }}>Check extension</Button>
          </div>
          <div style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222" }}>
            {JSON.stringify({ generative_operation:{ type:"object_removal", source_asset_id:"asset_004", range:{start_ms:1200,end_ms:4800}, mask_id:"mask_009", target_description:"remove microphone stand", preserve:["cast shadow","table reflection"], model_id:"n0va-inpaint-v2", output_mode:"new_derived_asset"} }, null, 2)}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Original frame recoverable at every stage — before/after comparison available.</div>
        </Card>
      </div>

      {/* Camera variations + anchors */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Camera & Lighting Variations <Badge tone="primary">3/3 shown</Badge></div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginTop:8 }}>
            {generateCameraVariations(jobs[0]?.output_asset_id ?? "gen_01",3).map((v,i)=>(
              <div key={i} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11 }}>
                <div style={{ fontWeight:700 }}>{v.framing} {v.movement}</div>
                <div>{v.position} focal {v.focal_length_sim}mm {v.dof}</div>
                <div>lighting {v.lighting} tod {v.tod}</div>
                <Badge tone={v.generation_method==="camera_simulation"?"success":"neutral"}>{v.generation_method}</Badge>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Simulated vs image-space vs depth-aware vs synthetic regeneration — simulated preserves more source.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Anchors — Product & Character <Badge tone="warning">consent required</Badge></div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-muted)", marginTop:4 }}>Product anchor preserves logo/buttons/color/screen UI; Character anchor stores face/body/wardrobe + consent + prohibited transforms</div>
          <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222", marginTop:8 }}>
            {JSON.stringify({ product_anchor:{ anchor_id:"product_nova_phone_01", approved_assets:["asset_front_hero"], constraints:{ preserve_logo:true, preserve_color:true }, usage_policy:{ commercial:true, territories:["worldwide"], expires_at:"2027-12-31"} } }, null, 2)}
          </div>
          <div style={{ marginTop:8, display:"flex", gap:6 }}><Button size="sm" variant="ghost" onClick={()=>{ const r=checkAnchorCompliance(jobs[0]?.output_asset_id ?? "gen_01","product_nova_phone_01"); alert(`warnings:${r.warnings.length} ${r.warnings.join(",")}`); }}>Auto-compare vs anchor</Button><Badge tone="neutral">Territories worldwide expires 2027-12-31</Badge></div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Warnings: logo deformation, wrong color, missing controls, extra fingers, face drift — issued with confidence 0.92.</div>
        </Card>
      </div>

      {/* Storyboard + B-roll + continuation */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Storyboard → Animatic</div>
          <div style={{ display:"flex", gap:6, marginTop:8, overflowX:"auto" }}>
            {createStoryboardCards(["Designed for creators","Place product on table","Reveal hinge"]).map((c,i)=>(
              <div key={i} style={{ minWidth:160, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11 }}>
                <div style={{ fontWeight:700 }}>{c.scene} {c.shot}</div>
                <div>{c.duration_ms}ms {c.framing} {c.camera}</div>
                <div style={{ color:"var(--nv-color-text-muted)" }}>{c.action}</div>
                <div>Dialogue “{c.dialogue}”</div>
                <Badge tone={c.generation_status==="exploratory"?"warning":"success"}>{c.generation_status}</Badge>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Script import → shot list → frames (manual or generated) → camera plan → animatic → version comparison. Generated frames not final unless promoted.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Shot Continuation & Synthetic B-roll <Badge tone="primary">continuity warnings not silent</Badge></div>
          <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, fontSize:11, border:"1px solid var(--nv-color-border)", marginTop:8 }}>
            <div>Continuation: {JSON.stringify(createContinuationJob({source_clip_id:"clip_021", extend_by_ms:2400})).slice(0,90)}…</div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
              {suggestBroll({ product_anchor:"product_nova_phone_01"}).map((b,i)=>(
                <span key={i} style={{ background:"#0f0f12", color:"#e2e8f0", padding:"4px 8px", borderRadius:999, fontSize:11, border:"1px solid #222" }}>{b.concept} {b.duration_ms}ms anchor {b.product_anchor} conf {b.continuity_confidence} risk {b.brand_risk}</span>
              ))}
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Proposed as branch/overlay, never auto-inserted • Purpose: cover jump cut @00:01:14.200</div>
          </div>
        </Card>
      </div>

      {/* Review grid + provenance */}
      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Review Grid <Badge tone="primary">contact sheet + A/B + flicker</Badge></div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginTop:8 }}>
            {[0,1,2].map(i=>(
              <div key={i} style={{ background:"#0f0f12", borderRadius:8, padding:6, border:"1px solid #222", textAlign:"center" }}>
                <div style={{ height:70, background:`linear-gradient(135deg,#${(i*40+80).toString(16)}a${(i*30+90).toString(16)}ff,#222)`, borderRadius:6 }} />
                <div style={{ fontSize:10, marginTop:4 }}>Variation {i+1} • anchor 3/3 logo 3/3 temporal 0.9{i+2}</div>
                <Badge tone={i===0?"success":"neutral"}>{["Draft","Generated","Needs review"][i] as string}</Badge>
              </div>
            ))}
          </div>
          <div style={{ fontSize:11, marginTop:8, display:"flex", gap:4, flexWrap:"wrap" }}>
            {["Draft","Generated","Needs review","Approved for editorial","Approved for client","Approved for delivery","Restricted","Rejected","Archived","Revoked"].map(s=><Badge key={s} tone="neutral">{s}</Badge>)}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Source vs generated, overlay diff, wipe, anchor compliance, prompt/model/license panels, approval controls</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Provenance — machine + visible + segment</div>
          <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:10, border:"1px solid #222", marginTop:8, maxHeight:160, overflow:"auto" }}>
            {selectedAsset && getProvenance(selectedAsset) ? <pre style={{ margin:0 }}>{JSON.stringify(getProvenance(selectedAsset), null, 2).slice(0,600)}…</pre> : <span style={{ color:"#666" }}>Select a generated asset (above) to view signed manifest — prompt_hash, seed 841992, model_digest, source_assets, operations, human_actions, usage territories worldwide</span>}
          </div>
          <div style={{ marginTop:8, fontSize:11 }}><Badge tone="warning">AI-GENERATED</Badge> <Badge tone="neutral">timeline badge</Badge> <Badge tone="neutral">corner label</Badge> <Badge tone="neutral">review watermark DRAFT — SYNTHETIC MEDIA</Badge></div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Policy-controlled disclosure never removed by trim/color-correct/export. Segment provenance: tl001 original 0-12400 ai_assisted 12400-15800 ai_generated 15800-21100</div>
          <div style={{ marginTop:8, display:"flex", gap:6 }}>
            <Button size="sm" variant="ghost" onClick={()=>{ if(selectedAsset) { const p=getProvenance(selectedAsset); alert(p? `manifest ${p.integrity.manifest_hash.slice(0,16)}…`:"no provenance"); }}}>View manifest</Button>
            <Button size="sm" variant="ghost" onClick={()=>{ const seg=getSegmentProvenance("tl001"); alert(seg? JSON.stringify(seg.segments).slice(0,120):"no segments"); }}>Segment map</Button>
          </div>
        </Card>
      </div>

      {/* Restrictions + model registry + on-prem */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Usage Restrictions & Consent <Badge tone="warning">blocked before publish</Badge></div>
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            <Button size="sm" onClick={()=>{ const r=checkUsage(jobs[0]?.output_asset_id ?? "gen_01","publish"); alert(`result:${r.result} reasons:${r.reasons.join(",")||"none"}`); }}>Check publish</Button>
            <Button size="sm" variant="ghost" onClick={()=>{ const c=createConsent({subject:"character_hero_01"}); alert(`consent ${c.consent_id} active`); }}>Create consent</Button>
            <Button size="sm" variant="ghost" onClick={()=>{ const cons=Array.from((createConsent({subject:"tmp"}) as unknown as Record<string, unknown>).keys as unknown as string[]); }}>Revoke demo</Button>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Inherited from source/talent/brand/model/territory/consent — evaluated at generate/insert/review/interchange/render/publish. Revocation marks assets restricted, blocks new generations, notifies owners, preserves audit.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Model Registry & On-Prem</div>
          <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, fontSize:11, border:"1px solid var(--nv-color-border)", marginTop:8 }}>
            <div>n0va-video-gen-pro 4.2.1 capabilities text_to_video/image_to_video/shot_continuation approved commercial_b_roll restricted political_advertising — no customer training, residency IN/US retention 30d</div>
            <div style={{ marginTop:6, fontFamily:"var(--nv-font-mono)", fontSize:10, background:"#0f0f12", color:"#a5b4fc", padding:6, borderRadius:6, border:"1px solid #222" }}>{JSON.stringify(processingRoute(true), null, 2)}</div>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Processing Studio GPU Mumbai cloud fallback disabled reference assets remain on-premise encrypted 90d training prohibited.</div>
        </Card>
      </div>

      {/* Timeline integration + compliance report */}
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Timeline — V1 Original V2 Inserts V3 Generated <Badge tone="primary">badges</Badge></div>
          <div style={{ marginTop:8, background:"#0f0f12", borderRadius:8, padding:10, border:"1px solid #222", display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}><span style={{ width:40, fontSize:10, fontWeight:800, color:"#22c55e" }}>V1</span><div style={{ flex:1, height:18, background:"rgba(34,197,94,0.15)", borderRadius:6, display:"flex", alignItems:"center", padding:"0 8px", fontSize:10, color:"#86efac" }}>Original picture — camera originals</div></div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}><span style={{ width:40, fontSize:10, fontWeight:800, color:"#f59e0b" }}>V3</span><div style={{ flex:1, height:18, background:"rgba(245,158,11,0.15)", borderRadius:6, display:"flex", alignItems:"center", padding:"0 8px", fontSize:10, color:"#fde68a" }}>[GEN] AI-generated • product anchor 3/3 • [EXT] synthetic extension</div></div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}><span style={{ width:40, fontSize:10, fontWeight:800, color:"#a855f7" }}>G1</span><div style={{ flex:1, height:18, background:"rgba(168,85,247,0.15)", borderRadius:6, display:"flex", alignItems:"center", padding:"0 8px", fontSize:10, color:"#e9d5ff" }}>Disclosure — AI-GENERATED badges, corner labels</div></div>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Filters: show generated/hide/undisclosed/restricted/missing provenance/model outputs — badges never hidden for approved deliverables.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Synthetic Media Compliance Report <Badge tone={report.export_status==="blocked"?"warning":"success"}>{report.export_status}</Badge></div>
          <div style={{ background: report.export_status==="blocked" ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11, marginTop:8 }}>
            <div>Segments: {report.total_segments} — fully {report.fully_generated} • assisted {report.ai_assisted} • fill {report.generative_fill}</div>
            <div>Provenance: {report.provenance.present}/{report.provenance.total} manifests, {report.provenance.output_hashes_verified} hashes verified, {report.provenance.visible_disclosures} disclosures</div>
            <div>Usage: territory {report.usage.territory_restriction} consent violations {report.usage.consent_violations} rights needed {report.usage.rights_confirmation_needed}</div>
            <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-muted)" }}>{report.issues.join(" • ")}</div>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Policies: Strict block if missing provenance/disclosure • Professional allow watermark internal • Exploratory DRAFT label • Legacy audited only.</div>
        </Card>
      </div>
    </div>
  );
}
