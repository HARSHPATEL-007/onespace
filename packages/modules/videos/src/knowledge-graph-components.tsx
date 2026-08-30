"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  listNodes, getNode, traverse, findPath, hybridSearch, queryExpiringConsent, queryApprovedCurrentPackaging, queryLegalBlockers,
  queryUnverifiedChanges, queryCalendarRisk, queryUnsupportedClaims, evaluatePublishability, getConflicts, resolveConflict,
  listMatches, confirmMatch, canAccessNode, graphMetrics, createNode, createEdge, confirmEdge,
} from "./knowledge-graph-engine";

export function KnowledgeGraphPanel({ projectId }: { projectId: string }) {
  const metrics = useMemo(() => graphMetrics(), []);
  const [searchText, setSearchText] = useState("Show all approved Q3 clips featuring the CEO discussing Product X, with valid consent for India and no legal blockers");
  const [hybridResults, setHybridResults] = useState(() => hybridSearch({ text: searchText, campaign_id: "campaign_q3", product_id: "product_007", require_consent: true, require_no_legal_block: true }));
  const expiring = useMemo(() => queryExpiringConsent(30), []);
  const approvedPack = useMemo(() => queryApprovedCurrentPackaging("campaign_q3","product_007"), []);
  const legals = useMemo(() => queryLegalBlockers(), []);
  const unverified = useMemo(() => queryUnverifiedChanges(), []);
  const calendar = useMemo(() => queryCalendarRisk(), []);
  const claims = useMemo(() => queryUnsupportedClaims("product_007"), []);
  const policy = useMemo(() => evaluatePublishability(projectId, "paid_social"), [projectId]);
  const conflicts = useMemo(() => getConflicts(), []);
  const matches = useMemo(() => listMatches(), []);
  const [selectedNode, setSelectedNode] = useState("scene_012");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>MULTIMODAL KNOWLEDGE GRAPH — EMBEDDINGS DISCOVER · GRAPH PROVES WITH EVIDENCE + TIME + PROVENANCE</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Temporal, provenance-aware property graph over Mongo + vector + events</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.9 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>{metrics.total_nodes} nodes · {metrics.total_edges} edges · {metrics.pct_with_evidence}% with evidence</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Human confirmed {metrics.human_confirmation_rate}% · stale {metrics.stale_edge_rate}%</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Contradictions {metrics.contradictions} · entity precision {metrics.entity_resolution_precision}</span>
        </div>
      </div>

      {/* Graph + Embedding Federation */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Graph & Embedding Federation <Badge tone="primary">Mongo authoritative · vector NN · graph traversal · search index</Badge></div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, fontSize: 11 }}>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", border: "1px solid #222", lineHeight: 1.6 }}>
            <div>VideoProject proj_001</div>
            <div>├── contains → VideoAsset asset_001</div>
            <div>├── has_version → TimelineVersion 0.4 (snapshot_0194)</div>
            <div>├── belongs_to → Campaign Q3 → linked_to CRM OPP-2044</div>
            <div>├── scheduled_by → CalendarEvent deadline 2026-09-05</div>
            <div>├── includes → Scene 012 → depicts → Product X (current packaging)</div>
            <div>├── contains → Person person_001 (restricted) → authorized_by Consent 032</div>
            <div>├── subject_to → LegalMatter LM-44 → blocks → Export 004</div>
            <div>└── receives → ReviewDecision approved_with_changes → affects → DeliveryWorkflow</div>
            <div style={{ marginTop: 6, color: "#a5b4fc" }}>Every relationship: confidence · source · evidence · validity · observed_at · model_version · human confirmation · tenant · provenance_chain</div>
          </div>
          <div style={{ fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Projection strategy — Mongo remains authoritative</div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, marginTop: 4 }}>
              <div>Mongo: timeline, asset metadata, comments, versions, audit, exports</div>
              <div>Graph: entity identity, typed relationships, evidence, intervals, provenance, policy attributes, cross-module refs</div>
              <div>Vector: visual/audio/multimodal/style/mood 4096-dim</div>
              <div>Event stream: video.scene.detected → normalize → validate → update projection → recompute policy → invalidate search</div>
            </div>
            <div style={{ marginTop: 6 }}>
              <Badge tone="neutral">Trust: confirmed / imported / machine_inferred / similarity_inferred / contradicted / stale</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Hybrid search */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Natural-Language + Hybrid Search <Badge tone="primary">embedding candidates → graph traversal → temporal/permission → evidence → explain</Badge></div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={searchText} onChange={e => setSearchText(e.target.value)} className="nv-input" style={{ flex: 1, fontSize: 12 }} />
          <Button size="sm" onClick={() => setHybridResults(hybridSearch({ text: searchText, campaign_id: "campaign_q3", product_id: "product_007", require_consent: true, require_no_legal_block: true }))}>Search</Button>
        </div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
          <div>
            {hybridResults.map(r => (
              <div key={r.result_id} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>Why this matched — score {r.score}</div>
                <ul style={{ margin: "4px 0 0 14px", color: "var(--nv-color-text-muted)" }}>{r.why_matched.map((w,i) => <li key={i}>{w}</li>)}</ul>
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", fontFamily: "var(--nv-font-mono)" }}>Path: {r.path.join(" → ")} · trust {r.trust}</div>
                <div style={{ fontSize: 10 }}>Evidence: frames {r.evidence.frames?.join(",")} · transcript {r.evidence.transcript_ranges?.[0]} · doc {r.evidence.documents?.[0]}</div>
              </div>
            ))}
            {hybridResults.length===0 && <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>No results — try approved Q3 + Product X + India consent</div>}
          </div>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
            <div>Campaign Q3 → Video Project 001 → Timeline Version 0.4 → Scene 012 → Product X → Consent Record 032 → Client Approval 0194</div>
            <div style={{ marginTop: 6 }}>Query plan: parse entities → vector candidates → graph resolve → consent validity → location India → legal check → review scope → social policy → rank → explain</div>
          </div>
        </div>
      </Card>

      {/* Reliable queries */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Reliable Relationship Queries</div>
          <div style={{ marginTop: 8, fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>People & consent — expires in 30 days: {expiring.length}</div>
              {expiring.slice(0,2).map((r,i) => <div key={i} style={{ fontFamily: "var(--nv-font-mono)", fontSize: 10 }}>{r.person.node_id} consent {r.consent.node_id} expires {r.consent.expires_at?.slice(0,10)} → scene {r.scene.node_id}</div>)}
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>MATCH (p:Person)-[:APPEARS_IN]-&gt;(s:Scene) MATCH (p)-[:HAS_CONSENT]-&gt;(c) WHERE c.expires_at &lt;= now()+30d</div>
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Product & campaign — approved current packaging: {approvedPack.length}</div>
              {approvedPack.slice(0,1).map((r,i) => <div key={i}>{r.scene.canonical_label} · {r.decision.canonical_label}</div>)}
            </div>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Legal blockers: {legals.length}</div>
              {legals.map((r,i) => <div key={i} style={{ fontSize: 10 }}>{r.matter.canonical_label} ({r.matter.attributes.status as string}) → {r.asset.canonical_label}</div>)}
            </div>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Unverified changes (approved but not verified): {unverified.length}</div>
              {unverified.map((r,i) => <div key={i} style={{ fontSize: 10 }}>{r.request.node_id} → {r.oldVersion.canonical_label} (no VERIFIED_IN)</div>)}
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Calendar & Claims</div>
          <div style={{ marginTop: 8, fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Calendar risk — due before publish with open blocker: {calendar.length}</div>
              {calendar.map((r,i) => <div key={i} style={{ fontSize: 10 }}>Deadline {r.deadline.canonical_label} { (r.deadline.attributes.start_at as string)?.slice(0,10)} → publish {(r.publishEvent.attributes.start_at as string)?.slice(0,10)} blocker {r.blocker.canonical_label}</div>)}
            </div>
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Unsupported claims — Product X not supported by latest doc: {claims.length}</div>
              {claims.slice(0,2).map((r,i) => <div key={i} style={{ fontSize: 10 }}>"{r.claim.canonical_label}" — doc {r.document?.canonical_label ?? "none"} is_latest {String(r.document?.attributes.is_latest_approved ?? false)}</div>)}
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Distinguishes "is available" (factual) vs "may become available" (hypothetical) — polarity/modality/confidence</div>
            </div>
            <div style={{ background: policy.publishable ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Publishability — {policy.publishable ? "Publishable" : "Not publishable"}</div>
              <div style={{ fontSize: 10 }}>{policy.reasons.join(" | ")}</div>
              <div style={{ fontSize: 10, fontFamily: "var(--nv-font-mono)" }}>Details: {Object.entries(policy.details).map(([k,v]) => `${k}:${String(v)}`).join(" ")}</div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Path: {policy.traversed_path.join(" → ")}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Evidence & temporal */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Evidence-Backed Edges & Temporal Dimensions</div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
              {`{ "from": "scene_012", "relationship": "depicts", "to": "product_007", "confidence": 0.96, "evidence": { "asset_id": "asset_001", "start_ms": 45000, "frame_ranges": [[2700,3120]], "model": "n0va-video-analysis-v4" }, "verification": { "status": "machine_generated" }, "validity": { "from": "2026-07-12" } }`}
            </div>
            <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, fontSize: 10 }}>
              <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Media time</div>00:00:45–00:00:52<br/>when entity appears in video</div>
              <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Validity time</div>Consent Jan1 2026–Jan1 2027<br/>when relationship is legally valid</div>
              <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>System time</div>Edge extracted Aug29 2026<br/>when system observed it</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--nv-color-text-faint)" }}>Expired consent / superseded doc cannot satisfy current policy — human-confirmed vs machine_inferred distinct.</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Conflict & Entity Resolution <Badge tone="warning">{conflicts.length} open</Badge></div>
          {conflicts.map(c => (
            <div key={c.conflict_id} style={{ marginTop: 6, background: "rgba(239,68,68,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 700 }}>{c.description}</div>
              <div style={{ fontSize: 10, fontFamily: "var(--nv-font-mono)" }}>{c.sources.map(s => `${s.system}:${s.value}@${s.effective_at.slice(0,10)}`).join(" | ")}</div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Blocks publish: {String(c.blocks_publish)} · review item {c.review_item_id}</div>
              <Button size="sm" variant="ghost" onClick={() => { resolveConflict(c.conflict_id, "ERP Version 4", "brand_owner"); alert("Resolved to ERP Version 4 — human resolution recorded"); }}>Resolve to ERP v4 (human)</Button>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Entity resolution</div>
            {matches.map(m => (
              <div key={m.match_id} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontSize: 10, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
                <span style={{ fontFamily: "var(--nv-font-mono)" }}>{m.left} ↔ {m.right}</span>
                <Badge tone={m.status==="confirmed"?"success":"neutral"}>{m.match_type} {m.confidence} {m.status}</Badge>
                {m.status!=="confirmed" && <Button size="sm" variant="ghost" onClick={() => { try { confirmMatch(m.match_id); alert(`Confirmed ${m.match_id}`);} catch(e){ alert((e as Error).message);} }}>Confirm</Button>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Never merge on name alone where legal/identity involved — requires authoritative_id (1.0 confirmed) vs name_alias 0.82 candidate.</div>
          </div>
        </Card>
      </div>

      {/* Traversal & governance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Graph Traversal — Review Intelligence & Compliance</div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={selectedNode} onChange={e => setSelectedNode(e.target.value)} className="nv-input" style={{ flex: 1 }}>
                {listNodes().slice(0,12).map(n => <option key={n.node_id} value={n.node_id}>{n.type} {n.node_id}</option>)}
              </select>
              <Button size="sm" variant="ghost" onClick={() => { const t = traverse(selectedNode, 2); alert(`Traversed ${t.length}: ${t.map(n=>n.node_id).slice(0,5).join(", ")}`); }}>Traverse depth 2</Button>
              <Button size="sm" variant="ghost" onClick={() => { const p = findPath("campaign_q3","consent_032"); alert(p ? p.join(" → ") : "No path"); }}>Path campaign → consent</Button>
            </div>
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 10 }}>
              <div style={{ fontWeight: 700 }}>Context-aware comment — frame contains:</div>
              <div>• Product X, packaging v4 (current) — confidence 0.96 frame_2700</div>
              <div>• Speaker: approved spokesperson (consent active IN until 2027)</div>
              <div>• Campaign: Q3 Product Launch</div>
              <div>• Legal note: packaging claim requires disclosure (LM-44)</div>
              <div>• Prior comment: “Use approved close-up.” (ri_001)</div>
              <div style={{ marginTop: 4, color: "var(--nv-color-text-faint)" }}>Clustering via graph context (scene/product/campaign/legal) more reliable than semantic alone — routing: product claim → legal/brand.</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, background: "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontWeight: 700 }}>Approval impact preview</div>
              <div>Will complete Client Creative Review, leave Legal pending, permit social only after consent check, trigger CRM attachment, keep 1 product-claim blocker open.</div>
            </div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Governance & Privacy — node/edge/property + purpose</div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button size="sm" variant="ghost" onClick={() => { const r = canAccessNode("person_001","editor"); alert(`${r.allowed?"✓":"✗"} ${r.reason}`); }}>Editor → person_001</Button>
              <Button size="sm" variant="ghost" onClick={() => { const r = canAccessNode("person_001","legal"); alert(`${r.allowed?"✓":"✗"} ${r.reason}`); }}>Legal → person_001</Button>
              <Button size="sm" variant="ghost" onClick={() => { const r = canAccessNode("scene_012","editor"); alert(`${r.allowed?"✓":"✗"} ${r.reason} — scene includes approved spokesperson allowed`); }}>Editor → scene_012 (allowed without PII)</Button>
            </div>
            <div style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 10 }}>
              <div>Allowed: Scene 012 → includes → Approved spokesperson</div>
              <div style={{ color: "var(--nv-color-text-faint)" }}>Restricted: Spokesperson → personal address / private biometric embedding (encrypted://face/...)</div>
              <div style={{ marginTop: 4 }}>Controls: tenant isolation · field-level encryption · RBAC+ABAC · purpose limitation · consent-aware retrieval · legal-hold · face embedding protection · query logging · export controls · right-to-erasure orchestration · human review for sensitive inferences.</div>
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => { const n = createNode({ type:"Person", canonical_label:"New Interviewee", attributes:{ role:["interviewee"] }}); alert(`Created ${n.node_id} — privacy restricted`); }}>Create privacy-sensitive Person</Button>
              <Button size="sm" variant="ghost" onClick={() => { const e = createEdge({ from_node:"scene_012", type:"DEPICTS", to_node:"product_007", confidence:0.91, evidence:{ asset_id:"asset_001" }, trust_level:"machine_inferred" }); alert(`Edge ${e.edge_id} machine_inferred — cannot authorize publish`); }}>Create machine_inferred edge (candidate only)</Button>
            </div>
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Machine-inferred never silently authorizes publication/approval/consent/legal. Stale &gt;90 days without confirmation → stale.</div>
          </div>
        </Card>
      </div>

      {/* Metrics */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Operational Metrics — decision quality <Badge tone="primary">entity precision {metrics.entity_resolution_precision} · 100% edges evidence-gated</Badge></div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, fontSize: 11 }}>
          {[
            ["Total nodes", String(metrics.total_nodes)],
            ["Total edges", String(metrics.total_edges)],
            ["With evidence", `${metrics.pct_with_evidence}%`],
            ["Human confirmed", `${metrics.human_confirmation_rate}%`],
            ["Stale rate", `${metrics.stale_edge_rate}%`],
            ["Contradictions", String(metrics.contradictions)],
          ].map(([k,v]) => <div key={k} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, textAlign:"center" }}><div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{k}</div><div style={{ fontWeight: 800 }}>{v}</div></div>)}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Also tracked: relationship precision/recall · contradiction detection · policy accuracy · false publication-block rate · query latency · traversal depth · cross-module match rate · consent coverage · review routing accuracy · % results with explainable evidence · time saved in compliance.</div>
      </Card>
    </div>
  );
}
