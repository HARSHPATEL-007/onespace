"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Tabs } from "@n0va/ui";
import type { AutonomyMode, Evidence, Proposal, IntentEnvelope, ConfidenceBreakdown } from "./copilot-types";
import { AUTONOMY_MODES, PERMISSION_MATRIX, DERIVATIVE_MATRIX, AGENT_CONTRACTS } from "./copilot-types";
import { parseIntentEnvelope, assembleContextPacket, createProposal, detectConflict, auditForProposal, unresolvedCommentsImpact } from "./copilot-engine";

/* Helpers */
function msToTc(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ff = String(Math.floor((ms % 1000) / 33)).padStart(2, "0");
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${ff}`;
}
function kindBadge(kind: Evidence["kind"]) {
  const map: Record<string, { tone: "neutral" | "primary" | "success" | "warning"; label: string }> = {
    exact: { tone: "success", label: "exact" },
    semantic: { tone: "primary", label: "semantic" },
    visual: { tone: "primary", label: "visual" },
    inferred: { tone: "warning", label: "inferred" },
  };
  return map[kind] ?? { tone: "neutral" as const, label: kind };
}

/* Main Copilot Panel */
export function VideoCopilotPanel({
  projectId,
  timelineId,
  projectTitle,
}: {
  projectId: string;
  timelineId?: string;
  projectTitle?: string;
}) {
  const [autonomy, setAutonomy] = useState<AutonomyMode>("assisted");
  const [userRequest, setUserRequest] = useState("Create a 60-second cut focused on the product demonstration");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [activeView, setActiveView] = useState<"command" | "plan" | "preview" | "decision" | "audit">("command");
  const [previewMode, setPreviewMode] = useState<"narrative" | "difference" | "evidence">("narrative");
  const [selectedOps, setSelectedOps] = useState<Set<string>>(new Set());
  const [baseSnapshot] = useState(`snap_${Date.now().toString(36)}`);
  const [generating, setGenerating] = useState(false);
  const [showContracts, setShowContracts] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

  // Generate proposal (planning separate from execution)
  const envelope: IntentEnvelope = useMemo(() => parseIntentEnvelope({
    user_request: userRequest,
    project_id: projectId,
    timeline_id: timelineId ?? `tl_${projectId.slice(0, 6)}`,
    autonomy_mode: autonomy,
  }), [userRequest, projectId, timelineId, autonomy]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      try {
        const res = await fetch("/api/videos/copilot/proposal", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_request: userRequest, project_id: projectId, timeline_id: timelineId ?? `tl_${projectId.slice(0,6)}`, autonomy_mode: autonomy }),
        });
        if (res.ok) {
          const p: Proposal = await res.json();
          setProposal(p);
          setSelectedOps(new Set(p.operations.map(o => o.op_id)));
          setActiveView("plan");
          return;
        }
      } catch {}
      const packet = assembleContextPacket(envelope, { projectTitle });
      const p = createProposal(envelope, packet);
      p.merge_conflict = detectConflict(baseSnapshot, baseSnapshot);
      setProposal(p);
      setSelectedOps(new Set(p.operations.map(o => o.op_id)));
      setActiveView("plan");
    } finally {
      setGenerating(false);
    }
  };

  const handleDecision = async (action: NonNullable<Proposal["decision"]>["action"]) => {
    if (!proposal) return;
    // Try server transactional commit (verifies base snapshot unchanged, audit, rollback options)
    try {
      const res = await fetch("/api/videos/copilot/decision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal_id: proposal.proposal_id, action, selectedOpIds: action === "accept_selected" ? Array.from(selectedOps) : undefined }),
      });
      if (res.ok) {
        const updated: Proposal = await res.json();
        setProposal(updated);
        setActiveView(action === "reject" ? "audit" : "decision");
        return;
      }
    } catch {}
    const updated: Proposal = {
      ...proposal,
      status: action === "reject" ? "rejected" : action === "modify" ? "draft" : "merged",
      decision: { by: "you", at: new Date().toISOString(), action, selected_ops: action === "accept_selected" ? Array.from(selectedOps) : undefined, note: action === "modify" ? "Regenerate affected operations" : undefined },
    };
    const _audit = auditForProposal(updated, autonomy);
    setProposal(updated);
    setActiveView(action === "reject" ? "audit" : "decision");
  };

  const allViews = [
    { id: "command", label: "Command" },
    { id: "plan", label: "Plan" },
    { id: "preview", label: "Preview" },
    { id: "decision", label: "Decision" },
    { id: "audit", label: "Audit" },
  ] as const;

  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", overflow: "hidden", background: "var(--nv-color-surface)" }}>
      {/* Autonomy selector — visible, included in every audit record */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "linear-gradient(135deg,#0f0f12 0%,#1e1a3a 100%)", color: "#fff", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", opacity: 0.75 }}>AUTONOMY</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {AUTONOMY_MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setAutonomy(m.id)}
              title={`${m.label}: ${m.description} • ${m.commit}`}
              style={{
                padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: "pointer",
                background: autonomy === m.id ? "#fff" : "rgba(255,255,255,0.12)", color: autonomy === m.id ? "#0f0f12" : "#fff",
                border: autonomy === m.id ? "2px solid #fff" : "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: m.color, display: "inline-block" }} />
              {m.label}
              {autonomy === m.id && <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>• {m.commit}</span>}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.7, border: "1px solid rgba(255,255,255,0.18)", padding: "4px 10px", borderRadius: 999, maxWidth: 360, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          Project policy • mode inherited • included in audit • {autonomy === "locked_production" ? "Reads only approved • no generative" : autonomy === "governed_autonomous" ? "Policy gates high-risk" : "Human decision before commit"}
        </span>
      </div>

      {/* Intent envelope preview (transparent) */}
      <div style={{ padding: "10px 14px", background: "var(--nv-color-surface-2)", borderBottom: "1px solid var(--nv-color-border)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11 }}>
        <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: "0.06em", color: "var(--nv-color-text-faint)" }}>INTENT ENVELOPE</span>
        <Badge tone="primary">{envelope.intent_id}</Badge>
        <span style={{ fontFamily: "var(--nv-font-mono)", color: "var(--nv-color-text-muted)" }}>{envelope.project_id.slice(0, 8)} • {envelope.timeline_id} • {envelope.target_duration_ms ? `${envelope.target_duration_ms / 1000}s` : "no duration"} • {envelope.creative_goal ?? "general"}</span>
        <Badge tone={envelope.requires_approval ? "warning" : "success"}>{envelope.requires_approval ? "requires approval" : "no approval"}</Badge>
        <span style={{ marginLeft: "auto", color: "var(--nv-color-text-faint)" }}>Chain: User intent → Parser → Context resolver → Evidence → Planner → Risk → Simulation → Proposal → Review → Commit → Audit/Learning/Rollback</span>
      </div>

      {/* 5 Views tabs */}
      <div style={{ padding: "10px 12px 0" }}>
        <Tabs tabs={allViews as unknown as { id: string; label: string }[]} active={activeView} onChange={id => setActiveView(id as typeof activeView)} />
      </div>

      <div style={{ padding: 14 }}>
        {activeView === "command" && (
          <CommandView
            userRequest={userRequest} onRequest={setUserRequest}
            envelope={envelope}
            autonomy={autonomy}
            onGenerate={handleGenerate} generating={generating}
            onShowContracts={() => setShowContracts(v => !v)} showContracts={showContracts}
            onShowMatrix={() => setShowMatrix(v => !v)} showMatrix={showMatrix}
          />
        )}
        {activeView === "plan" && proposal && (
          <PlanView proposal={proposal} onSelectOps={setSelectedOps} selectedOps={selectedOps} />
        )}
        {activeView === "preview" && proposal && (
          <PreviewView proposal={proposal} mode={previewMode} onMode={setPreviewMode} />
        )}
        {activeView === "decision" && proposal && (
          <DecisionView proposal={proposal} autonomy={autonomy} selectedCount={selectedOps.size} onDecision={handleDecision} />
        )}
        {activeView === "audit" && proposal && (
          <AuditView proposal={proposal} autonomy={autonomy} />
        )}
        {/* Empty states */}
        {activeView !== "command" && !proposal && (
          <div className="nv-empty" style={{ minHeight: 220 }}>
            <div style={{ fontWeight: 800 }}>No proposal yet</div>
            <div style={{ fontSize: 13, color: "var(--nv-color-text-muted)", maxWidth: 520, textAlign: "center" }}>Go to Command → enter a natural-language request → Generate. Planning is free (inspect/search/draft); execution requires explicit authorization and creates a reversible branch.</div>
            <Button size="sm" onClick={() => setActiveView("command")}>Go to Command</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Command View ─────────────────────────────────────────────────────────── */
function CommandView({
  userRequest, onRequest, envelope, autonomy, onGenerate, generating, onShowContracts, showContracts, onShowMatrix, showMatrix,
}: {
  userRequest: string; onRequest: (v: string) => void; envelope: IntentEnvelope; autonomy: AutonomyMode;
  onGenerate: () => void; generating: boolean;
  onShowContracts: () => void; showContracts: boolean;
  onShowMatrix: () => void; showMatrix: boolean;
}) {
  const examples = [
    "Create a 60-second cut focused on the product demonstration",
    "Find every shot where the speaker mentions pricing",
    "Replace this section with the strongest take",
    "Match the color and pacing of the reference video",
    "Generate three versions for LinkedIn, YouTube, and Instagram",
    "Show me every unresolved review comment affecting the final export",
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
          Natural-language command <Badge tone="neutral">Mode: {autonomy}</Badge>
          <span style={{ fontWeight: 500, color: "var(--nv-color-text-faint)", fontSize: 11 }}>• planning ≠ execution</span>
        </label>
        <textarea className="nv-input" value={userRequest} onChange={e => onRequest(e.target.value)} rows={3} placeholder="e.g. Create a 60-second cut focused on the product demonstration" style={{ fontSize: 14 }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {examples.map(ex => (
            <button key={ex} onClick={() => onRequest(ex)} style={{ fontSize: 11, background: ex === userRequest ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)", color: ex === userRequest ? "#fff" : "inherit", border: "1px solid var(--nv-color-border)", padding: "4px 8px", borderRadius: 999, cursor: "pointer", textAlign: "left", maxWidth: 340, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button size="md" onClick={onGenerate} disabled={generating || !userRequest.trim()}>{generating ? "Planning…" : "Generate Proposal (plan → simulate, no commit)"}</Button>
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Inspect/search/draft freely. Commit requires approval → staged branch → merge.</span>
        </div>

        {/* Envelope details */}
        <div style={{ background: "#0f0f12", color: "#a5b4fc", borderRadius: 10, padding: 12, fontFamily: "var(--nv-font-mono)", fontSize: 11, lineHeight: 1.5, border: "1px solid #222" }}>
          <div style={{ fontWeight: 800, color: "#fff", marginBottom: 6 }}>Intent Envelope (structured, auditable)</div>
          <div>intent_id: {envelope.intent_id}</div>
          <div>target_duration_ms: {envelope.target_duration_ms ?? "null"} • creative_goal: {envelope.creative_goal ?? "null"} • source_scope: {envelope.source_scope}</div>
          <div>output_mode: {envelope.output_mode} • autonomy: {envelope.autonomy_mode} • requires_approval: {String(envelope.requires_approval)}</div>
          <div style={{ marginTop: 6, color: "#fbbf24" }}>Inferred: {Object.keys(envelope.inferred).length ? Object.entries(envelope.inferred).map(([k, v]) => `${k}=${String((v as { value: unknown }).value).slice(0, 60)} (c ${(v as { confidence: number }).confidence})`).join(" • ") : "—"}</div>
          <div style={{ color: "#94a3b8" }}>Assumptions: {envelope.assumptions.length ? envelope.assumptions.join(" • ") : "—"}</div>
          <div style={{ color: "#f87171" }}>Unknowns: {envelope.unknowns.length ? envelope.unknowns.join(" • ") : "—"}</div>
          <div style={{ marginTop: 6, opacity: 0.75 }}>Distinction: explicit instructions vs inferred preferences vs project constraints vs brand/compliance rules vs agent assumptions vs unknowns. If “make it energetic,” interpretation is exposed (faster pacing, shorter pauses, higher music energy, brighter grade) not silent.</div>
        </div>

        {/* Clarification policy */}
        <div style={{ background: "rgba(14,165,233,0.08)", border: "1px solid rgba(14,165,233,0.25)", borderRadius: 10, padding: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 800 }}>Clarification policy — ask only when material</div>
          <div style={{ color: "var(--nv-color-text-muted)", marginTop: 4 }}>Example: “I found three product demonstrations. I selected the approved demo featuring the laptop because it has highest visual+transcript relevance (0.96). Continue, or choose another?” — prevents interruptions while keeping choices inspectable.</div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--nv-color-text-faint)" }}>Chain: User intent → Intent parser → Context/permission resolver → Evidence retrieval (purpose-bound) → Edit planner → Risk/policy evaluator → Simulation/proxy → Explainable proposal → Human review → Transactional commit → Audit/learning/rollback</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>Permissions & Approval Matrix <Button size="sm" variant="ghost" onClick={onShowMatrix}>{showMatrix ? "Hide" : "Show"}</Button></div>
          {!showMatrix ? <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Approval gates appear immediately before consequential action, default-deny timeout for high-risk.</div> : (
            <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid var(--nv-color-border)", borderRadius: 8 }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "var(--nv-color-surface-2)", textAlign: "left" }}><th style={{ padding: 6 }}>Action</th><th style={{ padding: 6 }}>Autonomy</th><th style={{ padding: 6 }}>Approval</th></tr></thead>
                <tbody>{PERMISSION_MATRIX.map(r => <tr key={r.action} style={{ borderTop: "1px solid var(--nv-color-border)" }}><td style={{ padding: 6 }}>{r.action}</td><td style={{ padding: 6 }}><Badge tone={r.default_autonomy==="disabled" ? "warning" : "neutral"}>{r.default_autonomy}</Badge></td><td style={{ padding: 6 }}>{r.approval}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>Agent Contracts (typed, auditable) <Button size="sm" variant="ghost" onClick={onShowContracts}>{showContracts ? "Hide" : "Show"}</Button></div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Copilot = supervisor (not super-agent). Specialists expose typed capabilities, receive minimum context.</div>
          {showContracts && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
              {AGENT_CONTRACTS.map(a => (
                <div key={a.agent} style={{ border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, background: "var(--nv-color-surface-2)" }}>
                  <div style={{ fontWeight: 800, fontSize: 12 }}>{a.agent} <Badge tone={a.risk_class==="critical" ? "warning" : "neutral"}>{a.risk_class}</Badge></div>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>can: {a.capabilities.join(", ")}</div>
                  <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>needs: {a.required_permissions.join(", ")} • prohibited: {a.prohibited_actions.join(", ")} • rollback: {a.rollback}</div>
                </div>
              ))}
            </div>
          )}
          {!showContracts && <div style={{ marginTop: 8, fontSize: 11, background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, border: "1px solid var(--nv-color-border)" }}>Reconciles conflicts — e.g. pacing agent shortening a clip while compliance requires disclaimer visible. Minimum context per agent.</div>}
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Project Scope</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)", marginTop: 4 }}>Current: {envelope.project_id.slice(0, 12)} • timeline {envelope.timeline_id} • available permissions: project.read, timeline.read, timeline.branch.write (staging only)</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge tone="neutral">evidence retrieval</Badge><Badge tone="neutral">purpose-bound scopes</Badge><Badge tone="primary">shows sources</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Plan View ────────────────────────────────────────────────────────────── */
function PlanView({ proposal, selectedOps, onSelectOps }: { proposal: Proposal; selectedOps: Set<string>; onSelectOps: (s: Set<string>) => void }) {
  const toggle = (id: string) => {
    const next = new Set(selectedOps);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectOps(next);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Edit Plan — typed ordered operations</span>
          <Badge tone="primary">{proposal.proposal_id}</Badge>
          <Badge tone="neutral">base {proposal.base_snapshot.slice(0, 12)} → branch {proposal.target_branch}</Badge>
          <Badge tone={proposal.risk.level==="low" ? "success" : proposal.risk.level==="medium" ? "warning" : "warning"}>risk {proposal.risk.level} • {proposal.risk.reversibility}</Badge>
        </div>
        <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 90px 1fr 70px 56px", gap: 0, background: "var(--nv-color-surface-2)", padding: "8px 10px", fontSize: 11, fontWeight: 800, color: "var(--nv-color-text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <span>✓</span><span>Type</span><span>Operation / Reason</span><span>Range</span><span>Conf</span>
          </div>
          {proposal.operations.map(op => (
            <div key={op.op_id} style={{ display: "grid", gridTemplateColumns: "28px 90px 1fr 70px 56px", gap: 8, padding: "10px 10px", borderTop: "1px solid var(--nv-color-border)", alignItems: "start", background: selectedOps.has(op.op_id) ? "rgba(139,92,246,0.06)" : "transparent" }}>
              <input type="checkbox" checked={selectedOps.has(op.op_id)} onChange={() => toggle(op.op_id)} />
              <Badge tone="neutral">{op.type}</Badge>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{op.description}</div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 2 }}>Reason: {op.reason} • tracks: {op.affected_tracks.join(", ")} • {op.assumptions?.length ? `assume: ${op.assumptions.join(", ")}` : ""}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  <Badge tone={op.risk==="low" ? "success" : op.risk==="medium" ? "warning" : "warning"}>risk {op.risk}</Badge>
                  <Badge tone="neutral">{op.reversibility}</Badge>
                  {op.evidence_ids?.length ? <Badge tone="primary">evidence</Badge> : null}
                </div>
              </div>
              <span style={{ fontFamily: "var(--nv-font-mono)", fontSize: 11, color: "var(--nv-color-text-muted)" }}>{msToTc(op.time_range[0])}–{msToTc(op.time_range[1])}</span>
              <span style={{ fontWeight: 800, fontSize: 12, color: op.confidence < 0.75 ? "#ef4444" : op.confidence < 0.85 ? "#f59e0b" : "#10b981" }}>{op.confidence.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 10, fontFamily: "var(--nv-font-mono)", fontSize: 11, border: "1px solid #222" }}>
          <div>Affected tracks: {Array.from(new Set(proposal.operations.flatMap(o=>o.affected_tracks))).join(", ")} • source assets: {proposal.operations.filter(o=>o.source_asset).map(o=>o.source_asset).join(", ") || "—"} • inserted: {proposal.operations.filter(o=>o.inserted).length} • removed: {proposal.operations.filter(o=>o.removed).length || proposal.operations.filter(o=>o.type==="remove_silence").length}</div>
          <div style={{ marginTop: 4 }}>Estimated render: ${proposal.risk.estimated_render_cost_usd} • {Math.round(proposal.risk.estimated_render_ms/1000)}s • rollback: {proposal.risk.rollback_info} • base snapshot {proposal.base_snapshot}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Confidence Decomposition</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Overall {proposal.confidence.overall.toFixed(2)} — not = permission. High confidence still requires approval for locked master/consent/external.</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["Retrieval", proposal.confidence.retrieval, "Did we find right source?"],
              ["Semantic", proposal.confidence.semantic, "Does content match intent?"],
              ["Edit", proposal.confidence.edit, "Is cut structurally appropriate?"],
              ["Technical", proposal.confidence.technical, "Will it render correctly?"],
              ["Policy", proposal.confidence.policy, "Brand/privacy/copyright/workflow?"],
              ["User pref", proposal.confidence.user_preference, "Matches editor style?"],
            ].map(([label, val, why]) => (
              <div key={label as string} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 70, fontSize: 11, fontWeight: 700 }}>{label as string}</span>
                <div style={{ flex: 1, height: 8, background: "var(--nv-color-border)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${(val as number)*100}%`, height: "100%", background: (val as number) < 0.75 ? "#ef4444" : (val as number) < 0.85 ? "#f59e0b" : "#10b981" }} /></div>
                <span style={{ width: 36, textAlign: "right", fontWeight: 800, fontSize: 12 }}>{(val as number).toFixed(2)}</span>
                <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)", maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{why as string}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, background: "var(--nv-color-surface-2)", padding: 8, borderRadius: 8, border: "1px solid var(--nv-color-border)" }}>
            <div style={{ fontWeight: 800 }}>Overall: {proposal.confidence.overall.toFixed(2)}</div>
            <div style={{ color: "var(--nv-color-text-muted)" }}>{proposal.confidence.explanation}</div>
            {proposal.confidence.uncertainty_reason && <div style={{ color: "#f59e0b", marginTop: 4 }}>Uncertainty: {proposal.confidence.uncertainty_reason} — two product demos have similar relevance (0.96 vs 0.84).</div>}
          </div>
        </Card>

        <Card padded>
          <div style={{ fontWeight: 800 }}>Risk & Policy</div>
          <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge tone={proposal.risk.level==="low" ? "success" : proposal.risk.level==="medium" ? "warning" : "warning"}>level {proposal.risk.level}</Badge>
            <Badge tone="neutral">{proposal.risk.reversibility}</Badge>
            {proposal.risk.policy_flags.map(f => <Badge key={f} tone="warning">{f}</Badge>)}
            <Badge tone={proposal.risk.requires_approval ? "warning" : "success"}>{proposal.risk.requires_approval ? "requires approval" : "no approval"}</Badge>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Approver: {proposal.risk.approver_role} • cost ${proposal.risk.estimated_render_cost_usd} • render ~{Math.round(proposal.risk.estimated_render_ms/1000)}s • {proposal.risk.rollback_info}</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>Context sources: {proposal.context_sources.join(" • ")}</div>
        </Card>

        <Card padded>
          <div style={{ fontWeight: 800 }}>Evidence (time-coded)</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Exact vs semantic vs visual vs inferred — jump to frame/transcript span.</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {proposal.evidence.map(ev => {
              const k = kindBadge(ev.kind);
              return (
                <div key={ev.result + ev.timecode} style={{ border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, background: "var(--nv-color-surface-2)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 12 }}>{ev.result}</span>
                    <Badge tone={k.tone}>{k.label}</Badge>
                    <span style={{ fontFamily: "var(--nv-font-mono)", fontSize: 11, color: "var(--nv-color-text-muted)" }}>{ev.timecode}</span>
                    <span style={{ marginLeft: "auto", fontWeight: 800 }}>{ev.confidence.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 2 }}>{ev.evidence} {ev.speaker ? `• ${ev.speaker}` : ""}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Preview View ─────────────────────────────────────────────────────────── */
function PreviewView({ proposal, mode, onMode }: { proposal: Proposal; mode: "narrative" | "difference" | "evidence"; onMode: (m: typeof mode) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Simulation / Proxy Render</span>
          <Badge tone="primary">proxy quality • defer full until approval</Badge>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {(["narrative", "difference", "evidence"] as const).map(m => (
              <button key={m} onClick={() => onMode(m)} style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, cursor: "pointer", background: mode===m ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)", color: mode===m ? "#fff" : "inherit", border: "1px solid var(--nv-color-border)" }}>{m}</button>
            ))}
          </div>
        </div>

        <div style={{ background: "#000", borderRadius: 12, overflow: "hidden", border: "1px solid #222", aspectRatio: "16/9", position: "relative", display: "grid", placeItems: "center", color: "#fff" }}>
          {mode === "narrative" && <div style={{ textAlign: "center" }}><div style={{ fontWeight: 800 }}>Narrative Preview — proposed result only</div><div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{proposal.simulation.proxy_video_url} • {Math.round(proposal.simulation.after_duration_ms/1000)}s • quality {proposal.simulation.quality_score}</div><div style={{ marginTop: 10, width: 200, height: 8, background: "#333", borderRadius: 999, overflow: "hidden", marginInline: "auto" }}><div style={{ width: "68%", height: "100%", background: "#818cf8" }} /></div></div>}
          {mode === "difference" && (
            <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <div style={{ background: "#111", display: "grid", placeItems: "center", borderRight: "1px solid #333" }}><span style={{ fontSize: 11, opacity: 0.7 }}>Before • {Math.round(proposal.simulation.before_duration_ms/1000)}s</span></div>
              <div style={{ background: "#0f0f12", display: "grid", placeItems: "center" }}><span style={{ fontSize: 11, color: "#818cf8" }}>After • {Math.round(proposal.simulation.after_duration_ms/1000)}s • {proposal.simulation.diff.added} added / {proposal.simulation.diff.removed} removed</span></div>
            </div>
          )}
          {mode === "evidence" && (
            <div style={{ padding: 14, width: "100%" }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>Why each segment was chosen/removed</div>
              {proposal.operations.slice(0, 3).map(op => <div key={op.op_id} style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", padding: 6, borderRadius: 6, marginTop: 6 }}>{op.description} → {op.reason} (c {op.confidence.toFixed(2)})</div>)}
            </div>
          )}
          <div style={{ position: "absolute", bottom: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.7 }}>
            <span>Proxy preview • heavy ops (super-res, generative fill, interpolation) at proxy; full on approval</span>
            <span>{msToTc(proposal.simulation.before_duration_ms)} → {msToTc(proposal.simulation.after_duration_ms)} Δ {proposal.simulation.duration_delta_ms>0?"+":""}{Math.round(proposal.simulation.duration_delta_ms/1000)}s</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {[
            ["Duration", `${Math.round(proposal.simulation.before_duration_ms/1000)}s → ${Math.round(proposal.simulation.after_duration_ms/1000)}s`],
            ["Quality", `${proposal.simulation.quality_score}/100`],
            ["Cost", `$${proposal.simulation.cost_estimate_usd} • ~${Math.round(proposal.simulation.render_time_estimate_ms/1000)}s`],
          ].map(([k,v]) => <div key={k as string} style={{ background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)", borderRadius: 8, padding: 8, textAlign: "center" }}><div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", fontWeight: 800 }}>{k as string}</div><div style={{ fontWeight: 800 }}>{v as string}</div></div>)}
        </div>

        <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", background: "var(--nv-color-surface-2)", fontWeight: 800, fontSize: 12, display: "flex", gap: 8 }}>Timeline diff <Badge tone="neutral">before/after</Badge><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}>Removed/inserted clips • color/audio/caption changes</span></div>
          <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
            <div><strong>Removed:</strong> {proposal.simulation.diff.removed ? `${proposal.simulation.diff.removed} clips/pauses` : "—"} • <strong>Inserted:</strong> {proposal.simulation.diff.added ? `${proposal.simulation.diff.added} clips` : "—"} • <strong>Modified:</strong> {proposal.simulation.diff.modified}</div>
            <div><strong>Color:</strong> {proposal.simulation.color_changes.join(" • ") || "—"}</div>
            <div><strong>Audio:</strong> {proposal.simulation.audio_changes.join(" • ") || "—"}</div>
            <div><strong>Captions:</strong> {proposal.simulation.caption_changes.join(" • ")}</div>
            {proposal.simulation.compliance_warnings.length ? <div style={{ color: "#f59e0b" }}><strong>Compliance:</strong> {proposal.simulation.compliance_warnings.join(" • ")}</div> : <div style={{ color: "#10b981" }}><strong>Compliance:</strong> No warnings • brand/consent/copyright OK</div>}
            <div><strong>Export impact:</strong> {proposal.simulation.export_impact.join(" • ")}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Track-level changes</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["video_1", "2 added, 1 trimmed", "#818cf8"],
              ["audio_1", "silence removed, rebalance", "#10b981"],
              ["graphics_1", "no change", "#f59e0b"],
            ].map(([track, ch, color]) => <div key={track as string} style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, background: "var(--nv-color-surface-2)", borderRadius: 8, border: "1px solid var(--nv-color-border)" }}><span style={{ width: 8, height: 8, borderRadius: 999, background: color as string }} /><span style={{ fontWeight: 700, fontSize: 12 }}>{track as string}</span><span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-muted)" }}>{ch as string}</span></div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 8 }}>Proxy video: {proposal.simulation.proxy_video_url.slice(0, 48)}… • audio: {proposal.simulation.audio_preview_url.slice(0, 32)}…</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Branch & Merge</div>
          <div style={{ fontSize: 12, marginTop: 6, background: proposal.merge_conflict?.has_conflict ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${proposal.merge_conflict?.has_conflict ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, padding: 8, borderRadius: 8 }}>
            <div style={{ fontWeight: 800 }}>{proposal.merge_conflict?.has_conflict ? "⚠ Conflict" : "✓ No conflict"}</div>
            <div style={{ color: "var(--nv-color-text-muted)" }}>{proposal.merge_conflict?.message}</div>
            {proposal.merge_conflict?.has_conflict && <div style={{ marginTop: 6, fontFamily: "var(--nv-font-mono)", fontSize: 11 }}>Range: {proposal.merge_conflict.conflicting_range?.map(msToTc).join(" – ")} — show conflict map, not silent overwrite</div>}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Flow: Base → Snapshot → Branch {proposal.target_branch} → Preview → Decision → Merge (verify base unchanged) → Audit/Learning/Rollback</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Reversibility</div>
          <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, fontSize: 11 }}>
            {[
              ["Complete", "Clip/marker/caption → one-click undo"],
              ["Parameterized", "Grade/EQ/transition → restore params"],
              ["Branch-only", "Alternate cut → delete branch"],
              ["Derived", "Render/proxy → recompute"],
              ["External", "Publish/notify → compensating action"],
              ["Irreversible", "Purge/consent revocation → confirm + elevated"],
            ].map(([k,v]) => <div key={k} style={{ background: "var(--nv-color-surface-2)", padding: 6, borderRadius: 6, border: "1px solid var(--nv-color-border)" }}><strong>{k}</strong> • {v}</div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Current: {proposal.risk.reversibility} → {proposal.risk.rollback_info}</div>
        </Card>
      </div>
    </div>
  );
}

/* ── Decision View ────────────────────────────────────────────────────────── */
function DecisionView({ proposal, autonomy, selectedCount, onDecision }: { proposal: Proposal; autonomy: AutonomyMode; selectedCount: number; onDecision: (a: NonNullable<Proposal["decision"]>["action"]) => void }) {
  const canDirectCommit = autonomy === "governed_autonomous" && proposal.risk.level === "low" && !proposal.risk.policy_flags.includes("external_publish");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="md" onClick={() => onDecision("accept_all")} disabled={proposal.status==="merged"}>Accept all ({proposal.operations.length} ops) → transactional merge</Button>
          <Button size="md" variant="secondary" onClick={() => onDecision("accept_selected")} disabled={selectedCount===0}>Accept selected ({selectedCount}) → partial merge</Button>
          <Button size="md" variant="ghost" onClick={() => onDecision("modify")}>Modify → regenerate affected ops</Button>
          <Button size="md" variant="ghost" onClick={() => onDecision("reject")}>Reject → archive proposal</Button>
        </div>
        <div style={{ background: canDirectCommit ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${canDirectCommit ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: 10, padding: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 800 }}>{canDirectCommit ? "Governed autonomous: low-risk ops may auto-commit per policy" : "Assisted: human approval required before commit"}</div>
          <div style={{ color: "var(--nv-color-text-muted)", marginTop: 4 }}>Mode <strong>{autonomy}</strong> • risk {proposal.risk.level} • {proposal.risk.requires_approval ? "approval gate immediately before commit, default-deny timeout for high-risk" : "no gate"} • {proposal.merge_conflict?.has_conflict ? "conflict blocks merge" : "merge verified"}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button size="sm" variant="ghost" onClick={() => onDecision("modify")}>Ask the copilot (refine)</Button>
          <Button size="sm" variant="secondary">Save as reusable recipe</Button>
          <Badge tone="neutral">Narrative: open → demo body → proof → close • omitted high-ranking candidates shown</Badge>
        </div>
        {/* Derivative matrix if relevant */}
        {proposal.intent.output_mode === "derivative_matrix" && (
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "8px 10px", background: "var(--nv-color-surface-2)", fontWeight: 800, fontSize: 12 }}>Derivative Matrix (single timeline, inherited brand/provenance, platform-specific policy)</div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "var(--nv-color-surface-2)", textAlign: "left" }}><th style={{ padding: 6 }}>Variant</th><th style={{ padding: 6 }}>Aspect</th><th style={{ padding: 6 }}>Duration</th><th style={{ padding: 6 }}>Captions</th><th style={{ padding: 6 }}>Safe area</th></tr></thead>
              <tbody>{DERIVATIVE_MATRIX.map(d => <tr key={d.variant} style={{ borderTop: "1px solid var(--nv-color-border)" }}><td style={{ padding: 6, fontWeight: 700 }}>{d.variant}</td><td style={{ padding: 6 }}>{d.aspect}</td><td style={{ padding: 6 }}>{d.duration_strategy}</td><td style={{ padding: 6 }}>{d.captions}</td><td style={{ padding: 6 }}>{d.safe_area}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {/* Unresolved comments impact */}
        {proposal.intent.user_request.toLowerCase().includes("unresolved") && (
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Comment impact (timeline + asset lineage)</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Directly overlaps export • refers to clip in export • refers to inherited effect • blocks stage • resolved in earlier branch but not current • legal/compliance asset</div>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {unresolvedCommentsImpact([{ id:"c_002", body:"Add product close-up at 0:45", range:[44000,46000], resolved:false, severity:"medium", owner:"Client" }, { id:"c_005", body:"Color too warm", range:[45000,47000], resolved:false, severity:"low", owner:"Director" }], [0, 60000]).map(c => (
                <div key={c.id} style={{ display: "flex", gap: 8, padding: 8, background: "var(--nv-color-surface-2)", borderRadius: 8, border: "1px solid var(--nv-color-border)", fontSize: 12 }}>
                  <Badge tone={c.severity==="high" ? "warning" : "neutral"}>{c.severity}</Badge>
                  <span style={{ flex: 1 }}><strong>{c.body}</strong> • {c.affected_timecode} • {c.impact} • owner {c.owner}</span>
                  <span style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{c.action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <Card padded>
        <div style={{ fontWeight: 800 }}>What happens on commit</div>
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.6, color: "var(--nv-color-text-muted)" }}>
          <div>1. Verify base {proposal.base_snapshot.slice(0, 12)} unchanged → conflict map if changed</div>
          <div>2. Merge {proposal.operations.length} ops into {proposal.target_branch} transactionally (ACID, causal consistency)</div>
          <div>3. Create full-res render (proxy→full deferred until approval for heavy ops)</div>
          <div>4. Audit: intent→context→agents→tools→decisions→commit hash → rollback options</div>
          <div>5. Learning: scoped to {autonomy === "observe" ? "no learning" : "personal/team/brand/tenant/global (reversible, with origin/confidence/reset)"}</div>
        </div>
        <div style={{ marginTop: 10, background: "#0f0f12", color: "#a5b4fc", borderRadius: 8, padding: 10, fontFamily: "var(--nv-font-mono)", fontSize: 11, border: "1px solid #222" }}>
          <div>Proposal: {proposal.proposal_id} • branch {proposal.target_branch} • snapshot {proposal.base_snapshot.slice(0, 12)}</div>
          <div>Status: {proposal.status} {proposal.decision ? `• ${proposal.decision.action} by ${proposal.decision.by}` : "• awaiting decision"}</div>
          <div>Overall confidence {proposal.confidence.overall.toFixed(2)} • risk {proposal.risk.level} • cost ${proposal.risk.estimated_render_cost_usd} • {proposal.risk.rollback_info}</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--nv-color-text-faint)" }}>“Undo” for external side effects = compensating action + audit, not pretend it never happened. Purge/consent revocation = mandatory confirm + elevated permission.</div>
      </Card>
    </div>
  );
}

/* ── Audit View ───────────────────────────────────────────────────────────── */
function AuditView({ proposal, autonomy }: { proposal: Proposal; autonomy: AutonomyMode }) {
  const audit = auditForProposal(proposal, autonomy);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>Audit — explainable, traceable, reversible</span>
          <Badge tone="primary">NIST: outputs explained + documented, user can interrogate + trace to sources</Badge>
          <Badge tone="neutral">{audit.audit_id}</Badge>
        </div>
        <div style={{ background: "#0f0f12", color: "#e2e8f0", borderRadius: 10, padding: 12, fontFamily: "var(--nv-font-mono)", fontSize: 11, lineHeight: 1.5, border: "1px solid #222" }}>
          <div><strong style={{ color: "#fff" }}>User request:</strong> {audit.user_request}</div>
          <div><strong style={{ color: "#fff" }}>Intent:</strong> {proposal.intent.intent_id} • autonomy {audit.autonomy_mode} • project {proposal.intent.project_id.slice(0, 8)} • timeline {proposal.intent.timeline_id}</div>
          <div><strong style={{ color: "#fff" }}>Retrieved context:</strong> {audit.retrieved_context.join(" • ")}</div>
          <div><strong style={{ color: "#fff" }}>Agent calls:</strong> {audit.agent_calls.map(a=> `${a.agent} (${a.duration_ms}ms)`).join(" → ")}</div>
          <div><strong style={{ color: "#fff" }}>Model versions:</strong> {Object.entries(audit.model_versions).map(([k,v])=> `${k}:${v}`).join(" • ")}</div>
          <div><strong style={{ color: "#fff" }}>Tool actions:</strong> {audit.tool_actions.join(", ")}</div>
          <div><strong style={{ color: "#fff" }}>Human decisions:</strong> {audit.human_decisions.length ? audit.human_decisions.join(" • ") : "— (awaiting)"}</div>
          <div><strong style={{ color: "#fff" }}>Commit:</strong> {audit.final_commit_hash ?? "not yet committed (staging branch only)"} • rollback: {audit.rollback_options.join(" • ")}</div>
          <div><strong style={{ color: "#fff" }}>Provenance:</strong> {audit.provenance.map(p=> `${p.source_asset}@${p.timecode} c${p.confidence}`).join(" • ")}</div>
          {audit.overrides.length ? <div><strong style={{ color: "#fbbf24" }}>Overrides:</strong> {audit.overrides.map(o=> `${o.field}: ${String(o.original)}→${String(o.overridden)} by ${o.by} (${o.reason})`).join(" • ")}</div> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
          <Card padded>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Evaluation — quality</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 4, lineHeight: 1.5 }}>Shot precision/recall • transcript accuracy • timecode accuracy • narrative coherence • continuity errors • caption correction • brand violations • acceptance • modification distance • export failures • rollback frequency</div>
          </Card>
          <Card padded>
            <div style={{ fontWeight: 800, fontSize: 12 }}>Trust & productivity</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 4, lineHeight: 1.5 }}>Explanation usefulness • evidence-click rate • false-confidence • override by op class • approval latency • time to rough cut / approved export • review rounds • search-to-edit • manual ops avoided • cost per approved minute</div>
          </Card>
        </div>
        <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 10, padding: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 800 }}>Failure handling — degrade gracefully</div>
          <div style={{ color: "var(--nv-color-text-muted)", marginTop: 4 }}>On uncertainty: ranked candidates not forced single choice • preserve original • draft branch • mark unsupported assumptions • avoid low-confidence effects • ask when identity/legal/publication risk • deterministic fallback • keep partial plans reusable • never publish because upstream timed out.</div>
          <div style={{ marginTop: 6, fontFamily: "var(--nv-font-mono)", fontSize: 11, background: "#fff", padding: 6, borderRadius: 6, border: "1px solid var(--nv-color-border)" }}>What failed / What completed / What remains unchanged / Whether retry safe / Fallback / Human decision needed</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Safe Learning (scoped, reversible)</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Learn from accepted/rejected/modified, trim patterns, transitions, color, captions, platform choices — but never silently company-wide.</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
            {[
              ["Personal", "Your aggressive jump cuts — only you", "origin: you • conf 0.82 • reset"],
              ["Team", "Editorial pacing — team profile", "origin: editor team • conf 0.71 • reset"],
              ["Brand", "Corporate warm LUT — brand rule", "origin: brand kit • conf 0.93 • policy"],
              ["Tenant", "Legal disclaimer duration — policy", "origin: compliance • conf 1.0 • admin"],
              ["Global", "No auto-promote — guarded", "origin: model • conf — • disabled"],
            ].map(([scope, desc, meta]) => <div key={scope} style={{ display: "flex", gap: 8, padding: 6, background: "var(--nv-color-surface-2)", borderRadius: 6, border: "1px solid var(--nv-color-border)", alignItems: "center" }}><Badge tone={scope==="Brand"||scope==="Tenant" ? "warning" : "neutral"}>{scope}</Badge><span style={{ flex: 1 }}>{desc}</span><span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{meta}</span></div>)}
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginTop: 6 }}>Do not optimize only for acceptance — measure manual correction distance after acceptance.</div>
        </Card>
        <Card padded>
          <div style={{ fontWeight: 800 }}>Stages → Strongest differentiator</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", lineHeight: 1.5, marginTop: 4 }}>
            <div><strong>1 Read-only:</strong> search, transcript/scene retrieval, time-coded answers, comment impact, evidence cards</div>
            <div><strong>2 Draft branches:</strong> rough-cut proposals, operation plans, proxy previews, diffs, accept/reject/partial, snapshots</div>
            <div><strong>3 Specialist orchestration:</strong> Auto-Editor/Colorist/Sound/Caption/Motion/Compliance — typed contracts, scoped perms, confidence, rollback</div>
            <div><strong>4 Governed execution:</strong> policy-as-code, approval gates, RBAC, external staging, audit/provenance, conflict-aware merges, workspace/task sync</div>
            <div><strong>5 Adaptive:</strong> personal/team style, reference-video analysis, derivative matrix, predictive + cost-aware rendering</div>
          </div>
          <div style={{ marginTop: 8, background: "linear-gradient(135deg,#0f0f12,#1e1a3a)", color: "#fff", padding: 8, borderRadius: 8, fontSize: 11 }}>
            <strong>Most valuable:</strong> N0VA can explain exactly what it intends to change, show evidence, simulate result, wait for appropriate human approval, commit transactionally, and restore previous state anytime — a trustworthy creative operating layer.
          </div>
        </Card>
      </div>
    </div>
  );
}
