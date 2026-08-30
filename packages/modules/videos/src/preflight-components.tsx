"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import { runPreflight, getLatestPreflight, resolveFinding, requestException, getDashboard } from "./preflight-engine";
import type { PreflightRun, PreflightFinding } from "./preflight-types";

export function PreflightPanel({ projectId }: { projectId: string }) {
  const [current, setCurrent] = useState<PreflightRun | null>(() => getLatestPreflight(projectId) ?? runPreflight({ project_id: projectId, project_version: 18, timeline_id: "tl_001", destinations: ["youtube","instagram_reels","linkedin"] }));
  const dashboard = useMemo(() => getDashboard(projectId), [current]);
  const [selected, setSelected] = useState<PreflightFinding | null>(current?.findings.find(f=>f.severity==="critical") ?? current?.findings[0] ?? null);

  const handleRerun = () => {
    const pf = runPreflight({ project_id: projectId, project_version: 18, timeline_id: "tl_001", destinations: ["youtube","instagram_reels","linkedin"] });
    setCurrent(pf);
    setSelected(pf.findings.find(f=>f.severity==="critical") ?? pf.findings[0] ?? null);
  };
  const handleResolve = () => {
    if (!selected) return;
    const updated = resolveFinding(selected.finding_id, { resolution_type:"replace_asset", replacement_asset_id:"asset_music_cleared_07", note:"Replaced with campaign-cleared track.", rerun_affected_checks:true });
    if (updated) setCurrent(getLatestPreflight(projectId));
  };
  const handleException = () => {
    if (!selected) return;
    requestException(selected.finding_id, { reason:"Client supplied written permission for this campaign.", scope:{ destination:"youtube", territories:["IN","SG"], expires_at:"2026-12-31T23:59:59Z" }, evidence_document_ids:["doc_client_permission_22"], approver_role:"legal" });
    setCurrent(getLatestPreflight(projectId));
  };

  if (!current) return <div>No preflight yet — run one.</div>;

  const releaseDecision = (current as unknown as { release_decision?: string }).release_decision ?? current.status.toUpperCase();
  const qualityScore = (current as unknown as { quality_score?: number }).quality_score ?? current.readiness_score;
  const scoreConfidence = (current as unknown as { score_confidence?: number }).score_confidence ?? 0.91;
  const evidenceCoverage = (current as unknown as { evidence_coverage?: number }).evidence_coverage ?? 96;
  const controllingReason = (current as unknown as { controlling_reason?: string }).controlling_reason ?? (current.summary.critical>0 ? "unresolved commercial music license" : "");
  const statusColor = releaseDecision==="BLOCKED"||current.status==="blocked"?"#ef4444":releaseDecision==="READY_WITH_WARNINGS"?"#f59e0b":"#10b981";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header 2.0 */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>N0VA PREFLIGHT 2.0 — QUALITY SCORE vs RELEASE DECISION · POLICY-AWARE GATE</div>
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.8fr", gap:12, marginTop:6 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:900 }}>Project: Q3 Product Launch <span style={{ opacity:0.7, fontWeight:600 }}>Timeline v18</span> <span style={{ background: statusColor, padding:"2px 8px", borderRadius:999, fontSize:11 }}>{releaseDecision} {qualityScore}/100</span></div>
            <div style={{ fontSize:11, opacity:0.85, marginTop:4 }}>Destination: YouTube 4K HDR · Quality Score {qualityScore}/100 · Confidence {Math.round(scoreConfidence*100)}% · Evidence Coverage {evidenceCoverage}% · Freshness {(current as unknown as {analysis_freshness?:string}).analysis_freshness ?? "current"}</div>
            <div style={{ fontSize:11, opacity:0.8, marginTop:4, background:"rgba(239,68,68,0.15)", padding:"6px 8px", borderRadius:8, border:"1px solid rgba(239,68,68,0.25)" }}>{qualityScore}/100 — {releaseDecision} <span style={{ opacity:0.9 }}>Controlling gate: {controllingReason || "unresolved commercial music license"}</span> {current.secondary_findings ? `· Secondary: ${(current as unknown as {secondary_findings?:string[]}).secondary_findings?.slice(0,2).join(", ")}` : ""}</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
              <span style={{ background:"rgba(239,68,68,0.15)", padding:"4px 8px", borderRadius:999 }}>Critical {current.summary.critical}</span>
              <span style={{ background:"rgba(251,191,36,0.15)", padding:"4px 8px", borderRadius:999 }}>High {current.summary.high}</span>
              <span style={{ background:"rgba(14,165,233,0.15)", padding:"4px 8px", borderRadius:999 }}>Medium {current.summary.medium}</span>
              <span style={{ background:"rgba(16,185,129,0.15)", padding:"4px 8px", borderRadius:999 }}>Passed {current.summary.passed}</span>
              <span style={{ marginLeft:"auto", opacity:0.7 }}>Example: Quality 94/100 but BLOCKED by expired voice consent — avg never hides critical</span>
            </div>
          </div>
          <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:10, fontSize:11 }}>
            <div style={{ fontWeight:800 }}>Blocking gates</div>
            {Object.entries(current.gates).map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"2px 0", borderBottom:"1px solid rgba(255,255,255,0.08)" }}><span>{k}</span><span style={{ color: v===true||v===0 ? "#10b981" : "#ef4444", fontWeight:700 }}>{String(v)}</span></div>
            ))}
            <div style={{ fontSize:10, opacity:0.7, marginTop:4 }}>Gates: rights_clear · consent_clear · privacy_clear · legal_hold_clear · export_verified · required_approvals_complete · policy_scan_current · evidence_complete — any false → BLOCKED in strict mode</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
          <Button size="sm" variant="secondary" onClick={handleRerun}>Re-run preflight</Button>
          <Button size="sm" variant="ghost" onClick={() => alert(`Report ${current.preflight_id} timeline ${current.timeline_hash} render ${(current as unknown as {render_hash?:string}).render_hash ?? ""} evidence ${current.evidence_hash}`)}>Export report (4 views)</Button>
          <span style={{ fontSize:10, opacity:0.7, alignSelf:"center" }}>Three-level: asset · timeline · delivery — rendered file is authoritative, not just timeline</span>
        </div>
      </div>

      {/* Category cards 2.0 with evidence coverage and verdict */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        {Object.values(current.categories).map(cat => {
          const tone = cat.severity==="critical"?"#ef4444":cat.severity==="high"?"#f59e0b":cat.severity==="medium"?"#eab308":cat.severity==="pass"?"#10b981":"#6b7280";
          const evCov = (cat as unknown as { evidence_coverage?: number }).evidence_coverage ?? 96;
          return (
            <div key={cat.category} style={{ background:"var(--nv-color-surface)", border:`1px solid ${cat.severity==="critical"||cat.severity==="high"?"#f59e0b":"var(--nv-color-border)"}`, borderRadius:10, padding:10, borderLeft:`4px solid ${tone}` }}>
              <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.04em", color:"var(--nv-color-text-faint)" }}>{cat.category.replace("_"," ")}</div>
              <div style={{ fontSize:20, fontWeight:900, marginTop:4 }}>{cat.score} <span style={{ fontSize:11, color: tone, fontWeight:800 }}>{cat.severity.toUpperCase()}</span></div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-muted)" }}>{cat.finding_count} findings · {cat.status} · coverage {evCov}%</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Weight {cat.category==="legal_hold"?"gate":`${(cat.category==="technical_quality"?15:cat.category==="copyright_risk"?12:10)}%`} · {cat.category==="technical_quality"?"asset+timeline+delivery":cat.category==="caption_accuracy"?"timeline+delivery":"asset/timeline"}</div>
            </div>
          );
        })}
      </div>

      {/* Destinations 2.0 destination-specific */}
      <Card padded>
        <div style={{ fontWeight:800, display:"flex", gap:8 }}>Destinations — base {qualityScore} <Badge tone="primary">{Object.keys(current.destination_results).length} profiles versioned signed</Badge><span style={{ marginLeft:"auto", fontSize:10, color:"var(--nv-color-text-faint)" }}>Project base {qualityScore} · YouTube BLOCKED synth disclosure · Instagram BLOCKED aspect · LinkedIn READY_WITH_WARNINGS · Internal READY · Broadcast BLOCKED loudness — approval never cross-authorizes</span></div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginTop:8 }}>
          {Object.entries(current.destination_results).map(([dest, res]) => {
            const prof = (current.destination_profiles as unknown as { destination:string; profile_version:string; territory?:string }[]).find(p=>p.destination===dest);
            return (
            <div key={dest} style={{ background: res.status==="blocked"?"rgba(239,68,68,0.08)":res.status==="warning"?"rgba(251,191,36,0.08)":"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, fontSize:11 }}>
              <div style={{ fontWeight:800 }}>{dest} <Badge tone={res.status==="blocked"?"warning":res.status==="warning"?"neutral":"success"}>{res.status}</Badge></div>
              <div>Score {res.score} · profile {res.profile_version} {prof?.territory ? `· ${prof.territory}` : ""}</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>{dest==="youtube"?"synthetic-media disclosure missing":dest==="instagram_reels"?"requires 2160x3840 9:16, current 3840x2160":res.status==="warning"?"one caption term, synthetic pending":"ready"}</div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Dimensions/codec/loudness/captions/thumbnail/rights/policy {res.profile_version}</div>
            </div>
          );})}
        </div>
        <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Destination profiles signed versioned packs; policy change invalidates only that destination; release tuple tenant+project+timeline_hash+render_hash+export_profile+destination+territory+policy/rights/consent/evidence snapshots.</div>
      </Card>

      {/* Findings list + detail */}
      <div style={{ display:"grid", gridTemplateColumns:"0.95fr 1.05fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800, display:"flex", gap:8 }}>Findings <Badge tone="warning">{current.findings.length} total</Badge><span style={{ marginLeft:"auto", fontSize:11, color:"var(--nv-color-text-faint)" }}>[Resolve blockers] [Assign owners] [Request approval] [Export report]</span></div>
          <div style={{ marginTop:8, maxHeight:520, overflow:"auto", display:"flex", flexDirection:"column", gap:6 }}>
            {current.findings.map(f => (
              <div key={f.finding_id} onClick={()=>setSelected(f)} style={{ border:`2px solid ${selected?.finding_id===f.finding_id?"#0ea5e9":"var(--nv-color-border)"}`, borderRadius:8, padding:8, cursor:"pointer", background: f.severity==="critical"?"rgba(239,68,68,0.06)":f.severity==="high"?"rgba(251,191,36,0.06)":"var(--nv-color-surface-2)" }}>
                <div style={{ display:"flex", gap:6, alignItems:"center" }}><Badge tone={f.severity==="critical"?"warning":f.severity==="high"?"warning":"neutral"}>{f.severity}</Badge><span style={{ fontWeight:700, fontSize:11 }}>{f.title.slice(0,48)}</span><span style={{ marginLeft:"auto", fontSize:10 }}>{f.status}</span></div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>{f.category} · {f.check_id} · score {f.score} · conf {(f.confidence*100).toFixed(0)}% · {f.scope.start_ms!==undefined ? `${f.scope.start_ms}-${f.scope.end_ms}ms` : f.scope.asset_id ?? f.scope.export_id}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Owner: {f.owner.team} {f.approval.required?`· approval ${f.approval.status} (${f.approval.approver_role})`:""} · policy {f.policy?.policy_id ?? "—"}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card padded>
          {selected ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontWeight:800, display:"flex", gap:8 }}>{selected.title} <Badge tone={selected.severity==="critical"?"warning":selected.severity==="high"?"warning":"neutral"}>{selected.severity} {selected.status}</Badge></div>
              <div style={{ fontSize:11, fontFamily:"var(--nv-font-mono)", background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, border:"1px solid #222" }}>
                <div>check_id {selected.check_id} · category {selected.category} · score {selected.score} · confidence {(selected.confidence*100).toFixed(0)}% · verdict {(selected as unknown as {verdict?:string}).verdict ?? "FAILED"} · level {(selected as unknown as {evaluation_level?:string}).evaluation_level ?? "delivery_level"} · scope {selected.scope.project_id} v{selected.scope.timeline_version ?? 18} {selected.scope.asset_id ?? ""} {selected.scope.start_ms ?? ""}-{selected.scope.end_ms ?? ""} {selected.scope.export_id ?? ""} {selected.scope.destinations?.join(",") ?? ""}</div>
                <div>models {selected.model_versions.join(", ")} · freshness {(selected as unknown as {freshness?:{status:string}}).freshness?.status ?? "current"} · classification impact {(selected as unknown as {classification?:{impact:number}}).classification?.impact ?? ""} likelihood {(selected as unknown as {classification?:{likelihood:number}}).classification?.likelihood ?? ""}</div>
                <div>evidence graph {selected.evidence_ids?.length ?? selected.evidence.length} nodes · frame/thumbnail/audio/transcript/caption/OCR/rights/consent/policy — reusable across findings</div>
              </div>
              <div style={{ fontSize:11 }}>
                <div style={{ fontWeight:700 }}>Evidence — click to open timeline at timecode</div>
                {selected.evidence.map((ev,i) => (
                  <div key={i} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:4, fontSize:11 }}>
                    <div style={{ fontWeight:700 }}>{ev.type} {ev.timecode ?? ""} {ev.frame_ms ? `frame ${ev.frame_ms}` : ""}</div>
                    <div style={{ color:"var(--nv-color-text-muted)" }}>{ev.text ?? ""} {ev.fingerprint_match ? `match ${ev.fingerprint_match} conf ${ev.match_confidence}` : ""} {ev.policy_rule ?? ""}</div>
                    <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>confidence {ev.confidence ?? ""} {ev.thumbnail_url ?? ""}</div>
                  </div>
                ))}
                {selected.category==="privacy_pii" && <div style={{ fontSize:10, background:"rgba(251,191,36,0.08)", padding:8, borderRadius:8 }}>Redaction: tracked_blur email at 164100-166800 tracking 0.98 review_required export_verified false — rescan rendered file to confirm PII hidden.</div>}
              </div>
              <div style={{ fontSize:11 }}>
                <div style={{ fontWeight:700 }}>Evidence Graph — reusable nodes</div>
                <div style={{ fontSize:10, fontFamily:"var(--nv-font-mono)", background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:4 }}>
                  {selected.evidence_ids?.slice(0,3).map(id=> <div key={id}>{id}: {current.evidence_graph.find(e=>e.evidence_id===id)?.type} · detector {(current.evidence_graph.find(e=>e.evidence_id===id)?.detector?.model ?? "")} · integrity {current.evidence_graph.find(e=>e.evidence_id===id)?.integrity?.evidence_hash.slice(0,12)}…</div>)}
                  <div style={{ color:"var(--nv-color-text-faint)" }}>Finding → timeline range + source asset + rendered output + frame + audio + transcript + caption + OCR + rights/consent/policy + remediation result — same frame supports multiple findings</div>
                </div>
              </div>
              <div style={{ fontSize:11 }}>
                <div style={{ fontWeight:700 }}>Remediation — lifecycle {selected.status}</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:4 }}>{selected.remediation.map((r,i)=><Badge key={i} tone={r.automatable?"success":"neutral"}>{r.label} {r.automatable?"(automated)":""} · {r.category ?? r.mode ?? ""}</Badge>)}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Lifecycle: DETECTED→TRIAGED→(FALSE_POSITIVE/ACCEPTED_WARNING/REMEDIATION_REQUIRED/ESCALATED)→REMEDIATION_SUBMITTED→RERUN_PENDING→VERIFIED→APPROVED · Exception (approved deviation) vs Override (release despite unresolved, second approver required)</div>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <Button size="sm" onClick={handleResolve}>Resolve (replace_asset asset_music_cleared_07)</Button>
                <Button size="sm" variant="secondary" onClick={handleException}>Request exception (client permission until 2026-12-31)</Button>
                <Badge tone="neutral">Owner: {selected.owner.team} SLA 24h escalation 12h approver {selected.approval.approver_role}</Badge>
              </div>
              <div style={{ fontSize:11 }}>
                <div style={{ fontWeight:700 }}>Approval — immutable release tuple</div>
                <div style={{ background: selected.approval.status==="approved"?"rgba(16,185,129,0.08)":"rgba(251,191,36,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8, marginTop:4 }}>
                  {selected.approval.required ? `Required ${selected.approval.approver_role} — status ${selected.approval.status} ${selected.approval.second_approval_required?"(second approver required)":""}` : "No approval required"} {selected.approval.approved_by ? `by ${selected.approval.approved_by}` : ""}
                  <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Binding: tenant {current.project_id} · v{current.project_version} · tl {current.timeline_hash.slice(0,12)}… · render {(current as unknown as {render_hash?:string}).render_hash?.slice(0,12)}… · export youtube_4k_hdr_v12 · dest youtube [IN,SG] · policy {(current as unknown as {approval_binding?:{policy_hash:string}}).approval_binding?.policy_hash.slice(0,12)}… · rights/consent/evidence snapshots — any change → STALE</div>
                </div>
              </div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Severity = impact × likelihood × audience × destination sensitivity × legal obligation — caption typo internal medium vs public critical. State: DRAFT→ANALYSIS_PENDING→PREFLIGHT_RUNNING→FINDINGS_OPEN→APPROVED→EXPORTABLE→PUBLISHED; stale 4 checks after title change invalidates only affected ranges.</div>
            </div>
          ) : <div style={{ fontSize:11, color:"var(--nv-color-text-muted)" }}>Select a finding</div>}
        </Card>
      </div>

      {/* Approval matrix + queues + reports 2.0 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Human Review Queues — role-based</div>
          <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {[
              ["Legal","copyright blockers, consent mismatches, hold conflicts"],
              ["Privacy","PII exposures, redaction failures"],
              ["Brand","logo violations, claims"],
              ["Accessibility","caption errors, a11y"],
              ["Finishing","frame errors, loudness, render discrepancies"],
            ].map(([q,desc]) => (
              <div key={q as string} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <div style={{ fontWeight:700 }}>{q as string} queue</div><div style={{ fontSize:10, color:"var(--nv-color-text-muted)" }}>{desc as string}</div>
                <div style={{ fontSize:10, color:"var(--nv-color-text-faint)" }}>Evidence preview · timecode jump · SLA timer · escalation · audit history</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Dependency-aware rerun: replace music → audio/copyright/platform; caption → captions/a11y/platform; logo → brand/visual/a11y; crop → visual/privacy/a11y/export.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Evidence Report & Safety — 4 views</div>
          <div style={{ marginTop:8, fontSize:11, background:"#0f0f12", color:"#e2e8f0", padding:8, borderRadius:8, fontFamily:"var(--nv-font-mono)", border:"1px solid #222" }}>
            <div>N0VA Preflight Report — Q3 Product Launch v18 YouTube 4K HDR 30 Aug 2026</div>
            <div>Quality: {qualityScore}/100 Confidence {Math.round(scoreConfidence*100)}% Coverage {evidenceCoverage}% Decision: {releaseDecision} — Controlling: {controllingReason}</div>
            <div>Evidence: 14 frames · 6 transcript spans · 2 audio · 3 licenses · render {(current as unknown as {render_hash?:string}).render_hash?.slice(0,12)}…</div>
            <div>Views: Editorial (tech/audio/caption/continuity/brand) · Legal (copyright/consent/privacy/hold) · Distribution (export/policy) · Executive (readiness/blockers/destinations)</div>
          </div>
          <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:6 }}>Safe automation: deterministic re-run/generations vs human-required copyright/consent/privacy/legal-hold/brand exception vs never automate deletion/publishing blocked media. Continuous event bus → impact resolver → affected-check planner → parallel analyzers → evidence collector → gate evaluator.</div>
        </Card>
      </div>
    </div>
  );
}
