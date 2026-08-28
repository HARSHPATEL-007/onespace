"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import { CATEGORY_META } from "./quality-types";
import type { QualityWarning, Severity } from "./quality-types";
import {
  runQualityAnalysis,
  getWarnings,
  getFindings,
  generateProposalsForFinding,
  applyProposal,
  resolveFinding,
  getDashboard,
  evaluateGate,
  enrichConfidence,
  recordFeedback,
} from "./quality-engine";

function msLabel(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const ms3 = ms % 1000;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms3).padStart(3, "0")}`;
}

const SEV_COLOR: Record<Severity, string> = {
  informational: "#94a3b8",
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  critical: "#991b1b",
};

export function QualityPanel({ timelineId, graphVersion }: { timelineId: string; graphVersion: string }) {
  const [passes, setPasses] = useState<("editorial_continuity" | "technical" | "visual_consistency" | "graphics_text" | "distribution")[]>([
    "editorial_continuity",
    "technical",
    "visual_consistency",
    "graphics_text",
    "distribution",
  ]);
  const [warnings, setWarnings] = useState<QualityWarning[]>(() => getWarnings(timelineId));
  const [selected, setSelected] = useState<string | null>(null);
  const [proposalInfo, setProposalInfo] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterSev, setFilterSev] = useState<string>("all");

  const run = () => {
    const ws = runQualityAnalysis({ timeline_id: timelineId, graph_version: graphVersion, passes: passes as never, export_profiles: ["youtube_4k_hdr", "instagram_reels_9x16"], mode: "non_destructive" });
    setWarnings([...ws]);
  };

  const selectedWarning = useMemo(() => warnings.find((w) => w.warning_id === selected) ?? warnings[0] ?? null, [warnings, selected]);
  const dashboard = useMemo(() => getDashboard(timelineId), [warnings]);
  const filtered = warnings.filter((w) => (filterCat === "all" || w.category === filterCat) && (filterSev === "all" || w.severity === filterSev));

  const onGenerateFix = (w: QualityWarning) => {
    const f = getFindings(timelineId).find((x) => x.finding_type === w.type && x.timeline_ranges[0]?.start_ms === w.range.start_ms);
    if (!f) { setProposalInfo("No finding linked — run analysis first"); return; }
    const props = generateProposalsForFinding(f.quality_finding_id);
    setProposalInfo(`Generated ${props.length} proposals for ${w.type} — first: ${props[0]?.operation.type ?? "—"} (approval ${props[0]?.requires_approval ? "required" : "no"})`);
  };
  const onApply = (w: QualityWarning) => {
    const f = getFindings(timelineId).find((x) => x.finding_type === w.type);
    if (!f) return;
    const props = generateProposalsForFinding(f.quality_finding_id);
    if (!props[0]) return;
    const r = applyProposal(props[0].proposal_id, "new_branch", "continuity fixes preview");
    setProposalInfo(`Applied ${props[0].proposal_id} → ${r.new_branch} (reanalysis ${r.requires_reanalysis ? "required" : "no"})`);
  };
  const onResolve = (w: QualityWarning, res: "intentional" | "dismissed") => {
    const f = getFindings(timelineId).find((x) => x.finding_type === w.type && x.timeline_ranges[0]?.start_ms === w.range.start_ms);
    if (f) { resolveFinding(f.quality_finding_id, res, res === "intentional" ? "Jump cut is part of the approved editorial style." : "Dismissed"); setWarnings([...getWarnings(timelineId)]); }
  };

  const gate = useMemo(
    () =>
      evaluateGate(graphVersion, "youtube_4k_hdr", {
        critical_warnings: "zero",
        high_warnings: "zero",
        lower_third_identity_mismatch: "zero",
        audio_sync_max_ms: 40,
        unsafe_title_overflow_percent: 0,
      }),
    [warnings, graphVersion],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — operating principle */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>CONTINUITY & QUALITY INTELLIGENCE — ANALYZE → DETECT → EXPLAIN → PRIORITIZE → SUGGEST → PREVIEW → APPROVAL → NEW NODE</div>
        <div style={{ fontSize: 15, fontWeight: 900, marginTop: 4 }}>No detection mutates timeline/graph/render — every fix is a non-destructive proposal.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Observation ≠ Inference ≠ Recommendation ≠ Action</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Linked to semantic spans, graph nodes, assets, versions — follows moved ranges</span>
        </div>
      </div>

      {/* Pass selector + run */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Quality Passes</span>
          {[
            ["editorial_continuity", "Editorial Continuity"],
            ["technical", "Technical"],
            ["visual_consistency", "Visual Consistency"],
            ["graphics_text", "Graphics & Text"],
            ["distribution", "Distribution"],
          ].map(([id, label]) => {
            const active = passes.includes(id as never);
            return (
              <button key={id} onClick={() => setPasses((p) => (p.includes(id as never) ? (p.filter((x) => x !== id) as never) : [...p, id as never]))} style={{ padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", background: active ? "#0ea5e9" : "var(--nv-color-surface-2)", color: active ? "#fff" : "inherit", border: "1px solid var(--nv-color-border)" }}>{label as string}</button>
            );
          })}
          <Button size="sm" onClick={run} style={{ marginLeft: "auto" }}>Run Quality Analysis (non-destructive)</Button>
          <Badge tone="neutral">graph {graphVersion}</Badge>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-faint)" }}>Mode: non_destructive • Export profiles: youtube_4k_hdr, instagram_reels_9x16 • Thresholds configurable by project type (documentary/ad/social/legal)</div>
      </Card>

      {/* Warning lane above timeline — colored by category */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Warning Lane — timeline overlay</span>
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Amber=continuity • Blue=audio_sync • Purple=graphics_text • Orange=color • Red=delivery • Gray=duplicate • Teal=AI (icon + label, not color alone)</span>
          <Badge tone="primary">{filtered.length} warnings</Badge>
        </div>
        <div style={{ marginTop: 10, background: "#0f0f12", borderRadius: 10, padding: 10, border: "1px solid #222", overflowX: "auto" }}>
          <div style={{ position: "relative", height: 56, minWidth: 900, background: "linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "90px 100%" }}>
            {/* timeline ruler 0-03:00 */}
            <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#666", padding: "0 6px" }}>
              <span>00:00</span><span>01:00</span><span>02:00</span><span>03:00</span>
            </div>
            {/* warnings as colored segments */}
            {filtered.map((w) => {
              const total = 180000; // 3 min timeline
              const left = (w.range.start_ms / total) * 100;
              const width = Math.max(0.8, ((w.range.end_ms - w.range.start_ms) / total) * 100);
              const cat = CATEGORY_META[w.category];
              const isSel = selectedWarning?.warning_id === w.warning_id;
              return (
                <div
                  key={w.warning_id}
                  onClick={() => setSelected(w.warning_id)}
                  title={`${w.type} ${msLabel(w.range.start_ms)}—${msLabel(w.range.end_ms)} ${w.severity}`}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    width: `${width}%`,
                    top: w.category === "continuity" ? 18 : w.category === "audio_sync" ? 28 : w.category === "graphics_text" ? 38 : 46,
                    height: 10,
                    background: cat.color,
                    borderRadius: 4,
                    border: isSel ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)",
                    opacity: w.severity === "critical" ? 1 : w.severity === "high" ? 0.9 : 0.75,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    color: "#fff",
                    fontWeight: 800,
                  }}
                >
                  {cat.icon}
                </div>
              );
            })}
            {/* example markers text */}
            <div style={{ position: "absolute", bottom: 2, left: 6, fontSize: 9, color: "#a5b4fc", display: "flex", gap: 12 }}>
              <span>00:01:14.200 Amber jump cut</span>
              <span style={{ color: "#60a5fa" }}>00:01:42.800 Blue audio 86ms</span>
              <span style={{ color: "#f472b6" }}>00:02:18.400 Red title mismatch</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
          {Object.entries(CATEGORY_META).map(([k, v]) => (
            <span key={k} style={{ display: "inline-flex", gap: 4, alignItems: "center", background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} /> {v.label}
            </span>
          ))}
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="nv-input" style={{ fontSize: 11, padding: "4px 8px" }}>
            <option value="all">All categories</option>
            {Object.keys(CATEGORY_META).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)} className="nv-input" style={{ fontSize: 11, padding: "4px 8px" }}>
            <option value="all">All severities</option>
            <option value="critical">critical</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
            <option value="informational">informational</option>
          </select>
        </div>
      </Card>

      {/* Dashboard */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Quality Dashboard <Badge tone="primary">{dashboard.open} open</Badge></div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", fontSize: 11 }}>
            {Object.entries(dashboard.by_severity).map(([k, v]) => (
              <span key={k} style={{ background: SEV_COLOR[k as Severity], color: k === "critical" ? "#fff" : k === "high" ? "#fff" : "#0f0f12", padding: "4px 8px", borderRadius: 999, fontWeight: 800 }}>{k}: {v as number}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", fontSize: 11 }}>
            {Object.entries(dashboard.by_category).map(([k, v]) => (
              <span key={k} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999 }}>{k}: {v as number}</span>
            ))}
          </div>
          <div style={{ marginTop: 10, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Export readiness</div>
            {Object.entries(dashboard.export_readiness).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, justifyContent: "space-between", borderTop: "1px solid var(--nv-color-border)", padding: "4px 0" }}>
                <span>{k}</span>
                <Badge tone={v.ready ? "success" : "warning"}>{v.ready ? "ready" : `blocked by ${v.blocking?.length ?? 0}`}</Badge>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222" }}>
            Gate: youtube_4k_hdr on {graphVersion} — {gate.result === "blocked" ? `blocked by ${gate.blocking_warnings.length} warnings` : "ready"} • rules: critical zero, high zero, title mismatch zero, audio_sync ≤40ms, unsafe title 0%
          </div>
        </Card>

        {/* Detail panel */}
        <Card padded>
          <div style={{ fontWeight: 800 }}>Warning Detail — explain, prioritize, suggest, preview</div>
          {selectedWarning ? (
            <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 10, background: selectedWarning.severity === "critical" ? "rgba(239,68,68,0.08)" : "var(--nv-color-surface-2)" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Badge tone={selectedWarning.severity === "critical" || selectedWarning.severity === "high" ? "warning" : "neutral"}>{selectedWarning.severity}</Badge>
                <Badge tone="neutral">{selectedWarning.category}</Badge>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{selectedWarning.type}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--nv-color-text-faint)" }}>{msLabel(selectedWarning.range.start_ms)}–{msLabel(selectedWarning.range.end_ms)} • {CATEGORY_META[selectedWarning.category].label}</span>
              </div>
              <div style={{ fontSize: 11, marginTop: 6, color: "var(--nv-color-text-muted)" }}>{selectedWarning.explanation}</div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>
                Evidence: {JSON.stringify(selectedWarning.evidence).slice(0, 220)} • related nodes {selectedWarning.related_nodes?.join(", ") ?? "—"}
              </div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                {enrichConfidence(selectedWarning).confidence_explain.slice(0, 240)}
              </div>
              {selectedWarning.type === "lip_sync_mismatch" && <div style={{ marginTop: 6, fontSize: 10, color: "#ef4444" }}>No auto lip-sync fix on approved synthetic — requires approval</div>}
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" onClick={() => onGenerateFix(selectedWarning)}>Preview re-time</Button>
                <Button size="sm" variant="secondary" onClick={() => onGenerateFix(selectedWarning)}>Compare alternate take</Button>
                <Button size="sm" variant="ghost" onClick={() => onApply(selectedWarning)}>Apply to branch</Button>
                <Button size="sm" variant="ghost" onClick={() => onResolve(selectedWarning, "intentional")}>Mark intentional</Button>
                <Button size="sm" variant="ghost" onClick={() => onResolve(selectedWarning, "dismissed")}>Dismiss</Button>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
                {selectedWarning.suggested_fixes.map((f) => (
                  <Badge key={f.type} tone="neutral">
                    {f.type} {f.confidence.toFixed(2)}
                  </Badge>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Requires approval: {String(selectedWarning.requires_approval)} • export_blocking: {String(selectedWarning.export_blocking ?? false)} • style_dependent: {String(selectedWarning.style_dependent ?? false)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 8 }}>Select a marker in the lane above. Panel shows evidence, confidence, graph nodes, suggested fixes — never forces raw diagnostics.</div>
          )}
          {proposalInfo && <div style={{ marginTop: 8, fontSize: 11, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", padding: 8, borderRadius: 8 }}>{proposalInfo}</div>}
        </Card>
      </div>

      {/* Proposals as non-destructive graph nodes */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Suggested Fixes as Proposals <Badge tone="primary">non-destructive → graph node</Badge></div>
        <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
          {`{ "proposal_id": "proposal_…", "warning_id": "warn_…", "operation": { "type": "insert_b_roll", "parameters": { "candidate_asset_id": "asset_broll_07", "duration_ms": 840 } }, "expected_effect": { "warning_resolution": "likely", "continuity_risk": 0.14 }, "mode": "preview_only", "requires_approval": true }`}
        </div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Preview → Apply to branch → Compare before/after → Apply to current → Reject / Mark intentional / Request another. Learning scoped to project/series/brand/export profile, never global suppression.</div>
      </Card>

      {/* Warnings table */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Open Warnings (linked to semantic spans, graph nodes, assets, versions — follows moved ranges) <Badge tone="neutral">{filtered.length}</Badge></div>
        <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 140px 1fr 110px", gap: 0, background: "var(--nv-color-surface-2)", padding: "6px 10px", fontSize: 11, fontWeight: 800, color: "var(--nv-color-text-faint)" }}>
            <span>Range / Type</span><span>Category / Severity</span><span>Explanation</span><span>Fixes</span>
          </div>
          {filtered.slice(0, 12).map((w) => (
            <div key={w.warning_id} onClick={() => setSelected(w.warning_id)} style={{ display: "grid", gridTemplateColumns: "140px 140px 1fr 110px", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--nv-color-border)", fontSize: 11, cursor: "pointer", background: selected === w.warning_id ? "rgba(14,165,233,0.06)" : "transparent" }}>
              <span style={{ fontFamily: "var(--nv-font-mono)" }}>{msLabel(w.range.start_ms)}<br/><span style={{ color: "var(--nv-color-text-faint)", fontSize: 10 }}>{w.type}</span></span>
              <span><Badge tone={w.severity === "critical" || w.severity === "high" ? "warning" : "neutral"}>{w.severity}</Badge><div style={{ marginTop: 4, display: "flex", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: CATEGORY_META[w.category].color, display: "inline-block" }} />{w.category}</div></span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{w.explanation.slice(0, 110)}…</span>
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{w.suggested_fixes.slice(0, 2).map((f) => (<Badge key={f.type} tone="neutral">{f.type}</Badge>))}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
