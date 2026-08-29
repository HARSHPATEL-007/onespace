"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  createReviewItem, listReviewItems, clusterItems, listClusters, detectReviewDuplicates, detectContradictions,
  generateSuggestion, getApprovalGraph, detectBlockers, classify, predictDeadlineRisk, verifyChange,
  ingestVoiceFeedback, getReviewRound, listReviewRounds, clearReviewStores,
} from "./review-engine";
import type { ReviewItem } from "./review-types";

export function ReviewIntelligencePanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ReviewItem[]>(() => listReviewItems());
  const [clusters, setClusters] = useState(() => listClusters());
  const [newComment, setNewComment] = useState("Could we maybe make the product shot less flat? The current one doesn’t really land.");
  const [selected, setSelected] = useState<string | null>(null);

  const selectedItem = useMemo(() => items.find(i => i.review_item_id === selected) ?? items[0] ?? null, [items, selected]);
  const blockers = useMemo(() => detectBlockers(), [items]);
  const risk = useMemo(() => predictDeadlineRisk("round_client_v03"), [items]);
  const approvalGraph = useMemo(() => getApprovalGraph(), []);

  const handleCreate = () => {
    const item = createReviewItem({
      revision_id: "rev_0192",
      source: { type: "comment", comment_id: `comment_${Date.now()}` },
      anchor: { start_ms: 45000, end_ms: 52000, frame: 2700 },
      text: newComment,
      round_id: "round_client_v03",
    });
    setItems([...listReviewItems()]);
  };

  const handleCluster = () => {
    if (items.length < 2) return;
    const ids = items.slice(0, 3).map(i => i.review_item_id);
    const c = clusterItems(ids, "semantic");
    setClusters([...listClusters()]);
  };

  const handleSuggestion = () => {
    if (!selectedItem) return;
    const s = generateSuggestion(selectedItem.review_item_id, { respect_locks: true });
    alert(`Suggestion ${s.suggestion_id}: ${s.operation.type} on ${s.operation.target_clip_id} confidence ${s.confidence} — requires human acceptance`);
    setItems([...listReviewItems()]);
  };

  const handleVerify = () => {
    if (!selectedItem) return;
    const res = verifyChange(selectedItem.review_item_id, "rev_0192", "rev_0194");
    setItems([...listReviewItems()]);
    alert(`Verification: ${res.status} — source removed: ${res.source_clip_removed}, candidate inserted: ${res.candidate_inserted}, evidence ${res.evidence_asset_id}`);
  };

  const handleVoice = () => {
    const item = ingestVoiceFeedback({ audio_asset_id: `voice_${Date.now()}`, transcript: "At around forty-five seconds, I’d use the tighter product shot and bring the music down slightly.", timeline_anchor: { start_ms: 45000, end_ms: 52000 } });
    setItems([...listReviewItems()]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — principle */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>REVIEW INTELLIGENCE — TRACEABLE REQUEST → VERIFIED EVIDENCE</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Every comment → traceable request with owner, state, and evidence-backed approval</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Lifecycle: captured → verified → accepted</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Cluster → duplicate → contradiction → edit mapping</span>
        </div>
      </div>

      {/* Ingestion */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Feedback Ingestion (text, email, voice note, video review)</span>
          <Badge tone="primary">{items.length} review items</Badge>
          <Button size="sm" variant="ghost" onClick={handleVoice}>Ingest voice note @45s</Button>
          <Button size="sm" variant="ghost" onClick={() => { const d = detectReviewDuplicates(); alert(`Duplicates: ${d.length} — don’t auto-delete, preserve attribution`); }}>Detect duplicates</Button>
          <Button size="sm" variant="ghost" onClick={() => { const c = detectContradictions(); alert(`Contradictions: ${c.length} — Client slower pause vs Director tighten`); }}>Detect contradictions</Button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Use the tighter product shot here." style={{ flex: 1 }} className="nv-input" />
          <Button size="sm" onClick={handleCreate}>Create review item (rev_0192, 45-52s)</Button>
          <Button size="sm" variant="secondary" onClick={handleCluster}>Cluster first 3</Button>
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Multimodal: speech-to-text + speaker ID + timecode alignment + visual-region + intent extraction — preserves original + normalized interpretation</div>
      </Card>

      {/* Clusters & mapping */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Automatic Clustering <Badge tone="primary">{clusters.length} clusters</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Timecode proximity + clip/scene + semantic similarity</span></div>
          {clusters.length === 0 ? <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 8 }}>No clusters — create items then cluster. Example: Client “premium” + Director “cleaner angle” + Legal “unapproved label” → Cluster: Replace product reveal shot 45-52s Risk: Legal</div> : clusters.map(c => (
            <div key={c.cluster_id} style={{ marginTop: 8, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
              <div style={{ fontWeight: 700 }}>{c.intent} — {c.time_range.start_ms}-{c.time_range.end_ms} participants {c.participants.length} confidence {c.confidence}</div>
              <div style={{ color: "var(--nv-color-text-muted)" }}>{c.reason.join(" • ")}</div>
              <div style={{ marginTop: 4, display: "flex", gap: 4 }}><Button size="sm" variant="ghost">Keep grouped</Button><Button size="sm" variant="ghost">Separate</Button></div>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Edit suggestion mapping (never silent)</div>
            <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 4 }}>
              {`{ "operation": { "type": "replace_clip", "target_clip_id": "clip_004", "candidate_asset_id": "asset_camera3_closeup" }, "confidence": 0.88, "requires_human_acceptance": true }`}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}><Button size="sm" onClick={handleSuggestion}>Generate suggestion for selected</Button><Badge tone="warning">High-risk: voice clone / legal disclaimer requires human confirmation</Badge></div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Approval Dependency Graph</div>
          <div style={{ background: "#0f0f12", color: "#e2e8f0", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8, lineHeight: 1.6 }}>
            <div>Editor Self-Review → Creative Director → Brand ─┐</div>
            <div>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;→ Legal ─┤ → Client → Accessibility → Export</div>
            <div>Nodes: {approvalGraph.nodes.map(n => `${n.node_id} ${n.status}`).join(" | ")}</div>
          </div>
          <div style={{ marginTop: 8, background: "rgba(239,68,68,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Blockers ({blockers.length})</div>
            {blockers.slice(0, 3).map(b => <div key={b.blocker_id} style={{ borderTop: "1px solid var(--nv-color-border)", padding: "4px 0" }}><Badge tone={b.severity === "critical" ? "warning" : "neutral"}>{b.severity}</Badge> {b.reason} — {b.category}</div>)}
            {blockers.length === 0 && <div style={{ color: "var(--nv-color-text-muted)" }}>No blockers — 2 color preference comments are non-blocking</div>}
          </div>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Sentiment & Urgency (triage, not judgment)</div>
            <div style={{ background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, fontSize: 11, border: "1px solid var(--nv-color-border)", marginTop: 4 }}>
              {selectedItem && (() => { const c = classify(selectedItem.original_text ?? selectedItem.requested_change.normalized_text); return <><div>Sentiment: {c.sentiment.label} ({c.sentiment.confidence}) • Urgency: {c.urgency.label} ({c.urgency.confidence}) • Intent: {c.intent.label}</div><div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{c.explanation.join(" ")}</div></>; })()}
              {!selectedItem && <span style={{ color: "var(--nv-color-text-muted)" }}>Select a review item to see classification</span>}
            </div>
          </div>
        </Card>
      </div>

      {/* Verification */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 800 }}>Requested-vs-Completed Verification</span>
          <Button size="sm" variant="ghost" onClick={handleVerify}>Verify selected (rev_0192 → rev_0194)</Button>
          <Badge tone="neutral">Side-by-side, overlay, difference, waveform, caption, transcript</Badge>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8, fontSize: 11 }}>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 700 }}>Before — rev_0192 00:00:00-00:00:12</div>
            <div style={{ height: 60, background: "#0f0f12", borderRadius: 6, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Original interview clip</div>
          </div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 700 }}>After — rev_0194 00:00:00-00:00:09</div>
            <div style={{ height: 60, background: "#1a243a", borderRadius: 6, marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#a5b4fc" }}>Camera 3 close-up — implemented pending verification</div>
          </div>
          <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}>
            <div style={{ fontWeight: 700 }}>Detected change</div>
            <div>Opening shortened 3.1s, audio bed shortened, caption shifted 3.1s — awaiting reviewer confirmation</div>
            <div style={{ marginTop: 4 }}><Badge tone="success">implemented_pending_verification</Badge></div>
          </div>
        </div>
      </Card>

      {/* Dashboard */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Review Intelligence Dashboard <Badge tone="primary">{items.length} items</Badge></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 8, fontSize: 11 }}>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Feedback</div><div>23 comments</div><div>5 clusters</div><div>4 duplicates merged</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Progress</div><div>7 implemented</div><div>4 awaiting verification</div><div>6 unresolved</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Risk</div><div>Level: {risk.level} {risk.score}</div><div>Confidence: {risk.confidence}</div><div>Drivers: {risk.drivers.slice(0,2).join(", ")}</div></div>
          <div style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>Priority queue</div><div>1. Legal disclaimer — Critical</div><div>2. Product-shot — High</div><div>3. Caption — High</div></div>
        </div>
        <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 120px 1fr 100px", gap: 0, background: "var(--nv-color-surface-2)", padding: "6px 10px", fontSize: 11, fontWeight: 800, color: "var(--nv-color-text-faint)" }}>
            <span>Item / Cluster</span><span>Priority / Owner</span><span>Requested change</span><span>Status</span>
          </div>
          {items.slice(0, 6).map(it => (
            <div key={it.review_item_id} onClick={() => setSelected(it.review_item_id)} style={{ display: "grid", gridTemplateColumns: "160px 120px 1fr 100px", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--nv-color-border)", fontSize: 11, cursor: "pointer", background: selected === it.review_item_id ? "rgba(14,165,233,0.06)" : "transparent" }}>
              <span style={{ fontFamily: "var(--nv-font-mono)" }}>{it.review_item_id.slice(0,8)}<br/><span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{it.cluster_id?.slice(0,8) ?? "no cluster"}</span></span>
              <span><Badge tone={it.priority === "critical" ? "warning" : "neutral"}>{it.priority}</Badge><div style={{ fontSize: 10 }}>{it.owner_id}</div></span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{it.requested_change.normalized_text.slice(0, 80)}…</span>
              <span><Badge tone={it.status.includes("implemented") ? "success" : it.status === "blocked" ? "warning" : "neutral"}>{it.status}</Badge></span>
            </div>
          ))}
        </div>
      </Card>

      {/* Agent roles */}
      <Card padded>
        <div style={{ fontWeight: 800 }}>Review Agent Roles (bounded authority)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 8, marginTop: 8, fontSize: 11 }}>
          {[
            ["Intake Agent", "Create drafts only"],
            ["Clustering Agent", "Suggest grouping"],
            ["Mapping Agent", "Cannot modify master"],
            ["Verification Agent", "Produce evidence"],
            ["Risk Agent", "Recommend actions"],
            ["Compliance Review Agent", "Block per policy"],
          ].map(([name, auth]) => <div key={name as string} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8 }}><div style={{ fontWeight: 700 }}>{name as string}</div><div style={{ color: "var(--nv-color-text-muted)" }}>{auth as string}</div></div>)}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Agents never approve own changes — suggestion retains model version, input comments, confidence, operation, affected regions, human acceptance, resulting revision, verification evidence.</div>
      </Card>
    </div>
  );
}
