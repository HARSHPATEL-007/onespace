"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  getGraph, seedProvenanceDemo, merkleRoot, frameHashes, computeIntegrity,
  createGenerationRecord, createSegmentLineage, appendTimelineEvent, verifyProvenance, computeCompleteness, explainFrame,
} from "./provenance-engine";
import type { ProvenanceGraph } from "./provenance-types";

function Section({ title, badge, children, aside }: { title: string; badge?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return <Card padded>
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}><span style={{ fontWeight:800 }}>{title}</span>{badge && <Badge tone="primary">{badge}</Badge>}<span style={{ marginLeft:"auto" }}>{aside}</span></div>
    <div style={{ marginTop:8 }}>{children}</div>
  </Card>;
}

export function ProvenanceExplorer({ projectId }: { projectId: string }) {
  const [frame, setFrame] = useState<number>( (1*60+2)*24+14 ); // 01:02:14 @24fps ≈ 896...
  const [graph, setGraph] = useState<ProvenanceGraph | null>(null);
  const [verify, setVerify] = useState<ReturnType<typeof verifyProvenance> | null>(null);
  const [complete, setComplete] = useState<ReturnType<typeof computeCompleteness> | null>(null);
  const [selectedExport, setSelectedExport] = useState<string>("exp_044");

  useEffect(() => {
    seedProvenanceDemo(projectId, "tenant_001");
    const g = getGraph();
    setGraph(g);
    setVerify(verifyProvenance(selectedExport));
    setComplete(computeCompleteness(selectedExport));
  }, [projectId, selectedExport]);
  useEffect(() => {
    if (projectId) {
      setVerify(verifyProvenance(selectedExport));
      setComplete(computeCompleteness(selectedExport));
    }
  }, [selectedExport, projectId]);

  const exp = useMemo(() => explainFrame(frame, 24), [frame]);
  const g = graph;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      {/* Fabric header */}
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#0f1a2e 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>PROVENANCE FABRIC — APPEND-ONLY GRAPH • MERKLE INTEGRITY • C2PA • CONSENT-BOUND</div>
        <div style={{ fontSize:18, fontWeight:900, marginTop:4 }}>Every pixel traceable to authorized source + transformation</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11, fontFamily:"var(--nv-font-mono)", opacity:0.8 }}>
          {["Source Assets → Identity/Hashing → Provenance Graph → Segment Lineage → AI/Edit Records → Approval/Consent → Reproducible Render → C2PA Manifest → Signed Export → Delivery Ledger"].map(s => <span key={s} style={{ background:"rgba(255,255,255,0.08)", padding:"4px 8px", borderRadius:999 }}>{s}</span>)}
        </div>
        <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
          <Badge tone="success">Frame→Segment→Asset→Timeline→Export→Project Merkle</Badge>
          <Badge tone="primary">Raw vs Decoded hash distinction</Badge>
          <Badge tone="neutral">Append-only, hash-linked, signed</Badge>
        </div>
      </div>

      {/* Top: Graph overview + integrity */}
      <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12 }}>
        <Section title="Provenance Graph" badge={`${g ? g.entities.size + g.activities.size + g.agents.size : 0} nodes`}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, fontSize:11 }}>
            <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, textAlign:"center", border:"1px solid var(--nv-color-border)" }}><div style={{ fontWeight:800 }}>Entity</div><div>{g?.entities.size ?? 0} • camera, proxy, transcript, timeline, export, approval, consent</div></div>
            <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, textAlign:"center", border:"1px solid var(--nv-color-border)" }}><div style={{ fontWeight:800 }}>Activity</div><div>{g?.activities?.size ?? g?.edit_records.size ?? 0} • ingest/trim/grade/voice/dub/lip-sync/render/upload</div></div>
            <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, textAlign:"center", border:"1px solid var(--nv-color-border)" }}><div style={{ fontWeight:800 }}>Agent</div><div>{g?.agents?.size ?? 6} • human, N0VA agent, model, plugin, N0VA10, render worker</div></div>
            <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8, textAlign:"center", border:"1px solid var(--nv-color-border)" }}><div style={{ fontWeight:800 }}>Association</div><div>{g?.associations?.size ?? 0} • inputs/outputs/principal/model/prompt/policy/token/approval/consent</div></div>
          </div>
          <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
            <span style={{ background:"rgba(129,140,248,0.12)", border:"1px solid rgba(129,140,248,0.25)", padding:"4px 8px", borderRadius:999 }}>Entity → Activity → Agent → Association (W3C PROV)</span>
            <span style={{ background:"var(--nv-color-surface-2)", padding:"4px 8px", borderRadius:999, border:"1px solid var(--nv-color-border)" }}>Timeline as event stream: Root → Event 001..007 → hash-linked</span>
          </div>
          <div style={{ marginTop:8, height:120, background:"#0f0f12", borderRadius:8, border:"1px solid #222", display:"grid", placeItems:"center", color:"#a5b4fc", fontFamily:"var(--nv-font-mono)", fontSize:11, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", inset:10, display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, opacity:0.9 }}>
              {["A001\nasset","Proxy","tl_07\nv184","Gen\nvoice","Render\nn0va-render 8.4.0","Export\nexp_044"].map((n,i) => <div key={i} style={{ background: i===3 ? "rgba(129,140,248,0.18)" : "rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, display:"grid", placeItems:"center", padding:6, whiteSpace:"pre-wrap", textAlign:"center", fontSize:10 }}>{n}</div>)}
            </div>
            <div style={{ position:"absolute", top:"50%", left:10, right:10, height:2, background:"linear-gradient(90deg,transparent,#818cf8,transparent)", opacity:0.6 }} />
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Chain: original camera file (sha3-512) → proxy → transcription → timeline branch → AI voice (cons_01J) → approved timeline → reproducible render (locked recipe) → signed manifest (merkle:root) → youtube private draft (yt_abc123, reconciled)</div>
        </Section>
        <Section title="Merkle Integrity" badge="7 levels">
          <div style={{ fontFamily:"var(--nv-font-mono)", fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:10, borderRadius:8, border:"1px solid #222", lineHeight:1.5 }}>
            <div>Frame hash → Segment Merkle → Asset Merkle → Timeline version root → Export manifest root → Project provenance root</div>
            <div style={{ marginTop:6, color:"#fff" }}>Domains: raw bytes • decoded frames • audio samples • timeline instructions • metadata • region masks • render config • provenance records</div>
            <div style={{ marginTop:6 }}>File vs decoded distinction: same container can have different decoded frames/metadata/timeline — verified separately.</div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>
              {(() => {
                const integ = computeIntegrity({ fileBytesHash:"sha3-512:file_abc", decodedHashes: frameHashes(4,"demo"), audioHashes: frameHashes(2,"audio"), metadata:{ title:"Q3 Launch" }, timelineInstructions:{ ops:2 }, regionMasks:["mask://roi_01J"], renderConfig:{ codec:"HEVC" }});
                return Object.entries(integ).map(([k,v]) => <span key={k} style={{ background:"rgba(255,255,255,0.06)", padding:"2px 6px", borderRadius:6 }}>{k}: {String(v).slice(0,18)}…</span>);
              })()}
            </div>
          </div>
          <div style={{ marginTop:8, display:"flex", gap:6 }}>
            <Badge tone="success">Frame 1440-2160: segment lin_01J 00:01:00-00:01:30 verified</Badge>
            <Badge tone="neutral">Sparse exceptions + ROI masks for face/background</Badge>
          </div>
        </Section>
      </div>

      {/* Frame inspector */}
      <Section title={`Frame Inspector — “Why does this frame look this way?”`} badge="Frame → Segment → Asset → Timeline → Approval → Export">
        <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:10, alignItems:"center" }}>
          <div>
            <div style={{ fontSize:12, fontWeight:800 }}>Select frame</div>
            <input type="range" min={0} max={5000} value={frame} onChange={e=>setFrame(parseInt(e.target.value,10))} style={{ width:"100%" }} />
            <div style={{ fontFamily:"var(--nv-font-mono)", fontSize:11, color:"var(--nv-color-text-muted)" }}>Frame {frame} • {Math.floor(frame/24/60).toString().padStart(2,"0")}:{String(Math.floor((frame% (60*24))/24)).padStart(2,"0")}:{String(frame%24).padStart(2,"0")} @24fps</div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>
              <Button size="sm" onClick={()=>setFrame( (1*60+2)*24+14 )}>01:02:14 (demo)</Button>
              <Button size="sm" variant="secondary" onClick={()=>setFrame(4800)}>48 00 (bg replace)</Button>
            </div>
            <div style={{ marginTop:8, fontSize:11, display:"flex", gap:4, flexWrap:"wrap" }}>
              <Badge tone="neutral">Project</Badge><Badge tone="neutral">Timeline</Badge><Badge tone="primary">Segment</Badge><Badge tone="success">Frame ROI</Badge><Badge tone="neutral">Sample</Badge>
            </div>
            <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Segment-level default • frame ranges for contiguous ops • sparse exceptions • Merkle frame groups</div>
          </div>
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:10, padding:10, fontSize:12, lineHeight:1.5 }}>
            <div style={{ fontWeight:800 }}>{exp.frame}</div>
            <div style={{ marginTop:4 }}><strong>Source:</strong> {exp.source}</div>
            <div style={{ marginTop:4 }}><strong>Transformations:</strong><ul style={{ margin:"4px 0 0 18px" }}>{exp.transformations.map((t,i)=><li key={i}>{t}</li>)}</ul></div>
            <div><strong>Human decisions:</strong><ul style={{ margin:"4px 0 0 18px" }}>{exp.human_decisions.map((d,i)=><li key={i}>{d}</li>)}</ul></div>
            <div><strong>Consent:</strong> {exp.consent}</div>
            <div><strong>Export:</strong> {exp.export}</div>
          </div>
        </div>
      </Section>

      {/* AI + Edit records */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Section title="AI Generation Record" badge=" durable, encrypted prompts">
          <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:10, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:11, border:"1px solid #222", lineHeight:1.5 }}>
            <div>generation_id: gen_01J_voice_044 • output: asset_synthetic_044 • operation: voice_synthesis</div>
            <div>model: approved_provider/n0va-voice-v5 5.2.1 digest sha3-512:model… • inference: endpoint prod, safety strict</div>
            <div>prompt_record: system_prompt_hash sha3-512:system… • user_prompt_ciphertext encrypted:… (hash visible, redacted summary for verification) • policy voice-policy-v3</div>
            <div>params: seed 88211, temperature 0.4, language en-IN, resolution 1920x1080, frame_rate 24</div>
            <div>inputs: voice_consent_sample_12 (consented_reference) • consent cons_01J… • operator user_204 • agent agent.video.dubbing.v2 • token cap_01J…</div>
            <div>output_hash: sha3-512:output… • moderation passed • human review approved • disclosure synthetic_voice</div>
          </div>
          <div style={{ marginTop:6, fontSize:11, display:"flex", gap:6, flexWrap:"wrap" }}>
            <Badge tone="primary">Model/provider/version/digest</Badge><Badge tone="neutral">System+user prompt + negative</Badge><Badge tone="neutral">Seed/sampler/guidance</Badge><Badge tone="success">Consent-bound</Badge>
          </div>
        </Section>
        <Section title="Edit Operation Record" badge="typed, not generic updated">
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:10, fontSize:11, lineHeight:1.5 }}>
            <div>activity_id: act_01J… • operation: trim_and_color_grade • inputs: [asset_camera_a001, lut_brand_warm_04] → outputs: [timeline_branch_17]</div>
            <div>params: source_in_frame 1200, out 3420, exposure 0.12, contrast 1.05, lut_intensity 0.75</div>
            <div>operator: agent agent.video.colorist.v2 • human_originator user_204 • capability cap_01J… • reversible: true • rollback snap_01J…</div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>{["Structural","Visual","Audio","Synthetic","Identity","Metadata","Compliance","Distribution"].map(c => <Badge key={c} tone="neutral">{c}</Badge>)}</div>
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Every timeline transformation is typed — enables “what changed?” explanations and deterministic rollback.</div>
        </Section>
      </div>

      {/* Event-sourced timeline */}
      <Section title="Timeline as Event-Sourced System" badge="7 events, hash-linked, immutable">
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
          {[
            "Timeline Root",
            "001 Add source clip",
            "002 Trim clip",
            "003 Apply color grade",
            "004 Add generated voice",
            "005 Insert caption track",
            "006 Approve version",
            "007 Render export",
          ].map((label,i) => (
            <div key={label} style={{ minWidth:140, background: i===0 ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)", color: i===0 ? "#fff" : "inherit", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, textAlign:"center", fontSize:11, fontWeight: i===0 ? 800 : 600 }}>
              <div>{label}</div><div style={{ fontFamily:"var(--nv-font-mono)", fontSize:10, opacity:0.7, marginTop:4 }}>{i===0 ? "hash:root" : `tle_01J_${String(i).padStart(3,"0")} • seq ${i} • sig`}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:8, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:11, border:"1px solid #222" }}>
          {g?.timeline_events.slice(0,3).map(ev => <div key={ev.timeline_event_id}>{ev.sequence.toString().padStart(2,"0")} {ev.event_type} • actor {ev.actor} • principal {ev.human_principal} • parent {ev.parent_event_hash.slice(0,16)}… • result {ev.resulting_timeline_hash.slice(0,16)}… • snap {ev.snapshot_id}</div>)}
          <div>… {g?.timeline_events.length ?? 0} events • hash-linked to previous • ordered • snapshot checkpointed • enables exact reconstruction, branch compare, deterministic rollback, approval invalidation on history change</div>
        </div>
      </Section>

      {/* Render recipe + manifest */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Section title="Reproducible Render Recipe" badge="locked">
          <div style={{ background:"#0f0f12", color:"#a5b4fc", padding:10, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:11, border:"1px solid #222", lineHeight:1.5 }}>
            <div>recipe_01J… • timeline_hash sha3-512:timeline… • source_hashes [sha3-512:asset_01, …]</div>
            <div>engine n0va-render 8.4.0 (sha256:image…) • video HEVC Main10 3840x2160 59.94 ACES 1.3 HDR10+ • audio AAC 2ch 48kHz LUFS -14</div>
            <div>captions [sha3-512:captions_en] • watermark sha3-512:watermark… • reproducibility locked</div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>
              <Badge tone="success">Bit-identical</Badge><Badge tone="primary">Media-equivalent</Badge><Badge tone="neutral">Process reproducible</Badge>
            </div>
            <div style={{ marginTop:4, color:"var(--nv-color-text-faint)" }}>Locks: source hashes, proxy/original, resolution, codec, color/HDR, audio layout, captions, watermark, effects, model, hardware-independent settings, seeds, container, destination.</div>
          </div>
        </Section>
        <Section title="Tamper-Evident Export Manifest" badge="n0va-provenance-1.0, signed, replicated">
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <select className="nv-input" value={selectedExport} onChange={e=>setSelectedExport(e.target.value)} style={{ fontSize:11 }}>
              <option value="exp_044">exp_044 — youtube_private_draft</option>
              <option value="exp_045">exp_045 — cdn (gap demo)</option>
            </select>
            <Badge tone={selectedExport==="exp_044" ? "success" : "warning"}>{selectedExport}</Badge>
          </div>
          <div style={{ marginTop:8, background: selectedExport==="exp_044" ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)", border:`1px solid ${selectedExport==="exp_044" ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`, padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", fontSize:11, lineHeight:1.5 }}>
            {(() => {
              const m = g?.export_manifests.get(selectedExport);
              if (!m) return "manifest not found";
              return `manifest ${m.manifest_version} • export ${m.export_id} • asset ${m.asset_hash.slice(0,16)}… • decoded ${m.decoded_media_hash.slice(0,16)}… • timeline ${m.timeline_hash.slice(0,16)}… • provenance ${m.provenance_root.slice(0,16)}…\nsource ${m.source_assets[0]?.asset_id} ${m.source_assets[0]?.usage[0]?.start_timecode}→${m.source_assets[0]?.usage[0]?.end_timecode}\nai ${m.ai_operations.map(a=>a.classification).join(", ")} • approvals ${m.approvals.join(", ")} • consents ${m.consents.join(", ")}\nrecipe ${m.render_recipe_id} • destination ${m.destination} • signature ${m.signature.slice(0,16)}… • replicated ${m.replicated_to?.join(", ")}`;
            })()}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Stored separately from video, replicated to independent integrity store.</div>
        </Section>
      </div>

      {/* C2PA + Consent */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Section title="C2PA Content Credentials" badge="lifecycle: ingest → publication">
          <div style={{ fontSize:11, display:"flex", gap:4, flexWrap:"wrap" }}>
            {["Captured","Edited","AI-generated","AI-assisted","Synthetic voice","Synthetic likeness","Background replace","Face alteration","Caption generation","Human approval","Disclosure required"].map(a => <Badge key={a} tone={a.includes("Synthetic")||a.includes("AI") ? "warning" : "neutral"}>{a}</Badge>)}
          </div>
          <div style={{ marginTop:8, background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontFamily:"var(--nv-font-mono)", fontSize:11 }}>
            {`assertion n0va.ai_transformation • claim_generator N0VA VIDEOS • operation background_replacement • 4800-5520 • input asset_camera_a001 • model n0va-segmentation-v4 • human_reviewed true • approved_by user_301 • disclosure_required true`}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Travels with master exports, review exports, downloads, CDN objects, platform uploads (if stripped, retain manifest URL).</div>
          <div style={{ marginTop:6, fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:6, borderRadius:6, border:"1px solid #222" }}>Lifecycle: Ingest → AI generation → Major edit → Final render → Export → External publication → Post-correction</div>
        </Section>
        <Section title="Consent Provenance" badge="time-bounded, not boolean">
          <div style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11, lineHeight:1.5 }}>
            <div>cons_01J… • subject person_044 • identity voice • permitted voice.generate/voice.dub • purpose q3_product_campaign • territories IN,US,GB • languages en,hi • destinations review_portal,youtube</div>
            <div>valid 2026-08-01 → 2027-04-30 • source_document_hash sha3-512:release… • verification verified • revoked_at null</div>
            <div style={{ marginTop:6, color:"#f59e0b" }}>Any voice/face/likeness output must point to exact consent record at generation time. Revocation propagates to workflows, derivatives, scheduled pubs, review links, external jobs, search.</div>
          </div>
          <div style={{ marginTop:6, fontSize:11, display:"flex", gap:4, flexWrap:"wrap" }}>
            <Badge tone="success">verified</Badge><Badge tone="neutral">territory IN,US,GB</Badge><Badge tone="neutral">purpose q3_product_campaign</Badge>
          </div>
        </Section>
      </div>

      {/* Cross-app + Privacy + Verification */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.2fr", gap:12 }}>
        <Section title="Cross-Application Provenance (N0VA10)" badge="prevents orphan publication">
          <div style={{ fontFamily:"var(--nv-font-mono)", fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, border:"1px solid #222" }}>
            {(() => { const t = Array.from(g?.external_transactions.values() ?? []).find(x=>x.export_id===selectedExport); if (!t) return "no transaction"; return `${t.external_transaction_id} • ${t.application} via ${t.connector} ${t.operation} → ${t.external_object_id}\nrequest ${t.request_hash.slice(0,16)}… response ${t.response_hash.slice(0,16)}… credential ${t.credential_subject} • ${t.status} • manifest ${t.content_manifest_id} • reconciled`; })()}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Destination app, connector version, credential identity, request/response hash, external object ID, publication state, reconciliation — every external video has N0VA record.</div>
        </Section>
        <Section title="Verification Service" badge="8 checks, exact broken link">
          <div style={{ border:"1px solid var(--nv-color-border)", borderRadius:8, overflow:"hidden" }}>
            {verify ? (
              <div style={{ padding:8 }}>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <Badge tone={verify.status.includes("verified") ? "success" : "warning"}>{verify.status}</Badge>
                  <span style={{ fontFamily:"var(--nv-font-mono)", fontSize:11 }}>{verify.verification_id}</span>
                  <span style={{ marginLeft:"auto", fontSize:11, color:"var(--nv-color-text-faint)" }}>{new Date(verify.verified_at).toLocaleString()}</span>
                </div>
                <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, fontSize:11 }}>
                  {Object.entries(verify.checks).map(([k,v]) => <span key={k} style={{ padding:"4px 6px", borderRadius:6, background: v==="passed" ? "rgba(16,185,129,0.12)" : v==="failed" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", border:`1px solid ${v==="passed" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`, textAlign:"center" }}>{k}: {v}</span>)}
                </div>
                <div style={{ marginTop:6, fontSize:11 }}>disclosures: {verify.disclosures.join(", ") || "—"} {verify.broken_link && <span style={{ color:"#ef4444" }}>• broken: {verify.broken_link}</span>}</div>
                {verify.status==="failed" && <div style={{ color:"#ef4444", fontSize:11, marginTop:4 }}>Exact broken link reported, not just “invalid”.</div>}
              </div>
            ) : <div style={{ padding:10, fontSize:11, color:"var(--nv-color-text-faint)" }}>Select export to verify</div>}
          </div>
          <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
            <Button size="sm" variant="secondary" onClick={()=>setVerify(verifyProvenance(selectedExport))}>Re-verify</Button>
            <Button size="sm" variant="ghost" onClick={()=>setSelectedExport(selectedExport==="exp_044" ? "exp_045" : "exp_044")}>Switch export</Button>
            <Badge tone="neutral">manifest sig</Badge><Badge tone="neutral">hash consistency</Badge><Badge tone="neutral">timeline match</Badge><Badge tone="neutral">consent @ generation</Badge>
          </div>
        </Section>
      </div>

      {/* Privacy + Completeness + Operational controls */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
        <Section title="Privacy-Preserving Disclosure" badge="5 audience levels">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:4, fontSize:11 }}>
            {[
              ["Public", "AI-use label, creator, verification"],
              ["Client", "major edits, AI, approval state"],
              ["Editor", "full timeline, params, history"],
              ["Auditor", "full graph, sigs, consents"],
              ["Legal", "complete + restricted identities"],
            ].map(([aud, vis]) => <div key={aud} style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)" }}><strong>{aud}</strong><div style={{ color:"var(--nv-color-text-muted)" }}>{vis}</div></div>)}
          </div>
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Encrypted prompts, hashed identities, selective disclosure, role-based traversal, redacted manifests, ZK verification.</div>
        </Section>
        <Section title="Provenance Completeness" badge={complete ? `${Math.round(complete.provenance_completeness*100)}%` : "—"}>
          {complete && (
            <>
              <div style={{ height:8, background:"var(--nv-color-border)", borderRadius:999, overflow:"hidden" }}><div style={{ width:`${complete.provenance_completeness*100}%`, height:"100%", background: complete.provenance_completeness>=0.95 ? "#10b981" : complete.provenance_completeness>=0.8 ? "#f59e0b" : "#ef4444" }} /></div>
              <div style={{ marginTop:6, fontSize:11, display:"flex", justifyContent:"space-between" }}><span>{Math.round(complete.provenance_completeness*100)}% complete</span><Badge tone={complete.release_status==="production_ready" ? "success" : complete.release_status==="allowed_with_warning" ? "warning" : "warning"}>{complete.release_status}</Badge></div>
              <div style={{ marginTop:6, fontSize:11, display:"flex", flexDirection:"column", gap:3 }}>{Object.entries(complete.breakdown).map(([k,v]) => <div key={k} style={{ display:"flex", gap:6, alignItems:"center" }}><span style={{ flex:1 }}>{k}</span><Badge tone={v.present ? "success" : "warning"}>{v.present?"✓":"✗"} {Math.round(v.score*100)}%</Badge></div>)}</div>
              {complete.critical_gaps.length > 0 && <div style={{ marginTop:6, fontSize:11, color:"#b45309" }}>Gaps: {complete.critical_gaps.join(" • ")}</div>}
            </>
          )}
          <div style={{ marginTop:6, fontSize:10, color:"var(--nv-color-text-faint)" }}>Sum: source + transformation + model + prompt + operator + approval + consent + reproducibility + signature + reconciliation. Not “production-ready” if critical missing.</div>
        </Section>
        <Section title="Operational Controls" badge="pipeline boundary">
          <div style={{ fontSize:11, lineHeight:1.6 }}>
            {[
              "No asset without identity+hash",
              "No AI op without generation record",
              "No timeline change without event record",
              "No render without locked recipe",
              "No export without signed manifest",
              "No publication without approval+validation",
              "No consent-controlled output without active consent",
              "No external txn without reconciliation",
              "No Provenance record editable in-place",
            ].map(r => <div key={r} style={{ display:"flex", gap:6, alignItems:"center" }}><span style={{ color:"#10b981" }}>✓</span><span>{r}</span></div>)}
          </div>
          <div style={{ marginTop:6, fontSize:11, display:"flex", gap:6, flexWrap:"wrap" }}><Badge tone="success">Phase1 Identity</Badge><Badge tone="success">Phase2 Lineage</Badge><Badge tone="primary">Phase3 Reproducible</Badge><Badge tone="primary">Phase4 C2PA</Badge><Badge tone="neutral">Phase5 Enterprise</Badge></div>
        </Section>
      </div>

      {/* Rollback + Approval history */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Section title="Rollback & Reconstruction" badge="3 levels">
          <div style={{ fontFamily:"var(--nv-font-mono)", fontSize:11, background:"#0f0f12", color:"#a5b4fc", padding:8, borderRadius:8, border:"1px solid #222" }}>{JSON.stringify({ rollback_plan:{ snapshot_id:"snap_01J_abc", internal_actions:["restore_timeline","restore_caption_track","revoke_review_link"], external_actions:["unpublish_youtube","replace_cdn_manifest","notify_distribution_owners"], rollback_status:"tested" }}, null, 2)}</div>
          <div style={{ marginTop:6, fontSize:11, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
            <span style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)", textAlign:"center" }}>Timeline<br/>any event/snapshot</span>
            <span style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)", textAlign:"center" }}>Asset<br/>version/stem/caption</span>
            <span style={{ background:"rgba(239,68,68,0.06)", padding:6, borderRadius:6, border:"1px solid rgba(239,68,68,0.18)", textAlign:"center" }}>External<br/>unpublish/revoke/takedown</span>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Every irreversible action has compensating action.</div>
        </Section>
        <Section title="Approval & Consent History" badge="full decision history">
          <div style={{ fontSize:11, lineHeight:1.6, display:"flex", flexDirection:"column", gap:4 }}>
            {["Proposal created → Evidence assembled → Policy evaluated → Approval requested → Approval granted → Asset changed → Consent renewed → Consent revoked → Exception issued", "Approval references: proposal hash + timeline hash + asset hashes + destination + risk + consent snapshot + compliance snapshot + approver + policy version"].map(t => <div key={t} style={{ background:"var(--nv-color-surface-2)", padding:6, borderRadius:6, border:"1px solid var(--nv-color-border)" }}>{t}</div>)}
          </div>
          <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-muted)" }}>Proves exact delivered artifact was approved, not just “approved at some earlier point”.</div>
        </Section>
      </div>

      {/* Footer provenance governing contract */}
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a1a2e 100%)", color:"#fff", borderRadius:10, padding:12, border:"1px solid rgba(255,255,255,0.08)", fontSize:11, lineHeight:1.6 }}>
        <div style={{ fontWeight:800 }}>Governing Provenance Contract</div>
        <div style={{ opacity:0.85, marginTop:4 }}>N0VA can prove: where every frame/sample originated • which transformations • which model/prompt/tool/agent • which human initiated/approved • which consent/rights applied • which timeline/recipe produced export • whether delivered matches approved • which platforms received it • what disclosure required • how to reconstruct/rollback — turning provenance from passive audit log into active production control.</div>
      </div>
    </div>
  );
}
