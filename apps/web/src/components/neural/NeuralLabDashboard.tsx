"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { NeuralInput } from "@/app/(app)/m/neural/actions";

interface Row {
  id: string;
  [key: string]: unknown;
}

const TIER_LABELS = ["No sensing", "Local estimation", "Private UI adaptation", "Coarse sharing", "Command shortcuts", "Subvocal composition", "Research huddles"];
const SHARED_STATES = ["available", "focused", "in_meeting", "low_interruption_tolerance", "open_to_collaboration", "needs_recovery", "uncertain"];
const AUDIENCES = ["NOBODY", "PEOPLE", "ROOM", "DELAYED_AGGREGATE", "WORKSPACE"];
const FEATURES = ["FLOW_DETECTION", "SUBVOCAL_DECODING", "SHARED_ATTENTION", "NEURAL_STATE_SHARING", "TEAM_DASHBOARD"];

export function NeuralLabDashboard({
  status,
  attention,
  shares,
  visible,
  commands,
  accessLog,
  research,
  action,
}: {
  status: Record<string, unknown> & { tier: { tier: number; tiers?: Array<{ description: string }> }; consents: Array<Row & { feature: string; recipient: string; enabled: boolean; expiresAt: Date | string | null }>; flow: { state: string; flowProb: number | null; confidence: number; sources: string[]; corrected: boolean; rationale: string } | null; huddles: Row[] } | null;
  attention: { flow: { state: string; confidence: number; rationale: string }; weights: { activeTaskBoost: number; reduceVisualComplexity: boolean; delaySuggestions: boolean; panelDensity: string; textScale: number; offerBreak: boolean; collapseSecondary: boolean; quietProgress: boolean; contextRestore: boolean; rationale: string } } | null;
  shares: Row[];
  visible: { mine: Row[]; visible: Row[] };
  commands: Array<Row & { kind: string; decoded: string | null; confidence: number; status: string; detail: string | null; createdAt: Date | string }>;
  accessLog: Array<Row & { operation: string; target: string; detail: string | null; createdAt: Date | string }>;
  research: { tier: number; samples: number; corrections: number; withinPersonAccuracyEstimate: number | null; calibrationSessions: number; commandExecutionRate: number | null; sharesCreated: number; consentsRevoked: number; huddlesInWorkspace: number; note: string } | null;
  action: (input: NeuralInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "flow" | "sharing" | "commands" | "huddles" | "research">("overview");
  const [busy, setBusy] = useState(false);
  const [sandbox, setSandbox] = useState({ attention: 0.5, stress: 0.2, cognitiveLoad: 0.4, flowProb: 0.6 });
  const [shareForm, setShareForm] = useState({ state: "available", audience: "PEOPLE", personIds: "", roomId: "", durationMin: 60 });
  const [cmdText, setCmdText] = useState("");
  const [cmdTarget, setCmdTarget] = useState("");
  const [huddleName, setHuddleName] = useState("");
  const [huddleCmd, setHuddleCmd] = useState("");

  const run = async (input: NeuralInput) => {
    setBusy(true);
    try {
      await action(input);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: unknown): string => (v == null ? "—" : String(v));
  const fmtDate = (d: unknown): string => {
    if (!d) return "—";
    try {
      return new Date(d as string).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(d);
    }
  };
  const pct = (v: unknown): string => (v == null ? "—" : `${(Number(v) * 100).toFixed(0)}%`);

  return (
    <div style={{ padding: "var(--nv-space-4)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Neural Lab</h1>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>
            Opt-in research platform — tier {status?.tier.tier ?? 0} ({TIER_LABELS[status?.tier.tier ?? 0]}). Raw neural data is never stored or transmitted.
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--nv-color-warning)" }}>sensor status: {status?.flow?.state ? "synthetic sandbox only" : "no sensors connected — fail-silent"}</div>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(["overview", "flow", "sharing", "commands", "huddles", "research"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ border: "1px solid var(--nv-color-border)", background: tab === t ? "var(--nv-color-primary-alpha)" : "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)", textTransform: "capitalize" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>Capability tiers — strictly opt-in, low-risk first. Raw signals are never required for normal N0VA use; no employment or performance decisions depend on them.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {[0, 1, 2, 3, 4, 5, 6].map((t) => (
              <div key={t} style={{ border: `1px solid ${(status?.tier.tier ?? 0) === t ? "var(--nv-color-primary)" : "var(--nv-color-border)"}`, borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{t} · {TIER_LABELS[t]}</div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{(status?.tier as { tiers?: Array<{ description: string }> }).tiers?.[t]?.description ?? ""}</div>
                <Button size="sm" variant={(status?.tier.tier ?? 0) === t ? "primary" : "secondary"} disabled={busy} onClick={() => run({ op: "setTier", tier: t })}>
                  {(status?.tier.tier ?? 0) === t ? "Current" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Consent — granular, revocable, expiry-bound</div>
            {FEATURES.map((f) => {
              const c = status?.consents.find((s) => s.feature === f && s.recipient === "SELF_ONLY");
              return (
                <div key={f} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, minWidth: 170 }}>{f}</span>
                  <span style={{ color: c?.enabled ? "var(--nv-color-success)" : "var(--nv-color-text-faint)" }}>{c?.enabled ? `granted${c.expiresAt ? ` until ${fmtDate(c.expiresAt)}` : ""}` : "not granted"}</span>
                  <span style={{ flex: 1 }} />
                  {!c?.enabled ? (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "setConsent", feature: f, recipient: "SELF_ONLY", duration: "SESSION" })}>Grant</Button>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "renewConsent", feature: f, recipient: "SELF_ONLY", expiresHours: 24 })}>Renew 24h</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "revokeConsent", feature: f, recipient: "SELF_ONLY" })}>Revoke</Button>
                    </>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Revoking consent pauses the matching capability immediately; tier upgrades check consent first.</div>
          </div>
        </div>
      )}

      {tab === "flow" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Signal ingestion sandbox (§14.1)</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>Synthetic local signals only — no device attached. Derived states are probabilistic; no data → no inference.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
              {(["attention", "stress", "cognitiveLoad", "flowProb"] as const).map((k) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {k}
                  <input type="range" min={0} max={1} step={0.05} value={sandbox[k]} onChange={(e) => setSandbox({ ...sandbox, [k]: Number(e.target.value) })} style={{ width: 90 }} />
                  <span style={{ color: "var(--nv-color-text-faint)" }}>{sandbox[k].toFixed(2)}</span>
                </label>
              ))}
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "ingest", raw: sandbox as never })}>Ingest sample</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "selfReport", flowProb: sandbox.flowProb, cognitiveLoad: sandbox.cognitiveLoad })}>Self-report</Button>
            </div>
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Flow status (§6) — probabilistic, correctable</div>
            {status?.flow ? (
              <>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                  <span>state: <b>{status.flow.state}</b></span>
                  <span>flow: {status.flow.flowProb == null ? "n/a" : status.flow.flowProb.toFixed(2)}</span>
                  <span>confidence: <b>{status.flow.confidence.toFixed(2)}</b></span>
                  <span>sources: {status.flow.sources.join(", ") || "none"}</span>
                  {status.flow.corrected && <span style={{ color: "var(--nv-color-warning)" }}>corrected by user</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{status.flow.rationale}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["neutral", "entering_flow", "stable_flow", "cognitive_overload", "distraction"].map((s) => (
                    <Button key={s} size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "correctFlow", state: s })}>set {s}</Button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No state inferred — no sensor data (fail-silent, §13).</div>
            )}
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Flow-aware UI adaptation (§5/§7) — local only, never shared</div>
            {attention ? (
              <>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                  <span>active task boost ×{attention.weights.activeTaskBoost}</span>
                  <span>density: {attention.weights.panelDensity}</span>
                  <span>text scale ×{attention.weights.textScale}</span>
                  {attention.weights.delaySuggestions && <span style={{ color: "var(--nv-color-warning)" }}>suggestions deferred</span>}
                  {attention.weights.collapseSecondary && <span>secondary modules collapsed</span>}
                  {attention.weights.quietProgress && <span>quiet progress</span>}
                  {attention.weights.offerBreak && <span style={{ color: "var(--nv-color-danger)" }}>break offered</span>}
                  {attention.weights.contextRestore && <span>context restore ready</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{attention.weights.rationale}</div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Requires tier 2+. Enable tier 2 in Overview to see adaptations.</div>
            )}
          </div>
        </div>
      )}

      {tab === "sharing" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ fontSize: 12 }} value={shareForm.state} onChange={(e) => setShareForm({ ...shareForm, state: e.target.value })}>
              {SHARED_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={{ fontSize: 12 }} value={shareForm.audience} onChange={(e) => setShareForm({ ...shareForm, audience: e.target.value })}>
              {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input placeholder="person ids (comma)" value={shareForm.personIds} onChange={(e) => setShareForm({ ...shareForm, personIds: e.target.value })} style={{ fontSize: 12, minWidth: 160 }} />
            <input placeholder="roomId (optional)" value={shareForm.roomId} onChange={(e) => setShareForm({ ...shareForm, roomId: e.target.value })} style={{ fontSize: 12, minWidth: 120 }} />
            <input type="number" placeholder="duration min" value={shareForm.durationMin} onChange={(e) => setShareForm({ ...shareForm, durationMin: Number(e.target.value) })} style={{ fontSize: 12, width: 80 }} />
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "publishState", state: shareForm.state, audience: shareForm.audience as never, personIds: shareForm.personIds ? shareForm.personIds.split(",").map((s) => s.trim()) : [], roomId: shareForm.roomId || undefined, durationMin: shareForm.durationMin })}>Publish state</Button>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Coarse states only, auto-expiring. "Focused" never means consent to ignore urgent operational events.</div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>My shares ({visible.mine.length})</div>
            {visible.mine.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Nothing shared.</div>}
            {visible.mine.map((s) => (
              <div key={String(s.id)} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
                <b style={{ minWidth: 120 }}>{fmt(s.state)}</b>
                <span>{fmt(s.audience)}</span>
                {s.expiresAt ? <span style={{ color: "var(--nv-color-text-faint)" }}>until {fmtDate(s.expiresAt)}</span> : null}
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "revokeShare", commandId: String(s.id) })}>revoke</Button>
              </div>
            ))}
          </div>
          {visible.visible.length > 0 && (
            <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Visible from others ({visible.visible.length})</div>
              {visible.visible.map((s) => (
                <div key={String(s.id)} style={{ fontSize: 12, padding: "3px 0" }}>
                  <b>{fmt(s.state)}</b> <span style={{ color: "var(--nv-color-text-muted)" }}>· {fmt(s.audience)}</span> {s.expiresAt ? <span style={{ color: "var(--nv-color-text-faint)" }}>· until {fmtDate(s.expiresAt)}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "commands" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Subvocal sandbox (§3) — small vocabulary, confirm-before-send</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>Vocabulary: mute · join · bookmark · create task · send · agree · clarify · pause · raise hand — confidence threshold 0.7, decoded text is always previewed.</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input placeholder='say or type e.g. "mute general"' value={cmdText} onChange={(e) => setCmdText(e.target.value)} style={{ fontSize: 12, minWidth: 220 }} />
              <Button size="sm" variant="secondary" disabled={busy || !cmdText} onClick={() => run({ op: "decode", text: cmdText })}>Decode</Button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Decoded commands appear below as PENDING — preview, then confirm; sending requires a second confirmation with a target channel.</div>
          {commands.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No commands yet.</div>}
          {commands.map((c) => (
            <div key={String(c.id)} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, minWidth: 90 }}>{c.kind}</span>
              <span style={{ color: "var(--nv-color-text-muted)", minWidth: 110 }}>{fmt(c.decoded)}</span>
              <span style={{ color: "var(--nv-color-text-faint)" }}>conf {(Number(c.confidence) * 100).toFixed(0)}%</span>
              <span style={{ color: c.status === "EXECUTED" ? "var(--nv-color-success)" : c.status === "PENDING" || c.status === "CONFIRMED" ? "var(--nv-color-warning)" : "var(--nv-color-text-faint)", fontWeight: 700 }}>{c.status}</span>
              {c.detail && <span style={{ color: "var(--nv-color-text-faint)", flex: 1 }} title={String(c.detail)}>{String(c.detail).slice(0, 60)}</span>}
              <span style={{ flex: 1 }} />
              {(c.status === "PENDING" || c.status === "CONFIRMED") && (
                <>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "cancelCommand", commandId: String(c.id) })}>cancel</Button>
                  {c.status === "PENDING" && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "confirmCommand", commandId: String(c.id) })}>confirm</Button>}
                  {c.status === "CONFIRMED" && (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input placeholder={c.kind === "send" ? "channelId (required)" : "target (optional)"} value={cmdTarget} onChange={(e) => setCmdTarget(e.target.value)} style={{ fontSize: 11, width: 150 }} />
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "executeCommand", commandId: String(c.id), channelId: cmdTarget || undefined, messageText: c.kind === "send" ? `[neural] ${String(c.decoded ?? "")}` : undefined })}>execute</Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "huddles" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="huddle name" value={huddleName} onChange={(e) => setHuddleName(e.target.value)} style={{ fontSize: 12, minWidth: 180 }} />
            <Button size="sm" variant="secondary" disabled={busy || !huddleName} onClick={async () => { const r = await action({ op: "createHuddle", title: huddleName }); await action({ op: "startHuddle", sessionId: String((r as { id: string }).id) }); router.refresh(); }}>Create + start</Button>
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Research-only, per-session consent, coarse states + explicit commands. No raw EEG/EMG is ever transmitted to participants.</div>
          {status?.huddles?.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No live huddles.</div>}
          {(status?.huddles ?? []).map((h) => (
            <div key={String(h.id)} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <b>{fmt(h.title)}</b>
                <span style={{ color: "var(--nv-color-success)" }}>{fmt(h.status)}</span>
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "joinHuddle", sessionId: String(h.id) })}>join</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "endHuddle", sessionId: String(h.id) })}>end</Button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <select style={{ fontSize: 11 }} value={shareForm.state} onChange={(e) => setShareForm({ ...shareForm, state: e.target.value })}>
                  {SHARED_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "setHuddleState", sessionId: String(h.id), state: shareForm.state, confidence: 0.85 })}>share state</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "raiseHand", sessionId: String(h.id), raw: { raised: true } })}>raise hand</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "raiseHand", sessionId: String(h.id), raw: { raised: false } })}>lower hand</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "signalPause", sessionId: String(h.id), raw: { paused: true } })}>pause signals</Button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input placeholder='command e.g. "agree" / "clarify" / "pause"' value={huddleCmd} onChange={(e) => setHuddleCmd(e.target.value)} style={{ fontSize: 11, minWidth: 220 }} />
                <Button size="sm" variant="secondary" disabled={busy || !huddleCmd} onClick={() => run({ op: "sendHuddleCommand", sessionId: String(h.id), text: huddleCmd })}>send command (preview)</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "huddleStatus", sessionId: String(h.id) })}>refresh status</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "huddleTranscript", sessionId: String(h.id) })}>transcript</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "research" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {research && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {[
                { label: "Within-person accuracy est.", value: pct(research.withinPersonAccuracyEstimate) },
                { label: "Calibration sessions", value: fmt(research.calibrationSessions) },
                { label: "Signal samples", value: fmt(research.samples) },
                { label: "User corrections", value: fmt(research.corrections) },
                { label: "Command execution rate", value: pct(research.commandExecutionRate) },
                { label: "Shares created", value: fmt(research.sharesCreated) },
                { label: "Consents revoked", value: fmt(research.consentsRevoked) },
                { label: "Workspace huddles", value: fmt(research.huddlesInWorkspace) },
              ].map((c) => (
                <div key={c.label} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{c.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}
          {research?.note && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{research.note}</div>}
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Access log (§9) — every neural-data operation</div>
            {accessLog.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No operations logged yet.</div>}
            {accessLog.map((l) => (
              <div key={String(l.id)} style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid var(--nv-color-border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <b style={{ minWidth: 70 }}>{fmt(l.operation)}</b>
                <span style={{ color: "var(--nv-color-text-muted)" }}>{fmt(l.target)}</span>
                {l.detail && <span style={{ color: "var(--nv-color-text-faint)", flex: 1 }}>{String(l.detail).slice(0, 90)}</span>}
                <span style={{ color: "var(--nv-color-text-faint)" }}>{fmtDate(l.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}