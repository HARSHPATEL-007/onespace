"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface IntegrityStatusRow {
  id: string; academic: string; integrity: string;
  checked: string[]; notUsed: string[];
  accommodation: Record<string, unknown>;
  appealDeadline: string | null;
  appeals: { id: string; status: string }[];
  penaltyPending: string | null;
}

export interface ReviewRow {
  id: string; userId: string; status: string;
  academicScore: number | null; grader: string;
  signals: { type: string; severity: string; evidence: string; confidence: number }[];
  excludedSignals: string[];
  accommodation: Record<string, unknown> | null;
  technicalEvents: unknown[];
  appealDeadline: string | null; createdAt: string;
}

export interface AppealRow {
  id: string; recordId: string; reason: string; evidence: string;
  status: string; resolution: string; createdAt: string;
}

export interface IntegrityActions {
  status: () => Promise<IntegrityStatusRow[]>;
  appeal: (recordId: string, reason: string, evidence: string) => Promise<unknown>;
  appeals: () => Promise<AppealRow[]>;
  queue: () => Promise<ReviewRow[]>;
  review: (recordId: string, decision: "CLEARED" | "VIOLATION", reason: string) => Promise<void>;
  appealResolve: (appealId: string, status: "UPHELD" | "OVERTURNED", resolution: string) => Promise<void>;
  overview: (setId: string) => Promise<{ records: number; byStatus: Record<string, number>; appeals: number; openAppeals: number; items: number; retiredItems: number; note: string }>;
  metrics: () => Promise<{ records: number; appealRate: number; overturnRate: number; avgReviewTurnaroundHrs: number; humanReviewCoverage: number; noPenaltyDuringReview: boolean }>;
  similarity: (setId: string, text: string) => Promise<{ level: string; findings: { layer: string; detail: string; legitimateExplanation: string; sourceId: string }[]; note: string }>;
  createItem: (fd: FormData) => Promise<void>;
  makeVariant: (templateKey: string, setId: string) => Promise<{ item: { id: string; variantId: string }; spec: { numbers: number[]; names: string[]; context: string; invariants: string[]; randomizedFields: string[] } }>;
  itemStatus: (id: string, status: "ACTIVE" | "FROZEN" | "RETIRED" | "INVALIDATED") => Promise<void>;
  exposure: (templateKey: string) => Promise<{ views: number; learners: number; byKind: Record<string, number> }>;
  accommodations: () => Promise<{ id: string; userId: string; effects: string[]; active: boolean; expiresAt: string | null }[]>;
  addAccommodation: (fd: FormData) => Promise<void>;
  scheduleDefense: (fd: FormData) => Promise<void>;
  defenses: () => Promise<{ id: string; topic: string; status: string; userId: string; scores: Record<string, number | string>; consentRecording: boolean }[]>;
  scoreDefense: (id: string, fd: FormData) => Promise<void>;
  packet: (recordId: string) => Promise<{
    assessmentStakes: string; assessmentPolicy: Record<string, unknown>;
    alternativeExplanations: string[]; learnerResponse: { status: string; reason: string }[];
    aiLimits: string; signals: { type: string; severity: string; evidence: string }[];
    excludedSignals: string[];
  }>;
  technicalEvent: (recordId: string, category: string, detail?: string) => Promise<unknown>;
  codeProcess: (recordId: string) => Promise<{ milestones: { t: string; event: string }[]; testProgression: string; interpretation: string; note: string }>;
}

export function IntegrityPanel({ setId, actions, isInstructor }: {
  setId: string; actions: IntegrityActions; isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [status, setStatus] = useState<IntegrityStatusRow[] | null>(null);
  const [appeals, setAppeals] = useState<AppealRow[] | null>(null);
  const [queue, setQueue] = useState<ReviewRow[] | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<IntegrityActions["overview"]>> | null>(null);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<IntegrityActions["metrics"]>> | null>(null);
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealEvidence, setAppealEvidence] = useState("");
  const [simText, setSimText] = useState("");
  const [simRes, setSimRes] = useState<Awaited<ReturnType<IntegrityActions["similarity"]>> | null>(null);
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [accomms, setAccomms] = useState<Awaited<ReturnType<IntegrityActions["accommodations"]>> | null>(null);
  const [defenses, setDefenses] = useState<Awaited<ReturnType<IntegrityActions["defenses"]>> | null>(null);
  const [tplKey, setTplKey] = useState("");
  const [variant, setVariant] = useState<Awaited<ReturnType<IntegrityActions["makeVariant"]>> | null>(null);
  const [exposure, setExposure] = useState<Awaited<ReturnType<IntegrityActions["exposure"]>> | null>(null);
  const [packets, setPackets] = useState<Record<string, Awaited<ReturnType<IntegrityActions["packet"]>>>>({});
  const [processes, setProcesses] = useState<Record<string, Awaited<ReturnType<IntegrityActions["codeProcess"]>>>>({});
  const [techCat, setTechCat] = useState("browser_disconnect");
  const [techDetail, setTechDetail] = useState("");

  if (status === null) void actions.status().then((s) => setStatus(s)).catch(() => undefined);
  if (appeals === null) void actions.appeals().then((a) => setAppeals(a)).catch(() => undefined);
  if (isInstructor && queue === null) void actions.queue().then((q) => setQueue(q)).catch(() => undefined);
  if (isInstructor && overview === null) void actions.overview(setId).then((o) => setOverview(o)).catch(() => undefined);
  if (isInstructor && metrics === null) void actions.metrics().then((m) => setMetrics(m)).catch(() => undefined);
  if (isInstructor && accomms === null) void actions.accommodations().then((a) => setAccomms(a)).catch(() => undefined);
  if (defenses === null) void actions.defenses().then((d) => setDefenses(d)).catch(() => undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Learner status */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🛡 Assessment integrity status</div>
        {(status ?? []).length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No submissions under review. A signal is a reason to investigate — never proof of wrongdoing.</div>
        )}
        {(status ?? []).map((s) => (
          <div key={s.id} style={{ borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6, fontSize: 12 }}>
            <div><b>Academic result:</b> {s.academic}</div>
            <div><b>Integrity status:</b> {s.integrity.replace(/_/g, " ").toLowerCase()}</div>
            <div style={{ color: "var(--nv-color-text-faint)" }}>Checked: {s.checked.join(", ")}</div>
            <div style={{ color: "var(--nv-color-text-faint)" }}>Not used: {s.notUsed.join(", ")}</div>
            {s.accommodation && (s.accommodation as { active?: boolean }).active && (
              <div>Accommodation active — signals interpreted under it.</div>
            )}
            {s.penaltyPending && <div style={{ fontWeight: 700 }}>{s.penaltyPending}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
              <Button variant="ghost" size="sm" onClick={() => setAppealFor(appealFor === s.id ? null : s.id)}>Appeal</Button>
            </div>
            {appealFor === s.id && (
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <input className="nv-input" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} placeholder="reason (required)" style={{ flex: 1, minWidth: 160 }} />
                <input className="nv-input" value={appealEvidence} onChange={(e) => setAppealEvidence(e.target.value)} placeholder="drafts / notes reference" style={{ flex: 1, minWidth: 160 }} />
                <Button size="sm" onClick={() => {
                  if (!appealReason.trim()) return;
                  void actions.appeal(s.id, appealReason.trim(), appealEvidence).then(() => {
                    setAppealReason(""); setAppealEvidence(""); setAppealFor(null); setStatus(null); setAppeals(null); refresh();
                  });
                }}>File (14-day window)</Button>
              </div>
            )}
          </div>
        ))}
        {(appeals ?? []).length > 0 && (
          <div style={{ fontSize: 12, marginTop: 8 }}>
            <b>Appeals:</b> {(appeals ?? []).map((a) => `${a.status.toLowerCase()}${a.resolution ? ` — ${a.resolution.slice(0, 80)}` : ""}`).join(" · ")}
          </div>
        )}
        <div style={{ fontSize: 12, marginTop: 6 }}>Your rights: view evidence · add explanation · request human review · appeal — no retaliation, ever.</div>
      </div>

      {/* Similarity checker (review signal only) */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🔍 Similarity check (signal, never verdict)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="nv-input" value={simText} onChange={(e) => setSimText(e.target.value)} placeholder="Paste a passage to compare against course sources…" style={{ flex: 1, minWidth: 200 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.similarity(setId, simText).then((r) => setSimRes(r))}>Check</Button>
        </div>
        {simRes && (
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <div>Overlap level: <b>{simRes.level}</b></div>
            {simRes.findings.map((f, i) => (
              <div key={i}>• [{f.layer}] {f.detail} — <i>may be legitimate: {f.legitimateExplanation}</i></div>
            ))}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{simRes.note}</div>
          </div>
        )}
      </div>

      {/* Oral defenses */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🎤 Oral defense (optional; fluency excluded from subject score)</div>
        {(defenses ?? []).map((d) => (
          <div key={d.id} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{d.topic || "defense"}</b> · {d.status}
            {Object.keys(d.scores).length > 0 && (
              <span style={{ color: "var(--nv-color-text-faint)" }}> · {Object.entries(d.scores).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ")}</span>
            )}
            {isInstructor && d.status === "scheduled" && (
              <form action={(fd) => void actions.scoreDefense(d.id, fd).then(() => { setDefenses(null); refresh(); })} style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                {(["conceptual_accuracy", "decision_justification", "adaptation_to_counterexample", "uncertainty_awareness"] as const).map((k) => (
                  <input key={k} className="nv-input" name={k} placeholder={k.replace(/_/g, " ")} style={{ width: 130 }} />
                ))}
                <input className="nv-input" name="note" placeholder="reviewer note" style={{ flex: 1, minWidth: 140 }} />
                <Button size="sm" type="submit">Score</Button>
              </form>
            )}
          </div>
        ))}
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>Schedule defense</summary>
          <form action={(fd) => void actions.scheduleDefense(fd).then(() => { setDefenses(null); refresh(); })} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input type="hidden" name="setId" value={setId} />
            <input className="nv-input" name="topic" placeholder="topic" required style={{ flex: 1, minWidth: 160 }} />
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" name="consentRecording" /> Recording consent
            </label>
            <Button size="sm" type="submit">Schedule</Button>
          </form>
        </details>
      </div>

      {isInstructor && (
        <>
          {/* Review queue */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontWeight: 800 }}>👩‍⚖️ Human review queue ({(queue ?? []).length})</span>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => setQueue(null)}>Refresh</Button>
            </div>
            {(queue ?? []).map((r) => (
              <div key={r.id} style={{ borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6, fontSize: 12 }}>
                <div><b>{r.status}</b> · score {r.academicScore !== null ? Math.round((r.academicScore ?? 0) * 100) + "%" : "—"} · {r.grader}</div>
                {r.signals.map((s, i) => <div key={i}>• [{s.severity}] {s.type}: {s.evidence} (conf {Math.round(s.confidence * 100)}%)</div>)}
                <div style={{ color: "var(--nv-color-text-faint)" }}>Excluded by policy: {r.excludedSignals.slice(0, 5).join(", ")}</div>
                {r.accommodation && (r.accommodation as { active?: boolean }).active && (
                  <div>Accommodation active — interpret under it, not around it.</div>
                )}
                {r.appealDeadline && <div>Appeal deadline: {new Date(r.appealDeadline).toLocaleDateString()}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <input className="nv-input" id={`rr-${r.id}`} placeholder="written reason (required)" style={{ flex: 1, minWidth: 160 }} />
                  <Button variant="secondary" size="sm" onClick={() => {
                    const el = document.getElementById(`rr-${r.id}`) as HTMLInputElement | null;
                    if (!el?.value.trim()) { alert("A written reason is required."); return; }
                    void actions.review(r.id, "CLEARED", el.value.trim()).then(() => { setQueue(null); refresh(); });
                  }}>Clear</Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const el = document.getElementById(`rr-${r.id}`) as HTMLInputElement | null;
                    if (!el?.value.trim()) { alert("A written reason is required."); return; }
                    void actions.review(r.id, "VIOLATION", el.value.trim()).then(() => { setQueue(null); refresh(); });
                  }}>Violation</Button>
                  <Button variant="ghost" size="sm" onClick={() => setReviewFor(reviewFor === r.id ? null : r.id)}>Appeals</Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (packets[r.id]) setPackets((m) => { const c = { ...m }; delete c[r.id]; return c; });
                    else void actions.packet(r.id).then((p) => setPackets((m) => ({ ...m, [r.id]: p }))).catch(() => undefined);
                  }}>Packet</Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    if (processes[r.id]) setProcesses((m) => { const c = { ...m }; delete c[r.id]; return c; });
                    else void actions.codeProcess(r.id).then((p) => setProcesses((m) => ({ ...m, [r.id]: p }))).catch(() => undefined);
                  }}>Process</Button>
                </div>
                {packets[r.id] && (
                  <div style={{ fontSize: 12, marginTop: 4, borderTop: "1px solid var(--nv-color-border)", paddingTop: 4 }}>
                    <div><b>Reviewer packet</b> · stakes: {packets[r.id]!.assessmentStakes}</div>
                    <div style={{ color: "var(--nv-color-text-faint)" }}>Alternative readings: {packets[r.id]!.alternativeExplanations.join(" · ") || "—"}</div>
                    {packets[r.id]!.learnerResponse.length > 0 && (
                      <div>Learner response: {packets[r.id]!.learnerResponse.map((a) => `${a.status.toLowerCase()}: ${a.reason.slice(0, 100)}`).join(" · ")}</div>
                    )}
                    <div style={{ color: "var(--nv-color-text-faint)" }}>{packets[r.id]!.aiLimits}</div>
                  </div>
                )}
                {processes[r.id] && (
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <div><b>Process:</b> {processes[r.id]!.interpretation.replace(/_/g, " ")} — {processes[r.id]!.testProgression}</div>
                    <div style={{ color: "var(--nv-color-text-faint)" }}>{processes[r.id]!.milestones.slice(0, 6).map((m) => `${m.t} ${m.event}`).join(" → ") || "no milestones"}</div>
                    <div style={{ color: "var(--nv-color-text-faint)" }}>{processes[r.id]!.note}</div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <select className="nv-input" value={techCat} onChange={(e) => setTechCat(e.target.value)} style={{ width: 200 }}>
                    {["browser_disconnect", "browser_technical", "compile", "test_fail", "dependency_install", "browser_switch"].map((c) => (
                      <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                  <input className="nv-input" value={techDetail} onChange={(e) => setTechDetail(e.target.value)} placeholder="event detail…" style={{ flex: 1, minWidth: 160 }} />
                  <Button variant="ghost" size="sm" onClick={() => {
                    void actions.technicalEvent(r.id, techCat, techDetail).then(() => { setTechDetail(""); setQueue(null); refresh(); }).catch(() => undefined);
                  }}>Log event</Button>
                </div>
                {reviewFor === r.id && <AppealList recordId={r.id} actions={actions} />}
              </div>
            ))}
            {(queue ?? []).length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Queue empty.</div>}
          </div>

          {/* Items + variants + exposure */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>🧩 Item bank (variants preserve rubric + demand)</div>
            <form action={(fd) => void actions.createItem(fd).then(refresh)} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input type="hidden" name="setId" value={setId} />
              <input className="nv-input" name="templateKey" placeholder="template key" required style={{ width: 200 }} />
              <input className="nv-input" name="prompt" placeholder="prompt" style={{ flex: 1, minWidth: 160 }} />
              <Button size="sm" type="submit">Add item</Button>
            </form>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input className="nv-input" value={tplKey} onChange={(e) => setTplKey(e.target.value)} placeholder="template key…" style={{ width: 200 }} />
              <Button variant="secondary" size="sm" onClick={() => tplKey && void actions.makeVariant(tplKey, setId).then((v) => setVariant(v))}>Generate variant</Button>
              <Button variant="ghost" size="sm" onClick={() => tplKey && void actions.exposure(tplKey).then((e) => setExposure(e))}>Exposure map</Button>
            </div>
            {variant && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Variant <b>{variant.item.variantId}</b> · numbers [{variant.spec.numbers.join(", ")}] · context “{variant.spec.context}” ·
                invariants: {variant.spec.invariants.join(", ")} · randomized: {variant.spec.randomizedFields.join(", ")}
              </div>
            )}
            {exposure && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {exposure.views} views across {exposure.learners} learners · {Object.entries(exposure.byKind).map(([k, v]) => `${k} ${v}`).join(" · ")}
                <div style={{ color: "var(--nv-color-text-faint)" }}>Authorized practice exposure never punishes the learner — it retires the item for high-stakes use instead.</div>
              </div>
            )}
          </div>

          {/* Accommodations */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>♿ Accommodations (effects only — never diagnoses)</div>
            {(accomms ?? []).map((a) => (
              <div key={a.id} style={{ fontSize: 12, marginTop: 2 }}>
                {a.userId.slice(0, 8)}: {a.effects.join(", ")} · {a.active ? "active" : "inactive"}
              </div>
            ))}
            <form action={(fd) => void actions.addAccommodation(fd).then(() => { setAccomms(null); refresh(); })} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input type="hidden" name="setId" value={setId} />
              <input className="nv-input" name="userId" placeholder="learner user id" required style={{ width: 200 }} />
              <input className="nv-input" name="effects" placeholder="effects: extended_time, breaks…" required style={{ flex: 1, minWidth: 160 }} />
              <Button size="sm" type="submit">Add</Button>
            </form>
          </div>

          {/* Overview + metrics */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>📊 Integrity overview</div>
            {overview && (
              <div style={{ fontSize: 12 }}>
                Records {overview.records} · appeals {overview.appeals} (open {overview.openAppeals}) · items {overview.items} (retired {overview.retiredItems})
                <div>{Object.entries(overview.byStatus).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(" · ")}</div>
                <div style={{ color: "var(--nv-color-text-faint)" }}>{overview.note}</div>
              </div>
            )}
            {metrics && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Appeal rate {Math.round(metrics.appealRate * 100)}% · overturn {Math.round(metrics.overturnRate * 100)}% ·
                turnaround {metrics.avgReviewTurnaroundHrs}h · human-review coverage {Math.round(metrics.humanReviewCoverage * 100)}% ·
                no-penalty-during-review {metrics.noPenaltyDuringReview ? "enforced" : "VIOLATION"}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AppealList({ recordId, actions }: {
  recordId: string;
  actions: { appeals: () => Promise<AppealRow[]>; appealResolve: (appealId: string, status: "UPHELD" | "OVERTURNED", resolution: string) => Promise<void> };
}) {
  const [rows, setRows] = useState<AppealRow[] | null>(null);
  const [res, setRes] = useState("");
  if (rows === null) void actions.appeals().then((a) => setRows(a.filter((x) => x.recordId === recordId))).catch(() => undefined);
  return (
    <div style={{ marginTop: 4 }}>
      {(rows ?? []).map((a) => (
        <div key={a.id} style={{ fontSize: 12, marginTop: 4 }}>
          <b>{a.status.toLowerCase()}</b>: {a.reason} {a.evidence && <span style={{ color: "var(--nv-color-text-faint)" }}>· {a.evidence}</span>}
          {a.resolution && <div>Resolution: {a.resolution}</div>}
          {(a.status === "OPEN" || a.status === "UNDER_REVIEW") && (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input className="nv-input" value={res} onChange={(e) => setRes(e.target.value)} placeholder="resolution (written)" style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => void actions.appealResolve(a.id, "UPHELD", res).then(() => setRows(null))}>Uphold</Button>
              <Button variant="ghost" size="sm" onClick={() => void actions.appealResolve(a.id, "OVERTURNED", res).then(() => setRows(null))}>Overturn + repair</Button>
            </div>
          )}
        </div>
      ))}
      {(rows ?? []).length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No appeals on this record.</div>}
    </div>
  );
}
