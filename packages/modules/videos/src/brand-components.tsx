"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@n0va/ui";
import {
  runBrandScan,
  getBrandFindings,
  explainFinding,
  generateProposal,
  evaluateBrandGate,
  getBrandDashboard,
  createWaiver,
  listWaivers,
  compileBrandDocuments,
  approveCompiledRule,
  listCompiledProposals,
  getLogoRegistry,
  getFontPolicy,
  getColorPolicy,
} from "./brand-engine";
import type { BrandFinding } from "./brand-types";

export function BrandPanel({ timelineId, graphVersion }: { timelineId: string; graphVersion: string }) {
  const [region, setRegion] = useState("IN");
  const [platform, setPlatform] = useState("youtube");
  const [findings, setFindings] = useState<BrandFinding[]>(() => getBrandFindings(timelineId));
  const [selected, setSelected] = useState<string | null>(null);
  const [compiled, setCompiled] = useState(() => listCompiledProposals());

  const runScan = () => {
    const res = runBrandScan({ timeline_id: timelineId, graph_version: graphVersion, region, platforms: [platform, "instagram_reels", "broadcast"], checks: ["logos", "fonts", "colors", "voice", "products", "disclaimers", "lower_thirds", "music", "terminology", "regional_rules"] });
    setFindings([...res]);
  };

  const selectedFinding = useMemo(() => findings.find(f => f.finding_id === selected) ?? findings[0] ?? null, [findings, selected]);
  const dashboard = useMemo(() => getBrandDashboard(timelineId, region, "youtube_4k_hdr"), [findings, region]);
  const gate = useMemo(() => evaluateBrandGate({ timeline_id: timelineId, graph_version: graphVersion, export_profile: "youtube_4k_hdr", brand_policy: "brand_nova_2026.08", region }), [findings, region, graphVersion]);
  const waivers = useMemo(() => listWaivers(), [findings]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — architecture */}
      <div style={{ background: "linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color: "#fff", borderRadius: 12, padding: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.7, fontWeight: 800 }}>BRAND INTELLIGENCE — SOURCE → COMPILER → EXECUTABLE POLICY → DASHBOARD</div>
        <div style={{ fontSize: 14, fontWeight: 900, marginTop: 4 }}>Brand guidelines → hard/required/recommended/contextual/experimental rules → warnings/proposals/gates</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 11, opacity: 0.85 }}>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Hard: block export</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Every finding → stable rule_id</span>
          <span style={{ background: "rgba(255,255,255,0.08)", padding: "4px 8px", borderRadius: 999 }}>Regional overrides IN/US</span>
        </div>
      </div>

      {/* Compiler — PDF → rule approval */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Brand Rule Compiler</span>
          <Badge tone="primary">PDF Brand Book v7 → pending approval</Badge>
          <Button size="sm" variant="ghost" onClick={() => { compileBrandDocuments({ brandbook_v7: "Brand Book v7" }); setCompiled([...listCompiledProposals()]); }}>Compile documents</Button>
        </div>
        {compiled.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {compiled.map(c => (
              <div key={c.rule_id} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11, display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontWeight: 700 }}>{c.rule_id}</span>
                <span style={{ color: "var(--nv-color-text-muted)" }}>{c.description.slice(0, 80)}… Source: {c.source.document} p{c.source.page}</span>
                <Badge tone={c.status === "approved" ? "success" : "warning"}>{c.status}</Badge>
                {c.status !== "approved" && <Button size="sm" onClick={() => { approveCompiledRule(c.rule_id, "brand_director_001"); setCompiled([...listCompiledProposals()]); }}>Approve</Button>}
              </div>
            ))}
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>No auto-extracted rule becomes export-blocking until brand owner approves.</div>
          </div>
        )}
      </Card>

      {/* Scan controls */}
      <Card padded>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Brand Scan</span>
          <select value={region} onChange={e => setRegion(e.target.value)} className="nv-input" style={{ fontSize: 11 }}><option value="IN">IN (en-IN, INR)</option><option value="US">US (en-US, USD)</option></select>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="nv-input" style={{ fontSize: 11 }}><option value="youtube">youtube 16:9</option><option value="instagram_reels">instagram_reels 9:16</option><option value="broadcast">broadcast</option></select>
          <Button size="sm" onClick={runScan}>Run Brand Scan (hard/required/recommended)</Button>
          <Badge tone="neutral">{graphVersion}</Badge>
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--nv-color-text-faint)" }}>Checks: logos, fonts, colors, voice, products, disclaimers, lower thirds, music, terminology, regional — scoped to graph version {graphVersion} and platform {platform}</div>
      </Card>

      {/* Dashboard + gate */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Brand Dashboard <Badge tone={dashboard.export_status === "BLOCKED" ? "warning" : "success"}>{dashboard.export_status}</Badge></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Policy {dashboard.policy} • Region {dashboard.region} • Output {dashboard.output}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", fontSize: 11 }}>
            {Object.entries(dashboard.summary).map(([k, v]) => <span key={k} style={{ background: k === "critical" ? "#fee2e2" : k === "high" ? "#ffedd5" : "#f1f5f9", padding: "4px 8px", borderRadius: 999, fontWeight: 800 }}>{k}: {v as number}</span>)}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", fontSize: 11 }}>
            {Object.entries(dashboard.by_category).map(([k, v]) => <span key={k} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999 }}>{k}: {v as number}</span>)}
          </div>
          <div style={{ marginTop: 8, background: gate.result === "blocked" ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, fontSize: 11 }}>
            <div style={{ fontWeight: 700 }}>Pre-Export Gate — {gate.export_profile} • {gate.brand_policy} • {gate.region} • <Badge tone={gate.result === "blocked" ? "warning" : "success"}>{gate.result}</Badge></div>
            <div>Blocking: {gate.blocking_findings.slice(0, 3).join(", ") || "none"} {gate.blocking_findings.length > 3 ? `+${gate.blocking_findings.length - 3}` : ""}</div>
            <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Hard/critical block public/broadcast/regional/client exports; internal review may watermark BRAND REVIEW REQUIRED</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Finding Detail — rule, source, evidence, affected</div>
          {selectedFinding ? (
            <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 10, background: selectedFinding.severity === "critical" ? "rgba(239,68,68,0.08)" : "var(--nv-color-surface-2)" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Badge tone={selectedFinding.severity === "critical" ? "warning" : "neutral"}>{selectedFinding.severity}</Badge><span style={{ fontWeight: 700, fontSize: 12 }}>{selectedFinding.rule_id}</span><Badge tone="neutral">{selectedFinding.category}</Badge><span style={{ marginLeft: "auto", fontSize: 10, color: "var(--nv-color-text-faint)" }}>{selectedFinding.range.start_ms}-{selectedFinding.range.end_ms} • {selectedFinding.scope.region ?? "global"}/{selectedFinding.scope.platform ?? "master"}</span></div>
              <div style={{ fontSize: 11, marginTop: 6, color: "var(--nv-color-text-muted)" }}>{selectedFinding.explanation}</div>
              <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Source: {selectedFinding.source_reference.document} p{selectedFinding.source_reference.page} v{selectedFinding.source_reference.policy_version} • Evidence: {JSON.stringify(selectedFinding.evidence).slice(0, 180)} • Confidence {selectedFinding.confidence.toFixed(2)}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" onClick={() => { const p = generateProposal(selectedFinding.finding_id, ["timing", "speaker_identity"]); alert(`Proposal ${p?.proposal_id ?? "none"} preserve timing/product_position`); }}>Generate Proposal (preserve timing)</Button>
                <Button size="sm" variant="ghost" onClick={() => { const w = createWaiver({ finding_id: selectedFinding.finding_id, approved_by: "creative_director_001", reason: "Campaign intentionally uses monochrome logo.", scope: { platforms: ["cinema_master"] }, expires_at: "2026-12-31T23:59:59Z" }); alert(`Waiver ${w.waiver_id} audit ${w.audit_record.slice(0,16)}`); }}>Approve Waiver</Button>
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: "var(--nv-color-text-muted)" }}>Export effect: {selectedFinding.export_effect} • Suggested: {selectedFinding.suggested_fixes.map(f => f.type).join(", ")}</div>
            </div>
          ) : <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 8 }}>Select a finding below.</div>}
          {waivers.length > 0 && <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Waivers: {waivers.slice(0,2).map(w => `${w.finding_id.slice(0,8)}→${w.approved_by} ${w.reason.slice(0,30)}`).join(" | ")}</div>}
        </Card>
      </div>

      {/* Findings lane */}
      <Card padded>
        <div style={{ fontWeight: 800, display: "flex", gap: 8 }}>Brand Findings — timeline lane <Badge tone="neutral">{findings.length}</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Lane: brand warning • Graphic badge • Transcript highlight • Preview overlay • Checklist</span></div>
        <div style={{ marginTop: 8, background: "#0f0f12", borderRadius: 10, padding: 10, border: "1px solid #222", overflowX: "auto" }}>
          <div style={{ position: "relative", height: 40, minWidth: 900 }}>
            {findings.slice(0, 8).map((f, i) => {
              const left = ((f.range.start_ms % 180000) / 180000) * 100;
              const col = f.severity === "critical" ? "#991b1b" : f.severity === "high" ? "#ef4444" : f.severity === "medium" ? "#f59e0b" : "#22c55e";
              return <div key={f.finding_id} onClick={() => setSelected(f.finding_id)} style={{ position: "absolute", left: `${left}%`, top: 8, width: 14, height: 14, background: col, borderRadius: 4, border: selected === f.finding_id ? "2px solid #fff" : "1px solid rgba(0,0,0,0.3)", cursor: "pointer" }} title={`${f.rule_id} ${f.range.start_ms}`} />;
            })}
            <div style={{ position: "absolute", bottom: 2, left: 6, fontSize: 9, color: "#a5b4fc", display: "flex", gap: 12 }}>
              <span>00:00:04.200 High logo clearspace</span><span>00:00:18.000 Medium unapproved font</span><span>00:01:44.800 Critical disclaimer missing</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, border: "1px solid var(--nv-color-border)", borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "160px 110px 1fr 120px", gap: 0, background: "var(--nv-color-surface-2)", padding: "6px 10px", fontSize: 11, fontWeight: 800, color: "var(--nv-color-text-faint)" }}>
            <span>Range / Rule</span><span>Category / Severity</span><span>Evidence</span><span>Fix</span>
          </div>
          {findings.slice(0, 10).map(f => (
            <div key={f.finding_id} onClick={() => setSelected(f.finding_id)} style={{ display: "grid", gridTemplateColumns: "160px 110px 1fr 120px", gap: 8, padding: "8px 10px", borderTop: "1px solid var(--nv-color-border)", fontSize: 11, cursor: "pointer", background: selected === f.finding_id ? "rgba(14,165,233,0.06)" : "transparent" }}>
              <span style={{ fontFamily: "var(--nv-font-mono)" }}>{String(f.range.start_ms).padStart(5, "0")}<br/><span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{f.rule_id.slice(0, 22)}</span></span>
              <span><Badge tone={f.severity === "critical" || f.severity === "high" ? "warning" : "neutral"}>{f.severity}</Badge><div style={{ fontSize: 10, marginTop: 4 }}>{f.category}</div></span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{f.explanation.slice(0, 100)}… • {JSON.stringify(f.evidence).slice(0, 60)}</span>
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{f.suggested_fixes.slice(0, 2).map(x => <Badge key={x.type} tone="neutral">{x.type}</Badge>)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Registries preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Logo Registry</div>
          <div style={{ background: "#0f0f12", color: "#a5b4fc", padding: 8, borderRadius: 8, fontFamily: "var(--nv-font-mono)", fontSize: 10, border: "1px solid #222", marginTop: 8 }}>
            {(() => { const r = getLogoRegistry().get("logo_primary_horizontal"); return r ? `${r.logo_id} clearspace ${r.clearspace.top}x min ${r.minimum_width_px.digital_1080p}px allow_distortion ${String(r.allow_distortion)}` : "—"; })()}
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Font & Color</div>
          <div style={{ fontSize: 11, marginTop: 8 }}>
            <div>Font: {getFontPolicy().primary_family} weights {getFontPolicy().approved_weights.join(",")} min 42px tracking [-10,40]</div>
            <div>Color: {getColorPolicy().primary.hex} accent {getColorPolicy().accent.hex} contrast {getColorPolicy().accent.contrast_on_primary} forbidden {getColorPolicy().forbidden.length}</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Voice & Product</div>
          <div style={{ fontSize: 11, marginTop: 8 }}>N0VA /ˈnoʊ.və/ NOH-vah not N-zero-V-A • Product nova-phone-2026 2 lenses • Music Corporate Pulse 04 internal only → blocked for public</div>
        </Card>
      </div>
    </div>
  );
}
