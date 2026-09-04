"use client";

import { useState } from "react";
import { Button } from "@n0va/ui";

export interface InsightsActions {
  items: (setId: string) => Promise<{ items: ItemRow[] }>;
  clusters: (setId: string) => Promise<ClusterRow[]>;
  gains: (setId: string) => Promise<GainRow[]>;
  mastery: (setId: string, conceptKey?: string) => Promise<MasteryRow[]>;
  calibration: (setId: string, conceptKey?: string) => Promise<CalibrationData>;
  dropoff: (setId: string) => Promise<DropoffData>;
  quality: (setId: string) => Promise<QualityData>;
  warnings: (setId: string) => Promise<WarningGroup[]>;
  outcomes: (setId: string) => Promise<OutcomeRow[]>;
  map: (setId: string) => Promise<LearnerMap>;
  cohort: (setA: string, setB: string, conceptKey: string) => Promise<unknown>;
  dismiss: (targetId: string, reason: string) => Promise<void>;
  defs: () => Promise<{ name: string; version: string; definition: string; sources: string[] }[]>;
}

export interface ItemRow {
  prompt: string; conceptKey: string; condition: string; n: number; p: number;
  interval: [number, number] | null; band: string; discrimination: number;
  pointBiserial: number; flag: string | null; causes: string[]; action: string | null;
}
export interface ClusterRow {
  concept: string; conceptKey: string; label: string; evidencePattern: string[];
  learnersAffected: number; severity: string; confidence: number; exemplar: string;
  recommendedIntervention: { type: string; activity: string };
}
export interface GainRow {
  conceptId: string; key: string; label: string; preScore: number; postScore: number;
  absoluteGain: number; normalizedGain: number | null; transferGain: number | null;
  retention21d: number | null; calibrationError: number; n: number; interpretation: string;
}
export interface MasteryRow {
  conceptId: string; key: string; label: string; firstExposure: string;
  stableMastery: string | null; calendarDays: number | null; activeMinutes: number | null;
  attempts: number; hintsUsed: number | null; transferStatus: string; met: boolean; note: string;
}
export interface CalibrationData {
  overall: { pattern: string; gap: number; meanConf: number; meanPerf: number; error: number; n: number };
  byConcept: { conceptKey: string; pattern: string; gap: number; n: number }[];
  guidance: string;
}
export interface DropoffData {
  funnel: { name: string; count: number; conversion: number | null; drop: number }[];
  interruptedUnsubmitted: number;
  checkIn: string; checkInOptions: string[]; needsInstrumentation: string[];
}
export interface QualityData {
  flags: { prompt: string; n: number; p: number; discrimination: number; causes: string[]; action: string | null }[];
  lifecycle: string; bankItems: number; retired: number;
}
export interface WarningGroup {
  userId: string;
  warnings: { kind: string; evidence: string[]; severity: string; disclaimer: string; suggestion: string; dismissHint: string }[];
}
export interface OutcomeRow {
  interventionId: string; type: string; targetConcept: string; completion: boolean;
  immediateGain: number | null; delayedGain: number | null; transferGain: number | null;
  gainConfidence: number; interpretation: string;
}
export interface LearnerMap {
  strong: string[]; developing: { label: string; status: string }[];
  misconceptions: { label: string; concept: string }[];
  calibration: string; nextStep: string;
}

export function AnalyticsPanel({ setId, actions, isInstructor }: {
  setId: string; actions: InsightsActions; isInstructor: boolean;
}) {
  const [view, setView] = useState("map");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [conceptKey, setConceptKey] = useState("");
  const [cohortB, setCohortB] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  const load = (v: string) => {
    setView(v);
    setLoading(true);
    const done = (d: unknown) => { setData(d); setLoading(false); };
    const fail = () => setLoading(false);
    if (v === "map") void actions.map(setId).then(done).catch(fail);
    else if (v === "items") void actions.items(setId).then(done).catch(fail);
    else if (v === "clusters") void actions.clusters(setId).then(done).catch(fail);
    else if (v === "gains") void actions.gains(setId).then(done).catch(fail);
    else if (v === "mastery") void actions.mastery(setId, conceptKey || undefined).then(done).catch(fail);
    else if (v === "calibration") void actions.calibration(setId, conceptKey || undefined).then(done).catch(fail);
    else if (v === "dropoff") void actions.dropoff(setId).then(done).catch(fail);
    else if (v === "quality") void actions.quality(setId).then(done).catch(fail);
    else if (v === "warnings") void actions.warnings(setId).then(done).catch(fail);
    else if (v === "outcomes") void actions.outcomes(setId).then(done).catch(fail);
    else if (v === "defs") void actions.defs().then(done).catch(fail);
  };
  if (data === null && !loading && view === "map") load("map");

  const views: { id: string; label: string; instructorOnly?: boolean }[] = [
    { id: "map", label: "🗺 My map" },
    { id: "gains", label: "📈 Gains" },
    { id: "mastery", label: "⏱ Time-to-mastery" },
    { id: "calibration", label: "🎯 Calibration" },
    { id: "dropoff", label: "🌊 Drop-off" },
    { id: "outcomes", label: "🧪 Interventions" },
    { id: "items", label: "🧩 Items", instructorOnly: true },
    { id: "clusters", label: "🔍 Clusters", instructorOnly: true },
    { id: "quality", label: "🔬 Quality", instructorOnly: true },
    { id: "warnings", label: "⚠️ Early warnings", instructorOnly: true },
    { id: "defs", label: "📖 Definitions" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {views.filter((v) => isInstructor || !v.instructorOnly).map((v) => (
          <Button key={v.id} size="sm" variant={view === v.id ? undefined : "secondary"} onClick={() => { setData(null); load(v.id); }}>{v.label}</Button>
        ))}
        <input className="nv-input" value={conceptKey} onChange={(e) => setConceptKey(e.target.value)} placeholder="concept key filter…" style={{ width: 160 }} />
      </div>
      {loading && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>Computing from evidence…</div>}
      {!loading && data !== null && (
        <ViewBody view={view} data={data} setId={setId} cohortB={cohortB} setCohortB={setCohortB}
          actions={actions} dismissReason={dismissReason} setDismissReason={setDismissReason} />
      )}
    </div>
  );
}

function ViewBody({ view, data, setId, cohortB, setCohortB, actions, dismissReason, setDismissReason }: {
  view: string; data: unknown; setId: string; cohortB: string; setCohortB: (s: string) => void;
  actions: InsightsActions; dismissReason: string; setDismissReason: (s: string) => void;
}) {
  if (view === "map") {
    const m = data as LearnerMap;
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Your learning map</div>
        <div style={{ fontSize: 12, marginTop: 4 }}><b>Strong:</b> {m.strong.join(", ") || "—"}</div>
        <div style={{ fontSize: 12 }}><b>Developing:</b> {m.developing.map((d) => `${d.label} (${d.status.toLowerCase().replace(/_/g, " ")})`).join(", ") || "—"}</div>
        {m.misconceptions.length > 0 && (
          <div style={{ fontSize: 12 }}><b>Current misconception:</b> {m.misconceptions[0]!.label}
            <div style={{ color: "var(--nv-color-text-faint)" }}>Evidence: pattern across responses — see Graph tab for detail.</div></div>
        )}
        <div style={{ fontSize: 12 }}><b>Confidence check:</b> {m.calibration}</div>
        <div style={{ fontSize: 12 }}><b>Next step:</b> {m.nextStep}</div>
      </div>
    );
  }
  if (view === "gains") {
    const rows = (data as GainRow[]);
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Learning gain per concept</div>
        {rows.map((g) => (
          <div key={g.conceptId} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{g.label}</b>: {Math.round(g.preScore * 100)} → <b>{Math.round(g.postScore * 100)}</b>
            {" "}(Δ {g.absoluteGain >= 0 ? "+" : ""}{g.absoluteGain}
            {g.normalizedGain !== null ? `, norm ${g.normalizedGain}` : ", norm n/a at ceiling"}
            {g.transferGain !== null ? `, transfer ${g.transferGain >= 0 ? "+" : ""}${g.transferGain}` : ""}
            {g.retention21d !== null ? `, 21d retention ${Math.round(g.retention21d * 100)}%` : ""}) · n={g.n} · <i>{g.interpretation}</i>
          </div>
        ))}
        {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Not enough longitudinal evidence yet.</div>}
      </div>
    );
  }
  if (view === "mastery") {
    const rows = (data as MasteryRow[]);
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Time to mastery (criterion-gated, never speed-ranked)</div>
        {rows.map((r) => (
          <div key={r.conceptId} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{r.label}</b> {r.met ? "✅ met" : "○ in progress"} · first {r.firstExposure}
            {r.stableMastery ? ` → stable ${r.stableMastery} (${r.calendarDays}d` : ""}
            {r.activeMinutes !== null ? `, ${r.activeMinutes} active min` : ""}{r.stableMastery ? ")" : ""}
            {" "}· attempts {r.attempts} · transfer {r.transferStatus}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{r.note}</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No tracked concepts yet.</div>}
      </div>
    );
  }
  if (view === "calibration") {
    const c = data as CalibrationData;
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Confidence × performance (private, constructive)</div>
        <div style={{ fontSize: 12 }}>Pattern: <b>{c.overall.pattern}</b> · gap {c.overall.gap} · conf {Math.round(c.overall.meanConf * 100)}% vs perf {Math.round(c.overall.meanPerf * 100)}% · n={c.overall.n}</div>
        {c.byConcept.slice(0, 10).map((b) => (
          <div key={b.conceptKey} style={{ fontSize: 12 }}>{b.conceptKey}: {b.pattern} (gap {b.gap}, n={b.n})</div>
        ))}
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{c.guidance}</div>
      </div>
    );
  }
  if (view === "dropoff") {
    const d = data as DropoffData;
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Attempt funnel (no emotion inference)</div>
        {d.funnel.map((s) => (
          <div key={s.name} style={{ fontSize: 12 }}>{s.name}: <b>{s.count}</b>{s.conversion !== null && s.conversion < 1 ? ` (${Math.round(s.conversion * 100)}%, −${s.drop})` : ""}</div>
        ))}
        {d.interruptedUnsubmitted > 0 && <div style={{ fontSize: 12 }}>Interrupted unsubmitted: {d.interruptedUnsubmitted}</div>}
        <div style={{ fontSize: 12, marginTop: 4 }}>{d.checkIn}</div>
        {d.checkInOptions.map((o) => <div key={o} style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>- {o}</div>)}
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Needs instrumentation: {d.needsInstrumentation.join(", ")}</div>
      </div>
    );
  }
  if (view === "outcomes") {
    const rows = (data as OutcomeRow[]);
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Intervention effectiveness (associative unless experimental)</div>
        {rows.map((r) => (
          <div key={r.interventionId} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{r.type}</b> → {r.targetConcept.slice(0, 8)} · {r.completion ? "completed" : "not completed"}
            {r.immediateGain !== null ? ` · immediate ${r.immediateGain >= 0 ? "+" : ""}${r.immediateGain}` : ""}
            {r.delayedGain !== null ? ` · delayed ${r.delayedGain >= 0 ? "+" : ""}${r.delayedGain}` : ""}
            {r.transferGain !== null ? ` · transfer ${r.transferGain >= 0 ? "+" : ""}${r.transferGain}` : ""}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{r.interpretation}</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No interventions measured yet.</div>}
      </div>
    );
  }
  if (view === "items") {
    const d = data as { items: ItemRow[] };
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Item difficulty × discrimination (population × condition)</div>
        {d.items.slice(0, 30).map((i, ix) => (
          <div key={ix} style={{ fontSize: 12, marginTop: 4 }}>
            “{i.prompt.slice(0, 90)}” · p={i.p} ({i.band}, n={i.n}, {i.condition}) · D={i.discrimination}
            {i.flag && <span style={{ color: "var(--nv-color-danger)" }}> · ⚠ {i.flag.replace(/_/g, " ")}: {i.causes.slice(0, 2).join("; ")}</span>}
            {i.action && <div style={{ color: "var(--nv-color-text-faint)" }}>{i.action}</div>}
          </div>
        ))}
        {d.items.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Need ≥5 responses per item.</div>}
      </div>
    );
  }
  if (view === "clusters") {
    const rows = (data as ClusterRow[]);
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Misconception clusters (patterns, anonymized)</div>
        {rows.map((m, i) => (
          <div key={i} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{m.label}</b> ({m.concept}) · {m.learnersAffected} learner(s) · {m.severity} · conf {Math.round(m.confidence * 100)}%
            <div style={{ color: "var(--nv-color-text-faint)" }}>Pattern: {m.evidencePattern.join("; ")}</div>
            <div>“{m.exemplar}” → {m.recommendedIntervention.type} ({m.recommendedIntervention.activity})</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No active clusters.</div>}
      </div>
    );
  }
  if (view === "quality") {
    const d = data as QualityData;
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Question quality (bank {d.bankItems}, retired {d.retired})</div>
        {d.flags.map((f, i) => (
          <div key={i} style={{ fontSize: 12, marginTop: 4 }}>
            “{f.prompt.slice(0, 90)}” · p={f.p} · D={f.discrimination}
            <div style={{ color: "var(--nv-color-danger)" }}>Causes: {f.causes.join("; ")}</div>
            {f.action && <div style={{ color: "var(--nv-color-text-faint)" }}>{f.action}</div>}
          </div>
        ))}
        {d.flags.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No flags. Lifecycle: {d.lifecycle}</div>}
      </div>
    );
  }
  if (view === "warnings") {
    const groups = (data as WarningGroup[]);
    return (
      <DismissableWarnings groups={groups} setId={setId} actions={actions} />
    );
  }
  if (view === "defs") {
    const defs = (data as { name: string; version: string; definition: string; sources: string[] }[]);
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800 }}>Metric definitions (versioned)</div>
        {defs.map((d) => (
          <div key={d.name} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{d.name}</b> v{d.version}: {d.definition} <span style={{ color: "var(--nv-color-text-faint)" }}>[{d.sources.join(", ")}]</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function DismissableWarnings({ groups, setId, actions }: {
  groups: WarningGroup[]; setId: string;
  actions: { dismiss: (targetId: string, reason: string) => Promise<void> };
}) {
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  if (groups.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No warnings — observable conditions look fine.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {groups.map((g) => (
        <div key={g.userId} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Learner {g.userId.slice(0, 8)} (pseudonymous)</div>
          {g.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 4 }}>
              <b>{w.kind.replace(/_/g, " ")}</b> [{w.severity}]
              {w.evidence.map((e, j) => <div key={j}>- {e}</div>)}
              <div style={{ color: "var(--nv-color-text-faint)" }}>{w.disclaimer}</div>
              <div>Suggested: {w.suggestion}</div>
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{w.dismissHint}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input className="nv-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="dismiss/correct reason…" style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => {
              if (!reason.trim()) return;
              void actions.dismiss(setId, `${g.userId.slice(0, 8)}: ${reason.trim()}`).then(() => { setDone(g.userId); setReason(""); });
            }}>Dismiss with reason</Button>
          </div>
          {done === g.userId && <div style={{ fontSize: 12, color: "var(--nv-color-success)" }}>Recorded — the warning stays visible in history but stops triggering.</div>}
        </div>
      ))}
    </div>
  );
}
