"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { GraphConcept } from "./graph-ui";

export interface TurnResponse {
  sessionId: string; intent: string; workflow?: string; refused: boolean;
  mode?: string; modeBanner?: string; escalationId: string | null; latencyMs: number;
  response: {
    body: string; mode?: string; modeBanner?: string; transitionSuggestion?: string | null;
    checkForUnderstanding: string | null; misconceptionCheck: string | null;
    citations: string[]; unresolvedClaims: number; verifiedClaims: number;
    nextAction: string; controls: string[]; allowedOnly: string[] | null;
    metadata: { contributors: string[]; verifiedClaims: number; unresolvedClaims: number; humanReviewRequired: boolean };
  };
}

export interface TutorAgentActions {
  turn: (input: { sessionId?: string; setId: string; conceptId?: string; message: string; mode?: string }) => Promise<TurnResponse>;
  detail: (sessionId: string) => Promise<{ tasks: TaskRow[]; events: EventRow[]; escalations: unknown[]; degraded: boolean; intent: string }>;
  escalations: () => Promise<EscalationRow[]>;
  resolveEscalation: (fd: FormData) => Promise<void>;
  agents: () => Promise<{ key: string; name: string; mandate: string; version: string; tools: string[]; allowedActions: string[] }[]>;
  progress: (sessionId: string, signals: Record<string, boolean>) => Promise<{ transition: string | null; message: string }>;
  modeQuality: (setId: string) => Promise<{ turnsByMode: { mode: string; turns: number }[]; taskOutcomes: { agent: string; status: string; count: number }[]; escalations: { status: string; count: number }[] }>;
  setModePolicy: (fd: FormData) => Promise<void>;
}

export interface TaskRow { id: string; agentKey: string; intent: string; status: string; warnings: string[]; nextActions: string[]; modelVersion: string; latencyMs: number | null; error: string }
export interface EventRow { id: string; type: string; actor: string; createdAt: string; payload: unknown }
export interface EscalationRow { id: string; topic: string; issue: string; status: string; urgency: string; recommendation: string; learnerVisible: boolean; createdAt: string }

export function TutorAgentsPanel({ setId, concepts, actions, isInstructor }: {
  setId: string; concepts: GraphConcept[]; actions: TutorAgentActions; isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [conceptId, setConceptId] = useState(concepts[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [reqMode, setReqMode] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<{ q: string; r: TurnResponse }[]>([]);
  const [busy, setBusy] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [quality, setQuality] = useState<{ turnsByMode: { mode: string; turns: number }[]; taskOutcomes: { agent: string; status: string; count: number }[]; escalations: { status: string; count: number }[] } | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [escalations, setEscalations] = useState<EscalationRow[] | null>(null);
  const [registry, setRegistry] = useState<{ key: string; name: string; mandate: string; version: string; tools: string[]; allowedActions: string[] }[] | null>(null);

  const send = () => {
    if (!message.trim()) return;
    const q = message.trim();
    setMessage("");
    setBusy(true);
    setProgressMsg(null);
    void actions.turn({ sessionId, setId, conceptId: conceptId || undefined, message: q, mode: reqMode || undefined })
      .then((r) => {
        setSessionId(r.sessionId);
        setTurns((t) => [...t, { q, r }].slice(-10));
        setBusy(false);
      })
      .catch(() => setBusy(false));
  };

  const markProgress = (signals: Record<string, boolean>) => {
    if (!sessionId) return;
    void actions.progress(sessionId, signals).then((r) => setProgressMsg(r.message)).catch(() => undefined);
  };

  const loadDetail = () => {
    if (!sessionId) return;
    void actions.detail(sessionId).then((d) => {
      setEvents(d.events as EventRow[]);
      setTasks(d.tasks as TaskRow[]);
    }).catch(() => undefined);
  };

  const loadEscalations = () => {
    void actions.escalations().then((e) => setEscalations(e)).catch(() => undefined);
  };
  if (isInstructor && escalations === null) loadEscalations();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>💬 Supervised multi-agent tutor</div>
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
          Specialist agents (tutor, socratic, research, assessment, fact-check, planner, accessibility, safety, debate, supervisor) coordinate through an explicit orchestrator. State proposals are committed by services, never silently by agents.
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <select className="nv-input" value={conceptId} onChange={(e) => setConceptId(e.target.value)} style={{ width: 180 }}>
            <option value="">No specific concept</option>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="nv-input" value={reqMode} onChange={(e) => setReqMode(e.target.value)} title="Request a teaching mode" style={{ width: 180 }}>
            <option value="">Auto mode</option>
            {["SOCRATIC", "DIRECT", "WORKED_EXAMPLE", "PRACTICE", "EXAM", "DEBUGGING", "DEBATE", "RESEARCH_SUPERVISOR", "FLASHCARD", "ORAL_EXAM", "PEER_REVIEW", "ACCESSIBILITY"].map((m) => (
              <option key={m} value={m}>{m.toLowerCase().replace(/_/g, " ")}</option>
            ))}
          </select>
          <input className="nv-input" value={message} onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Explain photosynthesis — I still don't get it…" style={{ flex: 1, minWidth: 200 }} />
          <Button size="sm" onClick={send} disabled={busy}>{busy ? "…" : "Send"}</Button>
        </div>
        {sessionId && (
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Mark progress:</span>
            <Button variant="ghost" size="sm" onClick={() => markProgress({ independentApplication: true })}>I can do this independently</Button>
            <Button variant="ghost" size="sm" onClick={() => markProgress({ retrievalPassed: true })}>Retrieval passed</Button>
            <Button variant="ghost" size="sm" onClick={() => markProgress({ transferDone: true })}>Transfer done</Button>
            <Button variant="ghost" size="sm" onClick={() => markProgress({ submitted: true })}>Submitted</Button>
          </div>
        )}
        {progressMsg && <div style={{ fontSize: 12, marginTop: 6 }}>{progressMsg}</div>}
      </div>

      {turns.slice().reverse().map((t, i) => (
        <div key={`${t.r.sessionId}-${i}`} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>You: {t.q}</div>
          {(t.r.modeBanner || t.r.response.modeBanner) && (
            <div style={{ fontSize: 12, background: "var(--nv-color-surface-2, transparent)", borderRadius: 8, padding: 6, marginTop: 6 }}>
              {t.r.modeBanner ?? t.r.response.modeBanner}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 2 }}>
            intent {t.r.intent} · {t.r.workflow}{t.r.mode ? ` · mode ${t.r.mode.toLowerCase()}` : ""} · {t.r.latencyMs}ms{t.r.response.metadata.humanReviewRequired ? " · 👩‍🏫 human review flagged" : ""}
          </div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{t.r.response.body}</div>
          {t.r.response.transitionSuggestion && (
            <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600 }}>{t.r.response.transitionSuggestion}</div>
          )}
          {t.r.response.checkForUnderstanding && (
            <div style={{ fontSize: 12, marginTop: 6 }}><b>Check:</b> {t.r.response.checkForUnderstanding}</div>
          )}
          {t.r.response.misconceptionCheck && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>🔍 {t.r.response.misconceptionCheck}</div>
          )}
          <div style={{ fontSize: 12, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>✅ {t.r.response.verifiedClaims} verified</span>
            {t.r.response.unresolvedClaims > 0 && <span>⚠️ {t.r.response.unresolvedClaims} unresolved</span>}
            {t.r.response.citations.length > 0 && <span>📎 {t.r.response.citations.length} citations</span>}
            <span>Next: {t.r.response.nextAction.replace(/_/g, " ")}</span>
            {t.r.escalationId && <span style={{ color: "var(--nv-color-danger)" }}>⚖️ escalated — instructor notified</span>}
          </div>
          <button className="nv-link" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setShowMeta((v) => !v)}>
            {showMeta ? "Hide agent details" : "Show which agents contributed"}
          </button>
          {showMeta && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
              Contributors: {t.r.response.metadata.contributors.join(" · ")}
            </div>
          )}
        </div>
      ))}

      {sessionId && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 800 }}>🔍 Session inspection & replay</span>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={loadDetail}>Load tasks + events</Button>
          </div>
          {tasks && (
            <div style={{ marginTop: 6 }}>
              {tasks.map((t) => (
                <div key={t.id} style={{ fontSize: 12, marginTop: 4 }}>
                  <b>{t.agentKey}</b> · {t.status.toLowerCase()} · {t.modelVersion}{t.latencyMs ? ` · ${t.latencyMs}ms` : ""}
                  {t.warnings.map((w, j) => <div key={j} style={{ color: "var(--nv-color-danger)" }}>⚠ {w}</div>)}
                  {t.error && <div style={{ color: "var(--nv-color-danger)" }}>Error: {t.error} (degraded, not blocking)</div>}
                </div>
              ))}
            </div>
          )}
          {events && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>Event log ({events.length}) — replay & audit</summary>
              <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
                {events.map((e) => (
                  <div key={e.id} style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                    {new Date(e.createdAt).toLocaleTimeString()} · <b>{e.type}</b> · {e.actor}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {isInstructor && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 800 }}>⚖️ Escalation inbox</span>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={loadEscalations}>Refresh</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.agents().then((a) => setRegistry(a))}>Agent registry</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.modeQuality(setId).then((q) => setQuality(q))}>Mode quality</Button>
          </div>
          {quality && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <div>Turns by mode: {quality.turnsByMode.map((t) => `${t.mode.toLowerCase()} ${t.turns}`).join(" · ") || "none yet"}</div>
              <div>Task outcomes: {quality.taskOutcomes.slice(0, 8).map((t) => `${t.agent}/${t.status.toLowerCase()} ${t.count}`).join(" · ")}</div>
              <div>Escalations: {quality.escalations.map((e) => `${e.status.toLowerCase()} ${e.count}`).join(" · ") || "none"}</div>
            </div>
          )}
          <details>
            <summary style={{ fontSize: 12, cursor: "pointer" }}>Teaching-mode policy (allowed modes, course default)</summary>
            <form action={(fd) => void actions.setModePolicy(fd).then(refresh)} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input type="hidden" name="setId" value={setId} />
              <select className="nv-input" name="mode" defaultValue="DIRECT" style={{ width: 200 }}>
                {["SOCRATIC", "DIRECT", "WORKED_EXAMPLE", "PRACTICE", "EXAM", "DEBUGGING", "DEBATE", "RESEARCH_SUPERVISOR", "FLASHCARD", "ORAL_EXAM", "PEER_REVIEW", "ACCESSIBILITY"].map((m) => (
                  <option key={m} value={m}>{m.toLowerCase().replace(/_/g, " ")}</option>
                ))}
              </select>
              <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" name="isDefault" /> Course default
              </label>
              <select className="nv-input" name="enabled" defaultValue="on" style={{ width: 130 }}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </select>
              <Button size="sm" type="submit">Save</Button>
            </form>
          </details>
          {(escalations ?? []).map((e) => (
            <div key={e.id} style={{ fontSize: 12, borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6 }}>
              <div><b>{e.topic || "tutor turn"}</b> · {e.status} · urgency {e.urgency}</div>
              <div>{e.issue}</div>
              {e.recommendation && <div style={{ color: "var(--nv-color-text-faint)" }}>Recommended: {e.recommendation}</div>}
              {e.status === "OPEN" && (
                <form action={(fd) => void actions.resolveEscalation(fd).then(() => { refresh(); loadEscalations(); })} style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <input type="hidden" name="id" value={e.id} />
                  <input className="nv-input" name="resolution" placeholder="resolution (recorded + visible)" style={{ flex: 1, minWidth: 160 }} />
                  <Button variant="secondary" size="sm" type="submit" name="status" value="RESOLVED">Resolve</Button>
                  <Button variant="ghost" size="sm" type="submit" name="status" value="DISMISSED">Dismiss</Button>
                </form>
              )}
            </div>
          ))}
          {(escalations ?? []).length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Queue empty.</div>}
          {registry && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>Agent registry ({registry.length}) — mandates, tools, versions, scopes</summary>
              {registry.map((a) => (
                <div key={a.key} style={{ fontSize: 12, marginTop: 4 }}>
                  <b>{a.name}</b> ({a.version}) — {a.mandate}
                  <div style={{ color: "var(--nv-color-text-faint)" }}>tools: {a.tools.join(", ") || "none"} · actions: {a.allowedActions.join(", ")}</div>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </div>
  );
}
