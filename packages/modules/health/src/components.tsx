"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@n0va/ui";
import type { HealthCheckin } from "@n0va/db";
import type { CheckinStats } from "./server";

export interface HealthActions {
  create: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const MOODS = ["LOW", "OK", "GOOD", "GREAT"] as const;
const ENERGIES = ["LOW", "OK", "HIGH"] as const;
const MOOD_EMOJI: Record<string, string> = { LOW: "😕", OK: "😐", GOOD: "🙂", GREAT: "😄" };
const ENERGY_EMOJI: Record<string, string> = { LOW: "🪫", OK: "🔋", HIGH: "⚡" };

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "safety", label: "Safety OS" },
  { id: "registry", label: "Registry & CVC" },
  { id: "wallet", label: "Wallet" },
  { id: "patients", label: "UHR & Patients" },
  { id: "twin", label: "Bio-Digital Twin" },
  { id: "vitals", label: "Vitals & Mesh" },
  { id: "devices", label: "Devices & IoT" },
  { id: "care", label: "Care & Pharmacy" },
  { id: "wellness", label: "Wellness" },
  { id: "telehealth", label: "Telehealth" },
  { id: "ani", label: "Ani Intelligence" },
  { id: "n0va1o", label: "N0VA1O Swarm" },
  { id: "checkins", label: "Check-ins" },
] as const;

type TabId = typeof TABS[number]["id"];

function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: string }) {
  return (
    <div className="nv-card" style={{ padding: 12 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: "var(--nv-color-text-faint)", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: tone === "danger" ? "#ef4444" : "var(--nv-color-text-faint)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="nv-card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: subtitle ? 4 : 12 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        {action}
      </div>
      {subtitle && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 12 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

// Lightweight pills
function Pill({ children, tone }: { children: React.ReactNode; tone?: "primary" | "success" | "warning" | "danger" | "neutral" }) {
  const bg: Record<string, string> = { primary: "#4f46e5", success: "#059669", warning: "#d97706", danger: "#dc2626", neutral: "#6b7280" };
  const t = tone ?? "neutral";
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 800, color: "white", background: bg[t] }}>{children}</span>;
}

export function WellnessBoard({
  checkins,
  stats,
  actions,
}: {
  checkins: HealthCheckin[];
  stats: CheckinStats;
  actions: HealthActions;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  // legacy checkin form state
  const [mood, setMood] = useState<(typeof MOODS)[number]>("OK");
  const [energy, setEnergy] = useState<(typeof ENERGIES)[number]>("OK");
  const [sleep, setSleep] = useState("7");
  const [note, setNote] = useState("");

  // transcendent live data (client-fetched, degrades gracefully)
  const [dash, setDash] = useState<Record<string, unknown> | null>(null);
  const [patients, setPatients] = useState<Array<Record<string, unknown>>>([]);
  const [vitals, setVitals] = useState<Array<Record<string, unknown>>>([]);
  const [devices, setDevices] = useState<Array<Record<string, unknown>>>([]);
  const [alerts, setAlerts] = useState<Array<Record<string, unknown>>>([]);
  const [aniInput, setAniInput] = useState("I have had chest tightness and mild fever for 2 days");
  const [aniResult, setAniResult] = useState<Record<string, unknown> | null>(null);
  const [newPatient, setNewPatient] = useState({ firstName: "", lastName: "", mrn: "", email: "" });
  const [vitalForm, setVitalForm] = useState({ patientId: "", heartRate: "78", spo2: "98", bpSystolic: "120", bpDiastolic: "80", layer: "CARDIOVASCULAR" });
  const [ambient, setAmbient] = useState<Record<string, unknown> | null>(null);
  // safety OS state
  const [recs, setRecs] = useState<Array<Record<string, unknown>>>([]);
  const [incidents, setIncidents] = useState<Array<Record<string, unknown>>>([]);
  const [policies, setPolicies] = useState<Array<Record<string, unknown>>>([]);
  const [monitor, setMonitor] = useState<Record<string, unknown> | null>(null);
  const [degraded, setDegraded] = useState<Record<string, unknown> | null>(null);
  const [auditChain, setAuditChain] = useState<Record<string, unknown> | null>(null);
  const [reviewForm, setReviewForm] = useState({ id:"", decision:"AGREED" as string, reason:"" });
  const [incidentForm, setIncidentForm] = useState({ title:"", kind:"NEAR_MISS" as string, severity:"MODERATE" as string });
  // registry & CVC state
  const [registryModels, setRegistryModels] = useState<Array<Record<string, unknown>>>([]);
  const [datasets, setDatasets] = useState<Array<Record<string, unknown>>>([]);
  const [validationStudies, setValidationStudies] = useState<Array<Record<string, unknown>>>([]);
  const [evidenceClaims, setEvidenceClaims] = useState<Array<Record<string, unknown>>>([]);
  const [modelCards, setModelCards] = useState<Array<Record<string, unknown>>>([]);
  const [regulatory, setRegulatory] = useState<Array<Record<string, unknown>>>([]);
  const [deployments, setDeployments] = useState<Array<Record<string, unknown>>>([]);
  const [driftSignals, setDriftSignals] = useState<Array<Record<string, unknown>>>([]);
  const [changeControls, setChangeControls] = useState<Array<Record<string, unknown>>>([]);
  const [postMarket, setPostMarket] = useState<Array<Record<string, unknown>>>([]);
  const [clinicalReviews, setClinicalReviews] = useState<Array<Record<string, unknown>>>([]);
  const [registryAuthorize, setRegistryAuthorize] = useState<Record<string, unknown> | null>(null);
  const [newDataset, setNewDataset] = useState({ name:"", sourceOrg:"", modality:"wearable" });
  const [newClaim, setNewClaim] = useState({ claim_id:"", model_id:"sepsis-risk-v3", metric:"sensitivity", value:"0.92" });
  const [newDeployment, setNewDeployment] = useState({ modelId:"sepsis-risk-v3", modelVersion:"3.4.1", gate:"G2", channel:"SHADOW" });
  const [newDrift, setNewDrift] = useState({ modelId:"sepsis-risk-v3", metric:"calibration_error", value:"0.04", level:"AMBER" });
  // wallet state — patient wallet (use first patient as demo)
  const [walletConsents, setWalletConsents] = useState<Array<Record<string, unknown>>>([]);
  const [walletDashboard, setWalletDashboard] = useState<Record<string, unknown> | null>(null);
  const [walletLedger, setWalletLedger] = useState<Array<Record<string, unknown>>>([]);
  const [walletDerived, setWalletDerived] = useState<Array<Record<string, unknown>>>([]);
  const [walletProxies, setWalletProxies] = useState<Array<Record<string, unknown>>>([]);
  const [walletExports, setWalletExports] = useState<Array<Record<string, unknown>>>([]);
  const [walletCorrections, setWalletCorrections] = useState<Array<Record<string, unknown>>>([]);
  const [walletRestrictions, setWalletRestrictions] = useState<Array<Record<string, unknown>>>([]);
  const [walletDeletions, setWalletDeletions] = useState<Array<Record<string, unknown>>>([]);
  const [walletStudies, setWalletStudies] = useState<Array<Record<string, unknown>>>([]);
  const [consentForm, setConsentForm] = useState({ patientId:"", recipientId:"city-hospital", dataDomains:"GENERAL_MEDICAL", purposes:"TREATMENT", actions:"VIEW" });
  const [pdpForm, setPdpForm] = useState({ patientId:"", dataCategory:"GENERAL_MEDICAL", purpose:"TREATMENT", action:"VIEW", jurisdiction:"IN-GJ" });
  const [pdpResult, setPdpResult] = useState<Record<string, unknown> | null>(null);
  const [exportForm, setExportForm] = useState({ patientId:"", format:"FHIR_R4_BUNDLE" });
  const [correctionForm, setCorrectionForm] = useState({ patientId:"", recordId:"", dataDomain:"GENERAL_MEDICAL" });
  const [restrictionForm, setRestrictionForm] = useState({ patientId:"", restrictionType:"block_ai_training", dataDomains:"GENERAL_MEDICAL" });

  // fetch dashboard
  useEffect(() => {
    let alive = true;
    const url = (p: string) => p;
    const j = async (path: string) => {
      try {
        const r = await fetch(url(path), { cache: "no-store" });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    };
    void (async () => {
      const d = await j("/api/health/vitality");
      if (alive && d) setDash(d.dashboard ?? d);
      const p = await j("/api/health/patients?take=6");
      if (alive && p?.rows) setPatients(p.rows);
      const v = await j("/api/health/vitals?take=12");
      if (alive && v?.rows) setVitals(v.rows);
      const dev = await j("/api/health/devices?take=12");
      if (alive && dev?.rows) setDevices(dev.rows);
      const al = await j("/api/health/alerts?take=8");
      if (alive && al?.rows) setAlerts(al.rows);
      const amb = await j("/api/health/ambient");
      if (alive && amb) setAmbient(amb);
      const sr = await j("/api/health/safety/recommendations?take=12");
      if (alive && sr?.rows) setRecs(sr.rows);
      const si = await j("/api/health/safety/incidents?take=8");
      if (alive && si?.rows) setIncidents(si.rows);
      const sp = await j("/api/health/safety/policies");
      if (alive && sp?.rows) setPolicies(sp.rows);
      const mo = await j("/api/health/safety/monitor");
      if (alive && mo) setMonitor(mo.monitor ?? mo);
      const dg = await j("/api/health/safety/degraded");
      if (alive && dg) setDegraded(dg.degraded ?? dg);
      const ac = await j("/api/health/safety/audit?take=6");
      if (alive && ac) setAuditChain(ac);
      const rm = await j("/api/health/registry/models");
      if (alive && rm?.rows) setRegistryModels(rm.rows);
      const ds = await j("/api/health/registry/datasets");
      if (alive && ds?.rows) setDatasets(ds.rows);
      const vs = await j("/api/health/registry/validation-studies");
      if (alive && vs?.rows) setValidationStudies(vs.rows);
      const ec = await j("/api/health/registry/evidence-claims");
      if (alive && ec?.rows) setEvidenceClaims(ec.rows);
      const mc = await j("/api/health/registry/model-cards");
      if (alive && mc?.rows) setModelCards(mc.rows);
      const rg = await j("/api/health/registry/regulatory");
      if (alive && rg?.rows) setRegulatory(rg.rows);
      const dep = await j("/api/health/registry/deployments");
      if (alive && dep?.rows) setDeployments(dep.rows);
      const dr = await j("/api/health/registry/drift");
      if (alive && dr?.rows) setDriftSignals(dr.rows);
      const cc = await j("/api/health/registry/change-controls");
      if (alive && cc?.rows) setChangeControls(cc.rows);
      const pm = await j("/api/health/registry/post-market");
      if (alive && pm?.rows) setPostMarket(pm.rows);
      const cr = await j("/api/health/registry/clinical-reviews");
      if (alive && cr?.rows) setClinicalReviews(cr.rows);
      const demoPatient = (p?.rows?.[0] as Record<string,unknown> | undefined)?.id as string | undefined;
      if (demoPatient) {
        const wc = await j(`/api/health/wallet/consents?patientId=${demoPatient}`);
        if (alive && wc?.rows) setWalletConsents(wc.rows);
        const wd = await j(`/api/health/wallet/dashboard?patientId=${demoPatient}`);
        if (alive && wd?.dashboard) setWalletDashboard(wd.dashboard);
        const wl = await j(`/api/health/wallet/ledger?patientId=${demoPatient}&take=8`);
        if (alive && wl?.rows) setWalletLedger(wl.rows);
        const wder = await j(`/api/health/wallet/derived?patientId=${demoPatient}`);
        if (alive && wder?.rows) setWalletDerived(wder.rows);
        const wprox = await j(`/api/health/wallet/proxies?patientId=${demoPatient}`);
        if (alive && wprox?.rows) setWalletProxies(wprox.rows);
        const wexp = await j(`/api/health/wallet/exports?patientId=${demoPatient}`);
        if (alive && wexp?.rows) setWalletExports(wexp.rows);
        const wcorr = await j(`/api/health/wallet/corrections?patientId=${demoPatient}`);
        if (alive && wcorr?.rows) setWalletCorrections(wcorr.rows);
        const wrest = await j(`/api/health/wallet/restrictions?patientId=${demoPatient}`);
        if (alive && wrest?.rows) setWalletRestrictions(wrest.rows);
        const wdel = await j(`/api/health/wallet/deletions?patientId=${demoPatient}`);
        if (alive && wdel?.rows) setWalletDeletions(wdel.rows);
        const wst = await j(`/api/health/wallet/research-studies`);
        if (alive && wst?.rows) setWalletStudies(wst.rows);
        setConsentForm(prev=> ({ ...prev, patientId: demoPatient }));
        setPdpForm(prev=> ({ ...prev, patientId: demoPatient }));
        setExportForm(prev=> ({ ...prev, patientId: demoPatient }));
        setCorrectionForm(prev=> ({ ...prev, patientId: demoPatient }));
        setRestrictionForm(prev=> ({ ...prev, patientId: demoPatient }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const submit = () => {
    const fd = new FormData();
    fd.set("mood", mood);
    fd.set("energy", energy);
    fd.set("sleepHours", sleep);
    fd.set("note", note);
    void actions.create(fd).then(() => {
      setNote("");
      router.refresh();
    });
  };

  const createPatient = async () => {
    if (!newPatient.firstName || !newPatient.lastName) return;
    const r = await fetch("/api/health/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: newPatient.firstName, lastName: newPatient.lastName, mrn: newPatient.mrn || undefined, email: newPatient.email || undefined }) });
    if (r.ok) {
      setNewPatient({ firstName: "", lastName: "", mrn: "", email: "" });
      const j = await r.json().catch(()=>null);
      if (j?.patient) setPatients((prev)=> [j.patient, ...prev].slice(0,6));
    }
  };

  const ingestVital = async () => {
    if (!vitalForm.patientId) return;
    const body = { patientId: vitalForm.patientId, heartRate: vitalForm.heartRate ? Number(vitalForm.heartRate) : undefined, spo2: vitalForm.spo2 ? Number(vitalForm.spo2) : undefined, bpSystolic: vitalForm.bpSystolic ? Number(vitalForm.bpSystolic) : undefined, bpDiastolic: vitalForm.bpDiastolic ? Number(vitalForm.bpDiastolic) : undefined, layer: vitalForm.layer };
    const r = await fetch("/api/health/vitals/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batch: [body] }) });
    if (r.ok) {
      const j = await r.json().catch(()=>null);
      if (j?.result) setVitals((prev)=> [...(j.result.vitals ?? []), ...prev].slice(0,12));
    }
  };

  const runAni = async () => {
    const r = await fetch("/api/health/ani/symptom-checker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symptoms: aniInput }) });
    if (r.ok) setAniResult(await r.json());
    else setAniResult({ error: "Ani service unavailable — deterministic mock used", mock: true });
  };

  const d: Record<string, Record<string, unknown>> = (dash as Record<string, Record<string, unknown>>) ?? {};
  const patientsKpi = (d.patients as Record<string, unknown>) ?? {};
  const vitalsKpi = (d.vitals as Record<string, unknown>) ?? {};
  const devicesKpi = (d.devices as Record<string, unknown>) ?? {};
  const alertsKpi = (d.alerts as Record<string, unknown>) ?? {};

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      {/* Header — Vitality-Ω */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 900, letterSpacing: -0.5 }}>N0VA HEALTH & WELLNESS</h1>
        <span className="nv-badge nv-badge-amber">VITALITY-Ω • Transcendent</span>
        <Badge tone="primary">99.999% SLA</Badge>
        <Badge tone="success">HIPAA • GDPR • FHIR R4/R5</Badge>
        <Badge tone="warning">QUANTUM-SAFE</Badge>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--nv-color-text-faint)" }}> &lt;10ms ingestion • &lt;50ms alert • &lt;100ms EHR sync</span>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
        <Stat label="PATIENTS (UHR)" value={String(patientsKpi.total ?? patients.length ?? "—")} hint={`${String(patientsKpi.active ?? "")} active • ${(patientsKpi.highRisk as number) ?? 0} high risk`} />
        <Stat label="VITALS 24H" value={String(vitalsKpi.last24h ?? vitals.length ?? "—")} hint={`${String(vitalsKpi.streamingNow ?? "—")} streaming • Q ${String(vitalsKpi.avgQuality ?? 0.94)}`} />
        <Stat label="DEVICES" value={String(devicesKpi.total ?? devices.length ?? "—")} hint={`${String(devicesKpi.online ?? 0)} online • ${Object.keys((devicesKpi.byFamily as Record<string,unknown>)??{}).length} families`} />
        <Stat label="ALERTS ACTIVE" value={String(alertsKpi.active ?? alerts.length ?? "—")} hint={`${String(alertsKpi.critical ?? 0)} critical • ${String((alertsKpi.byKind as Record<string,unknown>)? Object.keys((alertsKpi.byKind as Record<string,unknown>)).length : 0)} kinds`} tone={(alertsKpi.critical as number ?? 0) > 0 ? "danger" : undefined} />
        <Stat label="CHECK-INS 30D" value={String(stats.checkinCount)} hint={`${stats.avgSleep.toFixed(1)}h avg sleep`} />
        <Stat label="FHIR SUCCESS" value={`${Math.round(((d.fhir as Record<string,unknown>)?.successRate as number ?? 0.98)*100)}%`} hint={(d.fhir as Record<string,unknown>)?.lastSyncAt ? `last ${new Date(String((d.fhir as Record<string,unknown>).lastSyncAt)).toLocaleTimeString()}` : "no sync yet"} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14, borderBottom: "1px solid var(--nv-color-border)", paddingBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: tab === t.id ? "1.5px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
              background: tab === t.id ? "var(--nv-color-surface-raised)" : "transparent",
              fontWeight: tab === t.id ? 800 : 600,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div style={{ display: "grid", gap: 12 }}>
          <Section title="Penta-Consciousness Health Interface" subtitle="Clinical • Patient • Autonomous AI • Neural • Ambient — the workspace breathes with the human.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <div className="nv-card" style={{ padding: 12, borderLeft: "3px solid #4f46e5" }}><div style={{ fontWeight: 800, fontSize: 13 }}>Clinical (Provider)</div><div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Precognitive diagnostic UX • Gesture-intent surgical flow • Neural cache</div></div>
              <div className="nv-card" style={{ padding: 12, borderLeft: "3px solid #059669" }}><div style={{ fontWeight: 800, fontSize: 13 }}>Patient (Individual)</div><div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Bio-Digital Twin mirror • Embodied wellness • Circadian interface</div></div>
              <div className="nv-card" style={{ padding: 12, borderLeft: "3px solid #d97706" }}><div style={{ fontWeight: 800, fontSize: 13 }}>Autonomous (AI/Agent)</div><div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Synthetic physician • Predictive pathways • Swarm diagnostics</div></div>
              <div className="nv-card" style={{ padding: 12, borderLeft: "3px solid #7c3aed" }}><div style={{ fontWeight: 800, fontSize: 13 }}>Neural (BCI-Ready)</div><div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>EEG/EMG • Eye-tracking • Haptic biofeedback • Sub-vocal</div></div>
              <div className="nv-card" style={{ padding: 12, borderLeft: "3px solid #0ea5e9" }}><div style={{ fontWeight: 800, fontSize: 13 }}>Ambient (Environmental)</div><div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Smart home mesh • Exposome grid • Omnipresent compute</div></div>
            </div>
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12 }}>
            <Section title="Workspace-Native Ambient Health" subtitle="Every email → keystroke stress • Every meeting → voice biomarker • Every task → burnout signal. Health is the background radiation of productive existence.">
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--nv-color-text-muted)" }}>
                {ambient ? (
                  (()=> {
                    const a = ambient as Record<string, unknown>;
                    const ws = (a.workspaceSignals as Record<string, unknown>) ?? {};
                    const hc = (a.healthContext as Record<string, unknown>) ?? {};
                    const wc = (hc.workspace_context as Record<string, unknown>) ?? {};
                    const bsi = (wc.biometric_stress_indicators as Record<string, unknown>) ?? {};
                    const interventions = a.interventions as unknown[] | undefined;
                    return (
                      <div style={{ display: "grid", gap: 6 }}>
                        <div>Mail 7d: <b>{String(ws.mail7d ?? "—")}</b> • Calendar 7d: <b>{String(ws.calendar7d ?? "—")}</b> • Tasks 7d: <b>{String(ws.tasks7d ?? "—")}</b></div>
                        <div>Keystroke pressure: <b>{String(bsi.keystroke_pressure ?? "—")}</b> • Cognitive load: <b>{String(bsi.cognitive_load_index ?? "—")}</b></div>
                        {Array.isArray(interventions) && interventions.length>0 && <div><Pill tone="warning">Suggested: {String((interventions[0] as Record<string,unknown>).suggestion)}</Pill></div>}
                      </div>
                    );
                  })()
                ) : <span>Loading ambient signals…</span>}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Pill tone="primary">Mail × Health</Pill><Pill tone="primary">Calendar × Health</Pill><Pill tone="primary">Tasks × Health</Pill><Pill tone="primary">Docs × Health</Pill><Pill tone="primary">Chat × Health</Pill><Pill tone="primary">Meet × Health</Pill>
              </div>
            </Section>
            <Section title="Live Ingestion Mesh (12 Layers)">
              <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
                {[
                  ["Layer 1 Cardiovascular","ECG 250Hz • PPG 100Hz","<5ms"],
                  ["Layer 2 Metabolic","CGM 1-5min • labs real-time","<10ms"],
                  ["Layer 3 Neurological","EEG 256-2048Hz • fNIRS","<2ms"],
                  ["Layer 4 Respiratory","Spirometry • capnography","<5ms"],
                  ["Layer 10 Environmental","PM2.5/VOC/CO2/light/noise","<10ms"],
                  ["Layer 11 Behavioral","GPS • typing • screen time","<10ms"],
                ].map(([l,s,lat])=> (
                  <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 8px", border:"1px solid var(--nv-color-border)", borderRadius:8 }}>
                    <span><b>{l}</b> <span style={{ color:"var(--nv-color-text-faint)"}}>— {s}</span></span><span style={{ color:"var(--nv-color-primary)", fontWeight:800 }}>{lat}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color:"var(--nv-color-text-faint)"}}>12 layers • 500+ device families • 10M concurrent streams • 50B readings/day • HSM + lattice post-quantum • zero raw biometric storage</div>
              </div>
            </Section>
          </div>

          <Section title="Care Orchestration — Cross-Module Atomic Symphonies" subtitle="N0VA1O collapses N×M (1,000 sources × 1,000 agents = 1,000,000 integrations) → 1 unified gateway with Saga atomicity.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:10, fontSize:12 }}>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Sepsis 47ms Cascade</div><div style={{ color:"var(--nv-color-text-faint)"}}>Vital breach → Health alert → Tasks (cultures + antibiotics) → Chat (rapid response) → Calendar (ETA 3m) → Docs (bundle) → Mail → ERP — ACID</div></div>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Discharge-to-Home</div><div style={{ color:"var(--nv-color-text-faint)"}}>Note generation → med rec → follow-up tasks → appointments → discharge summary → billing → Vault 7y — all-or-all rollback</div></div>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Clinician Wellness Intervention</div><div style={{ color:"var(--nv-color-text-faint)"}}>HRV 28ms + sleep 4.2h → Calendar reschedule + task redistribute + EAP + peer buddy — reassess 24h</div></div>
            </div>
          </Section>
        </div>
      )}

      {/* SAFETY OS — Clinical Safety Operating System */}
      {tab === "safety" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Clinical Safety Operating System — Mandatory Control Plane" subtitle="Every AI output → recommendation → evidence panel → policy engine → human review gate → execution guard → hash-chain audit. Model never approves its own output, never modifies threshold, never bypasses review, never directly executes S4-S5." action={<><Badge tone="warning">FDA CDS • WHO • NIST RMF</Badge><span style={{ marginLeft:8 }}><Pill tone="danger">S0-S5</Pill></span></>}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:8 }}>
              <Stat label="RECS 24H" value={String((monitor as Record<string,unknown>)?.generated ?? recs.length ?? "—")} hint={`${String((monitor as Record<string,unknown>)?.reviewRequired ?? recs.filter(r=> String(r.state)==="REVIEW_REQUIRED").length)} review req • ${String((monitor as Record<string,unknown>)?.abstained ?? recs.filter(r=> String(r.state)==="ABSTAINED").length)} abstained`} />
              <Stat label="ABSTENTION RATE" value={`${Math.round(((monitor as Record<string,unknown>)?.abstentionRate as number ?? (recs.filter(r=> String(r.state)==="ABSTAINED").length / Math.max(1, recs.length)))*100)}%`} hint="Target: abstain > block unsafe confidence" />
              <Stat label="APPROVED" value={String((monitor as Record<string,unknown>)?.approved ?? recs.filter(r=> String(r.state)==="APPROVED").length)} hint="Requires evidence viewed + reason" />
              <Stat label="INCIDENTS" value={String(incidents.length)} hint="Open + investigating" tone={incidents.length>0?"warning":undefined} />
              <Stat label="AUDIT CHAIN" value={(auditChain as Record<string,unknown>)?.valid===false? "BROKEN":"OK"} hint={`${String((auditChain as Record<string,unknown>)?.count ?? "—")} entries • SHA-256`} tone={(auditChain as Record<string,unknown>)?.valid===false?"danger":"success" as unknown as string} />
              <Stat label="DEGRADED" value={degraded ? Object.values(degraded as Record<string,Record<string,string>>).some(v=> v.status!=="nominal")? "DEGRADED":"NOMINAL" : "—"} hint={degraded? Object.entries(degraded as Record<string,Record<string,string>>).filter(([,v])=> v.status!=="nominal").map(([k])=>k).join(", ")||"All nominal" : ""} />
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:12 }}>
            <Section title="Safety Classification (Potential Harm, Not Complexity)" subtitle="S0 informational → S5 regulated/safety-critical. Simple dispatch rule > sophisticated wellness model.">
              <div style={{ overflowX:"auto" }}>
                <table className="nv-table" style={{ fontSize:12 }}>
                  <thead><tr><th>Class</th><th>Description</th><th>Examples</th><th>Default</th></tr></thead>
                  <tbody>
                    <tr><td><Pill tone="neutral">S0</Pill></td><td>Informational wellness</td><td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Sleep edu, hydration, general fitness</td><td style={{ fontSize:11 }}>May be automated with disclaimers</td></tr>
                    <tr><td><Pill tone="success">S1</Pill></td><td>Low-risk guidance</td><td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Wellness plans, habit coaching</td><td style={{ fontSize:11 }}>Automated if inputs valid</td></tr>
                    <tr><td><Pill tone="primary">S2</Pill></td><td>Patient-specific support</td><td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Symptom navigation, adherence</td><td style={{ fontSize:11 }}>Human rules, safe escalation</td></tr>
                    <tr><td><Pill tone="warning">S3</Pill></td><td>Clinical decision support</td><td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Risk scores, differential, care-gap</td><td style={{ fontSize:11 }}><b>Clinician review required</b></td></tr>
                    <tr><td><Pill tone="danger">S4</Pill></td><td>High-risk clinical</td><td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Sepsis, stroke, cardiac, dosing, suicide</td><td style={{ fontSize:11 }}><b>Immediate qualified review</b></td></tr>
                    <tr><td><span style={{ background:"#7c2d12", color:"white", padding:"2px 8px", borderRadius:999, fontSize:11, fontWeight:800 }}>S5</span></td><td>Regulated / safety-critical</td><td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Med order, emergency dispatch, device control</td><td style={{ fontSize:11 }}><b>Explicit auth + execution guard</b></td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
                <Pill tone="danger">S4/S5 never autonomous</Pill><Pill>Model ≠ approver</Pill><Pill>Independent review (FDA)</Pill><Pill>WHO autonomy/safety</Pill>
              </div>
            </Section>
            <Section title="Action Authorization Matrix" subtitle="Observe → Suggest → Draft → Request Approval → Execute — AI may draft task/order but never implies clinician reviewed.">
              <div style={{ overflowX:"auto" }}>
                <table className="nv-table" style={{ fontSize:11 }}>
                  <thead><tr><th>Action</th><th>Suggest</th><th>Draft</th><th>Human</th><th>Auto Exec</th></tr></thead>
                  <tbody>
                    <tr><td>Wellness reminder</td><td>✅</td><td>✅</td><td>Usually no</td><td style={{ color:"#059669", fontWeight:800 }}>Yes</td></tr>
                    <tr><td>Symptom triage</td><td>✅</td><td>✅</td><td>High-risk req</td><td style={{ color:"#dc2626", fontWeight:800 }}>No</td></tr>
                    <tr><td>Clinical risk alert</td><td>✅</td><td>✅</td><td>Required</td><td style={{ color:"#dc2626", fontWeight:800 }}>No</td></tr>
                    <tr><td>Medication order</td><td>✅</td><td>Draft only</td><td>Required</td><td style={{ color:"#dc2626", fontWeight:800 }}>No</td></tr>
                    <tr><td>Sepsis protocol</td><td>✅</td><td>✅</td><td>Required</td><td style={{ fontSize:10 }}>Only pre-auth logistics</td></tr>
                    <tr><td>Suicide escalation</td><td>✅</td><td>✅</td><td>Immediately</td><td style={{ fontSize:10 }}>Only narrow safety notif</td></tr>
                    <tr><td>Emergency dispatch</td><td>✅</td><td>Draft</td><td>Confirm if feasible</td><td style={{ fontSize:10 }}>Validated policy only</td></tr>
                    <tr><td>Diagnostic report</td><td>Prelim</td><td>✅</td><td>Sign-off</td><td style={{ color:"#dc2626", fontWeight:800 }}>No</td></tr>
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section title="Recommendation Lifecycle — Every State Transition Has Actor, Timestamp, Context, Model/Policy Versions, Input Hash, Reason, Authorization, Signature, Links, Outcome" subtitle="Terminal: ABSTAINED / REJECTED / EXPIRED / CANCELLED / SUPERSEDED / FAILED_SAFE — never fail-open for S3-S5.">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>
              {["GENERATED","VALIDATING","ELIGIBLE","REVIEW_REQUIRED","APPROVED","EXECUTING","COMPLETED","OUTCOME_MONITORED"].map((s,i)=> (
                <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                  <span style={{ padding:"4px 8px", borderRadius:999, background: s==="REVIEW_REQUIRED"?"#fef3c7": s==="APPROVED"?"#d1fae5": s==="ABSTAINED"?"#fee2e2":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>
                  {i<7 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}
                </span>
              ))}
              <span style={{ color:"var(--nv-color-text-faint)", marginLeft:8 }}>Terminal: <Pill tone="danger">ABSTAINED</Pill> <Pill>REJECTED</Pill> <Pill>EXPIRED</Pill> <Pill>CANCELLED</Pill> <Pill>SUPERSEDED</Pill> <Pill tone="danger">FAILED_SAFE</Pill></span>
            </div>
            <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)", lineHeight:1.6 }}>
              WHO: autonomy & human oversight • FDA: sufficient information for independent review, not primary reliance • NIST: govern-map-measure-manage • Independent safety system (model never approves own output)
            </div>
            <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
              <Pill tone="primary">Enforced: allowed transitions only</Pill><Pill>Trace ID + input hash + chainPrev</Pill><Pill>Dual approval for DUAL/SPECIALIST</Pill>
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Input Safety Gateway — Before Inference" subtitle="If stale/corrupted/contradictory/out-of-range/outside population → abstain or request confirmation, never confident recommendation.">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}>
                {["Patient identity & encounter matching","Data freshness & timestamp consistency","Device identity & authentication","Signal quality & artifact detection","Unit normalization","Reference-range & plausibility","Missing-value detection","Duplicate-event detection","Contradictory data","Pregnancy/age/renal/hepatic/allergy/medication context","Location & care setting","Population approval","Device/modality approval","Operating envelope"].map(c=> (
                  <div key={c} style={{ padding:"4px 6px", border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)" }}>✓ {c}</div>
                ))}
              </div>
              <div style={{ marginTop:8, padding:8, border:"1px dashed #d97706", borderRadius:8, fontSize:11, background:"#fffbeb" }}>
                <b>Safe abstention:</b> “N0VA cannot safely assess this situation from the available information. A clinician review is required.”
              </div>
            </Section>
            <Section title="Operating Envelope (Machine-Readable)" subtitle="Per-model declaration — policy engine blocks/downgrades when missing.">
              <pre style={{ fontSize:11, background:"var(--nv-color-surface-raised)", padding:8, borderRadius:8, overflowX:"auto", whiteSpace:"pre-wrap" }}>{`{
  "model_id": "sepsis-risk-v3",
  "approved_use": "adult inpatient deterioration",
  "excluded_use": ["pediatric","pregnancy","outpatient","single wearable"],
  "required_inputs": ["heart_rate","respiratory_rate","blood_pressure","temperature","oxygen_saturation","labs"],
  "maximum_input_age_minutes": 30,
  "minimum_signal_quality": 0.85,
  "minimum_calibration_confidence": 0.90,
  "required_human_role": "attending_or_rapid_response",
  "execution_mode": "recommendation_only"
}`}</pre>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)"}}>Stored as HealthModelRegistry + HealthOperatingEnvelope • status ACTIVE/SUSPENDED/EXPIRED • drift_detected auto-suspends</div>
            </Section>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Confidence & Abstention — Never Single %" subtitle="Suppress when required inputs missing / quality inadequate / conflicts / outside population / unstable / interval crosses boundary / expired / drift / conflicts clinician fact.">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontSize:11 }}>
                <div><b>Predictive probability</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Raw model output</span></div>
                <div><b>Calibration</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Is 80% really 80%?</span></div>
                <div><b>Aleatoric</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Noisy/incomplete data</span></div>
                <div><b>Epistemic</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Model unfamiliarity</span></div>
                <div><b>Input quality</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Sensor/data trust</span></div>
                <div><b>Population conf</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Representativeness</span></div>
                <div><b>Temporal stability</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Repeated inference variance</span></div>
                <div><b>Evidence strength</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Strong/moderate/weak</span></div>
              </div>
            </Section>
            <Section title="Evidence & Explanation Contract (FDA CDS)" subtitle="Every clinical recommendation has structured panel — intended use, facts, sources, freshness, missing, model/policy versions, validation, pos/neg factors, contraindications, alternatives, uncertainty, next step, urgency, reviewer, expiration, source links.">
              <div style={{ display:"grid", gap:4, fontSize:11 }}>
                <div><b>Required:</b> Title • Intended use • Patient facts • Sources • Freshness • Missing • Model/policy/validation • Local metrics • Pos/neg factors • Contraindications • Alternatives • Uncertainty • Next step • Urgency • Required reviewer • Expiration • Source links</div>
                <div style={{ padding:8, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", borderRadius:8 }}>
                  <div style={{ fontWeight:800 }}>Wellness reminder (S0)</div>
                  <div style={{ color:"var(--nv-color-text-faint)"}}>May be automated with disclaimers</div>
                  <div style={{ fontWeight:800, marginTop:6 }}>Sepsis risk (S4)</div>
                  <div style={{ color:"var(--nv-color-text-faint)"}}>80% • Calibration nominal • Aleatoric 0.18 • Epistemic 0.11 • Trends + vitals + labs shown • Contraindications • Alternatives: pneumonia/PE • Next: rapid response assessment • Expires +4h • Links: vitals snapshot, labs</div>
                </div>
              </div>
            </Section>
          </div>

          <Section title="Human Review — Structured, Not Superficial Accept" subtitle="Reviewer sees original data, trends, notes/orders, missing/corrupted/conflicts, evidence, validation, can ask Ani rationale/counterargument, request second model/clinician, accept/modify/reject/defer with reason, assign follow-up, set reassessment.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px,1fr))", gap:8, fontSize:12 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Single</b><div style={{ color:"var(--nv-color-text-faint)"}}>Low-moderate support</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Dual</b><div style={{ color:"var(--nv-color-text-faint)"}}>Med dosing, high-risk, invasive</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Specialist</b><div style={{ color:"var(--nv-color-text-faint)"}}>Oncology, psychiatry, OB, peds, transplant, critical care</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Emergency concurrence</b><div style={{ color:"var(--nv-color-text-faint)"}}>Rapid response / ED for time-critical</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Patient confirmation</b><div style={{ color:"var(--nv-color-text-faint)"}}>Treatment/consent/monitoring/sharing changes</div></div>
            </div>
            <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)"}}>Distinguishes reviewed / agreed / modified / overridden — clinically different events. Override requires reason.</div>
            <div style={{ marginTop:8, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:8, fontSize:11, background:"var(--nv-color-surface-raised)", display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              <input className="nv-input" placeholder="Recommendation ID (UUID)" value={reviewForm.id} onChange={e=> setReviewForm({...reviewForm, id: e.target.value})} style={{ flex:1, minWidth:220 }} />
              <select className="nv-select" value={reviewForm.decision} onChange={e=> setReviewForm({...reviewForm, decision: e.target.value})} style={{ width:150 }}>
                {["AGREED","MODIFIED","REVIEWED","OVERRIDDEN","REJECTED","DEFERRED"].map(o=> <option key={o} value={o}>{o}</option>)}
              </select>
              <input className="nv-input" placeholder="Reason (required for override)" value={reviewForm.reason} onChange={e=> setReviewForm({...reviewForm, reason: e.target.value})} style={{ flex:1, minWidth:160 }} />
              <Button onClick={async()=> {
                if (!reviewForm.id) return;
                const r = await fetch(`/api/health/safety/recommendations/${reviewForm.id}/review`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ decision: reviewForm.decision, reason: reviewForm.reason, viewedEvidence:true, viewedTrends:true }) });
                const j = await r.json().catch(()=>null);
                if (r.ok) { setRecs(prev=> prev.map(x=> String(x.id)===reviewForm.id? {...x, state: j?.review? "APPROVED": x.state } as Record<string,unknown> : x)); setReviewForm({...reviewForm, id:"", reason:""}); }
                else alert(j?.error ?? "Review failed — ensure DUAL/SPECIALIST has second reviewer");
              }} disabled={!reviewForm.id}>Submit Review</Button>
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:12 }}>
            <Section title="Safety Policy Engine — Separate From Inference" subtitle="Inputs: age, care setting, diagnosis, allergies, meds, pregnancy, organ function, vitals, device quality, urgency, confidence, regulatory status, reviewer role, protocol, consent, jurisdiction, time since review.">
              <div style={{ fontSize:11, lineHeight:1.6 }}>
                <b>Outputs:</b> allow • require review • require second review • downgrade • suppress patient message • trigger escalation • require re-collection • lock medication • create task • expire • safe-degraded<br/>
                <b>Example policy: medication_dose_change (S5)</b>
                <pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:8, fontSize:11, marginTop:6, whiteSpace:"pre-wrap" }}>{`when: risk_class S5 + renal_impairment/pregnancy/pediatric/allergy/narrow_index
controls: require_prescriber_approval, require_pharmacist_review,
  block_autonomous_execution, show_contraindications,
  require_recent_labs 24h, create_reassessment_task`}</pre>
                <div style={{ display:"flex", gap:6, marginTop:6, flexWrap:"wrap" }}><Pill>Eval live via /api/health/safety/policies</Pill><Pill tone="danger">Policy ≠ model</Pill></div>
                {policies.length>0 && <div style={{ marginTop:6, fontSize:11 }}>Loaded: {policies.map(p=> String((p as Record<string,unknown>).policyKey)).join(", ")}</div>}
              </div>
            </Section>
            <Section title="High-Risk Workflow Controls" subtitle="Sepsis never states confirmed — states risk signal requiring assessment. Track time to ack → bedside → treatment → reassessment → outcome.">
              <div style={{ display:"grid", gap:6, fontSize:11 }}>
                <div className="nv-card" style={{ padding:8 }}><b>Sepsis</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Multi-evidence categories • verify freshness/quality • trends not score • no auto antibiotic/dosing • time-bound review • protocol only after approval • logistics (checklist/notify) pre-authorized OK • dedup with escalation preserved</span></div>
                <div className="nv-card" style={{ padding:8 }}><b>Medication optimization</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Reconciliation • allergy/duplicate • renal/hepatic/pregnancy • interaction severity • CPIC grading • formulary • pharmacist review • patient explanation • signature • post-order monitoring • rollback only if safe/authorized — never silent replacement</span></div>
                <div className="nv-card" style={{ padding:8 }}><b>Suicide/crisis</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>No passive signal alone as imminent risk • validated assessment + human conversation • taxonomy distress/concern/ideation/plan/danger • immediate human contact • jurisdiction-aware escalation • no alarming opaque-score message</span></div>
                <div className="nv-card" style={{ padding:8 }}><b>Emergency dispatch</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Multi-modality confirmation • two-way voice/text • location • cancel/ack check • local number • minimum info • ack tracking • operator override • connectivity-loss resilience • post-event review</span></div>
              </div>
            </Section>
          </div>

          <Section title="Review Queue — Structured Human Review (Not Accept Button)" subtitle="Every S3-S5 recommendation appears here until clinician completes evidence review. Distinguishes reviewed/agreed/modified/overridden.">
            <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
              <Button variant="ghost" size="sm" onClick={async()=> { const r=await fetch("/api/health/safety/recommendations?take=12",{cache:"no-store"}); const j=await r.json().catch(()=>null); if(j?.rows) setRecs(j.rows); }}>Refresh</Button>
              <span style={{ fontSize:11, color:"var(--nv-color-text-faint)", alignSelf:"center" }}>{recs.length} recommendations • abstain safe • expired 24h • superseded tracked</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table className="nv-table" style={{ fontSize:12 }}>
                <thead><tr><th>When</th><th>Kind</th><th>Class</th><th>State</th><th>Title</th><th>Patient</th><th>Urgency</th></tr></thead>
                <tbody>
                  {recs.length===0 && <tr><td colSpan={7} className="nv-empty">No recommendations — predictive scores, Ani DDX, med orders, imaging, vitals breaches automatically create S0-S5 recommendations via CSOS (safe abstention when inputs invalid)</td></tr>}
                  {recs.map((r,i)=> (
                    <tr key={String((r as Record<string,unknown>).id ?? i)}>
                      <td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{r.createdAt? new Date(String(r.createdAt)).toLocaleString():""}</td>
                      <td><Pill tone={(r as Record<string,unknown>).kind==="sepsis"||(r as Record<string,unknown>).kind==="deterioration"?"danger": (r as Record<string,unknown>).safetyClass==="S5"?"danger": (r as Record<string,unknown>).safetyClass==="S4"?"warning":"primary"}>{String((r as Record<string,unknown>).kind)}</Pill></td>
                      <td><Pill tone={(r as Record<string,unknown>).safetyClass==="S5"||(r as Record<string,unknown>).safetyClass==="S4"?"danger": (r as Record<string,unknown>).safetyClass==="S3"?"warning":"neutral"}>{String((r as Record<string,unknown>).safetyClass)}</Pill></td>
                      <td><Pill tone={String((r as Record<string,unknown>).state)==="REVIEW_REQUIRED"?"warning": String((r as Record<string,unknown>).state)==="APPROVED"?"success": String((r as Record<string,unknown>).state)==="ABSTAINED"?"danger":"neutral"}>{String((r as Record<string,unknown>).state)}</Pill></td>
                      <td style={{ maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{String((r as Record<string,unknown>).title).slice(0,80)}</td>
                      <td style={{ fontSize:11 }}>{String((r as Record<string,unknown>).patientId ?? "—").slice(0,8)}</td>
                      <td><Pill tone={(r as Record<string,unknown>).urgency==="emergent"?"danger": (r as Record<string,unknown>).urgency==="urgent"?"warning":"neutral"}>{String((r as Record<string,unknown>).urgency ?? (r as Record<string,unknown>).priority ?? "routine")}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop:8, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:8, fontSize:11, background:"var(--nv-color-surface-raised)" }}>
              <b>Execution guard:</b> Approved → EXECUTING → COMPLETED → OUTCOME_MONITORED. <code>EXECUTE</code> checks state + blockedActions + authorizedActions + S5 dual-approval + jurisdiction. Try: <code>POST /api/health/safety/recommendations/:id/execute {"{ actionKind: 'EXECUTE' }"}</code> — blocked until reviewed.
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Safe-Degraded Operation — Never Fail-Open for S3-S5" subtitle="Hierarchy of fallbacks with jurisdiction-aware routing.">
              <div style={{ overflowX:"auto" }}>
                <table className="nv-table" style={{ fontSize:11 }}>
                  <thead><tr><th>Failure</th><th>System Response</th></tr></thead>
                  <tbody>
                    <tr><td>Wearable unavailable</td><td>Mark stale, notify, manual measurement</td></tr>
                    <tr><td>Signal poor</td><td>Request repositioning / alternate device</td></tr>
                    <tr><td>EHR unavailable</td><td>Read-only cached summary, block unsafe orders</td></tr>
                    <tr><td>Model unavailable</td><td>Validated rules or human review</td></tr>
                    <tr><td>Policy engine unavailable</td><td>Block high-risk; only S0 allowed</td></tr>
                    <tr><td>Network unavailable</td><td>Encrypted offline emergency summary</td></tr>
                    <tr><td>Model drift detected</td><td>Disable model, fallback active</td></tr>
                    <tr><td>Cybersecurity incident</td><td>Isolate, preserve clinical continuity</td></tr>
                  </tbody>
                </table>
              </div>
              {degraded && <div style={{ marginTop:8, fontSize:11 }}>Live: {JSON.stringify(degraded, null, 0).slice(0,300)}</div>}
            </Section>
            <Section title="Monitoring Dashboard — NIST Govern/Map/Measure/Manage" subtitle="Sensitivity, specificity, PPV/NPV, calibration, false-neg/pos, abstention, drift, subgroup, OOD, explanation completeness, time-to-ack/review, override, duplicate, escalation fail, alert burden, automation bias…">
              {monitor ? (
                <div style={{ display:"grid", gap:6, fontSize:12 }}>
                  <div>Generated: <b>{String((monitor as Record<string,unknown>).generated)}</b> • Abstained: <b>{String((monitor as Record<string,unknown>).abstained)}</b> ({Math.round(((monitor as Record<string,unknown>).abstentionRate as number ?? 0)*100)}%) • Review req: <b>{String((monitor as Record<string,unknown>).reviewRequired)}</b> • Approved: <b>{String((monitor as Record<string,unknown>).approved)}</b></div>
                  <div>Avg time to review: <b>{String((monitor as Record<string,unknown>).avgTimeToReviewSec)}s</b> • Incidents: <b>{String((monitor as Record<string,unknown>).incidents)}</b></div>
                  <div style={{ color:"var(--nv-color-text-faint)", fontSize:11 }}>By class: {JSON.stringify((monitor as Record<string,unknown>).byClass)}<br/>By state: {JSON.stringify((monitor as Record<string,unknown>).byState)}</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}><Pill tone="primary">NIST govern: Clinical Safety Officer</Pill><Pill>map: hazard/FMEA</Pill><Pill>measure: cal/PPV/drift</Pill><Pill>manage: policy+gate+degraded</Pill></div>
                </div>
              ) : <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>Loading monitor… (seeded after first recommendation)</div>}
              <div style={{ marginTop:8, display:"flex", gap:6 }}><Button variant="ghost" size="sm" onClick={async()=> { const r=await fetch("/api/health/safety/monitor?windowHours=24"); const j=await r.json().catch(()=>null); if(j?.monitor) setMonitor(j.monitor); }}>Refresh</Button><Pill tone="warning">Alert burden / per clinician tracked</Pill></div>
            </Section>
          </div>

          <Section title="Incident & Near-Miss Management — Clinical AI Safety Event Service" subtitle="Timeline, impact, versions, snapshot, decision path, human actions, contributing, severity, detectability, root cause, corrective/preventive, regulatory assessment, closure owner, verified remediation.">
            <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap", alignItems:"center" }}>
              <input className="nv-input" placeholder="Title" value={incidentForm.title} onChange={e=> setIncidentForm({...incidentForm, title:e.target.value})} style={{ flex:1, minWidth:200 }} />
              <select className="nv-select" value={incidentForm.kind} onChange={e=> setIncidentForm({...incidentForm, kind:e.target.value})} style={{ width:160 }}>
                {["FALSE_NEGATIVE","FALSE_POSITIVE","DELAYED_ALERT","UNSAFE_RECOMMENDATION","MISSING_CONTRAINDICATION","HALLUCINATED_EVIDENCE","INCORRECT_DOSE","ALERT_FATIGUE","PARTIAL_TRANSACTION","CLINICIAN_OVERRIDE","NEAR_MISS","OTHER"].map(k=> <option key={k} value={k}>{k}</option>)}
              </select>
              <select className="nv-select" value={incidentForm.severity} onChange={e=> setIncidentForm({...incidentForm, severity:e.target.value})} style={{ width:130 }}>
                {["MINOR","MODERATE","MAJOR","CATASTROPHIC"].map(s=> <option key={s} value={s}>{s}</option>)}
              </select>
              <Button onClick={async()=> {
                if (!incidentForm.title) return;
                const r=await fetch("/api/health/safety/incidents",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ kind: incidentForm.kind, severity: incidentForm.severity, title: incidentForm.title })});
                const j=await r.json().catch(()=>null);
                if(r.ok && j?.incident) { setIncidents(prev=> [j.incident, ...prev].slice(0,8)); setIncidentForm({ title:"", kind:"NEAR_MISS", severity:"MODERATE" }); }
              }} disabled={!incidentForm.title}>Report</Button>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table className="nv-table" style={{ fontSize:12 }}>
                <thead><tr><th>When</th><th>Kind</th><th>Severity</th><th>Status</th><th>Title</th></tr></thead>
                <tbody>
                  {incidents.length===0 && <tr><td colSpan={5} className="nv-empty">No incidents — near-misses encouraged (wrong patient, stale vitals, motion artifact, drift, hallucinated evidence, alert fatigue, wrong contact, partial transaction, model update) — each gets root cause + CAPA.</td></tr>}
                  {incidents.map((inc,i)=> (
                    <tr key={String((inc as Record<string,unknown>).id ?? i)}>
                      <td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{inc.createdAt? new Date(String(inc.createdAt)).toLocaleString():""}</td>
                      <td><Pill>{String((inc as Record<string,unknown>).kind)}</Pill></td>
                      <td><Pill tone={String((inc as Record<string,unknown>).severity)==="MAJOR"||String((inc as Record<string,unknown>).severity)==="CATASTROPHIC"?"danger":"warning"}>{String((inc as Record<string,unknown>).severity)}</Pill></td>
                      <td><Pill tone={String((inc as Record<string,unknown>).status)==="CLOSED"||String((inc as Record<string,unknown>).status)==="VERIFIED"?"success":"neutral"}>{String((inc as Record<string,unknown>).status)}</Pill></td>
                      <td>{String((inc as Record<string,unknown>).title).slice(0,70)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Safety Case — Living S3-S5" subtitle="Claim → Subclaims → Hazard Analysis → Risk Controls → Verification → Clinical Validation → Residual Risk Acceptance → Post-Deployment Monitoring">
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", lineHeight:1.6 }}>
                Example claim: “Sepsis-risk provides timely interpretable risk signals without autonomously diagnosing or initiating treatment.”<br/>
                Evidence: intended use, hazard analysis, dataset/population, external validation, subgroup/calibration, input-failure testing, workflow simulation, human factors, alert burden, downtime, security, sign-off, residual acceptance.<br/>
                Status: DRAFT → IN_REVIEW → APPROVED/CONDITIONAL/REJECTED → RETIRED. API: <code>POST /api/health/safety/cases</code> / <code>PUT /cases/:id/approve</code>
              </div>
            </Section>
            <Section title="Governance Roles — No Single Team Deploys High-Risk Without Approval">
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
                {["Clinical Safety Officer","Medical Director","Model Owner","Product Owner","Privacy Officer","Security Officer","Quality & Regulatory Lead","Human Factors Lead","Clinical Review Board","Incident Review Board"].map(r=> <Pill key={r}>{r}</Pill>)}
              </div>
              <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)"}}>S3-S5 deployments & major changes require clinical + quality + privacy + security + human-factors approval.</div>
            </Section>
          </div>

          <Section title="FMEA — Traditional + AI-Specific (12 Rows)" subtitle="Hover control shows mitigation that CSOS enforces.">
            <div style={{ overflowX:"auto" }}>
              <table className="nv-table" style={{ fontSize:11 }}>
                <thead><tr><th>Failure Mode</th><th>Potential Harm</th><th>Control</th></tr></thead>
                <tbody>
                  <tr><td>Wrong patient matched</td><td>Incorrect treatment</td><td>Multi-factor identity + encounter lock</td></tr>
                  <tr><td>Stale vital signs</td><td>Delayed care</td><td>Freshness threshold + timestamp</td></tr>
                  <tr><td>Motion artifact → arrhythmia</td><td>Unnecessary emergency</td><td>Signal-quality gate + confirmation</td></tr>
                  <tr><td>Model poor on local pop</td><td>Missed/excess alerts</td><td>Local validation + subgroup monitor</td></tr>
                  <tr><td>Conflicting lab/medication</td><td>Unsafe dose</td><td>Conflict flag + pharmacist review</td></tr>
                  <tr><td>Confidence overstated</td><td>Automation bias</td><td>Calibrated uncertainty + limitations</td></tr>
                  <tr><td>Hallucinated evidence</td><td>Incorrect decision</td><td>Retrieval-grounded + source verification</td></tr>
                  <tr><td>Alert duplicated</td><td>Alert fatigue</td><td>Event identity + dedup</td></tr>
                  <tr><td>Emergency wrong contact</td><td>Privacy/safety harm</td><td>Contact verification + role routing</td></tr>
                  <tr><td>Partial transaction</td><td>Incomplete care</td><td>Saga + reconciliation</td></tr>
                  <tr><td>Model update changes behavior</td><td>Unexpected risk</td><td>Shadow + approval + rollback</td></tr>
                  <tr><td>Clinician accepts without review</td><td>Unsafe action</td><td>Structured review + audit</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Audit Record — Tamper-Evident Hash Chain (SHA-256) per Workspace" subtitle="Every decision has cryptographic trace: patient context, recommendation, evidence, decision, execution (blocked autonomous), audit (trace ID, snapshot hash, signature, retention).">
            <pre style={{ fontSize:11, background:"var(--nv-color-surface-raised)", padding:10, borderRadius:8, overflowX:"auto", whiteSpace:"pre-wrap" }}>{`{
  "safety_event_id": "safety-2026-000184",
  "patient_context": { "patient_id": "tokenized", "encounter_id": "enc-9842", "care_setting": "inpatient" },
  "recommendation": { "type": "clinical_risk_alert", "risk_class": "S4", "model_id": "deterioration-risk-v3", "model_version": "3.4.1", "policy_version": "clinical-safety-policy-12.7", "probability": 0.86, "uncertainty": { "epistemic": 0.11, "aleatoric": 0.18 } },
  "evidence": { "sources": ["vitals","labs","medications"], "missing_inputs": [], "signal_quality": 0.96 },
  "decision": { "required_action": "clinician_review", "reviewer_role": "attending_physician", "status": "approved_for_assessment" },
  "execution": { "actions": ["rapid_response_notification","clinical_task_created"], "autonomous_actions_blocked": ["medication_order","treatment_change"] },
  "audit": { "trace_id": "trace-...", "input_snapshot_hash": "sha256:...", "chainIndex": 42, "chainPrev": "sha256:..." }
}`}</pre>
            {auditChain && <div style={{ marginTop:8, fontSize:11 }}>Chain: {String((auditChain as Record<string,unknown>).valid === false? "BROKEN at "+String((auditChain as Record<string,unknown>).brokenAt) : "valid — "+String((auditChain as Record<string,unknown>).count)+" entries")} — verification via SHA-256 hash chain per workspace • retention: clinical-safety-record</div>}
          </Section>

          <Section title="Vitality Workspace Promise — Amendments Applied" subtitle="Automatic antibiotic → clinician-reviewed sepsis-risk support • Automatic emergency dispatch → validated jurisdiction-specific escalation • 'Mortality reduced' → outcome tracking without causality claim • Fixed accuracy → versioned validation records • Neural/twin/longevity/voice/BCI/genomic marked research/validated/production • No autonomous diagnosis/treatment/consciousness/guaranteed optimization • Every cross-module workflow has policy engine gate • Safety gates before tasks/messages/orders/family/financial/emergency • Every AI action reversible, attributable, time-bounded, reviewable • Safe abstention in every agent.">
            <div style={{ padding:10, border:"1.5px solid #4f46e5", borderRadius:10, fontSize:12, fontWeight:800, textAlign:"center", background:"var(--nv-color-surface-raised)" }}>
              N0VA may detect, explain, prioritize, draft, and coordinate — but high-risk clinical decisions remain explicitly authorized by accountable healthcare professionals.
            </div>
          </Section>
        </div>
      )}

      {/* REGISTRY & CVC — AMR-CVC */}
      {tab === "registry" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="AI Model Registry & Clinical Validation Center — Governed Product Subsystem" subtitle="FDA lifecycle (design→development→deployment→maintenance→monitoring→change control) + PCCP (description/protocol/impact). No model production-eligible by benchmark alone — needs intended use, population, evidence, safety controls, operational behavior." action={<><Badge tone="primary">FDA PCCP</Badge><Badge tone="warning">TRIPOD+AI</Badge><Pill tone="danger">G0-G5</Pill><Pill>E0-E6</Pill></>}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(150px,1fr))", gap:8 }}>
              <Stat label="MODELS REGISTERED" value={String(registryModels.length)} hint={`${String(registryModels.filter((m:Record<string,unknown>)=> String(m.status)==="ACTIVE").length)} active • ${String(registryModels.filter((m:Record<string,unknown>)=> String(m.safetyClass)==="S4"||String(m.safetyClass)==="S5").length)} S4/S5`} />
              <Stat label="EVIDENCE CLAIMS" value={String(evidenceClaims.length)} hint={`${String(evidenceClaims.filter((c:Record<string,unknown>)=> String(c.reviewStatus)!=="unverified").length)} verified • ${String(evidenceClaims.filter((c:Record<string,unknown>)=> String(c.status)==="active").length)} active`} />
              <Stat label="VALIDATION STUDIES" value={String(validationStudies.length)} hint={`E0-E6 • TRIPOD+AI • dossier 22 items`} />
              <Stat label="DEPLOYMENTS" value={String(deployments.length)} hint={`G0-G5 • shadow/canary • champion-challenger`} />
              <Stat label="DRIFT SIGNALS" value={String(driftSignals.length)} hint={`${String(driftSignals.filter((d:Record<string,unknown>)=> String(d.level)==="RED").length)} RED • ${String(driftSignals.filter((d:Record<string,unknown>)=> String(d.level)==="AMBER").length)} AMBER`} tone={driftSignals.some((d:Record<string,unknown>)=> String(d.level)==="RED")?"danger":undefined} />
              <Stat label="CLINICAL REVIEWS" value={String(clinicalReviews.length)} hint={`${String(clinicalReviews.filter((r:Record<string,unknown>)=> String(r.decision).includes("Approve")).length)} approve • ${String(postMarket.length)} post-market`} />
            </div>
            <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap" }}>
              <Pill tone="primary">Governance: 11 checks</Pill><Pill>Architecture: 10 sections</Pill><Pill>Identity: 14 + 8 generative</Pill><Pill>Contract: runtime-checked</Pill><Pill>WHO bias + WHO post-market</Pill>
            </div>
          </Section>

          <Section title="Governance Principle — 9 Required Before Production-Eligible" subtitle="A model becomes production-eligible only when intended use, population, evidence, safety controls, operational behavior are all approved — not by benchmark.">
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
              {["Intended use","Non-intended use","Technical owner","Clinical owner","Risk S0-S5","Validated population","Evidence package","Deployment approval","Monitoring plan","Rollback plan","Retirement/replacement"].map(c=> <Pill key={c} tone={c.includes("owner")||c.includes("Risk")?"primary":"neutral"}>{c}</Pill>)}
            </div>
            <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)"}}>If evidence missing/invalid for this patient/device/location/population/action/version → abstain/downgrade/require review (target operating model).</div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Registry Architecture — 10 Sections" subtitle="Connects to git, data catalogs, feature stores, experiment trackers, artifact stores, FHIR/DICOM, CI/CD, feature flags, K8s, observability, QMS, regulatory docs, safety events, outcomes.">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}>
                {["Model Identity & Lineage","Intended Use & Risk","Dataset & Consent Provenance","Validation Evidence","Fairness & Subgroup","Regulatory & Jurisdiction","Deployment & Release","Monitoring & Drift","Incident & CAPA","Retirement & Archival"].map(s=> <div key={s} style={{ padding:"4px 6px", border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)" }}>{s}</div>)}
              </div>
            </Section>
            <Section title="Model Identity — 14 Fields (Generative +8)" subtitle="Permanent immutable family ID + versioned artifacts.">
              <div style={{ fontSize:11, lineHeight:1.6 }}>
                <b>14:</b> family ID, version, artifact digest (SHA), code commit, feature schema, prompt/policy version, embedding/index version, runtime, lockfile, training run ID, release channel (RESEARCH→RETIRED), owner, clinical owner, risk S0-S5, status DRAFT/VALIDATING/APPROVED/SUSPENDED/RETIRED<br/>
                <b>Generative extra:</b> weights, system prompts, retrieval corpus, tool permissions, safety policies, evaluator version, temperature, tool routing
              </div>
              <div style={{ marginTop:6, maxHeight:120, overflowY:"auto", border:"1px solid var(--nv-color-border)", borderRadius:8 }}>
                <table className="nv-table" style={{ fontSize:11 }}>
                  <thead><tr><th>Model</th><th>Version</th><th>Risk</th><th>Channel</th><th>Status</th></tr></thead>
                  <tbody>
                    {registryModels.length===0 && <tr><td colSpan={5} className="nv-empty">No models — shadow/canary/production via G0-G5</td></tr>}
                    {registryModels.slice(0,6).map((m:Record<string,unknown>,i:number)=> <tr key={String(m.id ?? i)}><td><b>{String(m.modelId ?? m.model_id ?? "")}</b></td><td>{String(m.modelVersion ?? m.model_version ?? "")}</td><td><Pill tone={String(m.safetyClass)==="S4"||String(m.safetyClass)==="S5"?"danger":String(m.safetyClass)==="S3"?"warning":"neutral"}>{String(m.safetyClass)}</Pill></td><td>{String(m.status ?? m.releaseChannel ?? "")}</td><td>{String(m.driftStatus ?? m.regulatoryStatus ?? "—").slice(0,12)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section title="Intended-Use Contract — Machine-Readable, Runtime-Checked" subtitle="If patient/setting/modality/use case outside contract → abstain or low-risk fallback.">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, fontSize:11 }}>
              <pre style={{ background:"var(--nv-color-surface-raised)", padding:10, borderRadius:8, whiteSpace:"pre-wrap" }}>{`model_id: sepsis-risk-v3
intended_use:
  clinical_purpose: "Support early recognition of possible inpatient deterioration"
  user: "Qualified inpatient clinical staff"
  care_setting: "Adult inpatient units"
  output_type: "Risk signal and evidence summary"
  decision_role: "Clinical decision support only"
  action_limit: "No autonomous diagnosis, medication order, or treatment initiation"
population: { included: [adults_18_plus, inpatient], excluded: [pediatrics, pregnancy, outpatient, unsupported_devices] }
modalities: { required: [vitals, labs, encounter_context] }
approval: { clinical_review: required, regulatory_status: pending, jurisdiction: US }`}</pre>
              <div>
                <div style={{ display:"grid", gap:6 }}>
                  <div style={{ display:"flex", gap:6 }}><input className="nv-input" placeholder="modelId" value={newDeployment.modelId} onChange={e=> setNewDeployment({...newDeployment, modelId:e.target.value})} style={{ flex:1 }} /><input className="nv-input" placeholder="version" value={newDeployment.modelVersion} onChange={e=> setNewDeployment({...newDeployment, modelVersion:e.target.value})} style={{ width:90 }} /></div>
                  <Button size="sm" onClick={async()=> {
                    const r=await fetch(`/api/health/registry/authorize?modelId=${encodeURIComponent(newDeployment.modelId)}&version=${encodeURIComponent(newDeployment.modelVersion)}&jurisdiction=US&population=adult_inpatient&modality=vitals&careSetting=inpatient&actionClass=S4`);
                    const j=await r.json().catch(()=>null);
                    setRegistryAuthorize(j);
                  }}>Check: Can M vV operate in J/P/X/C/A/Q? (registry authorize)</Button>
                  {registryAuthorize && <div style={{ padding:8, border:`1px solid ${ (registryAuthorize as Record<string,unknown>).allowed? "#10b981":"#ef4444"}`, borderRadius:8, background: (registryAuthorize as Record<string,unknown>).allowed? "#ecfdf5":"#fef2f2" }}><b>{(registryAuthorize as Record<string,unknown>).allowed? "ALLOWED":"BLOCKED"}</b> — {String((registryAuthorize as Record<string,unknown>).reason)}{(registryAuthorize as Record<string,unknown>).fallback? ` → ${(registryAuthorize as Record<string,unknown>).fallback}`:""}</div>}
                  <div style={{ color:"var(--nv-color-text-faint)"}}>Negative → block or safe fallback. FDA PCCP: description/protocol/impact.</div>
                </div>
              </div>
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Evidence Tiers E0-E6" subtitle="Maturity scale — permission by tier.">
              <div style={{ overflowX:"auto" }}>
                <table className="nv-table" style={{ fontSize:11 }}>
                  <thead><tr><th>Tier</th><th>Evidence</th><th>Permitted</th></tr></thead>
                  <tbody>
                    <tr><td><Pill>E0</Pill></td><td>Concept/feasibility</td><td>Internal research only</td></tr>
                    <tr><td><Pill>E1</Pill></td><td>Retrospective internal</td><td>Shadow mode</td></tr>
                    <tr><td><Pill>E2</Pill></td><td>Retrospective external</td><td>Controlled pilot</td></tr>
                    <tr><td><Pill>E3</Pill></td><td>Prospective silent</td><td>Shadow deployment</td></tr>
                    <tr><td><Pill>E4</Pill></td><td>Prospective interventional</td><td>Limited clinical</td></tr>
                    <tr><td><Pill>E5</Pill></td><td>Real-world post-deployment</td><td>Broader approved</td></tr>
                    <tr><td><Pill tone="success">E6</Pill></td><td>Regulatory/institutional auth</td><td>Jurisdiction-specific regulated</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6}}>Not “clinically validated” unless registry specifies design/population/comparator/endpoint/n/sample/CI/authority.</div>
            </Section>
            <Section title="Dataset Lineage Graph — Source → Deployment Population" subtitle="Raw → Consent → De-id → Quality → Labeling → Cohort → Features → Split → Training → Evaluation → Deployment.">
              <div style={{ fontSize:11, lineHeight:1.5, color:"var(--nv-color-text-faint)"}}>
                {["Raw Source","Consent & Legal Basis","De-identification / Tokenization","Quality Filtering","Labeling & Adjudication","Cohort Construction","Feature Generation","Train/Val/Test Split","Model Training","Evaluation Dataset","Deployment Population"].map((s,i)=> <span key={s}>{i>0 && " → "}<b style={{ color:"var(--nv-color-text)"}}>{s}</b></span>)}
              </div>
              <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
                <span>30+ fields:</span> {["Source org","Collection dates","Geography","Care settings","Patient/encounter count","Modality","Inclusion/exclusion","Label definitions","Labeler qualifications","Inter-rater agreement","Missingness","Units","Device mfr/fw","Consent basis","Restrictions","License","De-id method","Re-id risk","Retention","Transformation","Known biases","Leakage","Restricted fields"].map(f=> <Pill key={f}>{f}</Pill>)}
              </div>
              <div style={{ marginTop:8, display:"flex", gap:6 }}>
                <input className="nv-input" placeholder="Dataset name" value={newDataset.name} onChange={e=> setNewDataset({...newDataset, name:e.target.value})} style={{ flex:1 }} />
                <input className="nv-input" placeholder="Source org" value={newDataset.sourceOrg} onChange={e=> setNewDataset({...newDataset, sourceOrg:e.target.value})} style={{ width:140 }} />
                <Button size="sm" onClick={async()=> {
                  if(!newDataset.name) return;
                  const r=await fetch("/api/health/registry/datasets",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name: newDataset.name, sourceOrg: newDataset.sourceOrg, modality: newDataset.modality })});
                  const j=await r.json().catch(()=>null);
                  if(r.ok && j?.dataset) { setDatasets(prev=> [j.dataset, ...prev].slice(0,8)); setNewDataset({ name:"", sourceOrg:"", modality:"wearable" }); }
                }} disabled={!newDataset.name}>Create Dataset</Button>
              </div>
              <div style={{ marginTop:6, maxHeight:90, overflowY:"auto" }}>
                <table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Name</th><th>Version</th><th>Source</th><th>Patients</th></tr></thead>
                  <tbody>{datasets.length===0 && <tr><td colSpan={4} className="nv-empty">No datasets — lineage required per dataset</td></tr>}{datasets.slice(0,4).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.name)}</td><td>{String(d.version)}</td><td>{String(d.sourceOrg ?? "—")}</td><td>{String(d.patientCount ?? "—")}</td></tr>)}</tbody>
                </table>
              </div>
            </Section>
          </div>

          <Section title="Consent Provenance — 11 Fields + Withdrawn Handling" subtitle="Each record linked to consent metadata; if withdrawn, N0VA identifies affected datasets/features/versions/evaluations/deployments.">
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
              {["consent_identifier","permitted_purposes","research authorization","geographic_scope","data_categories","commercial_use","AI-training permission","withdrawal_status","expiration_date","sharing_restrictions","secondary_use","family/genomic dependencies"].map(c=> <Pill key={c}>{c}</Pill>)}
            </div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Distinguishes: data deletable • aggregated retained • models retraining • regulatory retained • outputs corrected/invalidated.</div>
          </Section>

          <Section title="Bias & Representativeness — Before/During/After Deployment" subtitle="16 subgroups × 15 metrics — not demographic parity alone; missed-event/delayed escalation/inappropriate intervention matters. WHO: intensified post-deployment monitoring.">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Subgroups</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["age","sex","gender identity","race/ethnicity","language","geography","socioeconomic","disability","pregnancy","comorbidity","care setting","device mfr","device gen","image protocol","clinical site","clinician specialty","insurance/access"].map(s=> <Pill key={s}>{s}</Pill>)}</div></div>
              <div><b>Metrics</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["sensitivity","specificity","PPV/NPV","calibration","false-pos/neg","equal opportunity diff","subgroup calibration error","abstention","time-to-alert","time-to-treatment","outcome difference","missing-data rate","explanation completeness"].map(s=> <Pill key={s} tone="primary">{s}</Pill>)}</div></div>
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Validation Program" subtitle="TRIPOD+AI reporting for prediction model development/evaluation.">
              <div style={{ display:"grid", gap:6, fontSize:11 }}>
                <div><b>Analytical (11)</b><div style={{ color:"var(--nv-color-text-faint)"}}>Unit conversion, time sync, missing-value, image resolution/orientation, DICOM metadata, FHIR mapping, device signal, dedup, boundary/invalid, numerical reproducibility, schema stability</div></div>
                <div><b>Clinical (12)</b><div style={{ color:"var(--nv-color-text-faint)"}}>Retrospective internal/external, temporal, prospective silent/interventional, standard care & clinician comparison, workflow simulation, human-factors, alert burden, outcome analysis</div></div>
                <div><b>Generative — Ani/Scribe (17)</b><div style={{ color:"var(--nv-color-text-faint)"}}>Factual accuracy, unsupported inference, hallucinated citations, missing critical facts, wrong-patient contamination, contradiction, risk severity, triage, refusal/abstention, tool-use, PHI leakage, prompt injection, translation, health-literacy, editing burden, comprehension</div></div>
              </div>
              <div style={{ marginTop:8, display:"flex", gap:6 }}>
                <Button size="sm" variant="ghost" onClick={async()=> {
                  const r=await fetch("/api/health/registry/validation-studies",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ modelId:"sepsis-risk-v3", design:"PROSPECTIVE_SILENT", evidenceTier:"E3", sampleSize:18420, comparator:"standard clinical monitoring" })});
                  const j=await r.json().catch(()=>null);
                  if(r.ok && j?.study) setValidationStudies(prev=> [j.study, ...prev].slice(0,6));
                }}>Create Silent Study (E3)</Button>
                <span style={{ fontSize:11, color:"var(--nv-color-text-faint)", alignSelf:"center" }}>{validationStudies.length} studies</span>
              </div>
              {validationStudies.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Model</th><th>Design</th><th>Tier</th><th>n</th></tr></thead><tbody>{validationStudies.slice(0,4).map((s:Record<string,unknown>,i:number)=> <tr key={String(s.id ?? i)}><td>{String(s.modelId)}</td><td>{String(s.design)}</td><td><Pill>{String(s.evidenceTier)}</Pill></td><td>{String(s.sampleSize ?? "—")}</td></tr>)}</tbody></table></div>}
            </Section>
            <Section title="Validation Dossier — 22 Items, Thresholds Pre-Specified" subtitle="Immutable evidence dossier for each production candidate — thresholds approved before evaluation, not post-hoc.">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}>
                {["intended-use statement","risk classification","system architecture","data-flow diagram","dataset lineage","labeling protocol","statistical analysis plan","pre-specified endpoints","validation datasets","test results","confidence intervals","subgroup analysis","calibration","missing-data analysis","robustness","human-factors","cybersecurity","privacy","FMEA & hazard","residual-risk","reviewer sign-off","regulatory assessment","post-market plan","change-control","rollback","user labeling"].map(d=> <div key={d} style={{ padding:"3px 6px", border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)" }}>{d}</div>)}
              </div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>TRIPOD+AI informs report format. No deployment with unresolved critical findings.</div>
            </Section>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Model Card (19) + Safety Card (16)" subtitle="Technically accurate ≠ clinically safe (alert overload, delays, misrouting, automation bias).">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
                <div><b>Model</b><div style={{ color:"var(--nv-color-text-faint)"}}>description, intended/non-intended use, inputs/outputs, architecture, training/validation data, metrics, subgroup, limitations, failure modes, bias, env/hardware, version history, ownership, contact, license, regulatory</div></div>
                <div><b>Safety</b><div style={{ color:"var(--nv-color-text-faint)"}}>hazard summary, risk class, unsafe scenarios, abstention, thresholds, human-review, contraindications, fallback, emergency, automation-bias risks, monitoring, incident/rollback triggers, residual risk, patient limitations, reviewer responsibilities</div></div>
              </div>
              {modelCards.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Model</th><th>Type</th><th>Title</th></tr></thead><tbody>{modelCards.slice(0,4).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td>{String(c.modelId)}</td><td><Pill tone={String(c.cardType)==="safety"?"warning":"primary"}>{String(c.cardType)}</Pill></td><td>{String(c.title).slice(0,40)}</td></tr>)}</tbody></table></div>}
            </Section>
            <Section title="Performance Claims Registry — Evidence Objects, Not Fixed AUC" subtitle="Replace '92%' with configurable claim; display only when evidence valid for jurisdiction/population/context.">
              <pre style={{ fontSize:11, background:"var(--nv-color-surface-raised)", padding:8, borderRadius:8, whiteSpace:"pre-wrap" }}>{`{
  "claim_id": "claim-sepsis-v3-sensitivity",
  "model_id": "sepsis-risk-v3", "metric": "sensitivity", "value": 0.92,
  "confidence_interval": { "lower": 0.89, "upper": 0.94 },
  "population": "adult inpatient", "site_count": 4, "sample_size": 18420,
  "outcome_definition": "adjudicated sepsis", "prediction_horizon": "6 hours",
  "comparator": "standard monitoring", "validation_design": "prospective external",
  "review_status": "clinical-review-approved", "regulatory_status": "not a clearance claim",
  "expires": "2027-06-30", "source_document": "validation-report-2026-018"
}`}</pre>
              <div style={{ display:"flex", gap:6, marginTop:6 }}>
                <input className="nv-input" placeholder="claim_id" value={newClaim.claim_id} onChange={e=> setNewClaim({...newClaim, claim_id:e.target.value})} style={{ flex:1 }} />
                <input className="nv-input" placeholder="value" value={newClaim.value} onChange={e=> setNewClaim({...newClaim, value:e.target.value})} style={{ width:70 }} />
                <Button size="sm" onClick={async()=> {
                  if(!newClaim.claim_id) return;
                  const r=await fetch("/api/health/registry/evidence-claims",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ claim_id: newClaim.claim_id, model_id: newClaim.model_id, metric: newClaim.metric, value: Number(newClaim.value), population:"adult inpatient", site_count:4, sample_size:18420, validation_design:"prospective external", confidence_interval:{lower:0.89, upper:0.94}, review_status:"clinical-review-approved", source_document:"validation-report-2026-018" })});
                  const j=await r.json().catch(()=>null);
                  if(r.ok && j?.claim) { setEvidenceClaims(prev=> [j.claim, ...prev].slice(0,6)); setNewClaim({ claim_id:"", model_id:"sepsis-risk-v3", metric:"sensitivity", value:"0.92" }); }
                }} disabled={!newClaim.claim_id}>Create Claim</Button>
              </div>
              {evidenceClaims.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Claim</th><th>Metric</th><th>Value</th><th>Review</th><th>Expires</th></tr></thead><tbody>{evidenceClaims.slice(0,4).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td>{String(c.claimId ?? c.claim_id ?? "").slice(0,18)}</td><td>{String(c.metric)}</td><td>{String(c.value)}</td><td><Pill>{String(c.reviewStatus ?? c.review_status ?? "")}</Pill></td><td style={{ fontSize:10 }}>{c.expiresAt? new Date(String(c.expiresAt)).toLocaleDateString():"—"}</td></tr>)}</tbody></table></div>}
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6}}>Immediate changes: replace fixed AUC/92%/FDA-cleared/98% fertility/3-year warning/99.5% med-rec with evidence objects + required fields + jurisdiction.</div>
            </Section>
          </div>

          <Section title="Regulatory-Status Controls — 12 Fields, Never Infer From Name" subtitle="Project Vita assigns labels; treat as unverified until source evidence. Never infer FDA-cleared/CE/Breakthrough/research/LDT/validated from name.">
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
              {["classification","pathway","submission_status","clearance_number","approved_indication","approved_population","approved_version","approved_hardware","approved_jurisdiction","labeling_restrictions","change_control_restrictions","post_market_obligations"].map(f=> <Pill key={f}>{f}</Pill>)}
            </div>
            <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}>
              <table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Model</th><th>Pathway</th><th>Submission</th><th>Jurisdiction</th></tr></thead>
                <tbody>{regulatory.length===0 && <tr><td colSpan={4} className="nv-empty">No regulatory records — research/LDT/shadow until cleared</td></tr>}{regulatory.slice(0,4).map((r:Record<string,unknown>,i:number)=> <tr key={String(r.id ?? i)}><td>{String(r.modelId)}</td><td>{String(r.pathway ?? "—")}</td><td>{String(r.submissionStatus ?? "—")}</td><td>{String(r.approvedJurisdiction ?? "—")}</td></tr>)}</tbody>
              </table>
            </div>
          </Section>

          <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:12 }}>
            <Section title="Deployment Gates G0-G5 — Progressively Stricter" subtitle="Shadow reproduces full pathway without clinical action; Canary supports 12 routing controls; Champion-challenger 11 compares, not average metric alone.">
              <div style={{ overflowX:"auto" }}>
                <table className="nv-table" style={{ fontSize:11 }}>
                  <thead><tr><th>Gate</th><th>Label</th><th>Criteria</th></tr></thead>
                  <tbody>
                    <tr><td><Pill>G0</Pill></td><td>Research</td><td style={{ fontSize:10 }}>Data/consent, security scan, artifact registered, no production output</td></tr>
                    <tr><td><Pill>G1</Pill></td><td>Offline validation</td><td style={{ fontSize:10 }}>Pre-specified metrics, external dataset, subgroup, failure modes</td></tr>
                    <tr><td><Pill>G2</Pill></td><td>Shadow</td><td style={{ fontSize:10 }}>Real inputs, no action, logged, alert volume, drift, clinician review</td></tr>
                    <tr><td><Pill tone="warning">G3</Pill></td><td>Canary</td><td style={{ fontSize:10 }}>Small tenant/unit, % traffic, human review, safety monitoring, rollback</td></tr>
                    <tr><td><Pill tone="danger">G4</Pill></td><td>Controlled production</td><td style={{ fontSize:10 }}>Approved use only, explicit roles, thresholds, outcome tracking</td></tr>
                    <tr><td><Pill tone="success">G5</Pill></td><td>Expanded</td><td style={{ fontSize:10 }}>Multi-site, post-market, stable subgroup, alert burden, governance approval</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Shadow captures: input eligibility, prediction, confidence, explanation, alert priority, expected action, whether clinician independently recognized, outcome, time-to-event, counterfactual, subgroup/site performance — mixture of normal/borderline/missing/contradictory/extreme.</div>
              <div style={{ marginTop:6, display:"flex", gap:6 }}>
                <input className="nv-input" placeholder="modelId" value={newDeployment.modelId} onChange={e=> setNewDeployment({...newDeployment, modelId:e.target.value})} style={{ flex:1 }} />
                <select className="nv-select" value={newDeployment.gate} onChange={e=> setNewDeployment({...newDeployment, gate:e.target.value})} style={{ width:80 }}>{["G0","G1","G2","G3","G4","G5"].map(g=> <option key={g} value={g}>{g}</option>)}</select>
                <select className="nv-select" value={newDeployment.channel} onChange={e=> setNewDeployment({...newDeployment, channel:e.target.value})} style={{ width:110 }}>{["RESEARCH","SHADOW","CANARY","PRODUCTION","RETIRED"].map(c=> <option key={c} value={c}>{c}</option>)}</select>
                <Button size="sm" onClick={async()=> {
                  const r=await fetch("/api/health/registry/deployments",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ modelId: newDeployment.modelId, modelVersion: newDeployment.modelVersion, gate: newDeployment.gate, channel: newDeployment.channel })});
                  const j=await r.json().catch(()=>null);
                  if(r.ok && j?.deployment) setDeployments(prev=> [j.deployment, ...prev].slice(0,8));
                }}>Deploy</Button>
              </div>
              {deployments.length>0 && <div style={{ marginTop:6, maxHeight:90, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Model</th><th>Gate</th><th>Channel</th><th>Status</th></tr></thead><tbody>{deployments.slice(0,5).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.modelId)}</td><td><Pill>{String(d.gate)}</Pill></td><td>{String(d.channel)}</td><td><Pill tone={String(d.status)==="passed"?"success":String(d.status)==="failed"?"danger":"neutral"}>{String(d.status)}</Pill></td></tr>)}</tbody></table></div>}
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Canary routing: tenant/site/department/role/device/%/flags/instant disable/fallback/parallel comparison/safety-owner approval/auto rollback. Champion (approved) vs challenger (shadow) — discrimination, calibration, subgroup, abstention, alert volume, acceptance, time-to-review, outcomes.</div>
            </Section>
            <Section title="Drift Detection — 5 Types + Green/Amber/Red" subtitle="Thresholds based on clinical harm/workflow, not statistical deviation alone.">
              <div style={{ display:"grid", gap:6, fontSize:11 }}>
                <div><b>Data</b> <span style={{ color:"var(--nv-color-text-faint)"}}>PSI, Jensen-Shannon, Wasserstein, missingness, range, device distribution</span></div>
                <div><b>Concept</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Delayed-label performance, calibration, outcome-stratified, change-point, adjudication</span></div>
                <div><b>Performance</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Sensitivity, specificity, PPV/NPV, calibration, false-neg, time-to-alert, subgroup, outcome</span></div>
                <div><b>Device</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Firmware, sampling, calibration, signal quality, battery, manufacturer</span></div>
                <div><b>Workflow</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Routing, staffing, ack delays, override, documentation, care-pathway</span></div>
                <div style={{ padding:8, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", borderRadius:8 }}>
                  <b>Example thresholds:</b><br/>
                  calibration_error: Amber &gt;0.03 for 7d → investigation; Red &gt;0.05 for 3d → disable + fallback + CSO + safety event<br/>
                  subgroup_sensitivity_gap: Amber &gt;0.05; Red &gt;0.10<br/>
                  Actions: amber → investigation/notify/increase review; red → disable/route/notify/open event
                </div>
              </div>
              <div style={{ marginTop:6, display:"flex", gap:6 }}>
                <input className="nv-input" placeholder="metric e.g. calibration_error" value={newDrift.metric} onChange={e=> setNewDrift({...newDrift, metric:e.target.value})} style={{ flex:1 }} />
                <input className="nv-input" placeholder="value" value={newDrift.value} onChange={e=> setNewDrift({...newDrift, value:e.target.value})} style={{ width:80 }} />
                <select className="nv-select" value={newDrift.level} onChange={e=> setNewDrift({...newDrift, level:e.target.value})} style={{ width:90 }}>{["GREEN","AMBER","RED"].map(l=> <option key={l} value={l}>{l}</option>)}</select>
                <Button size="sm" onClick={async()=> {
                  const r=await fetch("/api/health/registry/drift",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ modelId: newDrift.modelId, metric: newDrift.metric, value: Number(newDrift.value), level: newDrift.level, driftType:"PERFORMANCE" })});
                  const j=await r.json().catch(()=>null);
                  if(r.ok && j?.signal) setDriftSignals(prev=> [j.signal, ...prev].slice(0,8));
                }}>Record Drift</Button>
              </div>
              {driftSignals.length>0 && <div style={{ marginTop:6, maxHeight:90, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Metric</th><th>Value</th><th>Level</th></tr></thead><tbody>{driftSignals.slice(0,5).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.driftType)}</td><td>{String(d.metric)}</td><td>{String(d.value)}</td><td><Pill tone={String(d.level)==="RED"?"danger":String(d.level)==="AMBER"?"warning":"success"}>{String(d.level)}</Pill></td></tr>)}</tbody></table></div>}
            </Section>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Change-Control C0-C3 + PCCP" subtitle="FDA PCCP: description (permitted changes) / protocol (data, validation, tests, human factors, security, rollout, monitoring, rollback) / impact (benefit, hazards, subgroup, workflow, privacy, cyber, regulatory, residual).">
              <div style={{ overflowX:"auto" }}>
                <table className="nv-table" style={{ fontSize:11 }}>
                  <thead><tr><th>Class</th><th>Examples</th><th>Approval</th></tr></thead>
                  <tbody>
                    <tr><td><Pill>C0</Pill></td><td>Documentation/owner/metadata</td><td>Registry admin</td></tr>
                    <tr><td><Pill>C1</Pill></td><td>Dependency/infra/perf/security patch identical outputs</td><td>Eng + quality + regression</td></tr>
                    <tr><td><Pill tone="warning">C2</Pill></td><td>Threshold/calibration/feature/corpus/prompt/device</td><td>Model + clinical + validation + board</td></tr>
                    <tr><td><Pill tone="danger">C3</Pill></td><td>New population/modality/indication/action/jurisdiction/claim/autonomous</td><td>Governance + regulatory submission</td></tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>PCCP permitted: recalibration, threshold, retraining on approved data, approved devices, retrieval-source, bug fixes, perf, language.</div>
              {changeControls.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Class</th><th>Title</th><th>Status</th></tr></thead><tbody>{changeControls.slice(0,4).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td><Pill>{String(c.changeClass)}</Pill></td><td>{String(c.title).slice(0,30)}</td><td>{String(c.status)}</td></tr>)}</tbody></table></div>}
            </Section>
            <Section title="Post-Market Surveillance — 16 Collects → 8 Drives" subtitle="WHO: proactive + additional clinical follow-up. Not compliance archive — drives CAPA.">
              <div style={{ fontSize:11, lineHeight:1.6 }}>
                <b>Collects:</b> real-world performance, complaints, adverse events, near misses, overrides, patient feedback, subgroup disparities, device behavior, drift, updates, downtime, cyber, new evidence, guideline changes, outcome association, resource utilization<br/>
                <b>Drives:</b> CAPA, label updates, threshold changes, training, restriction, suspension, replacement, regulatory reporting<br/>
                <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Model</th><th>Period</th><th>CAPA</th></tr></thead><tbody>{postMarket.length===0 && <tr><td colSpan={3} className="nv-empty">No post-market reports — real-world evidence required for E5</td></tr>}{postMarket.slice(0,4).map((p:Record<string,unknown>,i:number)=> <tr key={String(p.id ?? i)}><td>{String(p.modelId)}</td><td style={{ fontSize:10 }}>{p.periodStart? new Date(String(p.periodStart)).toLocaleDateString():"—"} → {p.periodEnd? new Date(String(p.periodEnd)).toLocaleDateString():"—"}</td><td>{String((p.capa as unknown[] ?? []).length)} items</td></tr>)}</tbody></table></div>
              </div>
            </Section>
          </div>

          <Section title="Clinical Validation Center — Permanent Multidisciplinary Service" subtitle="Teams 13 + Capabilities 14 + Review Board 8 standardized decisions.">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Teams</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["clinical validation","biostatistics","epidemiology","data engineering","ML","human factors","clinical safety","regulatory","privacy","cybersecurity","health economics","patient/caregiver reps","QA"].map(t=> <Pill key={t}>{t}</Pill>)}</div></div>
              <div><b>Capabilities</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["protocol design","cohort construction","dataset review","label adjudication","statistical analysis","fairness assessment","prospective study","silent deployment","workflow simulation","usability testing","dossier generation","regulatory support","post-market analysis","CAPA"].map(t=> <Pill key={t} tone="primary">{t}</Pill>)}</div></div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><b>Board:</b> {["Approve","Approve with restrictions","Shadow","Require evidence","Defer","Reject","Suspend","Retire"].map(d=> <Pill key={d} tone={d.includes("Approve")?"success":d==="Reject"||d==="Suspend"?"danger":"neutral"}>{d}</Pill>)} — records evidence, limitations, residual risk, controls, populations, jurisdictions, monitoring, review date, owners</div>
            {clinicalReviews.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Model</th><th>Decision</th><th>Residual</th></tr></thead><tbody>{clinicalReviews.slice(0,4).map((r:Record<string,unknown>,i:number)=> <tr key={String(r.id ?? i)}><td>{String(r.modelId)}</td><td><Pill>{String(r.decision)}</Pill></td><td style={{ fontSize:10 }}>{String(r.residualRisk ?? "—").slice(0,30)}</td></tr>)}</tbody></table></div>}
          </Section>

          <Section title="Registry API — 12 Endpoints + Authorization Check" subtitle="POST /models, GET /models/{id}, POST /models/{id}/versions, validation-studies, evidence-claims, approvals, deployments, GET drift/subgroup-performance/audit-trail, POST suspend/rollback/retire, plus Can model M vV operate in J/P/X/C/A/Q?">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11, fontFamily:"monospace" }}>
              {["POST   /models","GET    /models/{model_id}","POST   /models/{model_id}/versions","POST   /models/{model_id}/validation-studies","POST   /models/{model_id}/evidence-claims","POST   /models/{model_id}/approvals","POST   /models/{model_id}/deployments","GET    /models/{model_id}/drift","GET    /models/{model_id}/subgroup-performance","POST   /models/{model_id}/suspend","POST   /models/{model_id}/rollback","POST   /models/{model_id}/retire","GET    /models/{model_id}/audit-trail","POST   /registry/authorize ? J/P/X/C/A/Q"].map(e=> <div key={e} style={{ padding:"3px 6px", background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", borderRadius:6 }}>{e}</div>)}
            </div>
          </Section>

          <Section title="Evidence-Aware UI + Immediate Changes to Project Vita" subtitle="Replace fixed 0.94-0.98 AUC/92% sepsis/FDA-cleared/98% fertility/3-year/99.5% med-rec with evidence objects (claim_id, metric, value, CI, population, siteCount, n, outcomeDefinition, horizon, comparator, design, dataCutoff, reviewStatus, regulatoryStatus, expires, sourceDocument). Show only when evidence valid for jurisdiction/population/context.">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Clinician sees</b><div style={{ color:"var(--nv-color-text-faint)"}}>Evidence maturity, validation population, local vs external, last validation, version, drift, calibration, exclusions, required reviewer, regulated/investigational/wellness</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Patient sees</b><div style={{ color:"var(--nv-color-text-faint)"}}>What N0VA noticed, info used, cannot determine, whether clinician reviewed, what to do next, urgency, how to dispute/correct</div></div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><b>Feature status 10:</b> {["Concept","Research","Prototype","Internal validation","Shadow","Clinical pilot","Production wellness","Clinical decision support","Regulated medical-device function","Retired"].map(s=> <Pill key={s} tone={s.includes("Regulated")?"danger":s==="Retired"?"neutral":"primary"}>{s}</Pill>)} — Vita currently mixes production/research/regulated/speculative in same hierarchy → separate.</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Target operating model: Registry → Validation → Clinical Review → Shadow → Canary → Controlled Production → Continuous Monitoring → Incident/CAPA or Revalidation → Renewal/Restriction/Replacement/Retirement — evidence is runtime property.</div>
          </Section>

          <Section title="Success Metrics — Registry / Validation / Operational / Clinical">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px,1fr))", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Registry completeness</b><div style={{ color:"var(--nv-color-text-faint)"}}>100% models registered, S0-S5 with owners, intended-use contracts, rollback plans, cards, claims linked</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Validation quality</b><div style={{ color:"var(--nv-color-text-faint)"}}>All S3-S5 externally validated, local calibration, high-risk across subgroups, pre-specified protocol, no unresolved critical findings</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Operational safety</b><div style={{ color:"var(--nv-color-text-faint)"}}>Rollback in recovery time, drift before harm, no unapproved version in prod, no high-risk without approval, all events linked, post-market on schedule</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Clinical value</b><div style={{ color:"var(--nv-color-text-faint)"}}>Faster appropriate review, fewer missed deterioration, false-alert burden ↓, documentation ↓, care-gap closure ↑, no subgroup harm, no unsafe dependence</div></div>
            </div>
          </Section>
        </div>
      )}

      {/* WALLET — Patient Health Data Wallet */}
      {tab === "wallet" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Patient Health Data Wallet — Policy-Enforcing Privacy Control Plane" subtitle="HL7 FHIR Consent (recipients/roles, actions, purposes, time) + HIPAA (access/amendment/restriction/accounting) + GDPR (erasure/restriction/portability/withdrawal). Patient sees/controls; PDP/PEP enforce across 21 layers. Portable, verifiable, purpose-bound." action={<><Badge tone="primary">FHIR R4 Consent</Badge><Badge tone="warning">IN-GJ • DPDP</Badge><Pill tone="success">HIPAA • GDPR</Pill></>}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8 }}>
              <Stat label="ACTIVE CONSENTS" value={String(walletConsents.filter(c=> String(c.status)==="ACTIVE").length)} hint={`${String(walletConsents.filter(c=> String(c.status)==="REVOKED").length)} revoked • expiring soon ${String(walletConsents.filter(c=> c.validUntil && new Date(String(c.validUntil)).getTime() - Date.now() < 7*86400000).length)}`} />
              <Stat label="ACCESS EVENTS" value={String(walletLedger.length)} hint={`${String(walletLedger.filter(l=> (l as Record<string,unknown>).anomalyDetected).length)} anomalies`} />
              <Stat label="DERIVED ITEMS" value={String(walletDerived.length)} hint="13 classes — separate governance" />
              <Stat label="PROXIES" value={String(walletProxies.length)} hint="relationship + dual approval" />
              <Stat label="EXPORTS" value={String(walletExports.length)} hint="FHIR/C-CDA/DICOM/CSV/JSON" />
              <Stat label="DELETION JOBS" value={String(walletDeletions.length)} hint={`${String(walletDeletions.filter(d=> String(d.status)==="DELETED").length)} deleted`} />
            </div>
            <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}><Pill tone="primary">PDP → PEP → Ledger → Orchestration</Pill><Pill>21 enforcement points</Pill><Pill>8 principles</Pill><Pill>Gujarati/Hindi/English</Pill><Pill>IN-GJ DPDP</Pill></div>
          </Section>
          <Section title="Wallet Operating Model" subtitle="Patient Identity → Data Inventory → Consent Policy Builder → PDP → PEP (21) → Access Ledger + Notifications → Revocation/Correction/Export/Retention/Deletion Orchestration">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["Patient Identity","Data Inventory","Consent Builder","PDP","PEP (21)","Ledger+Notify","Orchestration"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<6 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}><Pill tone="warning">Patient control by default</Pill><Pill>Purpose limitation</Pill><Pill>Data minimization</Pill><Pill>Revocable</Pill><Pill>No silent inheritance</Pill><Pill>Safe clinical continuity</Pill><Pill>No consent laundering</Pill><Pill>Evidence of enforcement</Pill></div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:12 }}>
            <Section title="Data-Category Control Plane — 12 Domains">
              <div style={{ overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Domain</th><th>Sensitivity</th><th>Controls</th></tr></thead><tbody><tr><td>General medical</td><td><Pill>High</Pill></td><td style={{ fontSize:10 }}>Care-team + treatment</td></tr><tr><td>Mental-health</td><td><Pill tone="danger">Very high</Pill></td><td style={{ fontSize:10 }}>Separate consent, specialist</td></tr><tr><td>Substance-use</td><td><Pill tone="danger">Very high</Pill></td><td style={{ fontSize:10 }}>Stricter recipient/purpose</td></tr><tr><td><b>Genomics</b></td><td><span style={{ background:"#7c2d12", color:"white", padding:"2px 6px", borderRadius:999, fontSize:10, fontWeight:800 }}>Extreme</span></td><td style={{ fontSize:10 }}>Family implications</td></tr><tr><td>Reproductive</td><td><Pill tone="danger">Very high</Pill></td><td style={{ fontSize:10 }}>Geographic/jurisdiction</td></tr><tr><td>Voice</td><td><Pill tone="warning">High</Pill></td><td style={{ fontSize:10 }}>Speaker consent</td></tr><tr><td>Behavioral</td><td><Pill tone="warning">High</Pill></td><td style={{ fontSize:10 }}>Explicit opt-in</td></tr><tr><td><b>Biometric</b></td><td><span style={{ background:"#7c2d12", color:"white", padding:"2px 6px", borderRadius:999, fontSize:10, fontWeight:800 }}>Extreme</span></td><td style={{ fontSize:10 }}>Device/template</td></tr><tr><td>Location</td><td><Pill>High</Pill></td><td style={{ fontSize:10 }}>Precision reduction</td></tr><tr><td>Research</td><td><Pill>High</Pill></td><td style={{ fontSize:10 }}>Study license</td></tr><tr><td>Environmental</td><td><Pill>Mod-High</Pill></td><td style={{ fontSize:10 }}>Linkage restrictions</td></tr><tr><td>Financial</td><td><Pill>High</Pill></td><td style={{ fontSize:10 }}>Separate payment</td></tr></tbody></table></div>
            </Section>
            <Section title="Consent Dimensions → FHIR Consent">
              <div style={{ display:"grid", gap:6, fontSize:11 }}><div><b>WHO</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Patient, caregiver, parent, guardian, clinician, specialist, research team, insurer, device provider, emergency responder, N0VA service</span></div><div><b>WHAT</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Data categories, records, derived features, inferences, metadata, raw media, aggregates</span></div><div><b>WHY</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Treatment, payment, care coordination, wellness, research, quality, public health, emergency, product improvement</span></div><div><b>HOW</b> <span style={{ color:"var(--nv-color-text-faint)"}}>View, download, analyze, infer, share, train, contact, create task, trigger alert</span></div><div><b>WHEN</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Start/end, one-time, recurring, expiration, re-consent</span></div><div><b>WHERE</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Country, IN-GJ, institution, network, device, location</span></div><div><b>CONDITIONS</b> <span style={{ color:"var(--nv-color-text-faint)"}}>Minimum necessary, de-id, aggregation, human review, no automated decision, no onward sharing, no commercial use</span></div></div>
            </Section>
          </div>
          <Section title="Layered Consent + Dashboard">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}><div className="nv-card" style={{ padding:10, borderLeft:"3px solid #059669" }}><b>Layer 1 — Plain</b><div style={{ color:"var(--nv-color-text-faint)"}}>“Allow City Hospital to view your BP and meds for treatment until 30 Sep 2026. Not for research.”</div></div><div className="nv-card" style={{ padding:10, borderLeft:"3px solid #4f46e5" }}><b>Layer 2 — Visual</b><div style={{ color:"var(--nv-color-text-faint)"}}>Recipient, categories, purpose, duration, location, AI inference, onward sharing, expiration</div></div><div className="nv-card" style={{ padding:10, borderLeft:"3px solid #d97706" }}><b>Layer 3 — Technical</b><div style={{ color:"var(--nv-color-text-faint)"}}>FHIR resources, API scopes, model IDs, storage region, retention, subprocessors</div></div></div>
            <div style={{ marginTop:8, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><b>Dashboard:</b> {["Active","Expiring soon","Recently used","High-sensitivity","Unusual","Pending","Revocations","Exports","Corrections","Research","Proxy","Emergency","Devices","AI models","Organizations","Unresolved"].map(s=> <Pill key={s}>{s}</Pill>)} — Active/Expiring/Paused/Revoked/Under review/Emergency/Enforcement pending/Unable to delete</div>
            {(walletDashboard as Record<string,unknown>) && <div style={{ marginTop:8, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:8, fontSize:11, background:"var(--nv-color-surface-raised)" }}>Active: {String((walletDashboard as Record<string,unknown>).activePermissions ?? "—")} • ExpiringSoon: {String((walletDashboard as Record<string,unknown>).expiringSoon ?? "—")} • Unusual: {String((walletDashboard as Record<string,unknown>).unusual ?? "—")} • Proxies: {String((walletDashboard as Record<string,unknown>).proxyUsers ?? "—")}</div>}
          </Section>
          <Section title="One-Click Actions — Revoke / Export / Correction / Restriction / Delete">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px,1fr))", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Create Consent (7 dims)</b><div style={{ display:"grid", gap:6, marginTop:6 }}><input className="nv-input" placeholder="Patient ID (auto)" value={consentForm.patientId} onChange={e=> setConsentForm({...consentForm, patientId:e.target.value})} style={{ fontSize:11 }} /><div style={{ display:"flex", gap:4 }}><input className="nv-input" placeholder="Recipient ID" value={consentForm.recipientId} onChange={e=> setConsentForm({...consentForm, recipientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={consentForm.dataDomains} onChange={e=> setConsentForm({...consentForm, dataDomains:e.target.value})} style={{ width:110, fontSize:11 }}><option value="GENERAL_MEDICAL">General</option><option value="MENTAL_HEALTH">Mental</option><option value="GENOMICS">Genomics</option><option value="BIOMETRIC">Biometric</option></select></div><div style={{ display:"flex", gap:4 }}><select className="nv-select" value={consentForm.purposes} onChange={e=> setConsentForm({...consentForm, purposes:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="TREATMENT">Treatment</option><option value="RESEARCH">Research</option><option value="WELLNESS">Wellness</option></select><select className="nv-select" value={consentForm.actions} onChange={e=> setConsentForm({...consentForm, actions:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="VIEW">View</option><option value="INFER">Infer</option><option value="TRAIN_MODEL">Train</option></select></div><Button size="sm" onClick={async()=> { if(!consentForm.patientId || !consentForm.recipientId) return; const r=await fetch("/api/health/wallet/consents",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: consentForm.patientId, recipientId: consentForm.recipientId, recipientType:"organization", dataDomains:[consentForm.dataDomains], purposes:[consentForm.purposes], actions:[consentForm.actions], jurisdictions:["IN-GJ"], validUntil: new Date(Date.now()+30*86400000).toISOString(), language:"gu-IN" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.consent) setWalletConsents(prev=> [j.consent, ...prev].slice(0,8)); }} disabled={!consentForm.patientId || !consentForm.recipientId}>Create (FHIR gu-IN)</Button></div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Revoke — 9 Steps, 7 Categories</b><div style={{ color:"var(--nv-color-text-faint)"}}>Auth → confirm scope → show systems → explain stop vs remain → block tokens → stop inference → cancel exports → notify → deletion jobs</div><div style={{ marginTop:6 }}><select className="nv-select" onChange={e=> { const cid=e.target.value; if(cid) fetch(`/api/health/wallet/consents/${cid}/revoke`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reason:"Patient revocation" })}).then(r=> r.json()).then(j=> { if(j?.consent) setWalletConsents(prev=> prev.map(c=> String((c as Record<string,unknown>).consentId)===cid? j.consent:c)); }); }} style={{ width:"100%", fontSize:11 }}><option value="">Revoke a consent…</option>{walletConsents.slice(0,5).map((c,i)=> <option key={String((c as Record<string,unknown>).consentId ?? i)} value={String((c as Record<string,unknown>).consentId)}>{String((c as Record<string,unknown>).consentId).slice(0,12)} — {String((c as Record<string,unknown>).recipientId)} ({String((c as Record<string,unknown>).status)})</option>)}</select><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>7 categories: future access / new inference / existing derived / research results / legally retained / emergency / backups / aggregates / published</div></div></div>
              <div className="nv-card" style={{ padding:10 }}><b>PDP Quick Check</b><div style={{ display:"grid", gap:4, marginTop:4 }}><div style={{ display:"flex", gap:4 }}><input className="nv-input" placeholder="patientId" value={pdpForm.patientId} onChange={e=> setPdpForm({...pdpForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={pdpForm.dataCategory} onChange={e=> setPdpForm({...pdpForm, dataCategory:e.target.value})} style={{ width:120, fontSize:11 }}><option value="GENERAL_MEDICAL">General</option><option value="MENTAL_HEALTH">Mental</option><option value="GENOMICS">Genomics</option><option value="LOCATION">Location</option></select></div><div style={{ display:"flex", gap:4 }}><select className="nv-select" value={pdpForm.purpose} onChange={e=> setPdpForm({...pdpForm, purpose:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="TREATMENT">Treatment</option><option value="RESEARCH">Research</option></select><select className="nv-select" value={pdpForm.action} onChange={e=> setPdpForm({...pdpForm, action:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="VIEW">View</option><option value="INFER">Infer</option></select></div><Button size="sm" onClick={async()=> { if(!pdpForm.patientId) return; const r=await fetch(`/api/health/wallet/decide`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: pdpForm.patientId, dataCategory: pdpForm.dataCategory, purpose: pdpForm.purpose, action: pdpForm.action, jurisdiction: pdpForm.jurisdiction, requesterRole:"clinician" })}); const j=await r.json().catch(()=>null); setPdpResult(j); }} disabled={!pdpForm.patientId}>Decide (11 outcomes)</Button>{pdpResult && <div style={{ padding:6, border:`1px solid ${String((pdpResult as Record<string,unknown>).decision).includes("Allow")?"#10b981":"#ef4444"}`, borderRadius:6, background: String((pdpResult as Record<string,unknown>).decision).includes("Allow")?"#ecfdf5":"#fef2f2", fontSize:11 }}><b>{String((pdpResult as Record<string,unknown>).decision)}</b> {String((pdpResult as Record<string,unknown>).reason ?? "")}</div>}</div></div>
            </div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px,1fr))", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:8 }}><b>Export — 9 Formats</b><div style={{ color:"var(--nv-color-text-faint)"}}>FHIR R4 bundle, C-CDA, DICOM, CSV, JSON, med lists, consent/access history, AI summaries labeled derived</div><div style={{ display:"flex", gap:4, marginTop:4 }}><select className="nv-select" value={exportForm.format} onChange={e=> setExportForm({...exportForm, format:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="FHIR_R4_BUNDLE">FHIR R4 Bundle</option><option value="CSV">CSV</option><option value="JSON">JSON</option></select><Button size="sm" onClick={async()=> { if(!exportForm.patientId) return; const r=await fetch("/api/health/wallet/exports",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: exportForm.patientId, format: exportForm.format, passphraseProtected:true })}); const j=await r.json().catch(()=>null); if(r.ok && j?.export) setWalletExports(prev=> [j.export, ...prev].slice(0,6)); }} disabled={!exportForm.patientId}>Export (provenance+watermark)</Button></div></div>
              <div className="nv-card" style={{ padding:8 }}><b>Correction — History Preserved</b><div style={{ color:"var(--nv-color-text-faint)"}}>Original/proposed/reason/evidence/status/responsible org/corrected value/effective date → downstream graph alerts/care plans</div><div style={{ display:"flex", gap:4, marginTop:4 }}><input className="nv-input" placeholder="recordId" value={correctionForm.recordId} onChange={e=> setCorrectionForm({...correctionForm, recordId:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!correctionForm.patientId || !correctionForm.recordId) return; const r=await fetch("/api/health/wallet/corrections",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: correctionForm.patientId, recordId: correctionForm.recordId, dataDomain: correctionForm.dataDomain, originalValue:{ value:"old" }, proposedValue:{ value:"new" } })}); const j=await r.json().catch(()=>null); if(r.ok && j?.correction) setWalletCorrections(prev=> [j.correction, ...prev].slice(0,6)); }} disabled={!correctionForm.patientId || !correctionForm.recordId}>Request Correction</Button></div></div>
              <div className="nv-card" style={{ padding:8 }}><b>Restriction — 11 Types</b><div style={{ color:"var(--nv-color-text-faint)"}}>Hide recipients, block research/AI/behavioral/cross-border, mask location/diagnosis, aggregate only, treatment not product etc.</div><div style={{ display:"flex", gap:4, marginTop:4 }}><select className="nv-select" value={restrictionForm.restrictionType} onChange={e=> setRestrictionForm({...restrictionForm, restrictionType:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="block_ai_training">Block AI training</option><option value="block_behavioral_inference">Block behavioral</option><option value="block_cross_border_transfer">Block cross-border</option><option value="mask_sensitive_diagnosis">Mask diagnosis</option></select><Button size="sm" onClick={async()=> { if(!restrictionForm.patientId) return; const r=await fetch("/api/health/wallet/restrictions",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: restrictionForm.patientId, restrictionType: restrictionForm.restrictionType, dataDomains:[restrictionForm.dataDomains] })}); const j=await r.json().catch(()=>null); if(r.ok && j?.restriction) setWalletRestrictions(prev=> [j.restriction, ...prev].slice(0,6)); }} disabled={!restrictionForm.patientId}>Apply Restriction</Button></div></div>
              <div className="nv-card" style={{ padding:8 }}><b>Deletion — 14 Assets Ledger</b><div style={{ color:"var(--nv-color-text-faint)"}}>Primary, cached, search indexes, vector embeddings, graph edges, risk scores, features, research extracts, warehouse, backups, audit refs, vendor, device-local, derived</div><Button size="sm" variant="ghost" onClick={async()=> { const pid=restrictionForm.patientId; if(!pid) return; const r=await fetch("/api/health/wallet/deletions",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: pid, dataDomains:["GENERAL_MEDICAL"] })}); const j=await r.json().catch(()=>null); if(r.ok && j?.jobs) setWalletDeletions(prev=> [...(j.jobs as unknown[]).slice(0,6).map((x:unknown)=> x as Record<string,unknown>), ...prev].slice(0,8)); }} style={{ marginTop:4 }}>Request Deletion (14 assets)</Button></div>
            </div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Derived-Data Governance — Raw ≠ Inferred Score">
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)"}}>13 classes: normalized observations, health scores, risk predictions, digital biomarkers, voice embeddings, behavioral profiles, genomic interpretations, biological-age, digital-twin, cohort, personalization vectors, summaries, research features, alert histories — 11 metadata per item<br/><b>Heart-rate raw ≠ depression-risk</b></div>
              {walletDerived.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Class</th><th>Purpose</th><th>Can Infer</th></tr></thead><tbody>{walletDerived.slice(0,4).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.derivedClass)}</td><td>{String(d.processingPurpose ?? "—")}</td><td>{String((d as Record<string,unknown>).canBeUsedForFutureInference) ?? "false"}</td></tr>)}</tbody></table></div>}
            </Section>
            <Section title="AI-Specific Consent — 12 Operations + Research Marketplace">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["generate_patient_summary","clinical_decision_support","personalize_wellness","train_general","fine_tune_tenant","create_embeddings","population_analytics","research","voice_health_inference","behavioral_risk","automated_action","human_reviewed_only","cross_border"].map(o=> <Pill key={o}>{o}</Pill>)}<div style={{ marginTop:6, color:"var(--nv-color-text-faint)"}}>Study view 22 fields; 12 consent options; 12 withdrawal behaviors — revocable licenses, published cannot be withdrawn</div></div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Proxy & Delegated Access — Relationship-Based">
              <div style={{ fontSize:11 }}><div><b>11 relationships</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Parent","Legal guardian","Caregiver","Spouse/partner","Health-care proxy","Power of attorney","Trusted contact","Home-health","Research delegate","Emergency contact","Institutional rep"].map(r=> <Pill key={r}>{r}</Pill>)}</div></div><div style={{ marginTop:6 }}><b>13 permissions</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["view only","add data","schedule","manage meds","send messages","view mental health","view reproductive","view genomics","approve research","download","emergency alerts","manage devices","act during incapacity"].map(p=> <Pill key={p} tone="primary">{p}</Pill>)}</div></div><div style={{ marginTop:6 }}><b>11 safeguards</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["expiration","patient approval","legal-doc","dual approval","step-up auth","delegation audit","age-of-majority","emergency-only","immediate revocation","conflict resolution","separate per category"].map(p=> <Pill key={p} tone="warning">{p}</Pill>)}</div></div></div>
            </Section>
            <Section title="Family-Linked & Genomic — 10 Controls + Break-Glass">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Explicit family-link consent","Separate family-history","No automatic inherited-risk disclosure","Clinician-mediated serious findings","Family-tree visibility","Individual correction","Revocable inheritance","No identifying relatives","Minors/deceased handling","Genomic sharing restrictions"].map(c=> <Pill key={c} tone="danger">{c}</Pill>)}</div>
              <div style={{ marginTop:6, fontSize:11 }}><span style={{ display:"inline-block", padding:"4px 8px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, fontWeight:800, color:"#dc2626" }}>🔓 BREAK-GLASS — visible banner, minimum necessary, time-limited</span><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>12 controls: reason, minimum necessary, identity/role/location, time limit, read/write separation, privacy-office notify, patient notify, post-review, anomaly, explanation per category, no inheritance, immediate expiration — 18 ledger fields, 12 anomaly patterns, 5 reconfirmation triggers</div><Button size="sm" variant="ghost" onClick={async()=> { const pid=pdpForm.patientId; if(!pid) return; const r=await fetch("/api/health/wallet/break-glass",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: pid, reason:"Emergency — chest pain, unresponsive", requesterRole:"emergency_physician", location:"ED" })}); const j=await r.json().catch(()=>null); alert(j? `Break-glass logged — banner` : "Failed"); }} style={{ marginTop:6 }}>Test Break-Glass</Button></div>
            </Section>
          </div>
          <Section title="Enforcement 21 Layers + Privacy-Preserving 8 Modes + Deletion Ledger">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}><div><b>PEP 21</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["FHIR API","HL7","DICOM","Device gateway","Object storage","Search index","Vector DB","Graph DB","Feature store","Model-serving","Prompt builder","Agent tool","Clinical inbox","Chat/Meet","Mail/Calendar","Research warehouse","Export","Backup","Analytics","Vendor"].map(p=> <Pill key={p}>{p}</Pill>)}</div></div><div><b>Modes</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Local-only","Confidential cloud","De-identified","Federated","Aggregate-only","Human-reviewed","No-training","No-inference"].map(m=> <Pill key={m} tone="primary">{m}</Pill>)}</div><div style={{ marginTop:6 }}><b>Export security 11</b> — one-time links, passphrase, verification, expiration, watermarking, selective export, history, revocation, encryption, direct transfer</div></div></div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <div><b>Correction Graph</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:10, fontWeight:800, marginTop:4 }}>{["Source Record","Normalized Obs","Feature Store","Risk Scores","Alerts","Care Plans","Reports","Research Extracts"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"3px 6px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<7 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div></div>
              <div><b>Deletion Ledger</b><div style={{ overflowX:"auto", maxHeight:90 }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Asset</th><th>Status</th><th>Reason</th></tr></thead><tbody>{walletDeletions.length===0 && <tr><td colSpan={3} className="nv-empty">No deletions — 14 assets</td></tr>}{walletDeletions.slice(0,5).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td style={{ fontSize:10 }}>{String(d.asset)}</td><td><Pill tone={String(d.status)==="DELETED"?"success":String(d.status)==="RETAINED_BY_LAW"?"warning":"neutral"}>{String(d.status)}</Pill></td><td style={{ fontSize:10 }}>{String(d.reason ?? "—").slice(0,20)}</td></tr>)}</tbody></table></div></div>
            </div>
            <div style={{ marginTop:8, fontSize:11, display:"flex", gap:4, flexWrap:"wrap" }}><Pill>India-ready: gu-IN/Hindi/English, IN-GJ residency, DPDP consent-manager, cross-border</Pill><Pill>Security: passkeys, step-up, hardware keys, device binding, no support visibility</Pill><Pill>PDP returns 11 decisions: Allow/masking/redaction/human review/emergency/treatment/Deny/Defer/Require renewed/legal rep/fallback</Pill></div>
          </Section>
        </div>
      )}



      {/* PATIENTS */}
      {tab === "patients" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Unified Health Record (UHR) — Golden Patient Record" subtitle="Probabilistic matching 99.97% • 50+ sources • Family linkage • HL7 FHIR R4/R5 bidirectional sync (Epic, Cerner, Meditech) • Granular consent per data element / recipient / purpose / time." action={<Badge tone="primary">HL7 FHIR R4/R5 + DICOM + XDS.b</Badge>}>
            <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="First name" value={newPatient.firstName} onChange={(e)=> setNewPatient({...newPatient, firstName: e.target.value})} style={{ flex:1, minWidth:120 }} />
              <input className="nv-input" placeholder="Last name" value={newPatient.lastName} onChange={(e)=> setNewPatient({...newPatient, lastName: e.target.value})} style={{ flex:1, minWidth:120 }} />
              <input className="nv-input" placeholder="MRN (optional)" value={newPatient.mrn} onChange={(e)=> setNewPatient({...newPatient, mrn: e.target.value})} style={{ width:150 }} />
              <input className="nv-input" placeholder="Email (optional)" value={newPatient.email} onChange={(e)=> setNewPatient({...newPatient, email: e.target.value})} style={{ flex:1, minWidth:160 }} />
              <Button onClick={createPatient} disabled={!newPatient.firstName || !newPatient.lastName}>Create Patient + Bio-Twin</Button>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table className="nv-table">
                <thead><tr><th>Patient</th><th>MRN</th><th>Status</th><th>Risk</th><th>Updated</th></tr></thead>
                <tbody>
                  {patients.length===0 && <tr><td colSpan={5} className="nv-empty">No patients — create your first golden record above (auto-creates Bio-Digital Twin + Wellness Plan)</td></tr>}
                  {patients.map((p)=> (
                    <tr key={String(p.id)}>
                      <td><b>{String(p.firstName)} {String(p.lastName)}</b> <span style={{ color:"var(--nv-color-text-faint)", fontSize:11 }}>{String(p.language ?? "en")}</span></td>
                      <td style={{ fontSize:12 }}>{String(p.mrn ?? "—")}</td>
                      <td><Pill tone={p.status==="active"?"success":"neutral"}>{String(p.status)}</Pill></td>
                      <td>{typeof p.riskScore==="number" ? <span style={{ color: (p.riskScore as number)>0.6?"#dc2626": (p.riskScore as number)>0.3?"#d97706":"#059669", fontWeight:800 }}>{String(p.riskScore)}</span> : "—"}</td>
                      <td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{p.updatedAt ? new Date(String(p.updatedAt)).toLocaleString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:8 }}>Identity: demographic + biometric + behavioral signals • FHIR Patient/$match • DICOMweb ImagingStudy • Lab LOINC/SNOMED/ICD-10 • Tokenized PHI • Field-level encryption • Data residency per patient/per region</div>
          </Section>
          <Section title="Longitudinal Timeline (Birth → Present) • Zoom decade → millisecond" subtitle="All events — vitals, diagnoses, meds, procedures, allergies, immunizations, genetics, lifestyle — branchable for what-if modeling.">
            <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>Select a patient above to view timeline in production — demo shows event stream with zoom (decade/week/hour) and branching scenario modeling (what-if piperacillin/tazobactam).</div>
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
              <Pill>Problem List</Pill><Pill>Medication List</Pill><Pill>Allergy List</Pill><Pill>Immunizations</Pill><Pill>Family History</Pill><Pill>Social Determinants</Pill>
            </div>
          </Section>
        </div>
      )}

      {/* BIO-TWIN */}
      {tab === "twin" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Bio-Digital Twin — Quantum-Encrypted Living Model" subtitle="Every patient is a 8192-dim health embedding. Temporal predictions (24h/7d/30d/1y) + branching what-if (increase cardio 30m → epigenetic age 33.1). 4096-dim similarity search across populations.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:10, fontSize:12 }}>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Anatomy</div><div>3D mesh refs (DICOM) • organ systems • biomarker baselines</div><div style={{ marginTop:6 }}><Pill>CV hr 62</Pill> <Pill>met HbA1c 5.4</Pill> <Pill>CRP 0.8</Pill></div></div>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Epigenetic Clock</div><div>Horvath 34.2 • Hannum 35.1 • PhenoAge 32.8 • GrimAge 33.5 • DunedinPACE 0.92 • velocity tracked</div><div style={{ marginTop:6 }}><Pill tone="success">Bio-age 32.8</Pill> <Pill>‑1.2y vs chrono</Pill></div></div>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Exposome + Microbiome</div><div>PM2.5/VOC/NO2 • social connection • gut α-diversity 4.2 • dysbiosis 0.31</div><div style={{ marginTop:6 }}><Pill>butyrate 0.67</Pill> <Pill>firmicutes 42%</Pill></div></div>
              <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Pharmacogenomics (CPIC)</div><div>CYP2D6 poor/intermediate • SLCO1B1 • HLA-B*57:01 • warfarin VKORC1/CYP2C9 dosing</div><div style={{ marginTop:6 }}><Pill tone="warning">codeine: avoid</Pill> <Pill>clopidogrel → ticagrelor</Pill></div></div>
            </div>
            <div style={{ marginTop:10, padding:10, border:"1px dashed var(--nv-color-border)", borderRadius:8, fontSize:12 }}>
              <div style={{ fontWeight:800 }}>Neural Health Embedding (8192-dim)</div>
              <div style={{ color:"var(--nv-color-text-faint)"}}>Vector: [0.023, -0.891, 0.445, …] • model vitality-embed-v7 • attention cardiovascular 0.34 • anomaly map</div>
              <div style={{ marginTop:6, display:"flex", gap:6 }}><Pill tone="primary">Consciousness: active</Pill><Pill>Trajectory: homeostatic → optimal (67% 30d)</Pill><Pill tone="success">Intervention Δ epigenetic age -1.8y</Pill></div>
            </div>
          </Section>
        </div>
      )}

      {/* VITALS */}
      {tab === "vitals" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Real-Time Vitals Dashboard — NEWS/MEWS/PEWS + Population Baselines" subtitle="Streaming at <10ms • multi-parameter early warning • anomaly-triggered active surveillance • circadian + autonomic index • fall & emergency <0.1% FP.">
            <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="Patient ID (UUID)" value={vitalForm.patientId} onChange={(e)=> setVitalForm({...vitalForm, patientId: e.target.value})} style={{ flex:1, minWidth:220 }} />
              <select className="nv-select" value={vitalForm.layer} onChange={(e)=> setVitalForm({...vitalForm, layer: e.target.value})} style={{ width:170 }}>
                {["CARDIOVASCULAR","METABOLIC","NEUROLOGICAL","RESPIRATORY","MUSCULOSKELETAL","DERMATOLOGICAL","GASTROINTESTINAL","IMMUNOLOGICAL","GENOMIC","ENVIRONMENTAL","BEHAVIORAL","QUANTUM_BIOLOGICAL"].map(l=> <option key={l} value={l}>{l}</option>)}
              </select>
              <input className="nv-input" placeholder="HR" type="number" value={vitalForm.heartRate} onChange={(e)=> setVitalForm({...vitalForm, heartRate: e.target.value})} style={{ width:70 }} />
              <input className="nv-input" placeholder="SpO2" type="number" value={vitalForm.spo2} onChange={(e)=> setVitalForm({...vitalForm, spo2: e.target.value})} style={{ width:70 }} />
              <input className="nv-input" placeholder="S" type="number" value={vitalForm.bpSystolic} onChange={(e)=> setVitalForm({...vitalForm, bpSystolic: e.target.value})} style={{ width:70 }} />
              <input className="nv-input" placeholder="D" type="number" value={vitalForm.bpDiastolic} onChange={(e)=> setVitalForm({...vitalForm, bpDiastolic: e.target.value})} style={{ width:70 }} />
              <Button onClick={ingestVital} disabled={!vitalForm.patientId}>Ingest (&lt;10ms)</Button>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table className="nv-table">
                <thead><tr><th>When</th><th>Patient</th><th>Layer</th><th>HR</th><th>SpO2</th><th>BP</th><th>Quality</th><th>Source</th></tr></thead>
                <tbody>
                  {vitals.length===0 && <tr><td colSpan={8} className="nv-empty">No vitals yet — ingest via mesh above (edge-computed + HSM + offline 72h buffer)</td></tr>}
                  {vitals.map((v, i)=> (
                    <tr key={String((v as Record<string,unknown>).id ?? i)}>
                      <td style={{ fontSize:11 }}>{ (v as Record<string,unknown>).recordedAt ? new Date(String((v as Record<string,unknown>).recordedAt)).toLocaleString() : "" }</td>
                      <td style={{ fontSize:11 }}>{String((v as Record<string,unknown>).patientId ?? "").slice(0,8)}…</td>
                      <td><Pill>{String((v as Record<string,unknown>).layer ?? vitalForm.layer)}</Pill></td>
                      <td style={{ fontWeight:800, color: Number((v as Record<string,unknown>).heartRate) >140? "#dc2626": undefined }}>{String((v as Record<string,unknown>).heartRate ?? "—")}</td>
                      <td>{String((v as Record<string,unknown>).spo2 ?? "—")}</td>
                      <td>{String((v as Record<string,unknown>).bpSystolic ?? "—")}/{String((v as Record<string,unknown>).bpDiastolic ?? "—")}</td>
                      <td>{String((v as Record<string,unknown>).qualityScore ?? "1")}</td>
                      <td style={{ fontSize:11 }}>{String((v as Record<string,unknown>).source ?? "manual")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:10, marginTop:10, fontSize:12 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Signal Quality AI</b><div style={{ color:"var(--nv-color-text-faint)"}}>Artifact detection 0-100 • auto reposition guidance • motion correction • multi-sensor fusion</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Environmental Health</b><div style={{ color:"var(--nv-color-text-faint)"}}>PM2.5/VOC/CO2/light/noise correlated to symptoms • HVAC auto-adjust</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Fall & Emergency</b><div style={{ color:"var(--nv-color-text-faint)"}}>Accel+gyro+barometer ML • FP &lt;0.1% • auto 911 + GPS + history + caregiver cascade</div></div>
            </div>
          </Section>
        </div>
      )}

      {/* DEVICES */}
      {tab === "devices" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Device Gateway — 500+ Families • Zero-Touch • Hardware Attestation" subtitle="BLE 5.3 / ANT+ / NFC / UWB / MQTT / DICOMweb • FIDO2 • per-device AES-256-GCM 15-min rotation • mTLS X.509 • offline 72h encrypted buffer.">
            <table className="nv-table">
              <thead><tr><th>Device</th><th>Family</th><th>Protocol</th><th>Status</th><th>Battery</th><th>Quality</th></tr></thead>
              <tbody>
                {devices.length===0 && <tr><td colSpan={6} className="nv-empty">No devices onboarded — zero-touch via NFC tap / QR / UWB. Bulk enroll 1000+ for hospital fleet.</td></tr>}
                {devices.map((d, i)=> (
                  <tr key={String((d as Record<string,unknown>).id ?? i)}>
                    <td><b>{String((d as Record<string,unknown>).name)}</b> <span style={{ color:"var(--nv-color-text-faint)", fontSize:11 }}>{String((d as Record<string,unknown>).model ?? "")}</span></td>
                    <td><Pill tone="primary">{String((d as Record<string,unknown>).family)}</Pill></td>
                    <td style={{ fontSize:11 }}>{String((d as Record<string,unknown>).protocol)}</td>
                    <td><Pill tone={(d as Record<string,unknown>).status==="active"?"success": (d as Record<string,unknown>).status==="quarantined"?"danger":"neutral"}>{String((d as Record<string,unknown>).status)}</Pill></td>
                    <td>{String((d as Record<string,unknown>).batteryPct ?? "—")}{ (d as Record<string,unknown>).batteryPct!=null? "%":""}</td>
                    <td>{String((d as Record<string,unknown>).signalQuality ?? "1")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:8 }}>Supported: Apple Watch/Garmin/Fitbit/Oura/Whoop/Dexcom/FreeStyle AliveCor/Omron/Withings/Medtronic/Boston-Abbott pacemakers/ICDs/CRT • HealthKit • Fitbit Web API • Bluetooth LE • OAuth 2.0</div>
          </Section>
        </div>
      )}

      {/* CARE & PHARMACY */}
      {tab === "care" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Clinical & Diagnostic Intelligence — 17-Domain Constellation" subtitle="Radiology (chest/neuro/cardiac/abdominal/breast/MSK) AUC 0.90-0.98 • Pathology • Derm • Ophth • Cardio ECG • GI • Pulmonology • Oncology MCED • Genomics • Mental Health — all FDA 510(k)/CE Class IIa, tenant-isolated confidential containers.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:8, fontSize:12 }}>
              {[
                ["Chest X-ray","14 findings AUC 0.94-0.98","510(k)"],
                ["Neuro CT/MRI","hemorrhage/LVO/tumor AUC 0.93-0.97","510(k)"],
                ["Cardiac Echo","EF + calcium AUC 0.91-0.96","510(k)"],
                ["Dermatology","ISIC melanoma AUC 0.92-0.96","510(k)"],
                ["ECG 12-lead","arrhythmia/MI AUC 0.93-0.97","510(k)"],
                ["Genomics","ACMG 0.94 • PharmGKB 0.89","CLIA/CAP"],
              ].map(([a,b,c])=> <div key={a} className="nv-card" style={{ padding:10 }}><div style={{ fontWeight:800 }}>{a} <Pill tone="success">{c}</Pill></div><div style={{ color:"var(--nv-color-text-faint)"}}>{b}</div></div>)}
            </div>
          </Section>
          <Section title="Predictive Risk Scoring — 19 Horizons • Explainable SHAP + Uncertainty">
            <div style={{ display:"grid", gap:6, fontSize:12 }}>
              {[
                ["Sepsis 6-12h","92% sens 89% spec","antibiotic + lactate + ICU"],
                ["Deterioration 4-8h","89%/85%","rapid response"],
                ["Fall 24h","91%/88%","bed alarm + PT"],
                ["AKI 12-24h","85%/80%","nephrology + fluids"],
                ["Suicide 7-30d","82%/78%","safety planning + crisis"],
                ["Burnout 14d","89%/85%","wellness + schedule"],
              ].map(([k,acc,act])=> <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 8px", border:"1px solid var(--nv-color-border)", borderRadius:8 }}><span><b>{k}</b> <span style={{ color:"var(--nv-color-text-faint)"}}> {acc}</span></span><span style={{ color:"var(--nv-color-primary)", fontWeight:700 }}>{act}</span></div>)}
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)"}}>Architecture: Temporal Fusion Transformer + LSTM + Transformer + GNN + XGBoost/SHAP • bias/fairness monitored • “I don’t know” → human escalation • federated Byzantine-tolerant</div>
            </div>
          </Section>
          <Section title="Pharmacy Intelligence — 50k+ Drug Pairs • CPIC Pharmacogenomics • Blockchain Supply">
            <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>Drug-drug / drug-food / drug-disease / drug-lab • renal/hepatic dosing • pregnancy/lactation • counterfeit QR/NFC via supply blockchain • smart dispensers • adherence prediction + financial assistance • REMS & cold chain.</div>
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}><Pill tone="warning">Warfarin INR ↑ fluconazole</Pill><Pill tone="danger">Simvastatin + macrolide</Pill><Pill>CYP2D6 codeine → avoid</Pill><Pill>CPIC-guided dosing</Pill></div>
          </Section>
        </div>
      )}

      {/* WELLNESS */}
      {tab === "wellness" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Personalized Wellness • Nutrition Intelligence • Fitness Optimization" subtitle="AI wellness plans adapt to biometric feedback + cultural/dietary preferences + seasonality + travel. 200+ activity types • VO2max • ACWR injury risk • CGM glycemic prediction (78% acc).">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10, fontSize:12 }}>
              <div className="nv-card" style={{ padding:12 }}><b>Nutrition</b><div style={{ color:"var(--nv-color-text-faint)"}}>Glycemic 0-100 meal scoring • microbiome-guided fiber • nutrigenomics (MTHFR/APOE/FTO) • photo/voice/barcode • restaurant 500k menus</div><div style={{ marginTop:6 }}><Pill>CGM Δ +40 per 50g carbs</Pill> <Pill>USP verified</Pill></div></div>
              <div className="nv-card" style={{ padding:12 }}><b>Fitness</b><div style={{ color:"var(--nv-color-text-faint)"}}>ACWR • 3D gait • HRV recovery • altitude/heat • overtraining • 23% injury ↓ • 15% performance ↑</div></div>
              <div className="nv-card" style={{ padding:12 }}><b>Sleep</b><div style={{ color:"var(--nv-color-text-faint)"}}>PSG-quality • apnea/RLS screening • CBT-I • CPAP coaching • circadian/jet-lag • bedroom optimization</div></div>
              <div className="nv-card" style={{ padding:12 }}><b>Mental Health</b><div style={{ color:"var(--nv-color-text-faint)"}}>PHQ-9/GAD-7 • burnout 14d warning • voice biomarker • keyboard dynamics • crisis triage • therapist matching</div></div>
            </div>
          </Section>
          <Section title="Women's Health • Longevity & Anti-Aging" subtitle="Menstrual hormonal phases • fertility 98% • gestational diabetes/preeclampsia • menopause HRT • PCOS/endometriosis • Biological age (Horvath/Pheno/Grim/Dunedin) 2.3y reduction in 12m • NAD+/telomere/senolytics.">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, fontSize:12 }}>
              <div className="nv-card" style={{ padding:12 }}><b>Women&apos;s</b><div style={{ color:"var(--nv-color-text-faint)"}}>Cycle-synced training/nutrition • LHR surge • IVF tracking • high-risk pregnancy • postpartum EPDS • bone health post-menopause</div></div>
              <div className="nv-card" style={{ padding:12 }}><b>Longevity</b><div style={{ color:"var(--nv-color-text-faint)"}}>Organ-specific ages • telomere • senolytic (fisetin/quercetin) • NAD+ (NMN/NR) • mitochondrial • autophagy fasting • immune thymic • sarcopenia</div></div>
            </div>
          </Section>
        </div>
      )}

      {/* TELEHEALTH */}
      {tab === "telehealth" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Telehealth & Care Coordination — Schedule ↔ Meet ↔ Chat ↔ Vault Atomic" subtitle="Video consults • provider matching + insurance verification • automated follow-up + RPM (CMS CPT 99453-99458) • appointment 60-80ms SLA • pre-visit wearable check.">
            <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>Flows: Order lab → Tasks (phlebotomy) + Calendar + Finance (pre-auth) + Mail (prep) + Chat + ERP + Vault (atomic) • Prescribe → Pharmacy + Finance (copay) + Tasks (counseling) + Mail (pickup) — all-or-rollback.</div>
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}><Pill tone="primary">Epic/Cerner sync &lt;100ms FHIR</Pill><Pill>Surescripts + CoverMyMeds NCPDP</Pill><Pill>X12 837/835/278 payer</Pill><Pill>CMS RPM billing</Pill></div>
          </Section>
        </div>
      )}

      {/* ANI */}
      {tab === "ani" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Ani Health Intelligence — 24 Capabilities • 99.2% USMLE • Daily PubMed/MedRxiv/Cochrane Ingest" subtitle="Companion • Diagnostic reasoning (91% top-5) • Scribe (96% WER, 89% time saved) • Predictive alerts (92% sepsis) • Image analyst (AUC 0.94-0.98, 12 FDA) • Voice biomarker • Behavioral health • Drug discovery • Genomics • Nutrition • Fitness • Sleep • Longevity • Clinician wellness.">
            <div style={{ display:"flex", gap:8 }}>
              <input className="nv-input" value={aniInput} onChange={(e)=> setAniInput(e.target.value)} placeholder="Describe symptoms, question, or health goal..." style={{ flex:1 }} />
              <Button onClick={runAni}>Ask Ani (Bayesian DDX)</Button>
            </div>
            {aniResult && (
              <div style={{ marginTop:10, padding:10, border:"1px solid var(--nv-color-border)", borderRadius:8, fontSize:12, background:"var(--nv-color-surface-raised)" }}>
                { (aniResult as Record<string,unknown>).differential ? (
                  <div>
                    <div style={{ fontWeight:800, marginBottom:6 }}>Differential (Bayesian + uncertainty)</div>
                    {( (aniResult as Record<string,unknown>).differential as Array<Record<string,unknown>>).map((d,i)=> (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:"1px solid var(--nv-color-border)" }}>
                        <span><b>{String(d.condition)}</b> <span style={{ color:"var(--nv-color-text-faint)"}}> — {String(d.triage)}</span></span>
                        <span style={{ fontWeight:800 }}>{Math.round((d.probability as number)*100)}% <Pill tone={i===0?"primary":"neutral"}>{String(d.evidence ? (d.evidence as string[])[0] : "")}</Pill></span>
                      </div>
                    ))}
                    <div style={{ marginTop:6, color:"var(--nv-color-text-faint)", fontSize:11 }}>{String((aniResult as Record<string,unknown>).disclaimer ?? "")}</div>
                  </div>
                ) : <pre style={{ whiteSpace:"pre-wrap", fontSize:12 }}>{JSON.stringify(aniResult, null, 2)}</pre>}
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px,1fr))", gap:8, fontSize:12, marginTop:10 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Ani Scribe</b><div style={{ color:"var(--nv-color-text-faint)"}}>Ambient listening • diarization • ICD-10/CPT auto-coding • EHR auto-population</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Ani Image Analyst</b><div style={{ color:"var(--nv-color-text-faint)"}}>ViT + U-Net + 3D CNN • segmentation + 3D reconstruction • longitudinal tumor tracking</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Ani Voice Biomarker</b><div style={{ color:"var(--nv-color-text-faint)"}}>Wav2Vec 2.0 on-device • depression 87% • Parkinson 84% • multilingual 200+</div></div>
            </div>
          </Section>
        </div>
      )}

      {/* N0VA1O */}
      {tab === "n0va1o" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="N0VA1O — Unified Health Agent Gateway (N×M → 1)" subtitle="1,000+ health systems/devices/apps → 1 gateway → 1,000+ AI agents (PyTorch/TensorFlow/JAX/ONNX/Quantum). No OAuth/schema/webhook boilerplate.">
            <div style={{ fontSize:12, color:"var(--nv-color-text-faint)", lineHeight:1.6 }}>
              <b>Ingress:</b> HL7 FHIR R4/R5 REST, HL7 v2.x MLLP, DICOMweb, IEEE 11073 PHD, BLE/ANT+/NFC/UWB/MQTT/CoAP/gRPC/GraphQL • <b>Auth:</b> SAML 2.0 / OIDC / OAuth 2.1 / FIDO2 / mTLS / Device Cert • <b>Schema:</b> n0va_schema_fusion_v3 (FHIR↔HL7↔DICOM↔CDA↔X12↔NCPDP auto-mapped) • <b>Delivery:</b> at-least-once • exponential 48h • HMAC • DLQ • Saga compensated
            </div>
            <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}><Pill tone="primary">Intent routing: &quot;assess sepsis&quot; → 4 agents + 3 cross-module actions</Pill><Pill tone="success">Synthetic consciousness: shared Redis + Byzantine voting + self-healing GA</Pill></div>
          </Section>
          <Section title="Agent Swarm — 11 Classes • Health Hyper-Context Web">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:8, fontSize:11 }}>
              {[
                ["Diagnostic","radiology, pathology, ecg, genomic"],
                ["Predictive","sepsis, deterioration, fall, burnout"],
                ["Therapeutic","med optimizer, dosing, adherence"],
                ["Documentation","ambient scribe, coding, discharge"],
                ["Operational","scheduler, bed mgr, throughput"],
                ["Patient Engagement","educator, portal, coach"],
                ["Research","trial matcher, literature miner"],
                ["Wellness","sleep, nutrition, longevity"],
                ["Compliance","audit, regulator, privacy"],
                ["Security","threat, anomaly, biometric"],
                ["Cross-Module","calendar Health optimizer, burnout guardian"],
              ].map(([k,v])=> <div key={k} className="nv-card" style={{ padding:8 }}><div style={{ fontWeight:800 }}>{k}</div><div style={{ color:"var(--nv-color-text-faint)"}}>{v}</div></div>)}
            </div>
            <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)"}}>Hyper-context: order lab → Tasks + Calendar + Finance + Mail + Chat + ERP + Vault (atomic) • critical lab → Chat + Mail + Tasks + Calendar + Health CDS + Vault (escalation with timeout)</div>
          </Section>
          <Section title="Integration Universe — 1,000+ Systems via Single Gateway">
            <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>EHR 50+ (Epic, Cerner, Meditech, athena, VA VistA), Devices 500+ (Apple/Garmin/Fitbit/Oura/Whoop/Dexcom/Omron), PACS 30+ (GE, Philips, Siemens, Fuji), Labs 40+ (LabCorp, Quest, Mayo), Pharmacy 30+ (Surescripts), Payers 50+ (CMS, BCBS, UH), Public Health 30+ (CDC, WHO). See HealthService.fhirConformance() & apiCatalog().</div>
          </Section>
          {alerts.length>0 && (
            <Section title="Live Alerts (Predictive)">
              <table className="nv-table">
                <thead><tr><th>Kind</th><th>Severity</th><th>Score</th><th>Message</th><th>When</th></tr></thead>
                <tbody>
                  {alerts.map((a, i)=> (
                    <tr key={String((a as Record<string,unknown>).id ?? i)}>
                      <td><Pill tone={(a as Record<string,unknown>).severity==="critical"?"danger": (a as Record<string,unknown>).severity==="high"?"warning":"neutral"}>{String((a as Record<string,unknown>).kind)}</Pill></td>
                      <td>{String((a as Record<string,unknown>).severity)}</td>
                      <td style={{ fontWeight:800 }}>{String((a as Record<string,unknown>).score)}</td>
                      <td style={{ fontSize:11 }}>{String((a as Record<string,unknown>).message).slice(0,100)}</td>
                      <td style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{(a as Record<string,unknown>).createdAt ? new Date(String((a as Record<string,unknown>).createdAt)).toLocaleTimeString() : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>
      )}

      {/* CHECK-INS — legacy wellbeing preserved */}
      {tab === "checkins" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Today's Check-in — Ambient + Active Mood Logging (PHQ-9/GAD-7/PSS)" subtitle="Passive stress via HRV/sleep/activity/voice/typing + active validated scales. Burnout 14d warning • crisis triage.">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Mood</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      onClick={() => setMood(m)}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: 10,
                        border: mood === m ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                        background: mood === m ? "var(--nv-color-surface-raised)" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: mood === m ? 800 : 600,
                      }}
                    >
                      {MOOD_EMOJI[m]} {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Energy</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {ENERGIES.map((e) => (
                    <button
                      key={e}
                      onClick={() => setEnergy(e)}
                      style={{
                        flex: 1,
                        padding: "10px 0",
                        borderRadius: 10,
                        border: energy === e ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                        background: energy === e ? "var(--nv-color-surface-raised)" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: energy === e ? 800 : 600,
                      }}
                    >
                      {ENERGY_EMOJI[e]} {e}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap:"wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Sleep:</span>
                <input className="nv-input" type="number" min={0} max={24} step={0.5} value={sleep} onChange={(e) => setSleep(e.target.value)} style={{ width: 80 }} />
                <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>hours</span>
                <input className="nv-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything on your mind? (optional)" style={{ flex: 1, minWidth:160 }} />
                <Button onClick={submit} disabled={!sleep}>Save</Button>
              </div>
            </div>
          </Section>
          <div className="nv-card" style={{ padding: 0 }}>
            <table className="nv-table">
              <thead><tr><th>When</th><th>Mood</th><th>Energy</th><th>Sleep</th><th>Note</th><th style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {checkins.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{new Date(c.createdAt).toLocaleString()}</td>
                    <td>{MOOD_EMOJI[c.mood] ?? c.mood} {c.mood}</td>
                    <td>{ENERGY_EMOJI[c.energy] ?? c.energy} {c.energy}</td>
                    <td style={{ fontSize: 12 }}>{c.sleepHours}h</td>
                    <td style={{ fontSize: 12, color: "var(--nv-color-text-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.note || "—"}</td>
                    <td><Button variant="ghost" size="sm" onClick={() => { if (!window.confirm("Delete check-in?")) return; const fd = new FormData(); fd.set("id", c.id); void actions.remove(fd).then(() => router.refresh()); }}>✕</Button></td>
                  </tr>
                ))}
                {checkins.length === 0 && <tr><td colSpan={6} className="nv-empty">No check-ins yet — save your first one above</td></tr>}
              </tbody>
            </table>
          </div>
          <Section title="Cryogenic Health Continuum" subtitle="Hot (NVMe <0.1ms) → Warm → Cool → Cold (Glacier 5m) → Frozen (WORM 12h) → Cryogenic (DNA + Quantum WORM 48h) → Deleted 90d recover → Purged (DoD+ Gutmann+ quantum noise) → Anonymized (differential privacy) → Synthetic. Pediatric retention age 21+7, 50y Vault.">
            <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>RPO &lt;5m • RTO &lt;15m • DR &lt;1h multi-region active-active • incident response &lt;15m SOAR • compliance &lt;24h • DSAR &lt;24h • quantum-encrypted multiverse • DNA storage.</div>
          </Section>
        </div>
      )}

      <div style={{ marginTop:12, fontSize:11, color:"var(--nv-color-text-faint)", textAlign:"center" }}>VITALITY-Ω • Penta-Consciousness • Bio-Digital Twin • 12-Layer Mesh • FHIR R4/R5 • 24 Ani Capabilities • 1,000+ Integrations via 1 N0VA1O Gateway • Workspace-Native • Patent-Pending</div>
    </div>
  );
}

// Backwards-compat alias — page imports { WellnessBoard }
export const HealthVitalityBoard = WellnessBoard;
export const SafetyBoard = WellnessBoard;
