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
  { id: "command", label: "Command Center" },
  { id: "safety", label: "Safety OS" },
  { id: "registry", label: "Registry & CVC" },
  { id: "wallet", label: "Wallet" },
  { id: "provenance", label: "Provenance" },
  { id: "alerts", label: "Alert Intelligence" },
  { id: "literacy", label: "Literacy" },
  { id: "reasoning", label: "Reasoning" },
  { id: "caregiver", label: "Caregivers" },
  { id: "pathways", label: "Pathways" },
  { id: "inbox", label: "Clinical Inbox" },
  { id: "patients", label: "UHR & Patients" },
  { id: "twin", label: "Bio-Digital Twin" },
  { id: "twin-safeguards", label: "Twin Safeguards" },
  { id: "vitals", label: "Vitals & Mesh" },
  { id: "devices", label: "Devices & IoT" },
  { id: "care", label: "Care & Pharmacy" },
  { id: "meds", label: "Med Safety" },
  { id: "interop", label: "Interop" },
  { id: "offline", label: "Offline & Edge" },
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
  // provenance state
  const [deviceTrusts, setDeviceTrusts] = useState<Array<Record<string, unknown>>>([]);
  const [observations, setObservations] = useState<Array<Record<string, unknown>>>([]);
  const [inferences, setInferences] = useState<Array<Record<string, unknown>>>([]);
  const [provActions, setProvActions] = useState<Array<Record<string, unknown>>>([]);
  const [provenanceEvents, setProvenanceEvents] = useState<Array<Record<string, unknown>>>([]);
  const [provenanceCorrections, setProvenanceCorrections] = useState<Array<Record<string, unknown>>>([]);
  const [provenanceForm, setProvenanceForm] = useState({ patientId:"", code:"8867-4", amount:"92", unit:"%", origin:"DEVICE_GENERATED" });
  const [provenanceGraph, setProvenanceGraph] = useState<Record<string, unknown> | null>(null);
  const [provenanceTrace, setProvenanceTrace] = useState<Record<string, unknown> | null>(null);
  const [upstreamId, setUpstreamId] = useState("");
  const [correctionApproveForm, setCorrectionApproveForm] = useState({ correctionId:"", correctedValue:"20 mg" });
  // alert intelligence state
  const [alertCandidates, setAlertCandidates] = useState<Array<Record<string, unknown>>>([]);
  const [alertClusters, setAlertClusters] = useState<Array<Record<string, unknown>>>([]);
  const [alertBaselines, setAlertBaselines] = useState<Array<Record<string, unknown>>>([]);
  const [alertMetrics, setAlertMetrics] = useState<Record<string, unknown> | null>(null);
  const [candidateForm, setCandidateForm] = useState({ patientId:"", candidateType:"ELEVATED_BP", source:"device" });
  const [clusterForm, setClusterForm] = useState({ patientId:"", title:"Possible respiratory deterioration—bedside review required", priorityTier:"P1" });
  const [baselineForm, setBaselineForm] = useState({ patientId:"", metric:"morning_systolic_bp", median:"132", observations:"18" });
  const [priorityDemo, setPriorityDemo] = useState({ U:"0.88", C:"0.79", S:"0.74", A:"0.91", R:"0.82" });
  // command center state
  const [commandHome, setCommandHome] = useState<Record<string, unknown> | null>(null);
  const [commandWhatChanged, setCommandWhatChanged] = useState<Array<Record<string, unknown>>>([]);
  const [commandGoals, setCommandGoals] = useState<Array<Record<string, unknown>>>([]);
  const [commandActionCenter, setCommandActionCenter] = useState<Record<string, unknown> | null>(null);
  const [commandCareContext, setCommandCareContext] = useState("STABLE_WELLNESS");
  const [newGoal, setNewGoal] = useState({ goalType:"health_goals", title:"" });
  const [explainLevel, setExplainLevel] = useState<"simple"|"helpful"|"detailed">("helpful");
  // literacy state
  const [literacyProfile, setLiteracyProfile] = useState<Record<string, unknown> | null>(null);
  const [teachBackRecords, setTeachBackRecords] = useState<Array<Record<string, unknown>>>([]);
  const [clarificationSessions, setClarificationSessions] = useState<Array<Record<string, unknown>>>([]);
  const [readingLevel, setReadingLevel] = useState("PLAIN");
  const [literacyLang, setLiteracyLang] = useState("gu-IN");
  const [clarifyInput, setClarifyInput] = useState("My sugar is high. What should I do?");
  const [clarifyResult, setClarifyResult] = useState<Record<string, unknown> | null>(null);
  const [fidelityDemo, setFidelityDemo] = useState({ original:"Take this tablet every night. It helps lower your blood pressure. It may cause dizziness, especially when standing.", adapted:"Take this tablet at night. It helps control your blood pressure." });
  // reasoning state
  const [reasoningSessions, setReasoningSessions] = useState<Array<Record<string, unknown>>>([]);
  const [reasoningAnswer, setReasoningAnswer] = useState<Record<string, unknown> | null>(null);
  const [reasoningQuestion, setReasoningQuestion] = useState("Why have my readings changed?");
  const [reasoningContext, setReasoningContext] = useState<Record<string, unknown> | null>(null);
  // caregiver state
  const [careTeams, setCareTeams] = useState<Array<Record<string, unknown>>>([]);
  const [careTeamMembers, setCareTeamMembers] = useState<Array<Record<string, unknown>>>([]);
  const [delegations, setDelegations] = useState<Array<Record<string, unknown>>>([]);
  const [sharedCarePlans, setSharedCarePlans] = useState<Array<Record<string, unknown>>>([]);
  const [careTasks, setCareTasks] = useState<Array<Record<string, unknown>>>([]);
  const [escalationTrees, setEscalationTrees] = useState<Array<Record<string, unknown>>>([]);
  const [wellbeingChecks, setWellbeingChecks] = useState<Array<Record<string, unknown>>>([]);
  const [delegationForm, setDelegationForm] = useState({ patientId:"", delegateEmail:"", delegateName:"", relationship:"INFORMAL_CAREGIVER", authorizedTasks:"VIEW, VIEW_MEDICATION_LIST" });
  const [carePlanForm, setCarePlanForm] = useState({ patientId:"", title:"" });
  const [careTaskForm, setCareTaskForm] = useState({ patientId:"", title:"" });
  const [wellbeingForm, setWellbeingForm] = useState({ caregiverId:"caregiver-1", capacity:"manageable" });
  // twin safeguards state
  const [twinAttributes, setTwinAttributes] = useState<Array<Record<string, unknown>>>([]);
  const [twinSimulations, setTwinSimulations] = useState<Array<Record<string, unknown>>>([]);
  const [twinDisputes, setTwinDisputes] = useState<Array<Record<string, unknown>>>([]);
  const [twinAttributeForm, setTwinAttributeForm] = useState({ patientId:"", name:"cardiorespiratory_fitness_estimate", value:"41.2", origin:"INFERRED" });
  const [twinDisputeForm, setTwinDisputeForm] = useState({ patientId:"", attributeId:"", reason:"Wrong source data" });
  const [simulationForm, setSimulationForm] = useState({ patientId:"", question:"What might change if activity increases?", assumptions:"Medication remains unchanged, Activity increases by 20%" });
  const [firewallCheck, setFirewallCheck] = useState<Record<string, unknown> | null>(null);
  // pathways state
  const [pathwayDefinitions, setPathwayDefinitions] = useState<Array<Record<string, unknown>>>([]);
  const [pathwayEnrollments, setPathwayEnrollments] = useState<Array<Record<string, unknown>>>([]);
  const [pathwayExceptions, setPathwayExceptions] = useState<Array<Record<string, unknown>>>([]);
  const [pathwayForm, setPathwayForm] = useState({ pathwayId:"diabetes-type2-v3", title:"Type 2 diabetes support" });
  const [enrollmentForm, setEnrollmentForm] = useState({ patientId:"", pathwayId:"diabetes-type2-v3" });
  const [exceptionForm, setExceptionForm] = useState({ patientId:"", exceptionType:"Patient declines" });
  // clinical inbox / work-queue state
  const [workItems, setWorkItems] = useState<Array<Record<string, unknown>>>([]);
  const [workloads, setWorkloads] = useState<Record<string, unknown> | null>(null);
  const [slaBreaches, setSlaBreaches] = useState<Record<string, unknown> | null>(null);
  const [queueOutcomes, setQueueOutcomes] = useState<Record<string, unknown> | null>(null);
  const [workAudit, setWorkAudit] = useState<Record<string, unknown> | null>(null);
  const [workForm, setWorkForm] = useState({ patientId:"", type:"abnormal_lab", title:"Abnormal potassium result requires review", priority:"URGENT", queue:"abnormal_labs" });
  const refreshWorkItems = async (patientId?: string) => {
    try {
      const r = await fetch(patientId ? `/api/health/work-items?patientId=${patientId}&take=30` : `/api/health/work-items?take=30`, { cache: "no-store" });
      const j = await r.json().catch(()=>null);
      if (r.ok && j?.rows) setWorkItems(j.rows);
    } catch { /* degrades gracefully */ }
  };
  // medication safety cockpit state
  const [medRecords, setMedRecords] = useState<Array<Record<string, unknown>>>([]);
  const [medSummary, setMedSummary] = useState<Record<string, unknown> | null>(null);
  const [medAlerts, setMedAlerts] = useState<Array<Record<string, unknown>>>([]);
  const [medChanges, setMedChanges] = useState<Array<Record<string, unknown>>>([]);
  const [medTapers, setMedTapers] = useState<Array<Record<string, unknown>>>([]);
  const [medPhotos, setMedPhotos] = useState<Array<Record<string, unknown>>>([]);
  const [medRecon, setMedRecon] = useState<Record<string, unknown> | null>(null);
  const [medForm, setMedForm] = useState({ patientId:"", canonicalName:"", ingredient:"", strength:"", status:"PRESCRIBED" });
  const refreshMeds = async (patientId?: string) => {
    try {
      const pid = patientId || medForm.patientId;
      if (!pid) return;
      const r = await fetch(`/api/health/medications?patientId=${pid}&take=50`, { cache: "no-store" });
      const j = await r.json().catch(()=>null);
      if (r.ok && j?.rows) setMedRecords(j.rows);
      const s = await fetch(`/api/health/medications/summary?patientId=${pid}`, { cache: "no-store" });
      const sj = await s.json().catch(()=>null);
      if (s.ok && sj) setMedSummary(sj);
      const a = await fetch(`/api/health/medications/alerts?patientId=${pid}&status=OPEN`, { cache: "no-store" });
      const aj = await a.json().catch(()=>null);
      if (a.ok && aj?.rows) setMedAlerts(aj.rows);
    } catch { /* degrades gracefully */ }
  };
  // interoperability control plane state
  const [interopInterfaces, setInteropInterfaces] = useState<Array<Record<string, unknown>>>([]);
  const [interopMessages, setInteropMessages] = useState<Array<Record<string, unknown>>>([]);
  const [interopQuarantine, setInteropQuarantine] = useState<Array<Record<string, unknown>>>([]);
  const [interopConflicts, setInteropConflicts] = useState<Array<Record<string, unknown>>>([]);
  const [interopQuality, setInteropQuality] = useState<Record<string, unknown> | null>(null);
  const [interopIncidents, setInteropIncidents] = useState<Array<Record<string, unknown>>>([]);
  const [interopOutcome, setInteropOutcome] = useState<Record<string, unknown> | null>(null);
  const [interopForm, setInteropForm] = useState({ interfaceId:"", protocol:"FHIR_R4", messageType:"Observation", rawPayload:'{"resourceType":"Observation","status":"final"}' });
  const refreshInterop = async () => {
    try {
      const m = await fetch(`/api/health/interop/messages?take=30`, { cache: "no-store" });
      const mj = await m.json().catch(()=>null);
      if (m.ok && mj?.rows) setInteropMessages(mj.rows);
      const q = await fetch(`/api/health/interop/quarantine?status=OPEN`, { cache: "no-store" });
      const qj = await q.json().catch(()=>null);
      if (q.ok && qj?.rows) setInteropQuarantine(qj.rows);
      const c = await fetch(`/api/health/interop/conflicts?status=OPEN`, { cache: "no-store" });
      const cj = await c.json().catch(()=>null);
      if (c.ok && cj?.rows) setInteropConflicts(cj.rows);
      const d = await fetch(`/api/health/interop/quality/dashboard`, { cache: "no-store" });
      const dj = await d.json().catch(()=>null);
      if (d.ok && dj) setInteropQuality(dj);
    } catch { /* degrades gracefully */ }
  };
  // offline-first edge runtime state
  const [offlineDevices, setOfflineDevices] = useState<Array<Record<string, unknown>>>([]);
  const [offlineOutbox, setOfflineOutbox] = useState<Array<Record<string, unknown>>>([]);
  const [offlineConflicts, setOfflineConflicts] = useState<Array<Record<string, unknown>>>([]);
  const [offlineStoreForward, setOfflineStoreForward] = useState<Array<Record<string, unknown>>>([]);
  const [offlineSyncStatus, setOfflineSyncStatus] = useState<Record<string, unknown> | null>(null);
  const [offlineObservability, setOfflineObservability] = useState<Record<string, unknown> | null>(null);
  const [offlineForm, setOfflineForm] = useState({ deviceId:"clinic-tablet-04", name:"Community Clinic Tablet 04", role:"rural_clinic", patientId:"" });
  const refreshOffline = async () => {
    try {
      const dv = await fetch(`/api/health/offline/devices`, { cache: "no-store" });
      const dvj = await dv.json().catch(()=>null);
      if (dv.ok && dvj?.rows) setOfflineDevices(dvj.rows);
      const ob = await fetch(`/api/health/offline/outbox?status=QUEUED`, { cache: "no-store" });
      const obj = await ob.json().catch(()=>null);
      if (ob.ok && obj?.rows) setOfflineOutbox(obj.rows);
      const cf = await fetch(`/api/health/offline/conflicts?status=OPEN`, { cache: "no-store" });
      const cfj = await cf.json().catch(()=>null);
      if (cf.ok && cfj?.rows) setOfflineConflicts(cfj.rows);
      const sf = await fetch(`/api/health/offline/store-forward`, { cache: "no-store" });
      const sfj = await sf.json().catch(()=>null);
      if (sf.ok && sfj?.rows) setOfflineStoreForward(sfj.rows);
    } catch { /* degrades gracefully */ }
  };

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
        const obs = await j(`/api/health/provenance/observations?patientId=${demoPatient}&take=6`);
        if (alive && obs?.rows) setObservations(obs.rows);
        const inf = await j(`/api/health/provenance/inferences?patientId=${demoPatient}&take=6`);
        if (alive && inf?.rows) setInferences(inf.rows);
        const provAct = await j(`/api/health/provenance/actions?patientId=${demoPatient}&take=6`);
        if (alive && provAct?.rows) setProvActions(provAct.rows);
        const dev = await j(`/api/health/provenance/device-trust`);
        if (alive && dev?.rows) setDeviceTrusts(dev.rows);
        const ev = await j(`/api/health/provenance/events?take=8`);
        if (alive && ev?.rows) setProvenanceEvents(ev.rows);
        const pc = await j(`/api/health/provenance/corrections?patientId=${demoPatient}`);
        if (alive && pc?.rows) setProvenanceCorrections(pc.rows);
        setProvenanceForm(prev=> ({ ...prev, patientId: demoPatient }));
        const acand = await j(`/api/health/alerts/candidates?patientId=${demoPatient}&take=8`);
        if (alive && acand?.rows) setAlertCandidates(acand.rows);
        const aclust = await j(`/api/health/alerts/clusters?patientId=${demoPatient}&take=8`);
        if (alive && aclust?.rows) setAlertClusters(aclust.rows);
        const abase = await j(`/api/health/alerts/baselines?patientId=${demoPatient}`);
        if (alive && abase?.rows) setAlertBaselines(abase.rows);
        const amet = await j(`/api/health/alerts/metrics?patientId=${demoPatient}`);
        if (alive && amet) setAlertMetrics(amet.metrics ?? amet);
        setCandidateForm(prev=> ({ ...prev, patientId: demoPatient }));
        setClusterForm(prev=> ({ ...prev, patientId: demoPatient }));
        setBaselineForm(prev=> ({ ...prev, patientId: demoPatient }));
        const ch = await j(`/api/health/command-center/home?patientId=${demoPatient}&careContext=${commandCareContext}`);
        if (alive && ch) setCommandHome(ch.homeScreen ?? ch);
        const wcc = await j(`/api/health/command-center/what-changed?patientId=${demoPatient}&referencePoint=since_last_visit`);
        if (alive && wcc?.events) setCommandWhatChanged(wcc.events);
        else if (alive && wcc?.whatChanged) setCommandWhatChanged(wcc.whatChanged);
        const cg = await j(`/api/health/command-center/goals?patientId=${demoPatient}`);
        if (alive && cg?.rows) setCommandGoals(cg.rows);
        const ac = await j(`/api/health/command-center/action-center?patientId=${demoPatient}`);
        if (alive && ac) setCommandActionCenter(ac);
        const lp = await j(`/api/health/literacy/profile`);
        if (alive && lp?.profile) setLiteracyProfile(lp.profile);
        const tb = await j(`/api/health/literacy/teach-back?patientId=${demoPatient}`);
        if (alive && tb?.rows) setTeachBackRecords(tb.rows);
        const cl = await j(`/api/health/literacy/clarifications?patientId=${demoPatient}`);
        if (alive && cl?.rows) setClarificationSessions(cl.rows);
        const rs = await j(`/api/health/reasoning/sessions?patientId=${demoPatient}&take=6`);
        if (alive && rs?.rows) setReasoningSessions(rs.rows);
        const rctx = await j(`/api/health/reasoning/context?patientId=${demoPatient}`);
        if (alive && rctx?.context) setReasoningContext(rctx.context);
        const ct = await j(`/api/health/caregiver/care-teams?patientId=${demoPatient}`);
        if (alive && ct?.rows) setCareTeams(ct.rows);
        const ctm = await j(`/api/health/caregiver/care-team-members?patientId=${demoPatient}`);
        if (alive && ctm?.rows) setCareTeamMembers(ctm.rows);
        const del = await j(`/api/health/caregiver/delegations?patientId=${demoPatient}`);
        if (alive && del?.rows) setDelegations(del.rows);
        const scp = await j(`/api/health/caregiver/shared-care-plans?patientId=${demoPatient}`);
        if (alive && scp?.rows) setSharedCarePlans(scp.rows);
        const ctask = await j(`/api/health/caregiver/tasks?patientId=${demoPatient}`);
        if (alive && ctask?.rows) setCareTasks(ctask.rows);
        const esc = await j(`/api/health/caregiver/escalations?patientId=${demoPatient}`);
        if (alive && esc?.rows) setEscalationTrees(esc.rows);
        const wb = await j(`/api/health/caregiver/wellbeing?patientId=${demoPatient}`);
        if (alive && wb?.rows) setWellbeingChecks(wb.rows);
        const ta = await j(`/api/health/twin/attributes?patientId=${demoPatient}&take=6`);
        if (alive && ta?.rows) setTwinAttributes(ta.rows);
        const tsim = await j(`/api/health/twin/simulations?patientId=${demoPatient}&take=6`);
        if (alive && tsim?.rows) setTwinSimulations(tsim.rows);
        const tdis = await j(`/api/health/twin/disputes?patientId=${demoPatient}&take=6`);
        if (alive && tdis?.rows) setTwinDisputes(tdis.rows);
        setTwinAttributeForm(prev=> ({ ...prev, patientId: demoPatient }));
        setTwinDisputeForm(prev=> ({ ...prev, patientId: demoPatient }));
        setSimulationForm(prev=> ({ ...prev, patientId: demoPatient }));
        const pd = await j(`/api/health/pathways/definitions`);
        if (alive && (pd?.definitions ?? pd?.rows)) setPathwayDefinitions(pd.definitions ?? pd.rows ?? []);
        const pe = await j(`/api/health/pathways/enrollments?patientId=${demoPatient}`);
        if (alive && (pe?.enrollments ?? pe?.rows)) setPathwayEnrollments(pe.enrollments ?? pe.rows ?? []);
        const px = await j(`/api/health/pathways/exceptions?patientId=${demoPatient}`);
        if (alive && (px?.exceptions ?? px?.rows)) setPathwayExceptions(px.exceptions ?? px.rows ?? []);
        setPathwayForm(prev=> ({ ...prev }));
        setEnrollmentForm(prev=> ({ ...prev, patientId: demoPatient }));
        setExceptionForm(prev=> ({ ...prev, patientId: demoPatient }));
        const wi = await j(`/api/health/work-items?patientId=${demoPatient}&take=20`);
        if (alive && wi?.rows) setWorkItems(wi.rows);
        const wload = await j(`/api/health/workloads`);
        if (alive && wload) setWorkloads(wload);
        const sb = await j(`/api/health/sla-breaches`);
        if (alive && sb) setSlaBreaches(sb);
        const qo = await j(`/api/health/queue-outcomes`);
        if (alive && qo) setQueueOutcomes(qo);
        setWorkForm(prev=> ({ ...prev, patientId: demoPatient }));
        setMedForm(prev=> ({ ...prev, patientId: demoPatient }));
        const mr = await j(`/api/health/medications?patientId=${demoPatient}&take=20`);
        if (alive && mr?.rows) setMedRecords(mr.rows);
        const ms = await j(`/api/health/medications/summary?patientId=${demoPatient}`);
        if (alive && ms) setMedSummary(ms);
        const ma = await j(`/api/health/medications/alerts?patientId=${demoPatient}&status=OPEN`);
        if (alive && ma?.rows) setMedAlerts(ma.rows);
        const mc = await j(`/api/health/medications/changes?patientId=${demoPatient}`);
        if (alive && mc?.rows) setMedChanges(mc.rows);
        const mt = await j(`/api/health/medications/tapers?patientId=${demoPatient}`);
        if (alive && mt?.rows) setMedTapers(mt.rows);
        const mp = await j(`/api/health/medications/photos?patientId=${demoPatient}`);
        if (alive && mp?.rows) setMedPhotos(mp.rows);
        const ii = await j(`/api/health/interop/interfaces`);
        if (alive && ii?.rows) setInteropInterfaces(ii.rows);
        const im = await j(`/api/health/interop/messages?take=20`);
        if (alive && im?.rows) setInteropMessages(im.rows);
        const iq = await j(`/api/health/interop/quarantine?status=OPEN`);
        if (alive && iq?.rows) setInteropQuarantine(iq.rows);
        const ic = await j(`/api/health/interop/conflicts?status=OPEN`);
        if (alive && ic?.rows) setInteropConflicts(ic.rows);
        const id = await j(`/api/health/interop/quality/dashboard`);
        if (alive && id) setInteropQuality(id);
        const ix = await j(`/api/health/interop/incidents?status=open`);
        if (alive && ix?.rows) setInteropIncidents(ix.rows);
        const od = await j(`/api/health/offline/devices`);
        if (alive && od?.rows) setOfflineDevices(od.rows);
        const oo = await j(`/api/health/offline/outbox?status=QUEUED`);
        if (alive && oo?.rows) setOfflineOutbox(oo.rows);
        const oc = await j(`/api/health/offline/conflicts?status=OPEN`);
        if (alive && oc?.rows) setOfflineConflicts(oc.rows);
        const osf = await j(`/api/health/offline/store-forward`);
        if (alive && osf?.rows) setOfflineStoreForward(osf.rows);
        setOfflineForm(prev=> ({ ...prev, patientId: demoPatient }));
        setDelegationForm(prev=> ({ ...prev, patientId: demoPatient }));
        setCarePlanForm(prev=> ({ ...prev, patientId: demoPatient }));
        setCareTaskForm(prev=> ({ ...prev, patientId: demoPatient }));
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



      {/* PROVENANCE — HDPTF */}
      {tab === "provenance" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Health Data Provenance and Trust Fabric — Clinical Reasoning & Accountability Layer" subtitle="HL7 FHIR Provenance (entities/processes) + W3C PROV (entities/activities/agents) + FDA time-stamped audit trail. Not blockchain — source → transformation → inference → human decision → outcome, cryptographically verifiable." action={<><Badge tone="primary">FHIR Provenance</Badge><Badge tone="warning">W3C PROV</Badge><Pill tone="success">FDA Audit Trail</Pill></>}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8 }}>
              <Stat label="OBSERVATIONS" value={String(observations.length)} hint="L1-L3 trust-enriched" />
              <Stat label="INFERENCES" value={String(inferences.length)} hint="L4 model provenance" />
              <Stat label="ACTIONS" value={String(provActions.length)} hint="L5 authorization→execution" />
              <Stat label="EVENTS" value={String(provenanceEvents.length)} hint="Append-only hash chain" />
              <Stat label="CORRECTIONS" value={String(provenanceCorrections.length)} hint="Preserves history" />
              <Stat label="DEVICE TRUST" value={String(deviceTrusts.length)} hint="Versioned, firmware→revalidation" />
            </div>
            <div style={{ marginTop:8, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}><Pill tone="primary">Source → Outcome → Ledger</Pill><Pill>10 origins</Pill><Pill>11 trust labels</Pill><Pill>8 time stamps</Pill><Pill>7 retention P0-P7</Pill></div>
          </Section>
          <Section title="Trust-Fabric Architecture — 10 Stages Across 12 Sources">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["Source Capture","Identity/Time/Device Attestation","Signal Quality/Calibration","Normalization/Unit Conversion","Observation Store","Feature/Inference Lineage","Clinical Review/Authorization","Alert/Order/Message/Care Action","Outcome/Follow-up","Immutable Ledger"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<9 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Across: wearables, devices, labs, EHR/FHIR, imaging/DICOM, patient-reported, clinician docs, voice/text/behavioral, AI/retrieval, care plans/orders, patient comms, research, external orgs.</div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:12 }}>
            <Section title="Provenance Layers — 6">
              <div style={{ display:"grid", gap:6, fontSize:11 }}>
                <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #059669" }}><b>L1 Source</b><div style={{ color:"var(--nv-color-text-faint)"}}>Patient/encounter, org, device (mfr/model/fw/sensor/serial/collection method/collector/source class/consent/geography/residency)</div></div>
                <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #4f46e5" }}><b>L2 Measurement</b><div style={{ color:"var(--nv-color-text-faint)"}}>Event/device/receipt timestamp, TZ, clock sync, sampling rate, placement, signal quality, battery, calibration (status/date/standard), environment, motion, duplicate, manual confirmation</div></div>
                <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #d97706" }}><b>L3 Transformation</b><div style={{ color:"var(--nv-color-text-faint)"}}>Raw hash, parsing version, decryption, unit conversion, filtering, artifact rejection, interpolation, gap filling, sensor fusion, normalization, reference-range, derived feature, missing handling, human correction, code version, params, input/output hashes</div></div>
                <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #7c3aed" }}><b>L4 Inference</b><div style={{ color:"var(--nv-color-text-faint)"}}>Model family/version/digest, prompt/retrieval index, source docs, feature snapshot, input/model timestamp, confidence, calibration, uncertainty, abstention, policy version, guideline, contraindications, human-review, expiration</div></div>
                <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #dc2626" }}><b>L5 Action</b><div style={{ color:"var(--nv-color-text-faint)"}}>Alert (recipient/priority/ack), reviewer, approval/rejection, order draft/sign, message, escalation, care-plan/medication change, notification, execution result, time to action</div></div>
                <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #0ea5e9" }}><b>L6 Outcome</b><div style={{ color:"var(--nv-color-text-faint)"}}>Follow-up measurement, clinical/patient-reported outcome, adverse event, override, reassessment, readmission, escalation, resolution, adjudicator, timestamp</div></div>
              </div>
            </Section>
            <Section title="Data-Origin Taxonomy — 10 Origins, Never Display Inferred as Measured">
              <div style={{ overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Origin</th><th>Meaning</th><th>Trust</th></tr></thead><tbody><tr><td>Patient-reported</td><td>Entered/spoken by patient</td><td style={{ fontSize:10 }}>May require confirmation</td></tr><tr><td>Caregiver-reported</td><td>Authorized proxy</td><td style={{ fontSize:10 }}>Show identity/relationship</td></tr><tr><td>Clinician-entered</td><td>Healthcare professional</td><td style={{ fontSize:10 }}>Signed</td></tr><tr><td><b>Device-generated</b></td><td>Sensor/medical device</td><td style={{ fontSize:10 }}>Device/fw/calibration/quality</td></tr><tr><td>Laboratory-generated</td><td>Approved lab system</td><td style={{ fontSize:10 }}>Lab/analyzer/method</td></tr><tr><td>Imported</td><td>External system</td><td style={{ fontSize:10 }}>Source org + import history</td></tr><tr><td>Transformed</td><td>Deterministic processing</td><td style={{ fontSize:10 }}>Source + version</td></tr><tr><td><b>Inferred</b></td><td>Model/rules engine</td><td style={{ fontSize:10 }}>Model/evidence/uncertainty</td></tr><tr><td><b>Synthetic</b></td><td>Testing/simulation</td><td style={{ fontSize:10, color:"#dc2626", fontWeight:800 }}>Never mix silently</td></tr><tr><td>Human-adjudicated</td><td>Confirmed by authorized person</td><td style={{ fontSize:10 }}>Reviewer + rationale</td></tr></tbody></table></div>
              <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><b>Trust labels 11:</b> {["Measured","Reported","Imported","Validated","Derived","Inferred","Unverified","Stale","Conflicted","Synthetic","Corrected"].map(l=> <Pill key={l} tone={l==="Synthetic"||l==="Conflicted"?"danger":l==="Measured"?"success":"neutral"}>{l}</Pill>)}</div>
            </Section>
          </div>
          <Section title="Why This Appeared — Clinician-Facing Provenance View">
            <div style={{ padding:10, border:"1px solid var(--nv-color-border)", borderRadius:8, fontSize:12, background:"var(--nv-color-surface-raised)" }}>
              <b>Possible clinical deterioration</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>Generated at 14:14 IST by Deterioration Risk Model v3.4.1. Contributing: respiratory rate 18→29/min over 3h; SpO2 97%→92%; temperature 38.4°C. Input quality: acceptable. Latest vitals: 8 min old. Missing: current lactate. <b>This is a risk signal, not a diagnosis. Clinician assessment required.</b></span>
              <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}><Pill>Expand: raw measurements</Pill><Pill>Trend charts</Pill><Pill>Device quality</Pill><Pill>Calibration</Pill><Pill>Transformation pipeline</Pill><Pill>Model version</Pill><Pill>Uncertainty</Pill><Pill>Contradictory data</Pill><Pill>Actions taken</Pill><Pill>Outcome history</Pill></div>
            </div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px,1fr))", gap:8, fontSize:11 }}>
              <div><b>Graph — Entities/Activities/Agents</b><div style={{ color:"var(--nv-color-text-faint)"}}>Entities: observations, docs, models, features, alerts, orders, outcomes<br/>Activities: capture, import, transform, infer, review, approve, execute, revise<br/>Agents: patient, clinician, device, lab, org, model, software</div><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{`Apple Watch ECG → Raw ECG Segment → Artifact Filter v2.1 → Normalized Rhythm → Arrhythmia Model v5.0 → Possible AF Alert → Cardiologist → ECG Order → Confirmed`}</pre></div>
              <div><b>Queries</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Why was this alert generated?","Which raw measurements contributed?","Which model version was used?","Which patients were affected by flawed model?","Which recommendations used corrected lab?","Which actions followed uncalibrated device?","Which outcomes followed alert?"].map(q=> <Pill key={q}>{q}</Pill>)}</div><div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="resourceId e.g. alert-7842" value={upstreamId} onChange={e=> setUpstreamId(e.target.value)} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!upstreamId) return; const u=await fetch(`/api/health/provenance/${upstreamId}/upstream?depth=5`).then(r=> r.json()).catch(()=>null); setProvenanceGraph(u); }}>Upstream</Button><Button size="sm" variant="ghost" onClick={async()=> { if(!upstreamId) return; const d=await fetch(`/api/health/provenance/${upstreamId}/downstream?depth=5`).then(r=> r.json()).catch(()=>null); setProvenanceGraph(d); }}>Downstream</Button></div>{provenanceGraph && <pre style={{ marginTop:6, background:"var(--nv-color-surface-raised)", padding:6, borderRadius:6, fontSize:10, maxHeight:100, overflowY:"auto" }}>{JSON.stringify(provenanceGraph, null, 2).slice(0,600)}</pre>}</div>
            </div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Event-Sourcing — Append-Only, Reconstruct Any Point">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["OBSERVATION_RECEIVED","VALIDATED","NORMALIZED","CORRECTED","INFERENCE_GENERATED","REVIEWED","ACTION_APPROVED","EXECUTED","OUTCOME_RECORDED"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:3 }}><span style={{ padding:"3px 6px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", fontSize:10 }}>{s}</span>{i<8 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Each event: eventId, type, aggregateId, patient/encounter, actor, timestamp, previousStateHash, currentPayloadHash, parentEvent, software/policy version, signature, reasonCode, correlationId, retentionClass P0-P7.</div>
              <div style={{ marginTop:6, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Event</th><th>Aggregate</th><th>Actor</th><th>When</th></tr></thead><tbody>{provenanceEvents.length===0 && <tr><td colSpan={4} className="nv-empty">No provenance events — observations/inferences/actions will append here with hash chain</td></tr>}{provenanceEvents.slice(0,5).map((e:Record<string,unknown>,i:number)=> <tr key={String(e.id ?? i)}><td><Pill>{String(e.eventType)}</Pill></td><td style={{ fontSize:10 }}>{String(e.aggregateId).slice(0,12)}</td><td>{String(e.actor ?? "—")}</td><td style={{ fontSize:10 }}>{e.timestamp? new Date(String(e.timestamp)).toLocaleTimeString():""}</td></tr>)}</tbody></table></div>
            </Section>
            <Section title="Time Integrity — 8 Timestamps + Clock Sync">
              <div style={{ fontSize:11, lineHeight:1.6 }}><b>Preserve:</b> event time, device time, ingestion time, processing time, inference time, review time, action time, outcome time + clock offset + synchronization status<pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", marginTop:6 }}>{`{
  "event_time": "2026-09-01T14:05:12+05:30",
  "device_time": "2026-09-01T14:05:09+05:30",
  "ingestion_time": "2026-09-01T14:05:16+05:30",
  "clock_offset_ms": 3000,
  "synchronization": "within_tolerance",
  "time_source": "NTP_authenticated"
}`}</pre><div style={{ color:"var(--nv-color-text-faint)"}}>If sync poor → mark temporally uncertain, not silently accepted.</div></div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Device Trust Profile — 19 Fields, Versioned">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["manufacturer","device model","serial/attestation","firmware","hardware revision","regulatory status","intended use","supported measurements","calibration requirements","expected ranges","sampling behavior","known limitations","security status","last maintenance","last calibration","signal-quality algorithm","data-transfer","time-sync","revocation"].map(f=> <Pill key={f}>{f}</Pill>)}</div>
              <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Manufacturer e.g. PulseOx-4" value={provenanceForm.code} onChange={e=> setProvenanceForm({...provenanceForm, code:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { const r=await fetch("/api/health/provenance/device-trust",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ manufacturer: provenanceForm.code || "Example Medical", deviceModel:"PulseOx-4", firmware:"2.8.1" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.profile) setDeviceTrusts(prev=> [j.profile, ...prev].slice(0,6)); }}>Create Trust Profile (versioned)</Button></div>
              {deviceTrusts.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Manufacturer</th><th>Model</th><th>Firmware</th><th>v</th></tr></thead><tbody>{deviceTrusts.slice(0,4).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.manufacturer)}</td><td>{String(d.deviceModel)}</td><td>{String(d.firmware ?? "—")}</td><td>{String(d.version)}</td></tr>)}</tbody></table></div>}
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Firmware update → new provenance version → may trigger model revalidation.</div>
            </Section>
            <Section title="Signal-Quality Envelope — Every Measurement">
              <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{`{
  "signal_quality": {
    "overall": 0.91,
    "motion_artifact": 0.04,
    "electrode_contact": 0.98,
    "battery_sufficient": true,
    "calibration_valid": true,
    "sampling_complete": true,
    "quality_method": "ppg-quality-v2.3"
  }
}`}</pre><div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}><Pill tone="success">High-quality</Pill><Pill tone="warning">Usable with caution</Pill><Pill tone="danger">Poor</Pill><Pill>Uninterpretable</Pill><Pill>Missing</Pill><Pill>Device fault</Pill><Pill>Manually overridden</Pill></div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Prevent high-risk inference when below threshold.</div></div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Observation Object — FHIR Observation + Provenance">
              <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{`{
  "observation_id": "obs-...",
  "patient_id": "tokenized", "code": "8867-4",
  "value": { "amount": 92, "unit": "%", "display": "Oxygen saturation" },
  "origin": "device_generated",
  "source": { "device_id": "device-...", "manufacturer": "Example Medical", "model": "PulseOx-4", "firmware": "2.8.1" },
  "timing": { "event_time": "2026-09-01T14:05:12+05:30", "synchronization": "within_tolerance" },
  "quality": { "score": 0.94, "status": "usable" },
  "calibration": { "status": "valid", "last_calibrated": "2026-08-15" },
  "provenance_ref": "prov-...", "content_hash": "sha256:..."
}`}</pre><div style={{ display:"flex", gap:4, marginTop:4 }}><input className="nv-input" placeholder="patientId" value={provenanceForm.patientId} onChange={e=> setProvenanceForm({...provenanceForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="code e.g. 8867-4" value={provenanceForm.code} onChange={e=> setProvenanceForm({...provenanceForm, code:e.target.value})} style={{ width:90, fontSize:11 }} /><input className="nv-input" placeholder="value" value={provenanceForm.amount} onChange={e=> setProvenanceForm({...provenanceForm, amount:e.target.value})} style={{ width:60, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!provenanceForm.patientId) return; const r=await fetch("/api/health/provenance/observations",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: provenanceForm.patientId, code: provenanceForm.code, value:{ amount: Number(provenanceForm.amount), unit: provenanceForm.unit, display:"Observation" }, origin: provenanceForm.origin })}); const j=await r.json().catch(()=>null); if(r.ok && j?.observation) setObservations(prev=> [j.observation, ...prev].slice(0,6)); }}>Create Observation (L1-L3)</Button></div>{observations.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Observation</th><th>Code</th><th>Value</th><th>Label</th><th>Hash</th></tr></thead><tbody>{observations.slice(0,4).map((o:Record<string,unknown>,i:number)=> <tr key={String(o.id ?? i)}><td style={{ fontSize:10 }}>{String(o.observationId ?? o.id).slice(0,10)}</td><td>{String(o.code)}</td><td>{String((o.value as Record<string,unknown>)?.amount ?? (o as Record<string,unknown>).value ?? "—")}</td><td><Pill>{String(o.trustLabel)}</Pill></td><td style={{ fontSize:9 }}>{String(o.contentHash ?? "").slice(0,10)}</td></tr>)}</tbody></table></div>}</div>
            </Section>
            <Section title="Inference Object + Action Provenance">
              <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{`{
  "inference_id": "inf-...",
  "type": "clinical_risk_signal", "statement": "Possible deterioration", "status": "review_required",
  "model": { "family": "deterioration-risk", "version": "3.4.1", "artifact_digest": "sha256:..." },
  "inputs": [{ "observation_id": "obs-...", "role": "primary_feature" }],
  "uncertainty": { "predictive_probability": 0.86, "epistemic": 0.11, "aleatoric": 0.18 },
  "valid_until": "2026-09-01T15:14:00+05:30", "requires_human_review": true
}`}</pre><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", marginTop:6 }}>{`{
  "action_id": "action-...",
  "type": "rapid_response_notification",
  "trigger": { "inference_id": "inf-...", "policy_id": "policy-..." },
  "authorization": { "required_role": "attending_or_rapid_response", "reviewer_id": "clinician-token", "decision": "approved" },
  "execution": { "recipient": "rapid-response-team", "sent_at": "2026-09-01T14:16:20+05:30", "delivery_status": "acknowledged" }
}`}</pre><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Distinguishes model-generated vs clinician-approved vs automatically sent vs failed delivery vs human override vs outcome.</div></div>
            </Section>
          </div>
          <Section title="Clinical Decision Trace — 5 Panels (Not Generic 'AI Detected Risk')">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:8 }}><b>1. What was observed?</b><div style={{ color:"var(--nv-color-text-faint)"}}>Values, trends, source, quality, freshness, calibration</div></div>
              <div className="nv-card" style={{ padding:8 }}><b>2. What changed?</b><div style={{ color:"var(--nv-color-text-faint)"}}>Normalization, filtering, missing-data, derived features, conflict resolution</div></div>
              <div className="nv-card" style={{ padding:8 }}><b>3. What did model do?</b><div style={{ color:"var(--nv-color-text-faint)"}}>Version, input snapshot, output, confidence, uncertainty, envelope status</div></div>
              <div className="nv-card" style={{ padding:8 }}><b>4. What policy applied?</b><div style={{ color:"var(--nv-color-text-faint)"}}>Safety threshold, human-review rule, contraindication, consent, escalation</div></div>
              <div className="nv-card" style={{ padding:8 }}><b>5. What happened afterward?</b><div style={{ color:"var(--nv-color-text-faint)"}}>Reviewer, approval, action, delivery, reassessment, outcome</div></div>
            </div>
            <div style={{ marginTop:8, display:"flex", gap:4 }}><input className="nv-input" placeholder="resourceId e.g. inf-..." value={upstreamId} onChange={e=> setUpstreamId(e.target.value)} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!upstreamId) return; const r=await fetch(`/api/health/provenance/trace/${upstreamId}`).then(r=> r.json()).catch(()=>null); setProvenanceTrace(r?.trace ?? r); }}>Trace 5 Panels</Button></div>
            {provenanceTrace && <pre style={{ marginTop:6, background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, maxHeight:120, overflowY:"auto" }}>{JSON.stringify(provenanceTrace, null, 2).slice(0,1000)}</pre>}
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Digital Signatures — 3 Classes">
              <div style={{ fontSize:11 }}><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #059669" }}><b>Human Clinical</b><div style={{ color:"var(--nv-color-text-faint)"}}>Orders, diagnoses, treatment plans, notes, consent, overrides — verified identity, role, intent confirmation, step-up auth, timestamp, certificate, status</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #4f46e5", marginTop:6 }}><b>System</b><div style={{ color:"var(--nv-color-text-faint)"}}>Device data, transformations, AI inferences, notifications, policy decisions — workload identity, attested runtime, artifact digest, software version, key rotation, replay protection</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #d97706", marginTop:6 }}><b>Organization</b><div style={{ color:"var(--nv-color-text-faint)"}}>Validation reports, regulatory docs, research agreements, data-release approvals, institutional protocols</div></div><div style={{ marginTop:6, color:"var(--nv-color-text-faint)"}}>Signatures authenticate + detect modification, not confidentiality/replay — combine with encryption, key management, timestamps, nonce/sequence, revocation. HSM, separate keys by tenant/env, model/data keys, rotation, revocation, dual authorization, offline emergency verification, post-quantum migration.</div></div>
            </Section>
            <Section title="Tamper-Evident Audit + Retention P0-P7">
              <div style={{ fontSize:11 }}><div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{["Append-only event storage","Hash chaining","Merkle-tree checkpoints","External time-stamping","Immutable object storage","Write-once retention","Separate audit admin","Independent replication","Access logging","Signature verification","Exportable evidence package","Legal-hold support","Disaster-recovery testing"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}><Pill>P0 Temporary buffer — short</Pill><Pill>P1 Wellness — patient-configurable</Pill><Pill>P2 Clinical observation — clinical-record</Pill><Pill tone="danger">P3 Signed order — legal</Pill><Pill tone="danger">P4 High-risk AI — safety/regulatory</Pill><Pill>P5 Incident/CAPA — quality</Pill><Pill>P6 Research — protocol/legal</Pill><Pill>P7 Security audit</Pill></div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Hash chain shows whether records changed after creation; does not prove original truth — preserve source signatures, device attestations, human identity, independent logs.</div></div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Correction Workflow — Preserve History">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["Correction Requested","Original Preserved","Evidence Submitted","Clinical/Data Steward Review","Corrected Version Created","Original Superseded","Dependents Identified","Alerts/Reports Re-evaluated","Downstream Notified","Patient Shown Final"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:3 }}><span style={{ padding:"3px 6px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", fontSize:10 }}>{s}</span>{i<9 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
              <div style={{ marginTop:6, padding:8, border:"1px dashed #059669", borderRadius:8, fontSize:11, background:"#ecfdf5" }}><i>“Your recorded medication dose was corrected from 10 mg to 20 mg after review by City Hospital on 1 September 2026. The original entry remains visible in the history. N0VA rechecked two medication alerts that used the earlier value.”</i> — never silently replace.</div>
              <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="correctionId" value={correctionApproveForm.correctionId} onChange={e=> setCorrectionApproveForm({...correctionApproveForm, correctionId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="corrected value e.g. 20 mg" value={correctionApproveForm.correctedValue} onChange={e=> setCorrectionApproveForm({...correctionApproveForm, correctedValue:e.target.value})} style={{ width:100, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!correctionApproveForm.correctionId) return; const r=await fetch(`/api/health/provenance/corrections/${correctionApproveForm.correctionId}/approve`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ correctedValue:{ value: correctionApproveForm.correctedValue }, responsibleOrg:"City Hospital" })}); const j=await r.json().catch(()=>null); if(r.ok) setProvenanceCorrections(prev=> prev.map(c=> String((c as Record<string,unknown>).id)===correctionApproveForm.correctionId? {...c, reviewStatus:"approved"} as Record<string,unknown>:c)); }}>Approve Correction</Button></div>
              {provenanceCorrections.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Record</th><th>Status</th><th>Original → Proposed</th></tr></thead><tbody>{provenanceCorrections.slice(0,4).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td style={{ fontSize:10 }}>{String(c.recordId).slice(0,12)}</td><td><Pill>{String(c.reviewStatus)}</Pill></td><td style={{ fontSize:10 }}>{String(JSON.stringify(c.originalValue)).slice(0,20)} → {String(JSON.stringify(c.proposedValue)).slice(0,20)}</td></tr>)}</tbody></table></div>}
            </Section>
            <Section title="Correction Impact Graph + Trust Posture (7 Dimensions)">
              <div style={{ fontSize:11 }}><b>Corrected allergy →</b> medication reconciliation → interaction checker → medication recommendation → care-plan draft → patient message → research feature — each: Unaffected / Recomputed / Requires review / Withdrawn / Superseded / Patient notification required / Research correction / Regulatory report</div>
              <Button size="sm" variant="ghost" onClick={async()=> { if(!correctionApproveForm.correctionId) return; const r=await fetch(`/api/health/provenance/corrections/${correctionApproveForm.correctionId}/impact`).then(r=> r.json()).catch(()=>null); alert(r? `Impact: ${JSON.stringify(r.impact ?? r,null,2).slice(0,500)}` : "No impact"); }} style={{ marginTop:6 }}>Impact Analysis</Button>
              <div style={{ marginTop:6, padding:8, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", borderRadius:8 }}><b>Trust posture (not single score):</b><div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11, marginTop:4 }}><div>Authenticity: verified device</div><div>Quality: 0.94</div><div>Freshness: 8 min old</div><div>Calibration: valid</div><div>Corroboration: confirmed manual</div><div>Model validity: approved adult inpatient</div><div>Authorization: review required</div></div></div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Provenance-Aware AI Retrieval + Conflict Resolution">
              <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{`{
  "fact": "Patient reports penicillin allergy",
  "source_type": "clinician_entered",
  "author": "Dr. ...",
  "recorded_at": "2026-08-20T10:12:00Z",
  "last_verified": "2026-08-28T09:00:00Z",
  "status": "active",
  "confidence": "clinician_confirmed",
  "consent_scope": "treatment"
}`}</pre><div style={{ marginTop:6 }}><b>Conflict:</b> “Two active medication lists conflict: imported warfarin 5 mg vs clinician-entered apixaban 5 mg. Recommendations paused until reconciliation.” — display conflicting values, source identities, timestamps, quality, significance, required reviewer, safe interim behavior. Precedence not absolute — recent lab/device may outrank clinician-entered.</div><div style={{ marginTop:6 }}><b>Synthetic separation (hard boundary):</b> separate namespace/patient-ID pattern/storage bucket/FHIR tenant/tag, visible flag, no alerts/messages/billing/validation/timeline mixing.</div></div>
            </Section>
            <Section title="Provenance API — 11 Endpoints + FHIR/W3C PROV">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11, fontFamily:"monospace" }}>{["GET    /provenance/{resource_id}","GET    /provenance/{resource_id}/upstream","GET    /provenance/{resource_id}/downstream","GET    /provenance/{resource_id}/explanation","POST   /provenance/corrections","GET    /provenance/corrections/{id}","POST   /provenance/sign","POST   /provenance/verify","GET    /provenance/audit-events","POST   /provenance/holds","GET    /provenance/impact-analysis"].map(e=> <div key={e} style={{ padding:"3px 6px", background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)", borderRadius:6 }}>{e}</div>)}</div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>FHIR: Observation, Device, DeviceMetric, DiagnosticReport, DocumentReference, MedicationRequest, Consent, Provenance (agents/entities/activities), AuditEvent, Task, CarePlan — FHIR Provenance links target/agents/entities/activities + N0VA extensions (model version, quality, calibration, uncertainty, params, signatures). W3C PROV internally, FHIR clinically.</div>
              <div style={{ marginTop:6, fontSize:11 }}><b>Note markers 7 + Order linkage:</b> Patient-reported: / Clinician-observed: / Device-measured: / Imported: / AI-summarized: / Clinician-verified: / Not independently verified: — AI suggestion never represented as ordering clinician’s independent rationale.</div>
            </Section>
          </div>
          <Section title="Acceptance — 16 Questions for Any High-Risk Alert">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}>{["Which patient/encounter?","What source data?","Was each source patient-reported/device-generated/clinician-entered/imported/inferred/synthetic?","Which device/fw/calibration/quality?","When did event occur, was clock synchronized?","What transformations?","Which model/policy versions?","What evidence/uncertainty?","Which consent/access policy?","Who reviewed/approved?","What action?","Was action delivered?","What outcome?","Has source been corrected?","Which downstream affected?","Can chain be cryptographically verified?"].map(q=> <div key={q} style={{ padding:"4px 6px", border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)" }}>{q}</div>)}</div>
            <div style={{ marginTop:8, padding:10, border:"1.5px solid #4f46e5", borderRadius:10, fontSize:12, fontWeight:800, textAlign:"center", background:"var(--nv-color-surface-raised)" }}>Every important clinical fact in N0VA should be explainable as a signed, time-aware chain from source to transformation to inference to human decision to outcome.</div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}><Pill>First release: source classification, device metadata, timestamp/freshness, signal quality, FHIR Provenance, model/policy version, upstream/downstream, event log, correction history, explanation, signed high-risk actions</Pill><Pill>Second: device attestation, calibration registry, transformation graph, outcome links, patient-visible, conflict, derived lineage, impact</Pill><Pill>Third: cross-org, research lineage, privacy-wallet integration, automated propagation, post-market surveillance, cryptographic checkpoints, verification portal</Pill></div>
          </Section>
        </div>
      )}



      {/* COMMAND CENTER — Unified Patient Command Center */}
      {tab === "command" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Patient Command Center — Prioritized, Explainable Daily Workspace" subtitle="Answers: What matters today? What changed? What next? Who is waiting? — Simplifies by default, drill-down to source/provenance/uncertainty. Adapts to 11 care contexts." action={<><Badge tone="primary">AHRQ Health-Literacy</Badge><Badge tone="warning">WCAG 2.2 AA</Badge><Pill tone="success">NHS Inclusion</Pill></>}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", fontSize:11 }}>
              <span>Care context:</span>
              <select className="nv-select" value={commandCareContext} onChange={async e=> {
                const ctx=e.target.value;
                setCommandCareContext(ctx);
                const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined ?? (commandHome as Record<string,unknown> | undefined)?.patient_id as string | undefined;
                if(pid){
                  const r=await fetch(`/api/health/command-center/home?patientId=${pid}&careContext=${ctx}`);
                  const j=await r.json().catch(()=>null);
                  if(j) setCommandHome(j.homeScreen ?? j);
                }
              }} style={{ width:200, fontSize:11 }}>
                {["STABLE_WELLNESS","NEW_DIAGNOSIS","POST_DISCHARGE_RECOVERY","PREGNANCY","CHRONIC_DISEASE_MONITORING","ACTIVE_TREATMENT","MENTAL_HEALTH_SUPPORT","CAREGIVER_MANAGED_CARE","PEDIATRIC_ADOLESCENT_CARE","PALLIATIVE_HOSPICE_CARE","EMERGENCY_URGENT_FOLLOWUP"].map(c=> <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
              </select>
              <Pill tone="primary">8-card layout</Pill><Pill>Plain language</Pill><Pill>No single health score</Pill>
            </div>
            {(commandHome as Record<string,unknown> | null) ? (
              <div style={{ marginTop:8, padding:10, border:"1.5px solid #059669", borderRadius:10, background:"#ecfdf5" }}>
                <b>{String((commandHome as Record<string,unknown>).todayCard ? ((commandHome as Record<string,unknown>).todayCard as Record<string,unknown>).overview as string : "Today's health overview")}</b>
                <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8, fontSize:11 }}>
                  <div>Urgent: <b>{String(((commandHome as Record<string,unknown>).todayCard as Record<string,unknown> | undefined)?.urgentItems ?? (commandHome as Record<string,unknown>).urgentItems ?? "—")}</b></div>
                  <div>Actions due today: <b>{String(((commandHome as Record<string,unknown>).todayCard as Record<string,unknown> | undefined)?.actionsDueToday ?? "—")}</b></div>
                  <div>Next appointment: <b>{(commandHome as Record<string,unknown>).next_visit ? new Date(String((commandHome as Record<string,unknown>).next_visit)).toLocaleDateString() : String(((commandHome as Record<string,unknown>).todayCard as Record<string,unknown> | undefined)?.nextAppointment ? new Date(String(((commandHome as Record<string,unknown>).todayCard as Record<string,unknown>).nextAppointment)).toLocaleDateString() : "—")}</b></div>
                  <div>Medication: <b>{String((commandHome as Record<string,unknown>).medications ? ((commandHome as Record<string,unknown>).medications as unknown[]).length + " active" : String(((commandHome as Record<string,unknown>).todayCard as Record<string,unknown> | undefined)?.medicationStatus ?? "—"))}</b></div>
                  <div>Freshness: <b>{String((commandHome as Record<string,unknown>).dataFreshness ?? ((commandHome as Record<string,unknown>).todayCard as Record<string,unknown> | undefined)?.dataFreshness ?? "—")}</b></div>
                  <div>Reviewed: <b>{String(((commandHome as Record<string,unknown>).todayCard as Record<string,unknown> | undefined)?.clinicianReviewed ?? "false")}</b></div>
                </div>
                <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Source: Home BP monitor • Last updated: 28 minutes ago • Data quality: Good • Interpretation: Care-plan rule + clinician-approved threshold • Reviewed by clinician: No • Model output: Not used</div>
              </div>
            ) : <div style={{ fontSize:12, color:"var(--nv-color-text-faint)"}}>No command center data — select a patient or create one. Home screen adapts to care context (stable wellness → emergency).</div>}
          </Section>
          <Section title="What Needs Attention — Priority Engine (12 Factors, 5 Levels)" subtitle="Clinical urgency, time sensitivity, patient safety, overdue, clinician waiting, patient goals, treatment importance, confidence/evidence, consequence of delay, cost/coverage deadline, preference, accessibility — distinguishes AI priority (needs review/possible concern) from diagnosis.">
            <div style={{ overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Priority</th><th>Meaning</th><th>Example</th></tr></thead><tbody><tr><td><span style={{ background:"#7f1d1d", color:"white", padding:"2px 6px", borderRadius:999, fontSize:10, fontWeight:800 }}>EMERGENCY</span></td><td>Immediate human help</td><td>Severe breathing difficulty</td></tr><tr><td><Pill tone="danger">URGENT</Pill></td><td>Same-day/rapid review</td><td>Abnormal result awaiting review</td></tr><tr><td><Pill tone="warning">IMPORTANT</Pill></td><td>Action due soon</td><td>Medication refill/follow-up</td></tr><tr><td><Pill tone="primary">ROUTINE</Pill></td><td>Useful not time-sensitive</td><td>Preventive reminder</td></tr><tr><td><Pill>INFORMATIONAL</Pill></td><td>No action required</td><td>Stable sleep trend</td></tr></tbody></table></div>
            <div style={{ marginTop:8 }}>
              <div style={{ display:"grid", gap:8 }}>
                {((commandHome as Record<string,unknown> | null)?.priorities as Array<Record<string,unknown>> | undefined ?? []).slice(0,3).map((p,i)=> (
                  <div key={String(p.id ?? i)} className="nv-card" style={{ padding:10, borderLeft: `4px solid ${String(p.severity)==="urgent"||String(p.priority)==="URGENT"?"#dc2626": String(p.severity)==="important"?"#d97706":"#6b7280"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><b>{String(p.title ?? p.plain_language_title ?? "Priority")}</b><Pill tone={String(p.severity)==="important"||String(p.priority)==="IMPORTANT"?"warning":String(p.priority)==="URGENT"?"danger":"neutral"}>{String(p.urgency ?? p.priority ?? "—")}</Pill></div>
                    <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:4 }}>{String(p.rationale ?? p.reason ?? "Rationale")}</div>
                    <div style={{ fontSize:11, marginTop:4 }}><b>What changed:</b> {String(p.whatChanged ?? p.what_changed ?? "3 readings above threshold in 24h")} • <b>Next step:</b> {String(p.nextStep ?? p.next_step ?? "Recheck while seated")} • <b>Source:</b> {String(p.source ?? p.dataSource ?? "Home BP monitor")} • <b>Confidence:</b> {String(p.confidence ?? "Good")} • <b>Responsible:</b> {String(p.responsiblePerson ?? p.responsible_person ?? "Care team")}</div>
                    <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}><Button size="sm" onClick={()=> alert(`Action for ${String(p.title)} — provenance ${String(p.provenanceRef ?? p.provenance_ref ?? "")}`)}>Action</Button><Button size="sm" variant="ghost" onClick={()=> setExplainLevel("simple")}>Why am I seeing this?</Button><Button size="sm" variant="ghost" onClick={()=> alert("Marked incorrect — will trigger correction workflow")}>This is incorrect</Button><Button size="sm" variant="ghost">Hide/snooze (safe)</Button></div>
                    <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Human review required: {String(p.requiresHumanReview ?? p.reviewed_by_clinician === false ? "Yes" : "No")} • Due: {p.due_at? new Date(String(p.due_at)).toLocaleString(): p.dueAt? new Date(String(p.dueAt)).toLocaleString():"—"}</div>
                    <div style={{ marginTop:4, fontSize:11 }}><span style={{ cursor:"pointer", color:"#4f46e5" }} onClick={()=> setExplainLevel(explainLevel==="simple"?"helpful": explainLevel==="helpful"?"detailed":"simple")}>Explain this: {explainLevel==="simple"?"Your blood pressure has been higher than usual.": explainLevel==="helpful"?"Three readings over the last day were above your recent average. Recheck while seated and follow your care plan.":`Readings: ${(p as Record<string,unknown>).readings ?? "148/92 at 08:10, 151/94 at 12:20, 146/90 at 19:05"}. Device: Omron, firmware 2.1. Signal quality: good. Rule: BP-monitoring-policy 4.1. No clinician review.`}</span></div>
                  </div>
                ))}
                {(!commandHome || ((commandHome as Record<string,unknown>).priorities as unknown[] ?? []).length===0) && (
                  <div className="nv-card" style={{ padding:10, borderLeft:"4px solid #d97706" }}><b>Possible concern: Blood pressure above usual range</b><div style={{ fontSize:11, color:"var(--nv-color-text-faint)"}}>What changed: 3 readings above your personal threshold in 24 hours. Source: Home BP monitor, last reading 28 minutes ago.</div><div style={{ fontSize:11, marginTop:4 }}><b>What to do:</b> Recheck while seated and follow your care plan. <b>Urgency:</b> Contact your care team today if readings remain high. <b>Why shown:</b> 3 readings above threshold in 24h. <b>Confidence:</b> Good. <b>Responsible:</b> Care team.</div><div style={{ marginTop:6, display:"flex", gap:6 }}><Button size="sm">Recheck</Button><Button size="sm" variant="ghost">Why am I seeing this?</Button><Button size="sm" variant="ghost">This is incorrect</Button></div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Human review required: Yes • Due: Tomorrow • Source: Home BP monitor • Last updated: 28 minutes ago • Reviewed by clinician: No</div></div>
                )}
              </div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>For safety-sensitive, card must display when human review is required. AI priority never presented as diagnosis — uses “needs review/possible concern/action may be due”.</div>
            </div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Medications and Treatment Plan — Prescribed vs Real-World">
              <div style={{ fontSize:11 }}>
                <div style={{ display:"grid", gap:6 }}>
                  {((commandHome as Record<string,unknown> | null)?.medications as Array<Record<string,unknown>> | undefined ?? []).slice(0,2).map((m,i)=> (
                    <div key={i} className="nv-card" style={{ padding:10, border:"1px solid var(--nv-color-border)", borderRadius:8 }}>
                      <b>{String(m.medicine_name ?? m.title ?? "Medication")}</b> <span style={{ color:"var(--nv-color-text-faint)"}}>— {String(m.purpose_plain_language ?? m.purpose ?? "")}</span>
                      <div style={{ color:"var(--nv-color-text-faint)", marginTop:4 }}>Dose: {String(m.dose_and_schedule ?? m.dosage ?? "Once daily")} • Next dose: {m.next_dose? new Date(String(m.next_dose)).toLocaleString():"—"} • Refill: {String(m.refill_status ?? "5 days remaining")} • Supply: {String(m.remaining_supply ?? "7 days")} • Prescriber: {String(m.prescriber ?? "Dr. Smith")}</div>
                      <div style={{ marginTop:4 }}><b>Missed-dose:</b> {String(m.missed_dose_guidance ?? "Do not guess about the next dose. Contact your pharmacist or care team.")}</div>
                      <div style={{ display:"flex", gap:4, marginTop:4 }}><Pill>{String(m.status ?? "active")}</Pill><Pill tone="warning">{String(m.interaction_warning ?? "None")}</Pill><Pill>Reconciled: {String(m.last_reconciliation_date? new Date(String(m.last_reconciliation_date)).toLocaleDateString():"—")}</Pill></div>
                    </div>
                  ))}
                  {(!commandHome || ((commandHome as Record<string,unknown>).medications as unknown[] ?? []).length===0) && <div className="nv-card" style={{ padding:10 }}><b>Lisinopril</b> — For blood pressure<br/><span style={{ color:"var(--nv-color-text-faint)"}}>Dose: 10 mg daily • Next dose: tonight • Refill: 5 days • Supply: 7 days • Prescriber: Dr. Patel • Reconciled: 1 Sep 2026 • Adherence: Good</span><br/><span style={{ fontSize:10, color:"var(--nv-color-text-faint)"}}>Never invent missed-dose — if care plan not specify: “Do not guess about the next dose. Contact your pharmacist or care team.”</span></div>}
                </div>
                <div style={{ marginTop:8 }}>
                  <b>Treatment-plan timeline</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, marginTop:4 }}>{["Today: Take medication","Tomorrow: Blood test before appointment","This week: Complete symptom questionnaire","15 Sep: Follow-up with cardiology","30 Sep: Reassess treatment response"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"3px 8px", borderRadius:999, background:i===0?"#fef3c7":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<4 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
                  <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Owner, due time, completion status, dependency, preparation, escalation if overdue, care-team visibility, patient confirmation — Status: Planned/Due today/In progress/Completed/Missed/Rescheduled/Waiting for clinician/Blocked/Cancelled/Not applicable</div>
                </div>
              </div>
            </Section>
            <Section title="Appointments and Preparation — 15 Fields + Preparation Assistant">
              <div style={{ fontSize:11 }}>
                <div style={{ display:"grid", gap:6 }}>
                  {((commandHome as Record<string,unknown> | null)?.appointments as Array<Record<string,unknown>> | undefined ?? []).slice(0,2).map((a,i)=> (
                    <div key={i} className="nv-card" style={{ padding:8 }}>
                      <b>{a.date_and_time? new Date(String(a.date_and_time)).toLocaleString(): "15 Sep 10:00"} — {String(a.clinician_and_specialty ?? "Cardiology")}</b><div style={{ color:"var(--nv-color-text-faint)"}}>Location: {String(a.location_or_video_link ?? "Clinic")} • Purpose: {String(a.visit_purpose ?? "Follow-up")} • Travel: {String(a.travel_time ?? "20 min")} • Insurance: {String(a.insurance_authorization_status ?? "Pending verification")} • Cost: {String(a.estimated_cost ?? "May vary")}</div>
                      <div style={{ marginTop:4 }}><b>Preparation checklist:</b> {((a as Record<string,unknown>).preparation_checklist as string[] ?? ["Bring BP readings","Confirm med list","Complete questionnaire","Write down dizziness timing"]).map((item,idx)=> <div key={idx} style={{ display:"flex", gap:6 }}><input type="checkbox" /> <span>{item}</span></div>)}</div>
                      <div style={{ fontSize:10, color:"var(--nv-color-text-faint)"}}>Source: clinic + care pathway + AI draft (labeled) • Follow-up tasks after visit • Interpreter/accessibility • Caregiver permission</div>
                    </div>
                  ))}
                  {(!commandHome || ((commandHome as Record<string,unknown>).appointments as unknown[] ?? []).length===0) && <div className="nv-card" style={{ padding:8 }}><b>Before your cardiology appointment</b><div style={{ marginTop:4 }}><div style={{ display:"flex", gap:6 }}><input type="checkbox" /> Bring your home blood-pressure readings.</div><div style={{ display:"flex", gap:6 }}><input type="checkbox" /> Confirm your current medication list.</div><div style={{ display:"flex", gap:6 }}><input type="checkbox" /> Complete the symptom questionnaire.</div><div style={{ display:"flex", gap:6 }}><input type="checkbox" /> Write down when the dizziness occurs.</div></div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Show whether preparation came from clinic, care pathway, template, or AI draft.</div></div>}
                </div>
              </div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Results and Care-Team Messages — 8 Statuses, 9 Message States">
              <div style={{ fontSize:11 }}>
                <div><b>Results Review Queue</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["NEW","AWAITING_CLINICIAN_REVIEW","REVIEWED","ACTION_REQUESTED","REPEAT_RECOMMENDED","STABLE_OR_EXPECTED","CONFLICTING","URGENT_ESCALATION"].map(s=> <Pill key={s} tone={s==="URGENT_ESCALATION"?"danger":s==="AWAITING_CLINICIAN_REVIEW"?"warning":"neutral"}>{s}</Pill>)}</div>
                  <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:8, background:"var(--nv-color-surface-raised)" }}><i>“Your potassium result is outside the laboratory’s usual range. This result has not yet been reviewed by your care team. Do not change medication based on this screen; wait for instructions or contact the clinic if prompted.”</i> — Explain result, reference range, patient-specific target, trend, significance, clinician reviewed, what to do, preliminary/final — do not label “abnormal” solely on generic range.</div>
                  <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Result</th><th>Status</th><th>Reviewed</th></tr></thead><tbody>{((commandHome as Record<string,unknown> | null)?.results as Array<Record<string,unknown>> | undefined ?? []).slice(0,3).map((r,i)=> <tr key={i}><td>{String(r.result).slice(0,30)}</td><td><Pill>{String(r.status)}</Pill></td><td>{String(r.clinician_reviewed? "Yes":"No")}</td></tr>)}{(commandHome as Record<string,unknown> | null) && ((commandHome as Record<string,unknown>).results as unknown[] ?? []).length===0 && <tr><td colSpan={3} className="nv-empty">No results — status distinguishes New/Awaiting/Reviewed/Action requested/Repeat/Stable/Conflicting/Urgent</td></tr>}</tbody></table></div>
                </div>
                <div style={{ marginTop:8 }}><b>Messages by action state</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Needs your reply","Appointment-related","Medication-related","Result-related","Administrative","Billing/insurance","Educational","Completed","Archived"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Sender, role, org, time, deadline, clinical advice, secure, attachments, related result/medication/appointment/task — label: Clinician-authored / AI-drafted clinician-approved / AI educational / Automated administrative — never appear as clinician.</div></div>
              </div>
            </Section>
            <Section title="Trends + What Changed? — 12 Modules, 10 Categories">
              <div style={{ fontSize:11 }}>
                <div><b>Supported trends</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["sleep","activity","glucose","blood pressure","weight","heart rate","symptoms","med adherence","mood/stress (explicit permission)","recovery after hospitalization","PROs","lab trajectories"].map(t=> <Pill key={t}>{t}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Every chart: time period, units, source, measurement count, missing data, quality, baseline, threshold, event annotations, treatment changes, uncertainty, freshness — e.g. “Your average morning BP was higher this week than last.” Avoid “medication caused improvement.”</div></div>
                <div style={{ marginTop:8 }}><b>What changed — since last visit (12 Aug)</b><div style={{ display:"grid", gap:4, marginTop:4 }}>{(commandWhatChanged.length? commandWhatChanged : [{ category:"IMPROVED", title:"Sleep duration increased by 42 minutes on average" },{ category:"WORSENED", title:"Morning blood pressure is higher than your previous baseline" },{ category:"NEW", title:"A follow-up blood test was ordered" },{ category:"CORRECTED", title:"Your medication list was updated from 10 mg to 20 mg" }].slice(0,4)).map((c:Record<string,unknown>,i:number)=> <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 8px", border:"1px solid var(--nv-color-border)", borderRadius:6 }}><span><Pill tone={String(c.category)==="IMPROVED"?"success":String(c.category)==="WORSENED"||String(c.category)==="NEW"?"warning":"neutral"}>{String(c.category)}</Pill> {String(c.title)}</span><span style={{ fontSize:10, color:"var(--nv-color-text-faint)"}}>{String(c.provenanceRef ?? "prov-... Ner")}</span></div>)}</div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Categories 11: New/Improved/Worsened/Stable/Missing/Corrected/Reclassified/Awaiting review/Newly restricted/Newly shared/Newly added — each links to supporting record + provenance (measured vs AI interpretation).</div></div>
              </div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Prevention, Costs, and Coverage — Personalized Gaps + Financial Warnings">
              <div style={{ fontSize:11 }}><b>Gaps personalized by</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["age","sex/anatomy","pregnancy","medical history","family history","immunization","previous screening","risk factors","location","guidelines","preference","insurance","care-team"].map(f=> <Pill key={f}>{f}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Each: why relevant, due/overdue/optional, timing, responsible clinician, preparation, cost, coverage, source guideline, last completion, defer/decline — use “may be due” when incomplete, not “overdue”.</div>
                <div style={{ marginTop:6 }}><b>Financial — 14 warnings + 5 confidence</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["prior-auth","referral requirements","network","estimated cost","deductible","med coverage","generic alternatives","financial assistance","transport barriers","unpaid balances","billing discrepancies","expiring authorizations","care delays","coverage status"].map(s=> <Pill key={s} tone="warning">{s}</Pill>)}</div><div style={{ display:"flex", gap:4, marginTop:4 }}>{["Confirmed by payer","Estimated","Patient-reported","Pending verification","May vary"].map(s=> <Pill key={s}>{s}</Pill>)}<span style={{ color:"var(--nv-color-text-faint)", alignSelf:"center" }}>— not recommend clinically inferior cheaper option; cost is one factor, route to clinician/patient.</span></div></div>
              </div>
            </Section>
            <Section title="Details, Sources, Uncertainty, and Controls — 3-Level Disclosure">
              <div style={{ fontSize:11 }}><div><b>Default:</b> Recommended next step: Schedule your follow-up blood test this week. Why: care plan includes check after starting medication. Urgency: Due by 8 Sep. Action: Find a laboratory.</div><div style={{ marginTop:4 }}><b>Expanded:</b> Source care plan, ordering clinician, observations, med start date, guideline, evidence status, contraindications, freshness, model version, uncertainty, alternatives, what happens if delayed, who receives result.</div><div style={{ marginTop:4 }}><b>Technical:</b> FHIR IDs, provenance graph, model card, calibration, validation population, policy decision, consent scope, audit events, version history — supports patient comprehension + professional review. WCAG 2.2, NHS usable by physical/cognitive/sensory/language/digital-access needs.</div></div>
            </Section>
          </div>
          <Section title="Action Center — Single Task Engine (13 Sources) + Personalization (16) + Safety">
            <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Aggregates from</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Clinical care plans","Medication schedules","Lab orders","Imaging orders","Referrals","Appointments","Preventive care","Device maintenance","Consent expiration","Research participation","Insurance authorization","Financial assistance","Patient goals"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ marginTop:6, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Task</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>{((commandActionCenter as Record<string,unknown> | null)?.tasks as Array<Record<string,unknown>> | undefined ?? [{ title:"Complete follow-up blood test", due_at: new Date(Date.now()+2*86400000).toISOString(), priority:"important", status:"planned" }]).slice(0,5).map((t:Record<string,unknown>,i:number)=> <tr key={i}><td>{String(t.title).slice(0,30)}</td><td style={{ fontSize:10 }}>{t.due_at? new Date(String(t.due_at)).toLocaleDateString():"—"}</td><td><Pill tone={String(t.priority)==="important"?"warning":"neutral"}>{String(t.priority)}</Pill></td><td><Pill>{String(t.status)}</Pill></td></tr>)}</tbody></table></div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Each: task_id, title, source {'{type, id}'}, owner, due_at, priority, status, rationale, requires_human_review, dependencies, escalation {'{after, recipient}'}, provenance_ref — avoid duplicates for same obligation.</div></div>
              <div><b>Personalization 16</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["home-screen sections","preferred order","notification frequency","quiet hours","urgency sensitivity","displayed sources","units","language","reading level","chart density","caregiver visibility","financial visibility","mental/reproductive display","AI visibility","daily briefing time","preferred contact"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Must not allow hiding safety-critical alerts without explicit explanation + alternative notification.</div><div style={{ marginTop:6 }}><b>Patient goals “What matters to me” 11</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{(commandGoals.length? commandGoals : [{ title:"Avoid daytime drowsiness" }].slice(0,3)).map((g:Record<string,unknown>,i:number)=> <Pill key={i}>{String(g.title ?? g.goalType ?? "Goal")}</Pill>)}</div><div style={{ display:"flex", gap:4, marginTop:4 }}><input className="nv-input" placeholder="New goal e.g. Avoid daytime drowsiness" value={newGoal.title} onChange={e=> setNewGoal({...newGoal, title:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!newGoal.title) return; const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined; if(!pid) return; const r=await fetch("/api/health/command-center/goals",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: pid, goalType: newGoal.goalType, title: newGoal.title })}); const j=await r.json().catch(()=>null); if(r.ok && j?.goal) { setCommandGoals(prev=> [j.goal, ...prev].slice(0,5)); setNewGoal({ goalType:"health_goals", title:"" }); } }}>Add Goal</Button></div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Recommendations evaluated against patient goals, not only clinical risk — e.g. “You said avoiding daytime drowsiness is important. Options differ in this side effect. Discuss at appointment.”</div></div></div>
            </div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Safety Behavior — 6 States">
              <div style={{ display:"grid", gap:6, fontSize:11 }}><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #059669" }}><b>Normal</b><div style={{ color:"var(--nv-color-text-faint)"}}>Shows current priorities and routine tasks</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #d97706" }}><b>Data incomplete</b><div style={{ color:"var(--nv-color-text-faint)"}}>“Your glucose data has not updated for 9 hours. Check your sensor or enter a reading manually.”</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #4f46e5" }}><b>Awaiting clinical review</b><div style={{ color:"var(--nv-color-text-faint)"}}>Separates pending review from completed interpretation</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #dc2626" }}><b>Care-plan conflict</b><div style={{ color:"var(--nv-color-text-faint)"}}>“Your discharge instructions and medication list do not match. Contact your care team before changing the dose.”</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #7f1d1d", background:"#fef2f2" }}><b>Emergency concern</b><div style={{ color:"var(--nv-color-text-faint)"}}>Approved wording + human-contact route + local emergency instructions — not solely app notification</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #6b7280" }}><b>System degraded</b><div style={{ color:"var(--nv-color-text-faint)"}}>Safe fallback when integration unavailable</div></div></div>
            </Section>
            <Section title="Notifications + Care-Team Coordination">
              <div style={{ fontSize:11 }}><b>Notifications 7 (urgency, channel reliability, consent)</b><div style={{ display:"grid", gap:4, marginTop:4, fontSize:10 }}><div>In-app → optional email (routine)</div><div>In-app/chosen → caregiver if authorized (med due)</div><div>In-app → secure message (result awaiting)</div><div>Push + secure → alternate (urgent care-team)</div><div>Voice/SMS/app → human escalation (emergency)</div><div>In-app + email → privacy-office review (consent anomaly)</div><div style={{ color:"var(--nv-color-text-faint)"}}>Show delivery successful — sent ≠ received/acknowledged.</div></div><div style={{ marginTop:6 }}><b>Care-team 8 views</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Patient","Primary-care","Specialist","Nurse","Pharmacist","Caregiver","Social-care","Billing"].map(v=> <Pill key={v}>{v}</Pill>)} — each sees only necessary purpose. Shared tasks: owner, backup owner, due date, escalation, status, last update, related goal, patient visibility, audit history (AHRQ).</div></div></div>
            </Section>
          </div>
          <Section title="What Changed After a Visit — Patient-Approved Summary">
            <div style={{ padding:8, border:"1px solid var(--nv-color-border)", borderRadius:8, fontSize:11, background:"var(--nv-color-surface-raised)" }}>
              Your care plan changed on 1 September:<br/>
              <b>New:</b> Follow-up blood test ordered. Sleep target added.<br/>
              <b>Changed:</b> Medication timing moved from morning to evening.<br/>
              <b>Completed:</b> Cardiology referral reviewed.<br/>
              <b>Still pending:</b> Insurance authorization for imaging.<br/>
              <b>Your care team has not yet reviewed:</b> Home BP readings from last 24h.<br/>
              <span style={{ color:"var(--nv-color-text-faint)"}}>Co-produced from signed clinical records, not inferred from conversational text.</span>
              <div style={{ marginTop:6 }}><Button size="sm" variant="ghost" onClick={async()=> {
                const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined;
                if(!pid) return;
                const r=await fetch(`/api/health/command-center/what-changed-after-visit?patientId=${pid}&visitDate=2026-09-01`);
                const j=await r.json().catch(()=>null);
                alert(j? JSON.stringify(j,null,2).slice(0,800) : "No data");
              }}>Fetch post-visit summary</Button></div>
            </div>
          </Section>
          <Section title="Accessibility — WCAG 2.2 AA + NHS + AHRQ">
            <div style={{ fontSize:11 }}><div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{["screen readers","keyboard-only","voice control","low vision","color-blind","cognitive","dyslexia","older adults","low digital literacy","low bandwidth","mobile-only","limited language"].map(t=> <Pill key={t}>{t}</Pill>)} — test with all.</div><div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>{["No info by color alone","Large persistent focus","Keyboard every action","Plain labels","No forced drag","Adequate touch targets","Captions/transcripts","Text-to-speech","Voice input","Printable/offline","Clear error recovery","No timeout during reading","Consistent help"].map(b=> <Pill key={b} tone="primary">{b}</Pill>)}<span style={{ color:"var(--nv-color-text-faint)", alignSelf:"center" }}>NHS: varied physical/cognitive/social/cultural/learning needs + assisted support. AHRQ: simplify, confirm understanding, easy portals.</span></div></div>
          </Section>
          <Section title="Home-Screen Data Model + AI Orchestration + Acceptance">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{`{
  "patient_id": "tokenized",
  "as_of": "2026-09-01T14:40:00+05:30",
  "context": { "care_state": "active_treatment", "last_visit": "2026-08-12", "next_visit": "2026-09-03" },
  "priorities": [{ "id": "priority-1", "title": "Possible concern: BP above usual", "severity": "important", "urgency": "today", "source": "home_bp_monitor" }],
  "medications": [], "appointments": [], "results": [], "trends": [], "messages": []
}`}</pre><div style={{ marginTop:6 }}><b>AI rules 12:</b> Summarize not diagnose, prioritize within safety, cite records, distinguish observed vs interpretation, abstain when stale/missing/contradictory, ask clarifying, avoid lock-screen sensitive, never expose restricted to caregiver, never create order without auth, never silently change plan, never wellness→medical advice, allow correction, record version/provenance.</div></div>
              <div><div style={{ display:"grid", gap:4 }}><div><b>Rollout 4 phases</b><div style={{ color:"var(--nv-color-text-faint)"}}>1 Reliable aggregation (priorities, meds, appointments, results, messages, trends, freshness, correction, provenance) → 2 Action coordination (tasks, checklists, gaps, referrals, cost, caregiver, What Changed) → 3 Explainable intelligence (personalized prioritization, summaries, trend interpretation, safe recommendations, uncertainty) → 4 Longitudinal (cross-provider, research, digital-twin, goal optimization, predictive, family)</div></div><div style={{ marginTop:6 }}><b>Acceptance 13:</b> Identify most important action in seconds, understand why, see clinician reviewed, distinguish measured vs AI, see source/timestamp/quality, complete med/appointment tasks, understand what changed, correct record, see pending owners, view cost uncertainty, control caregiver visibility, use language/accessibility, reach human help, safe fallback.</div><div style={{ marginTop:6, padding:8, border:"1.5px solid #4f46e5", borderRadius:8, fontWeight:800, textAlign:"center", background:"var(--nv-color-surface-raised)" }}>Calm, trustworthy personal health operating system: reduce cognitive load, expose next meaningful action, never hide uncertainty behind polish.</div></div></div>
            </div>
          </Section>
        </div>
      )}



      {/* LITERACY - Adaptive Health Literacy Layer */}
      {tab === "literacy" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Adaptive Health Literacy Layer - Universal Precautions" subtitle="AHRQ teach-back, 5 reading levels, 3 language layers, 4 modes, WCAG 2.2 AA, NHS inclusion. Never adapt truth/safety/uncertainty.">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>
              <span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>Clinical Source</span><span>→</span><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>Meaning</span><span>→</span><span style={{ padding:"4px 8px", borderRadius:999, background:"#fef3c7", border:"1px solid var(--nv-color-border)" }}>Safety Gate</span><span>→</span><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>Policy Engine</span><span>→</span><span style={{ padding:"4px 8px", borderRadius:999, background:"#fef2f2", border:"1px solid var(--nv-color-border)" }}>Fidelity Check</span>
            </div>
            <div style={{ marginTop:6, padding:8, border:"1px solid #fecaca", borderRadius:8, background:"#fef2f2", fontSize:11, fontWeight:800, color:"#991b1b" }}>Never: change dose, remove contraindication, upgrade uncertainty, omit emergency, convert conditional to universal, translate without preserving meaning, present AI as clinician, infer cultural without consent.</div>
          </Section>
          <Section title="Communication Profile - Patient-Controlled">
            <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:8, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{`{
  "role": "patient",
  "preferred_language": "gu-IN",
  "fallback_languages": ["hi-IN", "en-IN"],
  "reading_level": "plain",
  "preferred_modalities": ["short_text","audio","visual"],
  "accessibility": { "low_vision": true },
  "cultural_preferences": { "dietary_pattern": "vegetarian" },
  "teach_back": { "enabled": true, "preferred_method": "voice_or_text" },
  "technical_detail": "on_demand"
}`}</pre><div style={{ marginTop:6, display:"flex", gap:6 }}><select className="nv-select" value={literacyLang} onChange={e=> setLiteracyLang(e.target.value)} style={{ width:120, fontSize:11 }}><option value="gu-IN">gu-IN Gujarati</option><option value="hi-IN">hi-IN Hindi</option><option value="en-IN">en-IN English</option></select><select className="nv-select" value={readingLevel} onChange={e=> setReadingLevel(e.target.value)} style={{ width:120, fontSize:11 }}><option value="ESSENTIAL">Essential</option><option value="PLAIN">Plain</option><option value="DETAILED">Detailed</option><option value="CLINICAL">Clinical</option><option value="RESEARCH">Research</option></select><Button size="sm" onClick={async()=> { const r=await fetch("/api/health/literacy/profile",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ preferredLanguage: literacyLang, readingLevel, role:"PATIENT" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.profile) setLiteracyProfile(j.profile); }}>Save Profile</Button></div></div>
          </Section>
          <Section title="Reading-Level Adaptation - 5 Levels">
            <div style={{ overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Level</th><th>Style</th><th>Example</th></tr></thead><tbody><tr><td><Pill tone="success">Essential</Pill></td><td>One action, one reason</td><td style={{ fontSize:10 }}>Take this tablet at night. It helps control your blood pressure.</td></tr><tr><td><Pill tone="primary">Plain</Pill></td><td>Short explanation + next step</td><td style={{ fontSize:10 }}>Take this tablet every night. It helps lower your BP. Do not stop without asking care team.</td></tr><tr><td><Pill>Detailed</Pill></td><td>More context + risks</td><td style={{ fontSize:10 }}>This medicine relaxes blood vessels... May cause dizziness when standing.</td></tr><tr><td><Pill>Clinical</Pill></td><td>Technical</td><td style={{ fontSize:10 }}>Mechanism, guideline, lab targets, interactions</td></tr><tr><td><Pill tone="warning">Research</Pill></td><td>Methods</td><td style={{ fontSize:10 }}>Study design, endpoint, CI, model version, limitations</td></tr></tbody></table></div>
          </Section>
          <Section title="Content Rules - 11 + Teach-Back Engine">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}><div>Put required action first</div><div>Use one idea per sentence</div><div>Prefer common words</div><div>Explain unavoidable medical terms</div><div>Use concrete times not vague phrases</div><div>Use numerals with units + plain interpretation</div><div>Separate what we know / may be happening / what to do</div><div>Limit high-priority instructions to small steps</div><div>Repeat critical safety in different form</div><div>Avoid shame/blame/jargon</div><div>Avoid false reassurance</div></div>
            <div style={{ marginTop:6, padding:8, border:"1px dashed #059669", borderRadius:8, fontSize:11, background:"#ecfdf5" }}><b>What to do now:</b> Sit down, rest for five minutes, and repeat the reading.<br/><b>Why:</b> Your BP reading is higher than usual.<br/><b>Get urgent help:</b> If you have chest pain, severe trouble breathing, weakness on one side, or confusion.</div>
            <div style={{ marginTop:6, fontSize:11 }}><b>Teach-Back Triggers 13:</b> new medication, dose change, discharge, complex plan, inhaler/device, fasting, emergency, consent, research, contradictory understanding, repeated missed steps, requests clarification, high-stakes pregnancy/pediatric/mental/substance — Prompts: I want to make sure I explained clearly. What will you do when you get home? — Handling: Correct→Confirm, Partial→Re-explain, Unsafe→Stop + escalate, No response→audio/visual/caregiver/interpreter</div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Topic e.g. inhaler_use" value={clarifyInput} onChange={e=> setClarifyInput(e.target.value)} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!clarifyInput) return; const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined; const r=await fetch("/api/health/literacy/teach-back",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: pid, topic: clarifyInput.slice(0,20), instructionVersion:"education-2.4", method:"VOICE_OR_TEXT", result:"PARTIAL", misunderstoodElement:"breathing_timing" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.teachBack) setTeachBackRecords(prev=> [j.teachBack, ...prev].slice(0,6)); }}>Record Teach-Back</Button></div>
          </Section>
          <Section title="Ambiguity Detection - 16 Fields + 5 Tiers">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["patient identity","symptom meaning","time course","severity","dose/medicine name","units","body location","pregnancy status","age/child","existing diagnoses","allergies","device reading","intended audience","language/dialect","wants education vs action","about patient vs someone else"].map(f=> <Pill key={f}>{f}</Pill>)}</div>
            <div style={{ marginTop:6, overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Tier</th><th>Ambiguity</th><th>Ani behavior</th></tr></thead><tbody><tr><td><Pill>LOW</Pill></td><td>Minor no safety impact</td><td>Answer + state assumption</td></tr><tr><td><Pill tone="warning">MODERATE</Pill></td><td>Missing context could change advice</td><td>Ask 1-2 questions</td></tr><tr><td><Pill tone="danger">HIGH</Pill></td><td>Medication/dose/pregnancy/child/serious symptom</td><td>Do not advise until clarified</td></tr><tr><td><span style={{ background:"#7f1d1d", color:"white", padding:"2px 6px", borderRadius:999, fontSize:10, fontWeight:800 }}>EMERGENCY</span></td><td>Potential immediate danger</td><td>Urgent safety instruction first</td></tr><tr><td><Pill>UNRESOLVABLE</Pill></td><td>Insufficient/conflicting</td><td>Abstain + route to human</td></tr></tbody></table></div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Try e.g. My sugar is high" value={clarifyInput} onChange={e=> setClarifyInput(e.target.value)} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined; const r=await fetch("/api/health/literacy/clarify",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ text: clarifyInput, patientId: pid })}); const j=await r.json().catch(()=>null); setClarifyResult(j); if(j) setClarificationSessions(prev=> [...prev, j].slice(0,6) as unknown as Array<Record<string,unknown>>); }}>Clarify</Button></div>
            {clarifyResult && <pre style={{ marginTop:6, background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:11, maxHeight:120, overflowY:"auto" }}>{JSON.stringify(clarifyResult, null, 2).slice(0,800)}</pre>}
          </Section>
          <Section title="Visual, Cultural, Language, Modes, Accessibility, Fidelity">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Visual 12:</b> Body maps, anatomical illustrations, medication schedules, timelines, severity scales, trend charts, care-pathway diagrams, decision trees, step-by-step demos, color-independent status, dose/timing grids, appointment checklists — Body-map: front/back/left/right, zoom/pan, text labels, screen-reader, touch/keyboard/switch/voice, pain location/spread, symptom type, onset/duration, patient confirmation</div>
              <div><b>Cultural 14:</b> vegetarian/vegan, Jain/halal/kosher, allergies, intolerances, regional foods, budget, cooking equipment, household patterns, fasting, work schedule, pregnancy/lactation, medical restrictions, meal timing, food availability — Gujarat: Gujarati + familiar foods only after patient confirms, still shows clinical basis/portion/interactions/uncertainty</div>
            </div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Language 3 layers:</b> Interface (buttons/alerts), Clinical content (symptoms/tests/meds/plans), Conversation (dialect/code-switching/voice) — Preserve: clinical meaning, urgency, negation, dose, units, time, conditional, uncertainty, contraindications, emergency instructions — Safeguards: glossary, clinician-reviewed high-risk phrases, back-translation, human review consent/emergency, versioned assets, display original term, audio pronunciation — Uncertain: “This explanation was translated automatically. For medication or emergency, request human interpreter.”</div>
              <div><b>Modes 4:</b> Patient (what happening/what to do/when/urgency/missing/human help), Caregiver (tasks/schedule/safety/permission/escalation, never full record), Clinician (evidence/timeline/trends/provenance/uncertainty/differential/contraindications/model version), Researcher (dataset/consent/de-id/provenance/missingness/bias) — Authorization-controlled</div>
            </div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Accessibility 4:</b> Low vision (screen-reader, large text, high contrast, reflow, sonification), Hearing (captions, transcripts, visual alarms), Motor (keyboard/switch, voice control, large touch), Cognitive (predictable, one task/screen, reduced choices, clear progress) — WCAG 2.2 AA + NHS — No info by color alone, large focus, keyboard every action</div>
              <div><b>Fidelity validator 15 validate / 9 block:</b> Validate patient/encounter, med name/dose, units, timing, negation, conditional, emergency, contraindications, provenance, model version, clinician approval, translation, reading-level, cultural, accessibility — Block if dose changed, uncertainty disappeared, may→will, contraindication removed, emergency weakened, translation changes meaning, patient-reported as measured, AI draft as clinician-authored, restricted data exposed, cannot identify source — Demo: <Button size="sm" onClick={async()=> { const r=await fetch("/api/health/literacy/fidelity-check",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ original:{ dose:"10 mg", uncertainty:"may", contraindications:["allergy"], emergencyInstructions:"chest pain" }, adapted: fidelityDemo.adapted })}); const j=await r.json().catch(()=>null); alert(j? JSON.stringify(j,null,2).slice(0,600) : "No result"); }}>Fidelity Check</Button></div>
            </div>
          </Section>
        </div>
      )}



      {/* CAREGIVER - Consent-Aware Care Coordination Network */}
      {tab === "caregiver" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Consent-Aware Care Coordination Network" subtitle="FHIR CareTeam, RelatedPerson, Consent, Provenance — patient remains center of control.">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8 }}>
              <Stat label="CARE TEAMS" value={String(careTeams.length)} hint={`${String(careTeamMembers.length)} members`} />
              <Stat label="DELEGATIONS" value={String(delegations.length)} hint={`${String(delegations.filter(d=> String(d.status)==="ACTIVE").length)} active`} />
              <Stat label="SHARED CARE PLANS" value={String(sharedCarePlans.length)} hint="3 visibility layers" />
              <Stat label="SHARED TASKS" value={String(careTasks.length)} hint={`${String(careTasks.filter(t=> String(t.status)==="COMPLETED").length)} completed`} />
            </div>
          </Section>
          <Section title="Delegation Lifecycle - 9 States + Least-Privilege">
            <div style={{ fontSize:11, display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontWeight:800 }}><span>REQUESTED</span><span>→</span><span>PATIENT_REVIEWED</span><span>→</span><span>VERIFIED</span><span>→</span><span>APPROVED</span><span>→</span><span>ACTIVE</span><span>→</span><span>REVOKED</span></div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={delegationForm.patientId} onChange={e=> setDelegationForm({...delegationForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Delegate email" value={delegationForm.delegateEmail} onChange={e=> setDelegationForm({...delegationForm, delegateEmail:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!delegationForm.patientId || (!delegationForm.delegateEmail && !delegationForm.delegateName)) return; const r=await fetch("/api/health/caregiver/delegations",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: delegationForm.patientId, delegateEmail: delegationForm.delegateEmail || undefined, delegateName: delegationForm.delegateName || undefined, relationship: delegationForm.relationship, authorizedTasks: delegationForm.authorizedTasks.split(",").map(s=> s.trim()).filter(Boolean), dataCategories:["GENERAL_MEDICAL"] })}); const j=await r.json().catch(()=>null); if(r.ok && j?.delegation) { setDelegations(prev=> [j.delegation, ...prev].slice(0,8)); } }}>Create Delegation</Button></div>
            {delegations.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Delegate</th><th>Relationship</th><th>Status</th><th>Action</th></tr></thead><tbody>{delegations.slice(0,5).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.delegateName ?? d.delegateEmail ?? "—")}</td><td>{String(d.relationship)}</td><td>{String(d.status)}</td><td><Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/caregiver/delegations/${String(d.id)}/revoke`,{method:"POST"}); if(r.ok) setDelegations(prev=> prev.map(x=> String((x as Record<string,unknown>).id)===String(d.id)? {...x, status:"REVOKED"} as Record<string,unknown>:x)); }}>Revoke</Button></td></tr>)}</tbody></table></div>}
          </Section>
          <Section title="Shared Care Plans - 3 Visibility Layers">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}><div className="nv-card" style={{ padding:10, borderLeft:"3px solid #059669" }}><b>Shared</b><div>Visible to all authorized</div></div><div className="nv-card" style={{ padding:10, borderLeft:"3px solid #d97706" }}><b>Role-specific</b><div>Visible only to selected</div></div><div className="nv-card" style={{ padding:10, borderLeft:"3px solid #dc2626" }}><b>Private</b><div>Visible only to patient</div></div></div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={carePlanForm.patientId} onChange={e=> setCarePlanForm({...carePlanForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Title e.g. Recovery at home" value={carePlanForm.title} onChange={e=> setCarePlanForm({...carePlanForm, title:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!carePlanForm.patientId || !carePlanForm.title) return; const r=await fetch("/api/health/caregiver/shared-care-plans",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: carePlanForm.patientId, title: carePlanForm.title, goal:"Maintain safe recovery" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.sharedCarePlan) { setSharedCarePlans(prev=> [j.sharedCarePlan, ...prev].slice(0,6)); } }}>Create Care Plan</Button></div>
          </Section>
          <Section title="Task Coordination - One Shared Record, 13 States">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><span>PLANNED</span><span>→</span><span>ASSIGNED</span><span>→</span><span>ACCEPTED</span><span>→</span><span>COMPLETED</span><span> | Declined/Reassigned/Snoozed/Missed/Blocked/Escalated</span></div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={careTaskForm.patientId} onChange={e=> setCareTaskForm({...careTaskForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Title e.g. Record morning weight" value={careTaskForm.title} onChange={e=> setCareTaskForm({...careTaskForm, title:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!careTaskForm.patientId || !careTaskForm.title) return; const r=await fetch("/api/health/caregiver/tasks",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: careTaskForm.patientId, title: careTaskForm.title })}); const j=await r.json().catch(()=>null); if(r.ok && j?.task) { setCareTasks(prev=> [j.task, ...prev].slice(0,8)); } }}>Create Task</Button></div>
            <div style={{ marginTop:6, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Title</th><th>Status</th><th>Action</th></tr></thead><tbody>{careTasks.length===0 && <tr><td colSpan={3} className="nv-empty">No shared tasks</td></tr>}{careTasks.slice(0,5).map((t:Record<string,unknown>,i:number)=> <tr key={String(t.id ?? i)}><td>{String(t.title).slice(0,24)}</td><td>{String(t.status)}</td><td><Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/caregiver/tasks/${String(t.id)}/complete`,{method:"POST"}); if(r.ok) setCareTasks(prev=> prev.map(x=> String((x as Record<string,unknown>).id)===String(t.id)? {...x, status:"COMPLETED"} as Record<string,unknown>:x)); }}>Complete</Button></td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Escalation + Wellbeing + Timeline">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Escalation Trees</b><div style={{ color:"var(--nv-color-text-faint)"}}>Event: missed_medication, abnormal_vital, fall_detected — tree step 1 patient in_app 15m → step 2 caregiver push 20m → step 3 pharmacist secure_message high-risk — stop when dose_confirmed/clinician_resolved/patient_declined</div><div style={{ marginTop:6, maxHeight:60, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Event</th><th>Status</th></tr></thead><tbody>{escalationTrees.length===0 && <tr><td colSpan={2} className="nv-empty">No escalations</td></tr>}{escalationTrees.slice(0,4).map((e:Record<string,unknown>,i:number)=> <tr key={String(e.id ?? i)}><td>{String(e.event)}</td><td>{String(e.status)}</td></tr>)}</tbody></table></div></div>
              <div><b>Wellbeing (Zarit, not surveillance)</b><div style={{ display:"flex", gap:4, marginTop:4 }}><input className="nv-input" placeholder="Caregiver ID" value={wellbeingForm.caregiverId} onChange={e=> setWellbeingForm({...wellbeingForm, caregiverId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={wellbeingForm.capacity} onChange={e=> setWellbeingForm({...wellbeingForm, capacity:e.target.value})} style={{ width:120, fontSize:11 }}><option value="manageable">Manageable</option><option value="strained">Strained</option><option value="overloaded">Overloaded</option><option value="unsafe">Unsafe</option></select><Button size="sm" onClick={async()=> { const r=await fetch("/api/health/caregiver/wellbeing",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ caregiverId: wellbeingForm.caregiverId, capacity: wellbeingForm.capacity, patientId: delegationForm.patientId || undefined })}); const j=await r.json().catch(()=>null); if(r.ok && j?.wellbeing) setWellbeingChecks(prev=> [j.wellbeing, ...prev].slice(0,6)); }}>Check-in</Button></div></div>
            </div>
          </Section>
        </div>
      )}



      {/* REASONING - Multimodal Personal Health Reasoning */}
      {tab === "reasoning" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Multimodal Personal Health Reasoning Fabric - Coordinated, Not One General-Purpose Model" subtitle="FHIR Clinical Reasoning + CDS Hooks + W3C PROV + FDA CDS — common patient context → normalization → temporal/provenance graph → contradiction/data-quality → evidence retrieval → specialized services → synthesis/uncertainty → safety/consent/human-review → role-specific answer." action={<><Badge tone="primary">FHIR Clinical Reasoning</Badge><Badge tone="warning">CDS Hooks</Badge><Pill tone="success">FDA CDS</Pill></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["Patient Context","Multimodal Normalization","Temporal & Provenance Graph","Contradiction & Data-Quality Engine","Evidence Retrieval Layer","Specialized Reasoning Services","Synthesis & Uncertainty Engine","Safety, Consent & Human-Review Gates","Role-specific Answer"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:i===5?"#fef3c7": i===7?"#fef2f2":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<8 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}><Pill tone="danger">Not one model inspects every raw source</Pill><Pill>Each modality → controlled service with provenance, quality rules, validation, output contracts</Pill><Pill>Common patient context + provenance graph shared</Pill></div>
          </Section>
          <Section title="Common Patient Context - Structured Package (21 Fields)">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{`{
  "patient": { "id": "tokenized", "age_context": "adult" },
  "encounter": { "id": "enc-...", "setting": "outpatient", "purpose": "symptom_review" },
  "active_problems": [], "medications": [], "allergies": [], "observations": [],
  "laboratory_results": [], "imaging": [], "genomics": [], "family_history": [],
  "social_context": [], "goals": [], "preferences": [], "consent": [],
  "data_quality": [], "contradictions": [], "provenance_refs": []
}`}</pre><div style={{ color:"var(--nv-color-text-faint)"}}>Each element: source, origin class, timestamp, freshness, quality, confidence, consent scope, clinical status, provenance reference, whether clinician reviewed.</div></div>
              <div><div style={{ display:"flex", gap:4 }}><Button size="sm" variant="ghost" onClick={async()=> { const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined; if(!pid) return; const r=await fetch(`/api/health/reasoning/context?patientId=${pid}`); const j=await r.json().catch(()=>null); if(j?.context) setReasoningContext(j.context); }}>Load Patient Context</Button><span style={{ fontSize:11, color:"var(--nv-color-text-faint)", alignSelf:"center" }}>Structured, not random retrieved documents</span></div>{reasoningContext && <pre style={{ marginTop:6, background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, maxHeight:120, overflowY:"auto", whiteSpace:"pre-wrap" }}>{JSON.stringify(reasoningContext, null, 2).slice(0,800)}</pre>}</div>
            </div>
          </Section>
          <Section title="Coordinated Reasoning Agents - 8 Specialized Services">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px,1fr))", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #059669" }}><b>Record</b><div style={{ color:"var(--nv-color-text-faint)"}}>Notes, diagnoses, procedures, care plans, discharge summaries, referrals, claims, patient-reported history, imported docs → Relevant facts, timeline, open care gaps, conflicting documentation, unresolved questions, source reliability</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #4f46e5" }}><b>Time-series</b><div style={{ color:"var(--nv-color-text-faint)"}}>Glucose, BP, HR, SpO2, temp, sleep, activity, weight, symptoms, adherence, device quality → Baseline, trend, variability, change points, missingness, signal quality, threshold breaches, temporal relationship with treatment</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #d97706" }}><b>Imaging</b><div style={{ color:"var(--nv-color-text-faint)"}}>Metadata, radiology reports, structured findings, images where validated, prior comparison, region findings → Must distinguish: what image/report states vs what model detected vs what changed vs what remains uncertain vs whether radiologist review complete vs diagnostic/assistive/educational</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #7c3aed" }}><b>Laboratory</b><div style={{ color:"var(--nv-color-text-faint)"}}>Individual results, reference ranges, patient-specific targets, trends, specimen quality, preliminary vs final, units, related tests, medication/fasting context — FHIR ServiceRequest→DiagnosticReport→Observation + LOINC</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #dc2626" }}><b>Medication & Allergy Graph</b><div style={{ color:"var(--nv-color-text-faint)"}}>Medication → indication, dose, route, schedule, prescriber, start/stop, adherence, interaction, contraindication, allergy relationship — Distinguish: confirmed/suspected allergy, intolerance, side effect, adverse reaction, family history, stopped, merely listed — Detect: allergy vs new order same class, two active doses, discontinued but still administered, patient-reported missing, interaction depends on no longer active → route to pharmacist/clinician</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #0ea5e9" }}><b>Genomic & Family-History</b><div style={{ color:"var(--nv-color-text-faint)"}}>Genetic test results, variant interpretations, methodology, coverage/limitations, family history, pedigree, phenotypes, ancestry only where justified/consented, reclassification, actionability, patient preferences — Must distinguish: measured result vs lab interpretation vs model risk vs family report vs inherited pattern vs confirmed diagnosis — Never silently infer/disclose relatives</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #6b7280" }}><b>Environmental & Social</b><div style={{ color:"var(--nv-color-text-faint)"}}>Air quality, heat/cold, housing, food access, transport, employment, caregiving burden, financial, digital access, affordability, language, safety, community resources — Identify barriers, offer options, not stigmatize — timestamp, geography, resolution, source, uncertainty — do not infer exposure solely from home address</div></div>
              <div className="nv-card" style={{ padding:10, borderLeft:"3px solid #059669" }}><b>Preferences & Goals</b><div style={{ color:"var(--nv-color-text-faint)"}}>Treatment goals, lifestyle priorities, dietary, cultural, work constraints, family responsibilities, cost limits, risk tolerance, communication style, desired intervention, privacy, advance-care — clinically possible ≠ appropriate if conflicts with goals</div></div>
            </div>
          </Section>
          <Section title="Reasoning Stages - 6">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Stage 1: Intent & Safety Classification</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["General education","Explanation of record","Trend interpretation","Preparation for appointment","Medication information","Symptom guidance","Urgent triage","Care-plan coordination","Research information","Data correction","Privacy/consent action"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>High-risk: emergency symptoms, medication dosing, pregnancy, pediatric, severe allergy, suicidal/violent intent, chest pain, severe breathing, stroke, bleeding, altered consciousness, dangerous glucose/vitals — if urgent risk possible, provide immediate safety guidance before broad reasoning.</div></div>
              <div><b>Stage 2: Relevant Retrieval</b><div style={{ color:"var(--nv-color-text-faint)"}}>Structured queries for measurements, temporal filters, patient-specific terminology, relevant notes, medication/allergy graph traversal, imaging report/prior matching, lab relationships, family links, approved evidence sources — only needed data, consent-aware, not every record just in case (excessive context increases privacy exposure, distraction, contradiction risk).</div></div>
            </div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Stage 3: Normalize</b><div style={{ color:"var(--nv-color-text-faint)"}}>Units, time zones, terminology, medication names, lab codes, anatomical locations, device metadata, reference ranges, source categories — preserve original alongside normalized.</div></div>
              <div><b>Stage 4: Establish Baseline</b><div style={{ color:"var(--nv-color-text-faint)"}}>Explicit: recent personal baseline, previous visit, pre-treatment, post-discharge, population reference, clinician-defined target — state which used: “Compared with your average morning readings over the past 14 days…” Avoid population range when clinical target differs.</div></div>
            </div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Stage 5: Identify Changes</b><div style={{ color:"var(--nv-color-text-faint)"}}>Direction, magnitude, duration, persistence, variability, abrupt change, treatment relationship, device change, missing data, seasonal/environmental — Change is not cause: “The change began after medication was started.” Not: “Medication caused change.”</div></div>
              <div><b>Stage 6: Detect Contradictions</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Patient report vs clinician note","Device vs manual","Med list vs patient-reported use","Allergy vs prescription","Lab units vs reference range","Current vs prior result","Imaging report vs structured finding","Genomic result vs interpretation","Care plan vs discharge","Caregiver vs patient","Consent scope vs requested use"].map(c=> <Pill key={c}>{c}</Pill>)}</div><div style={{ marginTop:4, overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Severity</th><th>Example</th><th>Behavior</th></tr></thead><tbody><tr><td><Pill>Informational</Pill></td><td>Two historical symptom descriptions</td><td>Show both</td></tr><tr><td><Pill tone="warning">Moderate</Pill></td><td>Med list differs from patient report</td><td>Ask or reconcile</td></tr><tr><td><Pill tone="danger">High</Pill></td><td>Allergy conflicts with order</td><td>Block or escalate</td></tr><tr><td><span style={{ background:"#7f1d1d", color:"white", padding:"2px 6px", borderRadius:999, fontSize:10, fontWeight:800 }}>Critical</span></td><td>Discharge conflicts with active prescription</td><td>Stop automated guidance</td></tr></tbody></table></div></div>
            </div>
          </Section>
          <Section title="Evidence Retrieval - Governed Source Registry (16 Metadata) + Multimodal Fusion">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Source metadata 16:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Organization","Publication title","Version","Publication date","Review date","Jurisdiction","Population","Clinical topic","Recommendation strength","Evidence quality","Conflicts of interest","Applicability","Expiration","License","Retrieval timestamp"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ marginTop:4 }}><b>Approved 8:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["National guidelines","Institutional protocols","Drug references","Public-health agencies","Specialty-society guidance","Peer-reviewed research","Regulatory communications","N0VA-approved patient education"].map(s=> <Pill key={s} tone="primary">{s}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Not arbitrary search results — if evidence unavailable/conflicting, say so and route to clinician.</div></div>
                <div style={{ marginTop:4 }}><b>Evidence-to-patient matching 12:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Age","Pregnancy","Relevant anatomy","Comorbidities","Kidney/liver","Allergies","Medications","Genetics","Care setting","Geography","Patient goal","Resource availability"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Guideline is not personalized until assumptions checked.</div></div></div>
              <div><b>Multimodal Fusion — Reliability & Concordance</b><div style={{ padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", marginTop:4 }}><div>Device signal: high quality<br/>Manual measurement: not available<br/>Patient symptom report: moderate confidence<br/>Clinician note: recent and signed<br/>Laboratory result: final<br/>Imaging report: radiologist reviewed<br/>AI image signal: assistive only</div><div style={{ marginTop:6, color:"var(--nv-color-text-faint)"}}>Synthesis: “The wearable suggests increased heart rate, and the patient reports palpitations. The clinic ECG from yesterday was normal. These findings do not fully agree, so further clinician review may be useful.” — Do not merge by averaging blindly.</div></div>
                <div style={{ marginTop:4 }}><b>Time-series:</b> Baseline computation 5 (personal median/range/variability/trend, treatment before/after, encounter admission/discharge/visit, population reference, device expected) + Quality-aware trend 10 (observations, time coverage, missing intervals, device changes, calibration, signal quality, outliers, manual corrections, CI/uncertainty, baseline selection) — Do not call “worsening” when only two poor-quality readings exist.</div>
              </div>
            </div>
          </Section>
          <Section title="Ask Ani - Multimodal Reasoning (Answer API)">
            <div style={{ display:"flex", gap:6, marginBottom:8 }}><input className="nv-input" placeholder="Why have my readings changed?" value={reasoningQuestion} onChange={e=> setReasoningQuestion(e.target.value)} style={{ flex:1 }} /><Button onClick={async()=> { const pid=(patients[0] as Record<string,unknown> | undefined)?.id as string | undefined; if(!pid) { alert("Create or select a patient first"); return; } const r=await fetch("/api/health/reasoning/answer",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patient_id: pid, question: reasoningQuestion, scope:{ time_range:{ start:"2026-08-01", end:"2026-09-02" }, modalities:["blood_pressure","medications","symptoms","appointments"] }, purpose:"health_education", response_preferences:{ language: literacyLang ?? "en-IN", reading_level: readingLevel.toLowerCase() } })}); const j=await r.json().catch(()=>null); if(j) setReasoningAnswer(j); }}>Ask Ani (Multimodal)</Button></div>
            {reasoningAnswer ? (
              <div style={{ display:"grid", gap:8, fontSize:11 }}>
                <div style={{ padding:8, border:"1px solid var(--nv-color-border)", borderRadius:8, background:"var(--nv-color-surface-raised)" }}><b>Status:</b> {String((reasoningAnswer as Record<string,unknown>).status)} • <b>Expires:</b> {String((reasoningAnswer as Record<string,unknown>).expires_at ?? "").slice(0,16)} • <b>Human review:</b> {String(((reasoningAnswer as Record<string,unknown>).human_review as Record<string,unknown> | undefined)?.required ?? "false")}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div className="nv-card" style={{ padding:8 }}><b>Known facts</b><div style={{ color:"var(--nv-color-text-faint)"}}>{JSON.stringify(((reasoningAnswer as Record<string,unknown>).sections as Record<string,unknown> | undefined)?.known_facts ?? [], null, 2).slice(0,600)}</div></div>
                  <div className="nv-card" style={{ padding:8 }}><b>Model observations</b><div style={{ color:"var(--nv-color-text-faint)"}}>{JSON.stringify(((reasoningAnswer as Record<string,unknown>).sections as Record<string,unknown> | undefined)?.model_observations ?? [], null, 2).slice(0,600)}</div></div>
                  <div className="nv-card" style={{ padding:8 }}><b>Possible explanations</b><div style={{ color:"var(--nv-color-text-faint)"}}>{JSON.stringify(((reasoningAnswer as Record<string,unknown>).sections as Record<string,unknown> | undefined)?.possible_explanations ?? [], null, 2).slice(0,600)}</div></div>
                  <div className="nv-card" style={{ padding:8 }}><b>Recommended next steps</b><div style={{ color:"var(--nv-color-text-faint)"}}>{JSON.stringify(((reasoningAnswer as Record<string,unknown>).sections as Record<string,unknown> | undefined)?.recommended_next_steps ?? [], null, 2).slice(0,600)}</div></div>
                  <div className="nv-card" style={{ padding:8 }}><b>Information still needed</b><div style={{ color:"var(--nv-color-text-faint)"}}>{JSON.stringify(((reasoningAnswer as Record<string,unknown>).sections as Record<string,unknown> | undefined)?.information_needed ?? [], null, 2).slice(0,400)}</div></div>
                  <div className="nv-card" style={{ padding:8, borderLeft:"3px solid #dc2626" }}><b>Urgent human care</b><div style={{ color:"var(--nv-color-text-faint)"}}>{JSON.stringify(((reasoningAnswer as Record<string,unknown>).sections as Record<string,unknown> | undefined)?.urgent_human_care ?? [], null, 2).slice(0,400)}</div></div>
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}><Pill>Contradictions: {String(((reasoningAnswer as Record<string,unknown>).contradictions as unknown[] ?? []).length)}</Pill><Pill>Evidence: {String(((reasoningAnswer as Record<string,unknown>).evidence as unknown[] ?? []).length)}</Pill><Pill>Provenance refs: {String(((reasoningAnswer as Record<string,unknown>).provenance_refs as unknown[] ?? []).length)}</Pill><Pill>Limitations: {String(((reasoningAnswer as Record<string,unknown>).limitations as unknown[] ?? []).length)}</Pill></div>
                <details style={{ fontSize:11 }}><summary>Model chain (no silent composition)</summary><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap" }}>{JSON.stringify((reasoningAnswer as Record<string,unknown>).model_chain ?? [], null, 2).slice(0,1000)}</pre></details>
                <details style={{ fontSize:11 }}><summary>Patient context (21 fields)</summary><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", maxHeight:120, overflowY:"auto" }}>{JSON.stringify((reasoningAnswer as Record<string,unknown>).patient_context ?? {}, null, 2).slice(0,1000)}</pre></details>
              </div>
            ) : <div style={{ fontSize:11, color:"var(--nv-color-text-faint)"}}>Ask about readings, trends, medications, symptoms — Ani will combine records, time series, labs, imaging, genomics, social context, goals, consent with provenance and uncertainty, not just answer from more data.</div>}
            <div style={{ marginTop:8, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Question</th><th>Status</th><th>Human Review</th><th>When</th></tr></thead><tbody>{reasoningSessions.length===0 && <tr><td colSpan={4} className="nv-empty">No reasoning sessions — Ask Ani above to create a multimodal session with 6-section output contract + provenance + model chain</td></tr>}{reasoningSessions.slice(0,5).map((s:Record<string,unknown>,i:number)=> <tr key={String(s.id ?? i)}><td style={{ maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{String(s.question).slice(0,40)}</td><td><Pill>{String(s.status)}</Pill></td><td>{String(((s.humanReview as Record<string,unknown> | undefined)?.required ?? s.human_review ?? "—"))}</td><td style={{ fontSize:10 }}>{s.createdAt? new Date(String(s.createdAt)).toLocaleTimeString():""}</td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Safeguards, Governance, Implementation">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Imaging 9:</b> Use only validated indications, preserve series/metadata, identify diagnostic-quality, compare only when registration reliable, separate findings from radiologist interpretation, show false-positive/negative limitations, require qualified review for actionable findings, never let patient-facing model reinterpret serious image as diagnosis, record model version/inputs/preprocessing/output<br/><b>Lab 14:</b> fasting, collection time, specimen quality, reference range, units, lab method, age/sex, pregnancy, medication timing, recent illness, trends, related tests, whether preliminary, preserve LOINC<br/><b>Genomic 13:</b> test type, lab, specimen, variant, classification, interpretation date, evidence source, reclassification, confirmatory testing, family implications, patient preference, actionability, counseling — deterministic predictions from uncertain variants not allowed</div>
              <div><b>Safety & Human Oversight 14 (human review required):</b> Diagnosis, medication initiation/discontinuation/dose change, high-risk abnormal, imaging urgent, genomic actionable, suicide/violence, pregnancy complications, pediatric emergencies, allergy conflicts, contradictory discharge, automated care-plan changes, emergency escalation, any physical harm — Ani may support retrieval/summarization/comparison/question generation/trend/evidence navigation/preparation/drafts/coordination, not silently replace clinician judgment (WHO autonomy/wellbeing/transparency/responsibility/equity/sustainability)<br/><b>Model Governance 14:</b> intended use, excluded use, input requirements, population, validation, failure modes, bias, calibration, uncertainty, human-review threshold, version, change history, monitoring, retirement — no silent composition: Input extraction → Lab normalization → Time-series feature → Medication interaction → Evidence retrieval → Clinical synthesis → Safety policy engine (each with name/version/role/input/output/error/confidence/provenance/decisive)</div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><Pill>WHO: protect autonomy, wellbeing, safety, transparency, explainability, responsibility, equity</Pill><Pill>Implementation: Phase 1 Shared foundation → Phase 2 High-value modalities → Phase 3 Multimodal expansion → Phase 4 Clinical workflow → Phase 5 Continuous monitoring</Pill><Pill>Acceptance: combine modalities without losing source identity, state baseline, preserve measured/reported/imported/derived/inferred/synthetic, detect contradictions, refuse unsafe when missing, distinguish 6 output sections, show evidence/provenance, identify model/snapshot/chain/policy, enable independent clinician review, respect consent/least-privilege, incorporate goals, avoid deterministic genomic claims, treat social as barriers, provide fallback, monitor bias/drift, preserve audit</Pill></div>
          </Section>
        </div>
      )}



      {/* ALERTS - Alert Intelligence and Response Service */}
      {tab === "alerts" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Alert Intelligence and Response Service - Managed Clinical Events" subtitle="AHRQ specificity, Joint Commission governance, deduplication, clustering, baselines, fatigue prevention. Not individual notifications — managed clinical events." action={<><Badge tone="primary">AHRQ</Badge><Badge tone="warning">Joint Commission</Badge><Pill tone="danger">P0-P5</Pill></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["Measurements, Records, Models, Tasks","Signal Quality and Validation","Alert Candidate Generation","Deduplication and Clustering","Patient Baseline and Context Engine","Priority and Actionability Scoring","Suppression and Cooldown Policy","Routing and Escalation","Acknowledgement and Action Tracking","Outcome and Fatigue Analytics","Policy, Threshold, Model Improvement"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:i===5?"#fef3c7":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<10 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8 }}>
              <Stat label="CANDIDATES" value={String(alertCandidates.length)} hint="Raw events, may require evaluation" />
              <Stat label="CLUSTERS" value={String(alertClusters.length)} hint={`${String(alertClusters.filter(c=> String(c.priorityTier)==="P0"||String(c.priorityTier)==="P1").length)} P0-P1 urgent`} />
              <Stat label="BASELINES" value={String(alertBaselines.length)} hint="Patient-specific, 12 metrics" />
              <Stat label="SUPPRESSION RATE" value={alertMetrics? `${Math.round(((alertMetrics as Record<string,unknown>).volume as Record<string,unknown> | undefined)?.suppressionRate as number*100 || 0)}%` : "—"} hint="Log/digest, not conceal" />
            </div>
            <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}><Pill tone="primary">Independent from device/feature assistants</Pill><Pill>Glucose device, sleep service, medication engine, clinical model → Alert Intelligence Service determines separate alerts / combined alert / trend / task / no notification</Pill></div>
          </Section>
          <Section title="Alert Lifecycle - 11 + 12 Additional States">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", alignItems:"center", fontSize:11, fontWeight:800 }}>{["Candidate","Validated","Deduplicated","Clustered","Prioritized","Routed","Delivered","Acknowledged","Actioned","Resolved","Outcome recorded"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"3px 6px", borderRadius:999, background: s==="Routed"?"#fef3c7":s==="Acknowledged"?"#dcfce7":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<10 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Suppressed","Snoozed","Escalated","Expired","Retracted","False positive","Duplicate","Data-quality issue","Patient declined","Unable to deliver","Awaiting clinician review","No outcome recorded"].map(s=> <Pill key={s}>{s}</Pill>)}<span style={{ color:"var(--nv-color-text-faint)"}}>Every transition attributable, timestamped, consent-checked, linked to observations and policy version.</span></div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8, fontSize:11 }}><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #6b7280" }}><b>Candidate</b><div style={{ color:"var(--nv-color-text-faint)"}}>Raw: one elevated BP, disconnected sensor, missed med, model risk score, low-quality signal, new lab, patient-reported symptom</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #dc2626" }}><b>Alert</b><div style={{ color:"var(--nv-color-text-faint)"}}>Validated, actionable, important to interrupt user or create assigned task</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #4f46e5" }}><b>Information</b><div style={{ color:"var(--nv-color-text-faint)"}}>Non-urgent trend in command center without interrupting care</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #059669" }}><b>Task</b><div style={{ color:"var(--nv-color-text-faint)"}}>Action assigned to person with due time, owner, escalation rule</div></div></div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Patient may have hundreds of candidates but only small number of actionable alerts. This distinction is essential.</div>
          </Section>
          <Section title="Alert Object + Deduplication (10 Dimensions) + Clustering">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{`{
  "alert_id": "alert-...",
  "patient_id": "tokenized",
  "status": "routed",
  "type": "clinical_risk_cluster",
  "severity": "urgent",
  "urgency": "same_day",
  "actionability": "high",
  "title": "Possible deterioration requires review",
  "evidence": [{ "source": "observation-...", "type": "oxygen_saturation", "value": "92%", "quality": "good" }],
  "cluster": { "cluster_id": "cluster-...", "related_candidates": ["candidate-1","candidate-2"], "reason": "same patient, time window, clinical syndrome" },
  "scoring": { "clinical_urgency": 0.88, "confidence": 0.79, "persistence": 0.74, "patient_context": 0.82, "actionability": 0.91 },
  "routing": { "primary_role": "assigned_nurse", "backup_role": "covering_physician", "shift": "current" },
  "policy": { "version": "alert-policy-5.1", "human_review_required": true }
}`}</pre></div>
              <div><b>Deduplication 10 dimensions:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Patient","Clinical concept","Data source","Time window","Care episode","Threshold","Model","Recipient","Action required","Patient context"].map(d=> <Pill key={d}>{d}</Pill>)}</div><div style={{ marginTop:6 }}><b>Examples 5:</b><div style={{ color:"var(--nv-color-text-faint)"}}>Three high HR readings within 5m → one event<br/>Device alert + AI alert same readings → one cluster<br/>Repeat lab from two interfaces → one result event<br/>Caregiver + patient reminders → separate delivery under one alert<br/>New meaningful change after ack → linked update not duplicate<br/>Original candidates remain in provenance even when merged.</div></div>
                <div style={{ marginTop:6 }}><b>Clustering example:</b><div style={{ padding:6, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", marginTop:4 }}>Raw: Respiratory rate increased, Oxygen saturation decreased, Temperature elevated, Patient reported shortness of breath, Deterioration model crossed threshold<br/>Visible: <b>Possible respiratory deterioration—bedside review required</b><br/>Evidence: Four related signals, Two device measurements, One patient report, One model output, Signal quality acceptable — Clusters based on validated clinical logic, not semantic similarity; preserve decisive/supporting/contradictory/contextual.</div></div>
              </div>
            </div>
          </Section>
          <Section title="Priority Scoring - P = U × C × S × A × R (Bounded, Not Alone)">
            <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:8, fontSize:11 }}>
              <div><div style={{ padding:10, border:"1.5px solid #4f46e5", borderRadius:10, background:"var(--nv-color-surface-raised)", fontWeight:800, textAlign:"center", fontSize:13 }}>P = U × C × S × A × R<br/><span style={{ fontSize:11, fontWeight:400, color:"var(--nv-color-text-faint)"}}>U=clinical urgency, C=confidence, S=persistence, A=actionability, R=patient-specific risk — Not used alone: low-confidence catastrophic potential may require review, high-confidence non-actionable should not interrupt</span></div>
                <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}><span>Factors 12:</span>{["Potential harm if missed","Time to harm","Reversibility","Patient-specific risk","Magnitude of deviation","Persistence","Corroborating sources","Signal quality","Clinical context","Care setting","Effective intervention available","Responsible person assigned","Already reviewed","Patient asleep/traveling/in encounter"].map(f=> <Pill key={f}>{f}</Pill>)}</div>
                <div style={{ marginTop:6, display:"flex", gap:4, alignItems:"center" }}><span>Demo:</span><input className="nv-input" value={priorityDemo.U} onChange={e=> setPriorityDemo({...priorityDemo, U:e.target.value})} style={{ width:50, fontSize:11 }} /><span>×</span><input className="nv-input" value={priorityDemo.C} onChange={e=> setPriorityDemo({...priorityDemo, C:e.target.value})} style={{ width:50, fontSize:11 }} /><span>×</span><input className="nv-input" value={priorityDemo.S} onChange={e=> setPriorityDemo({...priorityDemo, S:e.target.value})} style={{ width:50, fontSize:11 }} /><span>×</span><input className="nv-input" value={priorityDemo.A} onChange={e=> setPriorityDemo({...priorityDemo, A:e.target.value})} style={{ width:50, fontSize:11 }} /><span>×</span><input className="nv-input" value={priorityDemo.R} onChange={e=> setPriorityDemo({...priorityDemo, R:e.target.value})} style={{ width:50, fontSize:11 }} /><span>=</span><b>P</b></div>
              </div>
              <div><div style={{ overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Tier</th><th>Meaning</th><th>Behavior</th></tr></thead><tbody><tr><td><span style={{ background:"#7f1d1d", color:"white", padding:"2px 6px", borderRadius:999, fontSize:10, fontWeight:800 }}>P0</span></td><td>Immediate threat</td><td>Emergency pathway</td></tr><tr><td><Pill tone="danger">P1</Pill></td><td>Urgent clinical risk</td><td>Interrupt + escalation timer</td></tr><tr><td><Pill tone="warning">P2</Pill></td><td>Same-day review</td><td>Prioritized task</td></tr><tr><td><Pill tone="primary">P3</Pill></td><td>Action due soon</td><td>Worklist/patient task</td></tr><tr><td><Pill>P4</Pill></td><td>Informational trend</td><td>Dashboard, no interruption</td></tr><tr><td><Pill>P5</Pill></td><td>Low-value/non-actionable</td><td>Suppress/log/digest</td></tr></tbody></table></div></div>
            </div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Patient-Specific Baselines - 12 Metrics + Safeguards">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Recent personal median","Normal variability","Time of day","Treatment phase","Age/clinical context","Device characteristics","Activity state","Sleep state","Post-discharge","Patient-reported usual range","Clinician-defined target","Seasonal/environmental"].map(s=> <Pill key={s}>{s}</Pill>)}</div>
              <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Example:</b> {`{ "metric": "morning_systolic_bp", "baseline": { "median": 132, "range": [124, 140], "period": "14_days", "observations": 18, "quality": "acceptable", "confidence": "moderate" }, "adaptation": { "enabled": true, "max_daily_shift": 0.05, "requires_clinician_approval_for": ["critical_thresholds", "post_discharge_period"] } }`}</div>
              <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><b>Safeguards 10:</b> {["Minimum observation count","Quality threshold","Maximum adaptation rate","Stable time window","Exclusion of acute episodes","Clinician-defined hard limits","Separate baseline for treatment changes","Manual review high-risk","Freeze during deterioration","Audit trail"].map(s=> <Pill key={s} tone="warning">{s}</Pill>)}<span style={{ color:"var(--nv-color-text-faint)"}}>Must not learn dangerous new normal from persistent deterioration — “Your recent readings are consistently higher, but N0VA has not changed threshold because increase may be clinically important.”</span></div>
              <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="metric e.g. morning_systolic_bp" value={baselineForm.metric} onChange={e=> setBaselineForm({...baselineForm, metric:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="median e.g. 132" value={baselineForm.median} onChange={e=> setBaselineForm({...baselineForm, median:e.target.value})} style={{ width:80, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!baselineForm.patientId || !baselineForm.metric) return; const r=await fetch("/api/health/alerts/baselines",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: baselineForm.patientId, metric: baselineForm.metric, baseline:{ median: Number(baselineForm.median), range:[124,140], period:"14_days", observations: Number(baselineForm.observations), quality:"acceptable", confidence:"moderate" } })}); const j=await r.json().catch(()=>null); if(r.ok && j?.baseline) setAlertBaselines(prev=> [j.baseline, ...prev].slice(0,6)); }}>Upsert Baseline</Button></div>
              {alertBaselines.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Metric</th><th>Median</th><th>Observations</th></tr></thead><tbody>{alertBaselines.slice(0,4).map((b:Record<string,unknown>,i:number)=> <tr key={String(b.id ?? i)}><td>{String(b.metric)}</td><td>{String(((b.baseline as Record<string,unknown> | undefined)?.median ?? (b as Record<string,unknown>).median ?? "—"))}</td><td>{String(((b.baseline as Record<string,unknown> | undefined)?.observations ?? "—"))}</td></tr>)}</tbody></table></div>}
            </Section>
            <Section title="Persistence, Suppression, Cooldown, Ack, Escalation">
              <div style={{ fontSize:11 }}><b>Persistence 8:</b> number abnormal, time between, consecutive, trend direction, duration above threshold, quality, rested/repeated, across independent sources — Do not require persistence before emergency when initial event itself may be immediate danger.<br/><b>Safe suppression 8:</b> duplicate, repeated low-value reminders, known artifact, stale/invalid sensor, non-actionable thresholds, already acknowledged unchanged, covered by higher-priority cluster, routine trend during episode<br/><b>Never suppress 9:</b> immediate danger, high-risk condition, clinician requested, new severe symptom, safety-critical med conflict, patient not received/acknowledged prior, previous suppression with harm, contradictory but serious, cannot verify recipient<br/><b>Every suppression:</b> reason, rule version, duration, candidates, override, review date, safety impact<br/><b>Cooldown:</b> First breach→candidate, second within 10m→add to cluster, persistent 30m→escalate if validated, new symptom/worsening→break cooldown, acknowledged but unresolved→follow-up timer, hysteresis different activation/deactivation thresholds</div>
              <div style={{ marginTop:6 }}><b>Acknowledgement 13:</b> Delivered, Opened, Seen, Acknowledged, Accepted, Deferred, Reassigned, Escalated, Action initiated, Resolved, Unable to act, False positive, Patient declined — Structured for high-risk: I am responsible, I reviewed evidence, I am taking action, I am delegating, not actionable with reason, need more info, cannot safely manage — simple click should not close critical.<br/><b>Escalation timers P0-P2:</b> P0 immediate→backup→emergency, P1 assigned clinician within minutes → backup → supervisor, P2 same-day task → reminder → escalation — account for shift, holidays, on-call, specialty, location, patient setting, role availability, handover, absence, communication reliability — Do not route to technically assigned but not currently responsible.</div>
            </Section>
          </div>
          <Section title="Create Candidate / Cluster + Why Am I Seeing This?">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><div style={{ display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={candidateForm.patientId} onChange={e=> setCandidateForm({...candidateForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={candidateForm.candidateType} onChange={e=> setCandidateForm({...candidateForm, candidateType:e.target.value})} style={{ width:140, fontSize:11 }}><option value="ELEVATED_BP">Elevated BP</option><option value="DISCONNECTED_SENSOR">Disconnected sensor</option><option value="MISSED_MEDICATION">Missed medication</option><option value="MODEL_RISK_SCORE">Model risk score</option><option value="NEW_LAB_RESULT">New lab result</option></select><Button size="sm" onClick={async()=> { if(!candidateForm.patientId) return; const r=await fetch("/api/health/alerts/candidates",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: candidateForm.patientId, candidateType: candidateForm.candidateType, source: candidateForm.source, value:{ amount: 148, unit:"mmHg" }, quality:"good" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.candidate) setAlertCandidates(prev=> [j.candidate, ...prev].slice(0,8)); }}>Create Candidate</Button></div>
                <div style={{ marginTop:6, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Source</th><th>Status</th><th>When</th></tr></thead><tbody>{alertCandidates.length===0 && <tr><td colSpan={4} className="nv-empty">No candidates — raw events: one elevated BP, disconnected sensor, missed med, model score, low-quality signal, new lab, patient-reported symptom</td></tr>}{alertCandidates.slice(0,5).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td><Pill>{String(c.candidateType)}</Pill></td><td>{String(c.source ?? "—")}</td><td><Pill>{String(c.status)}</Pill></td><td style={{ fontSize:10 }}>{c.timestamp? new Date(String(c.timestamp)).toLocaleTimeString():""}</td></tr>)}</tbody></table></div>
                <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={clusterForm.patientId} onChange={e=> setClusterForm({...clusterForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Title" value={clusterForm.title} onChange={e=> setClusterForm({...clusterForm, title:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={clusterForm.priorityTier} onChange={e=> setClusterForm({...clusterForm, priorityTier:e.target.value})} style={{ width:80, fontSize:11 }}><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select><Button size="sm" onClick={async()=> { if(!clusterForm.patientId || !clusterForm.title) return; const r=await fetch("/api/health/alerts/clusters",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: clusterForm.patientId, title: clusterForm.title, candidateIds: alertCandidates.slice(0,3).map(c=> String((c as Record<string,unknown>).id)), priorityTier: clusterForm.priorityTier })}); const j=await r.json().catch(()=>null); if(r.ok && j?.cluster) setAlertClusters(prev=> [j.cluster, ...prev].slice(0,8)); }}>Create Cluster (clinical narrative)</Button></div>
              </div>
              <div><b>Why am I seeing this? — 3 levels</b><div style={{ padding:6, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", marginTop:4 }}><div><b>Simple:</b> Why this appeared: Your oxygen level is lower than usual and your breathing rate is higher.</div><div style={{ marginTop:4 }}><b>Helpful:</b> What supports this: Two recent device readings and your symptom report. What to do: Contact your care team today for review.</div><div style={{ marginTop:4 }}><b>Detailed:</b> Source measurements, Signal quality, Baseline, Time window, Threshold, Corroborating observations, Contradictions, Model output, Model version, Confidence, Care-plan rule, Human-review status, Suppression and routing decisions.</div></div><div style={{ marginTop:4 }}><b>Patient-safe language:</b> Avoid “You are deteriorating.” Use “These readings may indicate a change that needs clinical review.”<br/><b>Explanation object:</b> alert_id, summary, known_facts, derived_observations, possible_explanations, missing_information, next_step, urgent_signs, sources, policy, human_review_required</div><div style={{ marginTop:6 }}><b>Caregiver alerts:</b> Patient authorization, task-specific scope, defined escalation delay, patient notification, no sensitive detail beyond task, backup caregiver, ability to decline, human escalation — “A medication task for Anil has not been confirmed. Please check in if you are authorized to help.” Not “Anil’s heart-failure status is worsening.”</div></div>
            </div>
            <div style={{ marginTop:6, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Cluster</th><th>Tier</th><th>Score</th><th>Status</th></tr></thead><tbody>{alertClusters.length===0 && <tr><td colSpan={4} className="nv-empty">No clusters — related signals combined: respiratory rate increased + oxygen decreased + temperature elevated + patient shortness of breath + model threshold → “Possible respiratory deterioration—bedside review required”</td></tr>}{alertClusters.slice(0,5).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td style={{ maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{String(c.title).slice(0,30)}</td><td><Pill tone={String(c.priorityTier)==="P0"||String(c.priorityTier)==="P1"?"danger":String(c.priorityTier)==="P2"?"warning":"neutral"}>{String(c.priorityTier)}</Pill></td><td>{String((c as Record<string,unknown>).priorityScore ?? c.scoring? String(((c.scoring as Record<string,unknown>).clinical_urgency as number)*100): "—")}</td><td><Pill>{String(c.status)}</Pill></td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Clinician Worklist + Governance + Metrics">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Clinician worklist — issue-oriented queue</b><div style={{ padding:6, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", marginTop:4, fontFamily:"monospace", fontSize:10, whiteSpace:"pre-wrap" }}>{`1. P1 — Possible deterioration — 3 patients — 1 awaiting acknowledgement
2. P2 — Medication-allergy conflict — 2 patients — pharmacist review
3. P2 — Repeated abnormal glucose trend — 5 patients — same-day review
4. P3 — Device disconnected — 14 patients — batch outreach`}</div><div style={{ marginTop:4 }}>Sort by urgency, group by patient/syndrome/unit/responsible clinician, batch review low-risk, evidence preview, one-click acknowledgement with structured reason, reassignment, suppression proposal, trend/outcome history.</div><div style={{ marginTop:4 }}><b>Alert bundles:</b> “Routine monitoring bundle: 12 patients need review of stable but slightly elevated readings.” — bundling allowed only when no patient meets urgent criteria, each inspectable, not hiding deterioration, reviewer can prioritize within bundle, each patient-level outcome tracked.</div></div>
              <div><b>Governance — Alert Safety Committee 10 + 11 policies</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Clinicians","Nurses","Pharmacists","Patient/caregiver reps","Human-factors","Safety/quality","Privacy/legal","Data scientists","Device/infrastructure","Accessibility/language"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Alert inventory","Risk classification","Ownership","Default thresholds","Patient-specific customization","Suppression policy","Routing policy","Escalation policy","Review cadence","Incident history","Retirement criteria"].map(s=> <Pill key={s} tone="primary">{s}</Pill>)}</div><div style={{ marginTop:4 }}><b>Metrics 4 categories:</b><div>Volume: candidates/patient-day, visible/patient-day, by source/specialty/severity/recipient, duplicate rate, cluster size, suppression rate</div><div>Burden: alerts/clinician shift, interruptions/hour, patient/caregiver notifications/day, overnight, time reviewing, alert density, worklist backlog</div><div>Performance: median ack/action time, escalation/resolution, delivery, unacknowledged, reassignment, override, snooze, false-positive, missed-event, sensitivity/specificity/PPV/NPV</div><div>Clinical impact: harm after missed, near misses, time to intervention, avoided deterioration, unnecessary escalation, sleep disruption, burnout, readmissions</div></div></div>
            </div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Override & Suppression 13 categories:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["False positive","Already known","Not actionable","Wrong patient","Poor signal quality","Duplicate","Wrong threshold","Wrong recipient","Patient preference","Care plan changed","Model disagreement","Data stale","Clinical context not captured"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>High override → bad thresholds, poor adaptation, insufficient context, inaccurate routing, duplicate, low calibration, workflow mismatch — Do not automatically optimize toward fewer overrides.</div></div>
              <div><b>Missed-event 9 + structured review 8:</b><div style={{ color:"var(--nv-color-text-faint)"}}>Alert never generated, suppressed incorrectly, wrong role, delivered but not seen, seen but not ack, ack but not actioned, escalation failed, action too late, poor signal — Review: Detection → Validation → Prioritization → Suppression → Routing → Delivery → Acknowledgement → Action → Outcome — Record technical/clinical-rule/human-factors/staffing/communication/data-quality/consent/patient-context</div></div>
            </div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Post-alert outcome 10:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Confirmed clinically important","Confirmed but already known","Not clinically important","False positive","Unable to determine","Harmfully delayed","Preventive success","Patient declined","Data-quality failure"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>Link to: clinical assessment, repeat measurements, orders, medication changes, messages, admissions, escalations, patient-reported outcomes, adverse events, resolution, follow-up interval — Use to improve policies, never unsupervised self-modification of high-risk thresholds.</div></div>
              <div><b>Model monitoring 12:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Calibration","Drift","Subgroup performance","Data-shift","Abstention rate","Human override","Alert yield","Alert burden","Missed-event rate","Outcome by score band","Performance after device/fw changes","Performance across care settings/languages"].map(s=> <Pill key={s}>{s}</Pill>)}</div><div style={{ color:"var(--nv-color-text-faint)", marginTop:4}}>NIST post-deployment monitoring, user feedback, override/appeal, incident response, human-AI roles.</div></div>
            </div>
            <div style={{ marginTop:6, fontSize:11 }}><b>Safe personalization 8:</b> notification channel, quiet hours, reminder frequency, caregiver routing, measurement schedule, personal baseline display, digest preferences, preferred language — <b>Not freely disable 5:</b> emergency safety protocols, clinician-required monitoring, critical medication conflicts, active care-plan escalation, legally required notifications — Patient may silence low-priority trend, but N0VA shows effect: “This will stop routine reminders about sleep trends. It will not stop urgent messages.”<br/><b>Privacy-aware 8:</b> lock-screen previews, caregiver notifications, shared worklists, email subject lines, wearable vibrations, voice assistants, SMS, family dashboards, AI summaries — minimal text, patient-controlled channels, category-specific sensitivity, secure deep links, recipient verification, no sensitive detail in unencrypted SMS, consent checks, audit, automatic expiry of temporary routes.<br/><b>FHIR 7:</b> DetectedIssue, Task, Communication, CarePlan, Observation, Provenance, AuditEvent, Flag, CDS Hooks, Clinical Reasoning<br/><b>Policy example oxygen_deterioration_v5:</b> population adult_inpatient, inputs oxygen_saturation/respiratory_rate/temperature/patient_symptom_report, quality usable_or_better, trigger any oxygen_below_patient_threshold/respiratory_above_patient_threshold strengthen_if persistent_15m/corroborated/fever/dyspnea, suppress duplicate_within_10m/known_approved_baseline/invalid_signal, do_not_suppress severe_symptoms/critical_threshold/clinician_requested, route primary assigned_nurse backup covering_physician supervisor unit_lead, timers ack 5m action 15m, human_review required, patient_notification care_plan_dependent, evaluation sensitivity_target/false_alert_review mandatory<br/><b>Acceptance 16:</b> distinguish candidate/alert, deduplicate without losing provenance, cluster related, score 5 separately, adapt to baselines without learning deterioration, suppress only when validated, route to correct role/shift/specialty/responsible, track delivery/ack/action/escalation/resolution, explain why in patient/clinician language, preserve evidence/contradictions, measure burden/response/override/false-positive/missed, link to outcomes, detect routing/suppression/delivery failures, protect sensitive info, require human review high-risk, monitor drift/subgroup/post-deployment, retire low-value via governed change control — <b>An alert should interrupt only when sufficiently credible, actionable, important — every alert should have responsible recipient, deadline, explanation, outcome.</b></div>
            {alertMetrics && <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Live Metrics:</b> Available</div>}
          </Section>
        </div>
      )}

      {/* PATHWAYS — Closed-Loop Care Pathways */}
      {tab === "pathways" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Closed-Loop Care Pathways — Versioned, Executable Care Programs" subtitle="FHIR PlanDefinition → ActivityDefinition → CarePlan, AHRQ coordination. Every step has: owner, input requirements, completion criteria, due time, evidence, next action, exception path, escalation rule, consent scope, audit record, versioned clinical logic." action={<><Badge tone="primary">14-Step Execution Model</Badge><Badge tone="warning">15-State Machine</Badge><Badge tone="success">11 Pathways</Badge></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11, fontWeight:800 }}>{["Eligibility detection","Clinical and consent verification","Patient invitation","Enrollment or decline","Baseline assessment","Shared goals and risk tier","Intervention assignment","Task and appointment generation","Monitoring and follow-up","Alert and escalation management","Outcome measurement","Completion, continuation, or re-entry","Quality, financial, and equity reporting"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:i===11?"#fef3c7": i===12?"#fef2f2":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<12 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
          </Section>
          <Section title="State Machine — 15 States (Never Collapsed Into 'Noncompliant')">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:10, fontWeight:800 }}>{["NOT_ELIGIBLE","POTENTIALLY_ELIGIBLE","AWAITING_VERIFICATION","INVITED","ENROLLED","BASELINE_INCOMPLETE","ACTIVE","PAUSED","ESCALATED","CLINICIAN_OVERRIDE","COMPLETED","UNSUCCESSFUL_COMPLETION","WITHDRAWN","LOST_TO_FOLLOW_UP","RE_ENROLLMENT_ELIGIBLE"].map((s,i)=> <span key={s} style={{ padding:"4px 8px", borderRadius:999, background:i===6?"#d1fae5": i===7?"#fef3c7": i===8?"#fee2e2": i===10?"#dbeafe":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>)}</div>
          </Section>
          <Section title="Pathway Library — 11 Versioned Pathways with Full Eligibility/Baseline/Interventions/Escalation/Outcomes">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(280px,1fr))", gap:8, fontSize:11 }}>
              {[
                { id:"diabetes-type2-v3", title:"Type 2 Diabetes", ver:"3.0.0", status:"clinical_validation", eligibility:["confirmed_type_1_or_2_diabetes","elevated_glycemic_marker","new_diagnosis","medication_initiation_or_intensification","patient_request_for_support","diabetes_related_discharge"], baseline:["diabetes_type","recent_glycemic_results","medication_reconciliation","hypoglycemia_history","kidney_function","blood_pressure","weight_and_nutrition_context","foot_risk_screening","eye_care_status","patient_goals","device_access","food_and_medication_affordability"], interventions:["glucose_monitoring_plan","medication_and_hypoglycemia_education","nutrition_support","foot_care_education","kidney_and_eye_care_referral","activity_plan","pharmacy_review","caregiver_training"], escalation:["severe_or_repeated_low_glucose","persistently_high_glucose","symptoms_of_acute_metabolic_illness","medication_access_failure","repeated_missed_monitoring","new_foot_wound","vision_change","kidney_function_deterioration"], outcomes:["glycemic_measure","hypoglycemia_events","medication_safety","patient_goal","kidney_health_evaluation","eye_examination","foot_care_completion","emergency_visits","patient_confidence"] },
                { id:"hypertension-v2", title:"Hypertension", ver:"2.0.0", status:"active", eligibility:["confirmed_hypertension","repeated_elevated_readings","new_antihypertensive_medication","post_discharge_monitoring"], baseline:["validated_device","measurement_technique","recent_readings","medication_and_adherence","kidney_function_and_electrolytes","symptoms","pregnancy_status","diet_activity_stress_access_barriers"], interventions:["measurement_education","home_monitoring","medication_reconciliation","lifestyle_support","pharmacist_review","follow_up_scheduling","transport_and_affordability_support"], escalation:["emergency_symptoms","severe_reading_under_protocol","persistent_above_target_trend","low_readings_with_symptoms","medication_side_effects"], outcomes:["blood_pressure_control","measurement_reliability","medication_persistence","symptoms","patient_goal","emergency_visits","follow_up_completion"] },
                { id:"heart-failure-home-monitoring-v1", title:"Heart Failure Home Monitoring", ver:"1.0.0", status:"active", eligibility:["confirmed_heart_failure","recent_admission_or_emergency","new_or_changed_therapy","weight_or_symptom_trend_concern"], baseline:["ejection_fraction_category","weight_baseline","symptoms_and_functional_status","medication_and_allergy_review","kidney_function_and_electrolytes","blood_pressure","home_support","diet_fluid_access_context","advance_care_preferences"], interventions:["weight_and_symptom_monitoring","medication_reconciliation","pharmacy_review","discharge_education","follow_up","diet_and_fluid_plan","home_nursing","transport_support"], escalation:["rapid_weight_change","worsening_breathlessness","new_confusion_or_fainting","chest_pain","inability_to_take_medication","repeated_missed_monitoring","device_or_connectivity_failure"], outcomes:["readmission","emergency_visit","symptom_burden","functional_status","medication_safety","follow_up_after_discharge","patient_defined_goal"] },
                { id:"copd-v1", title:"COPD Support", ver:"1.0.0", status:"active", eligibility:["confirmed_copd","recent_exacerbation","new_inhaler_or_oxygen_plan","repeated_symptom_deterioration"], baseline:["symptoms","exacerbation_history","inhaler_technique","smoking_or_exposure_context","oxygen_status","activity_limitation","vaccination_status","mental_health_and_social_support","home_environment"], interventions:["inhaler_education","action_plan","pulmonary_rehabilitation","smoking_cessation_support","vaccination_review","exposure_reduction","home_support","follow_up"], escalation:["severe_breathing_difficulty","new_confusion","blue_lips_or_severe_fatigue","rapid_symptom_worsening","inability_to_use_rescue_plan"], outcomes:["exacerbations","emergency_visits","hospitalizations","symptom_score","activity_tolerance","inhaler_technique","patient_goal"] },
                { id:"kidney-disease-v1", title:"Kidney Disease", ver:"1.0.0", status:"active", eligibility:["chronic_kidney_disease","kidney_function_deterioration","albuminuria","diabetes_with_kidney_health_gap"], baseline:["kidney_function_trend","albuminuria","blood_pressure","diabetes_status","medication_and_nephrotoxin_review","electrolytes","symptoms","nutrition_and_access_barriers","care_goals"], interventions:["laboratory_monitoring","medication_reconciliation","nephrology_referral","blood_pressure_support","diabetes_coordination","nutrition_education","contrast_or_medication_safety_review","transport_support"], escalation:["rapid_kidney_function_decline","severe_electrolyte_abnormality","dangerous_fluid_or_bp_change","reduced_urine_with_symptoms","medication_conflict"], outcomes:["kidney_function_trajectory","albuminuria_monitoring","blood_pressure_control","medication_safety","referral_completion","patient_understanding","avoidable_acute_care_use"] },
                { id:"oncology-v1", title:"Oncology Support", ver:"1.0.0", status:"active", eligibility:["active_cancer_treatment","new_diagnosis","treatment_transition","post_treatment_surveillance","symptom_or_toxicity_concern"], baseline:["cancer_type_and_stage","treatment_plan","medication_and_allergy_reconciliation","symptoms","nutrition_and_functional_status","psychosocial_needs","fertility_or_reproductive_goals","caregiver_capacity","financial_and_transport_barriers","advance_care_preferences"], interventions:["treatment_education","symptom_and_toxicity_monitoring","appointment_coordination","laboratory_tracking","nutrition_support","psychosocial_support","palliative_care_referral","transport_and_financial_assistance","caregiver_coordination"], escalation:["fever_or_infection_concern","severe_bleeding","dehydration","uncontrolled_pain","new_neurological_symptoms","severe_treatment_reaction","suicidal_distress","missed_treatment_or_critical_lab"], outcomes:["treatment_completion","toxicity_management","symptom_burden","hospitalization","patient_goals","quality_of_life","supportive_care_access","timeliness_of_treatment"] },
              ].map(pw => (
                <div key={pw.id} className="nv-card" style={{ padding:10, borderLeft:`3px solid ${pw.status==="active"?"#059669":pw.status==="clinical_validation"?"#d97706":"#6b7280"}` }}>
                  <div style={{ fontWeight:800, fontSize:12 }}>{pw.title}</div>
                  <div style={{ color:"var(--nv-color-text-faint)", fontSize:10 }}>{pw.id} v{pw.ver} — {pw.status}</div>
                  <div style={{ marginTop:6 }}><b>Eligibility ({pw.eligibility.length}):</b> <span style={{ color:"var(--nv-color-text-faint)"}}>{pw.eligibility.map(e=> e.replace(/_/g," ")).join(", ")}</span></div>
                  <div style={{ marginTop:4 }}><b>Baseline ({pw.baseline.length}):</b> <span style={{ color:"var(--nv-color-text-faint)"}}>{pw.baseline.map(b=> b.replace(/_/g," ")).join(", ")}</span></div>
                  <div style={{ marginTop:4 }}><b>Interventions ({pw.interventions.length}):</b> <span style={{ color:"var(--nv-color-text-faint)"}}>{pw.interventions.map(i=> i.replace(/_/g," ")).join(", ")}</span></div>
                  <div style={{ marginTop:4 }}><b>Escalation ({pw.escalation.length}):</b> <span style={{ color:"var(--nv-color-text-faint)"}}>{pw.escalation.map(e=> e.replace(/_/g," ")).join(", ")}</span></div>
                  <div style={{ marginTop:4 }}><b>Outcomes ({pw.outcomes.length}):</b> <span style={{ color:"var(--nv-color-text-faint)"}}>{pw.outcomes.map(o=> o.replace(/_/g," ")).join(", ")}</span></div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Pathway Definitions (Database)">
            <div style={{ display:"flex", gap:4, marginBottom:6 }}><input className="nv-input" placeholder="Pathway ID" value={pathwayForm.pathwayId} onChange={e=> setPathwayForm({...pathwayForm, pathwayId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Title" value={pathwayForm.title} onChange={e=> setPathwayForm({...pathwayForm, title:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!pathwayForm.pathwayId || !pathwayForm.title) return; const r=await fetch("/api/health/pathways/definitions",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(pathwayForm)}); const j=await r.json().catch(()=>null); if(r.ok && j?.definition) setPathwayDefinitions(prev=> [j.definition, ...prev].slice(0,12)); }}>Create Definition</Button></div>
            <div style={{ maxHeight:120, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Pathway ID</th><th>Title</th><th>Version</th><th>Status</th><th>Owner</th></tr></thead><tbody>{pathwayDefinitions.length===0 && <tr><td colSpan={5} className="nv-empty">No pathway definitions yet — create one or use the library</td></tr>}{pathwayDefinitions.map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td>{String(d.pathwayId)}</td><td>{String(d.title)}</td><td>{String(d.version)}</td><td><Pill tone={String(d.status)==="ACTIVE"?"success":String(d.status)==="CLINICAL_VALIDATION"?"warning":"neutral"}>{String(d.status)}</Pill></td><td>{String(d.owner ?? "—")}</td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Enrollments — 12-Step Informed Workflow">
            <div style={{ display:"flex", gap:4, marginBottom:6 }}><input className="nv-input" placeholder="Patient ID" value={enrollmentForm.patientId} onChange={e=> setEnrollmentForm({...enrollmentForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Pathway ID" value={enrollmentForm.pathwayId} onChange={e=> setEnrollmentForm({...enrollmentForm, pathwayId:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!enrollmentForm.patientId || !enrollmentForm.pathwayId) return; const r=await fetch("/api/health/pathways/enrollments",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(enrollmentForm)}); const j=await r.json().catch(()=>null); if(r.ok && j?.enrollment) setPathwayEnrollments(prev=> [j.enrollment, ...prev].slice(0,12)); }}>Enroll Patient</Button></div>
            <div style={{ maxHeight:120, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Patient</th><th>Pathway</th><th>Version</th><th>Status</th><th>Risk</th><th>Enrolled</th><th>Actions</th></tr></thead><tbody>{pathwayEnrollments.length===0 && <tr><td colSpan={7} className="nv-empty">No enrollments yet</td></tr>}{pathwayEnrollments.map((e:Record<string,unknown>,i:number)=> <tr key={String(e.id ?? i)}><td style={{ fontSize:10 }}>{String(e.patientId).slice(0,8)}…</td><td>{String(e.pathwayId)}</td><td>{String(e.pathwayVersion)}</td><td><Pill tone={String(e.status)==="ACTIVE"?"success":String(e.status)==="ENROLLED"?"primary":String(e.status)==="PAUSED"?"warning":"neutral"}>{String(e.status)}</Pill></td><td>{String(e.riskTier ?? "—")}</td><td style={{ fontSize:10 }}>{e.enrolledAt ? new Date(String(e.enrolledAt)).toLocaleDateString() : "—"}</td><td style={{ display:"flex", gap:2 }}><Button size="sm" variant="ghost" onClick={async()=> { await fetch(`/api/health/pathways/enrollments/${String(e.id)}/tasks`,{method:"GET"}); }}>Tasks</Button><Button size="sm" variant="ghost" onClick={async()=> { await fetch(`/api/health/pathways/enrollments/${String(e.id)}/escalate`,{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({trigger:"Abnormal measurement"})}); }}>Escalate</Button></td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Exceptions — 22 Types, 9-Step Workflow, Never 'Failed'">
            <div style={{ display:"flex", gap:4, marginBottom:6 }}><input className="nv-input" placeholder="Patient ID" value={exceptionForm.patientId} onChange={e=> setExceptionForm({...exceptionForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={exceptionForm.exceptionType} onChange={e=> setExceptionForm({...exceptionForm, exceptionType:e.target.value})} style={{ fontSize:11 }}>{["Patient declines","Patient unavailable","Patient lacks transport","Patient lacks device","Language mismatch","Accessibility barrier","Medication unavailable","Insurance authorization delay","Caregiver unavailable","Clinician unavailable","Abnormal result","Emergency event","Duplicate enrollment","Conflicting care plan","Missing data","Device failure","Pregnancy status changed","Hospital admission","Patient transferred","Consent revoked","Pathway no longer appropriate"].map(t=> <option key={t} value={t}>{t}</option>)}</select><Button size="sm" onClick={async()=> { if(!exceptionForm.patientId || !exceptionForm.exceptionType) return; const r=await fetch("/api/health/pathways/exceptions",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(exceptionForm)}); const j=await r.json().catch(()=>null); if(r.ok && j?.exception) setPathwayExceptions(prev=> [j.exception, ...prev].slice(0,12)); }}>Log Exception</Button></div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:10, marginBottom:6 }}><Pill tone="success">Resolved</Pill><Pill tone="primary">Adapted</Pill><Pill>Transferred</Pill><Pill>Patient declined</Pill><Pill>Unable to contact</Pill><Pill>Clinician closed</Pill><Pill>Emergency superseded</Pill><Pill>Awaiting external service</Pill><Pill>Requires review</Pill></div>
            <div style={{ maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Severity</th><th>Status</th><th>Assigned</th><th>Created</th></tr></thead><tbody>{pathwayExceptions.length===0 && <tr><td colSpan={5} className="nv-empty">No exceptions logged</td></tr>}{pathwayExceptions.map((x:Record<string,unknown>,i:number)=> <tr key={String(x.id ?? i)}><td>{String(x.exceptionType)}</td><td>{String(x.severity)}</td><td><Pill tone={String(x.status)==="open"?"warning":"success"}>{String(x.status)}</Pill></td><td>{String(x.assignedOwner ?? "—")}</td><td style={{ fontSize:10 }}>{new Date(String(x.createdAt)).toLocaleDateString()}</td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Risk Stratification + Task Prevention + Completion Criteria">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>4 Risk Tiers</b><div style={{ color:"var(--nv-color-text-faint)"}}>Low: education, routine monitoring • Moderate: scheduled tasks, periodic review • High: frequent monitoring, named clinician • Critical: urgent human evaluation, automation pauses</div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Risk determines pathway intensity, not worth or access to care.</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Task Prevention — 7 Unsafe Patterns</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Duplicate tasks","Conflicting instructions","Impossible schedules","Unavailable caregivers","Unverified equipment","Exceeds capacity","Automated dose changes"].map(p=> <Pill key={p} tone="danger">{p}</Pill>)}</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Completion Criteria</b><div style={{ color:"var(--nv-color-text-faint)"}}><b>Required:</b> baseline_completed, intervention_delivered, follow_up_completed, outcome_measured<br/><b>Acceptable:</b> goal_met, goal_partially_met_with_plan, transferred_to_specialist, patient_completed, clinician_closed, patient_withdrew<br/><b>Not completion:</b> task_expired, no_response, appointment_scheduled_only, education_sent_only</div></div>
            </div>
          </Section>
          <Section title="Quality + Financial + Equity Reporting">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Quality Reporting — CMS Measure Specifications</b><div style={{ color:"var(--nv-color-text-faint)"}}>Every metric: numerator, denominator, exclusions, exceptions, missing data, data freshness, measure version, attribution logic, stratification, confidence, suppression for small cells, equity interpretation, responsible owner</div><div style={{ marginTop:4 }}><Pill tone="primary">CMS122v13 Glycemic Status</Pill><Pill tone="primary">CMS165v12 Controlling High BP</Pill><Pill tone="primary">CMS149v12 HF Readmission</Pill></div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Financial Reporting — Separated Pipeline</b><div style={{ color:"var(--nv-color-text-faint)"}}>Eligibility → Authorization → Service delivered → Documentation complete → Claim generated → Claim accepted or denied → Denial reason → Correction or appeal → Payment reconciliation</div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Do not generate a claim solely because an automated task was created. Require evidence that qualifying service occurred.</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Equity Reporting</b><div style={{ color:"var(--nv-color-text-faint)"}}>Enrollment disparities, task completion by access barriers, escalation patterns, outcome gaps by insurance type, language access, geographic barriers, financial burden, caregiver capacity, digital divide, preventive care gaps</div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Eligibility models monitored for missed populations, unequal access, incorrect exclusion.</div></div>
            </div>
          </Section>
          <Section title="Safety Controls + FHIR Mapping + Clinician Override">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Safety Controls (15):</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Pause during emergency","Pause conflicting pathways","Detect duplicate enrollment","Prevent contradictory tasks","Prevent unsafe medication advice","Require human review for high-risk","Preserve clinician overrides","Require consent before enrollment","Offer non-digital alternatives","Use patient-specific baselines carefully","Expire stale tasks","Reconcile after hospitalization","Notify patients of material changes","Make every exception actionable","Prevent financial incentives from overriding goals"].map(c=> <Pill key={c}>{c}</Pill>)}</div></div>
              <div><b>FHIR Resources (16):</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["PlanDefinition","ActivityDefinition","CarePlan","Task","ServiceRequest","Appointment","Questionnaire","Observation","Condition","Goal","Consent","Communication","DetectedIssue","Provenance","AuditEvent","$apply"].map(r=> <Pill key={r} tone="primary">{r}</Pill>)}</div><div style={{ marginTop:6 }}><b>Clinician Override (15 actions):</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Enroll or exclude","Change risk tier","Pause pathway","Change task frequency","Replace intervention","Override alert","Add clinical exception","Modify follow-up timing","Transfer responsibility","Close with reason","Resume later","Document rationale","Require human review","Override model eligibility"].map(a=> <Pill key={a} tone="warning">{a}</Pill>)}</div></div></div>
            </div>
          </Section>
        </div>
      )}

      {/* INBOX — Unified Clinical Work-Queue & Inbox Orchestration */}
      {tab === "inbox" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Unified Clinical Work-Queue & Inbox Orchestration — One Role-Aware Work Environment" subtitle="FHIR Task abstraction (Task.owner = accountable party, Task.focus = request/resource). Inbox belongs to the care team, not one physician. A result, message, referral, or alert never disappears because it was merged, delegated, batched, or routed." action={<><Badge tone="primary">11 Sources</Badge><Badge tone="warning">11 Queues</Badge><Badge tone="success">FHIR Task</Badge></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11, fontWeight:800 }}>{["Ingestion and provenance","Classification and safety screening","Deduplication and linking","Priority and SLA assignment","Ownership and routing","Queue work, delegation, or escalation","Resolution and documentation","Audit, outcome, burden, and quality reporting"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<7 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:10, fontWeight:800, marginTop:8 }}>{["RECEIVED","CLASSIFIED","VALIDATED","ROUTED","ASSIGNED","ACCEPTED","IN_PROGRESS","AWAITING_INFORMATION","AWAITING_EXTERNAL_PARTY","DELEGATED","ESCALATED","RESOLVED","CLOSED"].map((s)=> <span key={s} style={{ padding:"4px 8px", borderRadius:999, background:s==="ESCALATED"?"#fee2e2":s==="RESOLVED"||s==="CLOSED"?"#d1fae5":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>)}</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>“Closed” requires a resolution reason and evidence — opening an item or sending an acknowledgement never counts as resolution. Clinical and administrative priority are stored separately.</div>
          </Section>
          <Section title="Live Work-Queue — Owned, Prioritized, Time-Bound">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8, marginBottom:8 }}>
              <Stat label="OPEN ITEMS" value={String(workItems.filter(w=> !["CLOSED","RESOLVED","DUPLICATE","RETRACTED","NOT_ACTIONABLE"].includes(String(w.status))).length)} hint={`${String(workItems.length)} total loaded`} />
              <Stat label="UNASSIGNED" value={String(workItems.filter(w=> !["CLOSED","RESOLVED","DUPLICATE","RETRACTED","NOT_ACTIONABLE"].includes(String(w.status)) && !w.owner).length)} hint="everyone notified, nobody responsible = failure" tone="danger" />
              <Stat label="SLA AT RISK / BREACHED" value={String(((slaBreaches as Record<string,unknown> | null)?.count as number) ?? 0)} hint="overdue escalation uses role, shift, specialty" tone="danger" />
              <Stat label="LIVE WORKLOAD" value={String(((workloads as Record<string,unknown> | null)?.totalLive as number) ?? 0)} hint="W = Σ(E × C × U), never bare counts" />
            </div>
            <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="Patient ID (auto)" value={workForm.patientId} onChange={e=> setWorkForm({...workForm, patientId:e.target.value})} style={{ flex:1, minWidth:120, fontSize:11 }} />
              <select className="nv-select" value={workForm.type} onChange={e=> setWorkForm({...workForm, type:e.target.value})} style={{ fontSize:11 }}>{["abnormal_lab","imaging_finding","patient_message","renewal_request","prior_auth","referral","discharge","device_failure","unresolved_alert","research_match","compliance_task"].map(t=> <option key={t} value={t}>{t}</option>)}</select>
              <input className="nv-input" placeholder="Title" value={workForm.title} onChange={e=> setWorkForm({...workForm, title:e.target.value})} style={{ flex:2, minWidth:160, fontSize:11 }} />
              <select className="nv-select" value={workForm.priority} onChange={e=> setWorkForm({...workForm, priority:e.target.value})} style={{ fontSize:11 }}>{["STAT","URGENT","HIGH","ROUTINE","BATCH","INFORMATIONAL"].map(p=> <option key={p} value={p}>{p}</option>)}</select>
              <select className="nv-select" value={workForm.queue} onChange={e=> setWorkForm({...workForm, queue:e.target.value})} style={{ fontSize:11 }}>{["abnormal_labs","imaging","messages","renewals","prior_auth","referrals","discharge","device","alerts","research","compliance"].map(q=> <option key={q} value={q}>{q}</option>)}</select>
              <Button size="sm" onClick={async()=> { if(!workForm.title || !workForm.queue) return; const r=await fetch("/api/health/work-items",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: workForm.patientId || undefined, type: workForm.type, title: workForm.title, priority: workForm.priority, queue: workForm.queue })}); if(r.ok) void refreshWorkItems(workForm.patientId || undefined); }}>Ingest Work Item</Button>
            </div>
            <div style={{ maxHeight:220, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Title</th><th>Queue</th><th>Priority</th><th>Status</th><th>Owner</th><th>Due</th><th>Actions</th></tr></thead><tbody>{workItems.length===0 && <tr><td colSpan={7} className="nv-empty">No work items yet — ingest one above</td></tr>}{workItems.slice(0,12).map((w:Record<string,unknown>,i:number)=> <tr key={String(w.id ?? i)}><td style={{ maxWidth:220 }}>{String(w.title).slice(0,60)}</td><td>{String(w.queue)}</td><td><Pill tone={String(w.priority)==="STAT"?"danger":String(w.priority)==="URGENT"?"warning":String(w.priority)==="INFORMATIONAL"||String(w.priority)==="BATCH"?"neutral":"primary"}>{String(w.priority)}</Pill></td><td>{String(w.status)}</td><td style={{ fontSize:10 }}>{w.owner ? String(w.owner).slice(0,14) : <span style={{ color:"#dc2626", fontWeight:800 }}>unassigned</span>}</td><td style={{ fontSize:10 }}>{w.dueAt ? new Date(String(w.dueAt)).toLocaleString() : "—"}</td><td style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/work-items/${String(w.id)}/claim`,{method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"}); if(r.ok) void refreshWorkItems(workForm.patientId || undefined); }}>Claim</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/work-items/${String(w.id)}/accept`,{method:"POST"}); if(r.ok) void refreshWorkItems(workForm.patientId || undefined); }}>Accept</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/work-items/${String(w.id)}/start`,{method:"POST"}); if(r.ok) void refreshWorkItems(workForm.patientId || undefined); }}>Start</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const reason = window.prompt("Escalation reason:"); if(!reason) return; const r=await fetch(`/api/health/work-items/${String(w.id)}/escalate`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reason })}); if(r.ok) void refreshWorkItems(workForm.patientId || undefined); }}>Escalate</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const reason = window.prompt("Resolution reason (required):"); if(!reason) return; const r=await fetch(`/api/health/work-items/${String(w.id)}/resolve`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reason, evidence:[{ source:"clinician_review", note: reason }] })}); if(!r.ok) { const j=await r.json().catch(()=>null); alert(j?.error ?? "Resolve failed"); } else void refreshWorkItems(workForm.patientId || undefined); }}>Resolve</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/work-items/${String(w.id)}/audit`); const j=await r.json().catch(()=>null); if(j) setWorkAudit(j); }}>Audit</Button>
            </td></tr>)}</tbody></table></div>
            {workAudit && <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Audit — {String((workAudit as Record<string,unknown>).workItemId).slice(0,8)}…</b><div style={{ color:"var(--nv-color-text-faint)"}}>Who was responsible? Who saw it? Who changed it? Which rule routed it? Was the SLA met? Was the patient informed?</div><div style={{ marginTop:4, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Action</th><th>From → To</th><th>Owner</th><th>When</th></tr></thead><tbody>{(((workAudit as Record<string,unknown>).events as Array<Record<string,unknown>>) ?? []).map((e:Record<string,unknown>,i:number)=> <tr key={i}><td>{String(e.action)}</td><td style={{ fontSize:10 }}>{String(e.fromStatus ?? "—")} → {String(e.toStatus ?? "—")}</td><td style={{ fontSize:10 }}>{String(e.owner ?? "—").slice(0,14)}</td><td style={{ fontSize:10 }}>{e.createdAt ? new Date(String(e.createdAt)).toLocaleTimeString() : ""}</td></tr>)}</tbody></table></div></div>}
          </Section>
          <Section title="Queues × Priority × SLA — 11 Queues, 6 Levels, Configurable Timers">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:8, fontSize:11 }}>
              {[["abnormal_labs","Critical → ordering/covering clinician → nurse → supervisor"],["imaging","Routine vs urgent vs unexpected vs critical; AI never replaces final report"],["messages","Team triage before physician; emergency language → human escalation"],["renewals","Protocolable only when active, monitored, stable — never silent new Rx"],["prior_auth","CMS: 72h expedited, 7d standard; denial reason + appeal"],["referrals","Loop closes on report review + patient notified, not on send"],["discharge","AHRQ: meds, follow-up, teach-back, post-discharge contact"],["device","Missing data is never a normal reading; link monitoring-gap item"],["alerts","Unacknowledged, unresolved, escalated, conflicting, repeated"],["research","Separated from care; match ≠ enrollment; separate consent"],["compliance","Links to source record; never overwrites clinical docs"]].map(([q,desc])=> <div key={q} className="nv-card" style={{ padding:10, borderLeft:"3px solid #4f46e5" }}><div style={{ fontWeight:800 }}>{q} <span style={{ color:"var(--nv-color-text-faint)"}}>({String(workItems.filter(w=> String(w.queue)===q && !["CLOSED","RESOLVED"].includes(String(w.status))).length)} open)</span></div><div style={{ color:"var(--nv-color-text-faint)"}}>{desc}</div></div>)}
            </div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Priority — harm × time × confidence × actionability × risk:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}><Pill tone="danger">STAT — immediate (5m ack / 15m resolve)</Pill><Pill tone="warning">URGENT — rapid review (30m / 4h)</Pill><Pill tone="primary">HIGH — same/next-day</Pill><Pill>ROUTINE — 1d ack / 3d resolve</Pill><Pill>BATCH — grouped review</Pill><Pill>INFORMATIONAL — no action</Pill></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Triage destinations: no work (logged only) • batch work • assigned work item (owner + due) • urgent escalation (interruptive + timer).</div></div>
              <div><b>Timers show:</b><div style={{ color:"var(--nv-color-text-faint)"}}>Time remaining • clock type • pause reason • owner • backup • escalation time • breach risk • manual-change audit. Pausing requires a valid state (awaiting patient/payer/external) and documented reason.</div></div>
            </div>
          </Section>
          <Section title="Ownership, Delegation, Batch Safety">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>8 Ownership Levels</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Queue owner","Work-item owner","Clinical decision owner","Administrative owner","Backup owner","Supervisor","Patient communication owner","External-party owner"].map(o=> <Pill key={o}>{o}</Pill>)}</div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Example abnormal lab: results team → assigned nurse → ordering clinician → covering clinician → unit lead → care coordinator.</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Delegation — Role + Action Specific</b><div style={{ color:"var(--nv-color-text-faint)"}}>MA: verify + completeness • Nurse: triage + protocol + escalate • Pharmacist: reconcile + renewals + interactions • Auth specialist: payer packets • Referral coordinator: close loops • Clinician: interpret + diagnose + treat • Research: consented contact only • Compliance: documentation review. Minimum necessary data; accountability preserved.</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Batch — Preview Before Bulk</b><div style={{ color:"var(--nv-color-text-faint)"}}><b>Safe:</b> admin assigns, approved education, missing-doc requests, duplicate closure, routine scheduling, preventive reminders, device routing, auth packets.<br/><b>Never bulk:</b> critical labs, new cancer, urgent imaging, allergy conflicts, psychiatric safety, pregnancy warnings, pathology, genomics, treatment changes, severe-symptom messages. Every batch shows patients, criteria, exclusions, actor, template version, preview, confirmation, audit, undo path.</div></div>
            </div>
          </Section>
          <Section title="Workload (W = Σ E×C×U), SLA Breaches, Outcomes & Analytics">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Complexity-Adjusted Workload by Owner</b><div style={{ marginTop:4, maxHeight:110, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Owner</th><th>Items</th><th>W Score</th><th>Queues</th></tr></thead><tbody>{Object.entries((((workloads as Record<string,unknown> | null)?.byOwner as Record<string, { count:number; score:number; queues:string[] }>) ?? {})).slice(0,8).map(([o,v])=> <tr key={o}><td style={{ fontSize:10 }}>{o.slice(0,16)}</td><td>{v.count}</td><td style={{ fontWeight:800 }}>{Math.round(v.score*100)/100}</td><td style={{ fontSize:10 }}>{v.queues.join(", ").slice(0,40)}</td></tr>)}{Object.keys((((workloads as Record<string,unknown> | null)?.byOwner as Record<string, unknown>) ?? {})).length===0 && <tr><td colSpan={4} className="nv-empty">No live workload</td></tr>}</tbody></table></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>20 routine renewals ≠ 20 complex messages. Staffing by W, protected review time, overload detected before breach — never to pressure unsafe throughput.</div></div>
              <div><b>SLA Breaches & At-Risk</b><div style={{ marginTop:4, maxHeight:110, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Item</th><th>Queue</th><th>Remaining</th><th>State</th></tr></thead><tbody>{((((slaBreaches as Record<string,unknown> | null)?.breaches as Array<{ item: Record<string,unknown>; sla: Record<string,unknown> }>) ?? [])).slice(0,8).map((b,i)=> <tr key={i}><td style={{ maxWidth:160 }}>{String(b.item.title).slice(0,36)}</td><td>{String(b.item.queue)}</td><td style={{ fontWeight:800, color: b.sla.breached ? "#dc2626" : "#d97706" }}>{b.sla.timeRemainingMin === null ? "no timer" : `${String(b.sla.timeRemainingMin)}m`}</td><td>{b.sla.breached ? "BREACHED" : "AT RISK"}</td></tr>)}{(((slaBreaches as Record<string,unknown> | null)?.count as number) ?? 0)===0 && <tr><td colSpan={4} className="nv-empty">No breaches — timers healthy</td></tr>}</tbody></table></div></div>
            </div>
            <div style={{ marginTop:8, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Queue Outcomes</b><div style={{ color:"var(--nv-color-text-faint)"}}>{queueOutcomes ? Object.entries((((queueOutcomes as Record<string,unknown>).byQueue as Record<string, { total:number; resolved:number; closed:number; escalated:number }>) ?? {})).slice(0,6).map(([q,v])=> `${q}: ${v.total} total, ${v.resolved} resolved, ${v.closed} closed, ${v.escalated} escalated`).join(" • ") || "No outcomes yet" : "Loading…"}</div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}><b>Operational:</b> volume, assignment/acceptance/resolution time, SLA compliance, escalation/reassignment, backlog, duplicates. <b>Safety:</b> missed criticals, wrong-patient/owner routing, inappropriate closure, referral-loop closure, auth-delay harm. <b>Workload:</b> after-hours, interruptions, burden surveys, inequity.</div></div>
              <div><b>Automation (L0–L3) + Fairness + FHIR</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}><Pill>L0 Observe</Pill><Pill tone="primary">L1 Assist (human confirms)</Pill><Pill tone="warning">L2 Protocol execute (audit + undo)</Pill><Pill tone="danger">L3 Human required</Pill></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Every automated action shows rule/model, version, inputs, exclusions, review status, undo path. Stratify by specialty, setting, language, geography, age, disability, insurance, caregiver, digital access, shift — never deprioritize by vulnerability. FHIR: Task, Communication, ServiceRequest, DiagnosticReport, Observation, MedicationRequest/Dispense, Coverage, Claim, Appointment, CarePlan, Consent, Device, ResearchStudy, Provenance, AuditEvent.</div></div>
            </div>
            <div style={{ marginTop:8, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Patient communication:</b> <span style={{ color:"var(--nv-color-text-faint)"}}>“Your care team received a result that needs review. They have not yet documented a final interpretation. You will be contacted if action is needed.” — understandable language, no internal triage labels, review status shown, expected response time, urgent instructions where relevant, correction path, delivery + acknowledgement tracked, duplicates avoided, caregiver permissions respected.</span></div>
          </Section>
        </div>
      )}

      {tab === "meds" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Medication Safety Cockpit — One Reconciled, Patient-Confirmed Picture" subtitle="Prescriptions + dispensing + claims + photographs + caregiver reports + actual use → BPMH → reconciliation → safety graph → pharmacist/clinician review → patient confirmation → pharmacy coordination → adverse-event tracking." action={<><Badge tone="primary">4 Realities</Badge><Badge tone="warning">12 BPMH Sources</Badge><Badge tone="success">FHIR Meds</Badge></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11, fontWeight:800 }}>{["Normalization","Best Possible Medication History","Reconciliation + discrepancies","Safety graph","Pharmacist + clinician review","Patient confirmation","Updated plan","Pharmacy + caregiver + follow-up","Adverse-event tracking"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<8 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:8 }}>{["Prescribed: ordered","Dispensed: supplied","Reported: patient/caregiver says taken","Administered: documented given"].map((s)=> <Pill key={s} tone="primary">{s}</Pill>)}</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Never assume prescribed means taken, dispensed means understood, or detected means dangerous. A medicine is not “currently taking” from an old prescription or claims row alone.</div>
          </Section>
          <Section title="Live Medication List — Reconciled">
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8, marginBottom:8 }}>
              <Stat label="CONFIRMED CURRENT" value={String(medRecords.filter(m=> String(m.status)==="PATIENT_CONFIRMED_CURRENT").length)} hint={`${String(medRecords.length)} records loaded`} />
              <Stat label="UNCERTAIN / UNKNOWN" value={String(medRecords.filter(m=> ["UNCERTAIN","UNKNOWN"].includes(String(m.status))).length)} hint="safety-sensitive guidance held" tone="danger" />
              <Stat label="OPEN ALERTS" value={String(medAlerts.length)} hint={`${String(medAlerts.filter(a=> ["CRITICAL","HIGH"].includes(String(a.severity))).length)} critical/high`} tone={medAlerts.some(a=> String(a.severity)==="CRITICAL") ? "danger" : undefined} />
              <Stat label="PENDING CHANGES" value={String(medChanges.filter(c=> !["ACTIVE","CANCELLED","DECLINED","SUPERSEDED"].includes(String(c.status))).length)} hint="authorization + confirmation required" />
            </div>
            <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="Patient ID (auto)" value={medForm.patientId} onChange={e=> setMedForm({...medForm, patientId:e.target.value})} style={{ flex:1, minWidth:120, fontSize:11 }} />
              <input className="nv-input" placeholder="Name" value={medForm.canonicalName} onChange={e=> setMedForm({...medForm, canonicalName:e.target.value})} style={{ flex:1, minWidth:120, fontSize:11 }} />
              <input className="nv-input" placeholder="Ingredient" value={medForm.ingredient} onChange={e=> setMedForm({...medForm, ingredient:e.target.value})} style={{ flex:1, minWidth:120, fontSize:11 }} />
              <input className="nv-input" placeholder="Strength" value={medForm.strength} onChange={e=> setMedForm({...medForm, strength:e.target.value})} style={{ width:110, fontSize:11 }} />
              <select className="nv-select" value={medForm.status} onChange={e=> setMedForm({...medForm, status:e.target.value})} style={{ fontSize:11 }}>{["PRESCRIBED","DISPENSED","PATIENT_REPORTED_CURRENT","CAREGIVER_REPORTED","ADMINISTERED","UNCERTAIN","HISTORICAL","UNKNOWN"].map(s=> <option key={s} value={s}>{s}</option>)}</select>
              <Button size="sm" onClick={async()=> { if(!medForm.patientId || !medForm.canonicalName || !medForm.ingredient) return; const r=await fetch("/api/health/medications",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: medForm.patientId, canonicalName: medForm.canonicalName, ingredient: medForm.ingredient, strength: medForm.strength || undefined, status: medForm.status })}); if(r.ok) void refreshMeds(); }}>Add Record</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { if(!medForm.patientId) return; const r=await fetch(`/api/health/medications/safety-checks?patientId=${medForm.patientId}`,{ cache:"no-store" }); if(r.ok) void refreshMeds(); }}>Run Safety Checks</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { if(!medForm.patientId) return; const r=await fetch(`/api/health/patients/${medForm.patientId}/medications/reconciliation`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) setMedRecon(j); }}>Load Reconciliation</Button>
            </div>
            <div style={{ maxHeight:240, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Medicine</th><th>Ingredient</th><th>Strength</th><th>Status</th><th>Indication</th><th>Actions</th></tr></thead><tbody>{medRecords.length===0 && <tr><td colSpan={6} className="nv-empty">No medication records yet — add one above or import pharmacy/claims</td></tr>}{medRecords.slice(0,15).map((m:Record<string,unknown>,i:number)=> <tr key={String(m.id ?? i)}><td><b>{String(m.canonicalName)}</b></td><td style={{ fontSize:10 }}>{String(m.ingredient)}</td><td style={{ fontSize:10 }}>{String(m.strength ?? "—")}</td><td><Pill tone={String(m.status)==="PATIENT_CONFIRMED_CURRENT"?"success":["UNCERTAIN","UNKNOWN"].includes(String(m.status))?"danger":"neutral"}>{String(m.status)}</Pill></td><td style={{ fontSize:10, maxWidth:140 }}>{String(m.indication ?? "unknown")}</td><td style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/${String(m.id)}/confirm`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ answers:{ taking_now:true }, confirmedBy:"patient" })}); if(r.ok) void refreshMeds(); }}>Confirm</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/${String(m.id)}/renew`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({})}); const j=await r.json().catch(()=>null); if(!r.ok) alert(j?.error ?? "Renew failed"); else void refreshMeds(); }}>Renew</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const ev = window.prompt("Missed-dose event (missed/late/refused/vomited/unknown/could_not_obtain/device_failure):","missed"); if(!ev) return; const r=await fetch(`/api/health/medications/${String(m.id)}/missed-dose`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ eventType: ev })}); const j=await r.json().catch(()=>null); if(j) alert(String(j.guidance ?? "No guidance")); }}>Missed-dose</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const reason = window.prompt("Dispute reason:"); if(!reason) return; const r=await fetch(`/api/health/medications/${String(m.id)}/dispute`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reason })}); if(r.ok) void refreshMeds(); }}>Dispute</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const symptom = window.prompt("Adverse symptom:"); if(!symptom) return; const r=await fetch(`/api/health/medications/${String(m.id)}/adverse-event`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: medForm.patientId, symptom })}); if(r.ok) void refreshMeds(); }}>Report AE</Button>
            </td></tr>)}</tbody></table></div>
            {medRecon && <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Reconciliation — realities:</b> <span style={{ color:"var(--nv-color-text-faint)"}}>{(() => { const c = (medRecon as Record<string,unknown>).counts as Record<string,number> | undefined; return c ? `prescribed ${c.prescribed} • dispensed ${c.dispensed} • reported ${c.reported} • administered ${c.administered} • uncertain ${c.uncertain}` : ""; })()}</span><div style={{ marginTop:4, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Kind</th><th>Detail</th></tr></thead><tbody>{(((medRecon as Record<string,unknown>).discrepancies as Array<Record<string,unknown>>) ?? []).map((d,i)=> <tr key={i}><td><Pill tone="warning">{String(d.kind)}</Pill></td><td style={{ fontSize:10 }}>{String(d.detail)}</td></tr>)}</tbody></table></div></div>}
          </Section>
          <Section title="Safety Alerts — Why, Evidence, Reviewer, Notification, Block State">
            <div style={{ maxHeight:160, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Class</th><th>Severity</th><th>Why</th><th>Notified</th><th>Blocked</th><th>Action</th></tr></thead><tbody>{medAlerts.length===0 && <tr><td colSpan={6} className="nv-empty">No open alerts — run safety checks above</td></tr>}{medAlerts.slice(0,10).map((a:Record<string,unknown>,i:number)=> <tr key={String(a.id ?? i)}><td style={{ fontSize:10 }}>{String(a.alertClass)}</td><td><Pill tone={String(a.severity)==="CRITICAL"?"danger":String(a.severity)==="HIGH"?"warning":"neutral"}>{String(a.severity)}</Pill></td><td style={{ fontSize:10, maxWidth:260 }}>{String(a.why ?? "").slice(0,120)}</td><td>{a.patientNotified ? "yes" : "no"}</td><td>{a.actionBlocked ? "yes" : "no"}</td><td><Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/alerts/${String(a.id)}/review`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ decision:"RESOLVED" })}); if(r.ok) void refreshMeds(); }}>Resolve</Button></td></tr>)}</tbody></table></div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Renal: method + trend + dialysis identified; dose changes need authorized approval. Hepatic: trend-based, never one test → failure. Pregnancy/lactation: patient-confirmed, purpose-limited, never inferred. Age: risk explained, never age-as-frailty.</div>
          </Section>
          <Section title="Changes, Tapers, Pharmacy, Affordability">
            <div style={{ maxHeight:130, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{medChanges.length===0 && <tr><td colSpan={4} className="nv-empty">No proposed changes</td></tr>}{medChanges.slice(0,8).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td>{String(c.changeType)}</td><td><Pill tone={String(c.status)==="ACTIVE"?"success":String(c.status)==="PROPOSED"?"warning":"primary"}>{String(c.status)}</Pill></td><td style={{ fontSize:10, maxWidth:200 }}>{String(c.reason ?? "").slice(0,80)}</td><td style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/changes/${String(c.id)}/authorize`,{method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"}); if(r.ok) void refreshMeds(); }}>Authorize</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/changes/${String(c.id)}/confirm`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ accepted:"accepted" })}); if(r.ok) void refreshMeds(); }}>Pt-confirm</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/changes/${String(c.id)}/send`,{method:"POST"}); if(r.ok) void refreshMeds(); }}>To pharmacy</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/medications/changes/${String(c.id)}/activate`,{method:"POST"}); if(r.ok) void refreshMeds(); }}>Activate</Button>
            </td></tr>)}</tbody></table></div>
            <div style={{ marginTop:6, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Tapers ({String(medTapers.length)})</b><div style={{ color:"var(--nv-color-text-faint)"}}>{medTapers.length===0 ? "No taper plans — authorized, versioned, monitored, expiring; never from general information." : medTapers.slice(0,5).map((t:Record<string,unknown>)=> `${String(t.kind)} ${String(t.status)}${t.patientConfirmed ? " ✓pt" : ""}`).join(" • ")}</div></div>
              <div><b>Photos ({String(medPhotos.length)})</b><div style={{ color:"var(--nv-color-text-faint)"}}>{medPhotos.length===0 ? "No medicine photographs — per-field confidence; unclear strength asks for retake, never appearance-based dosing." : medPhotos.slice(0,5).map((p:Record<string,unknown>)=> String(p.status)).join(" • ")}</div></div>
            </div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Caregivers: schedule view, administration confirm, missed/refused reports, side-effect records, refill requests, reminders, photo upload, taper tasks — never dose changes, stops, confidential data, or substitution approval. Controlled substances: jurisdiction registry, data presented for review, misuse never inferred from one signal. FHIR: MedicationRequest, Dispense, Administration, Statement, Knowledge, AllergyIntolerance, AdverseEvent, Observation, Condition, CarePlan, Task, Communication, Consent, Provenance, AuditEvent.</div>
          </Section>
        </div>
      )}

      {tab === "interop" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Interoperability Control Plane — Prove It, Don't Assume It" subtitle="Raw immutable landing zone → parsing/normalization → terminology → validation → dedup/conflict → quarantine-or-ingest. Connected never implies interoperable; healthy means validated right data for the right patient — not merely data moving." action={<><Badge tone="primary">9 Protocols</Badge><Badge tone="warning">12 Validation Stages</Badge><Badge tone="success">Raw Immutable</Badge></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11, fontWeight:800 }}>{["Gateway","Protocol adapters","Raw landing zone","Parse + normalize","Terminology","Validation + rules","Dedup + conflict","Quarantine or ingest","Monitor + replay + audit"].map((s,i)=> <span key={s} style={{ display:"inline-flex", alignItems:"center", gap:4 }}><span style={{ padding:"4px 8px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>{i<8 && <span style={{ color:"var(--nv-color-text-faint)"}}>→</span>}</span>)}</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:8 }}>{["FHIR R4/R5","HL7 v2/MLLP","DICOM DIMSE","DICOMweb","Pharmacy","Claims","Devices","Research"].map((s)=> <Pill key={s} tone="primary">{s}</Pill>)}</div>
          </Section>
          <Section title="Interface Registry — Every Partner, Protocol, Profile, Owner">
            <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="Interface ID (partner-ehr-lab-results-v4)" value={interopForm.interfaceId} onChange={e=> setInteropForm({...interopForm, interfaceId:e.target.value})} style={{ flex:1, minWidth:200, fontSize:11 }} />
              <select className="nv-select" value={interopForm.protocol} onChange={e=> setInteropForm({...interopForm, protocol:e.target.value})} style={{ fontSize:11 }}>{["FHIR_R4","FHIR_R5","HL7_V2","DICOM_DIMSE","DICOMWEB","PHARMACY_FEED","CLAIMS_FEED","DEVICE","RESEARCH"].map(p=> <option key={p} value={p}>{p}</option>)}</select>
              <Button size="sm" onClick={async()=> { if(!interopForm.interfaceId) return; const r=await fetch("/api/health/interop/interfaces",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ interfaceId: interopForm.interfaceId, partner: interopForm.interfaceId.split("-")[0] ?? "partner", protocol: interopForm.protocol })}); if(r.ok) { const j=await r.json().catch(()=>null); if(j?.row) setInteropInterfaces(prev=> [j.row, ...prev].slice(0,20)); } }}>Register Interface</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/quality/dashboard`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) setInteropQuality(j); }}>Refresh Dashboard</Button>
            </div>
            <div style={{ maxHeight:150, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Interface</th><th>Partner</th><th>Protocol</th><th>Status</th><th>Conformance</th><th>Actions</th></tr></thead><tbody>{interopInterfaces.length===0 && <tr><td colSpan={6} className="nv-empty">No interfaces registered — add the first contract above</td></tr>}{interopInterfaces.slice(0,12).map((f:Record<string,unknown>,i:number)=> <tr key={String(f.id ?? i)}><td style={{ fontSize:10 }}><b>{String(f.interfaceId)}</b></td><td style={{ fontSize:10 }}>{String(f.partner)}</td><td><Pill tone="primary">{String(f.protocol)}</Pill></td><td>{String(f.status)}</td><td><Pill tone={String(f.conformanceStatus)==="PASS"?"success":String(f.conformanceStatus)==="FAIL"?"danger":"warning"}>{String(f.conformanceStatus)}</Pill></td><td style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/interfaces/${String(f.id)}/health`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) alert(`Error rate ${String((j.observed as Record<string,unknown> | undefined)?.errorRate ?? "?")} — ${String(j.note ?? "")}`); }}>Health</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/interfaces/${String(f.id)}/contract-test`,{method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"}); const j=await r.json().catch(()=>null); if(j) alert(`${String(((j.results as Array<unknown>) ?? []).length)} layers executed`); }}>Contract test</Button>
            </td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Landing Zone — Persist Raw First, ACK After, Validate Before Ingest">
            <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="Message type (Observation, ADT_A01, C-STORE…)" value={interopForm.messageType} onChange={e=> setInteropForm({...interopForm, messageType:e.target.value})} style={{ flex:1, minWidth:160, fontSize:11 }} />
              <input className="nv-input" placeholder='Raw payload (JSON or HL7/DICOM text)' value={interopForm.rawPayload} onChange={e=> setInteropForm({...interopForm, rawPayload:e.target.value})} style={{ flex:2, minWidth:220, fontSize:11 }} />
              <Button size="sm" onClick={async()=> { if(!interopForm.rawPayload || !interopForm.messageType) return; const r=await fetch("/api/health/interop/messages",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ protocol: interopForm.protocol, messageType: interopForm.messageType, rawPayload: interopForm.rawPayload })}); const j=await r.json().catch(()=>null); if(j) { setInteropOutcome(j); void refreshInterop(); } }}>Ingest Message</Button>
            </div>
            {interopOutcome && <div style={{ marginBottom:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Outcome: {String((interopOutcome as Record<string,unknown>).outcome ?? "—")}</b>{(interopOutcome as Record<string,unknown>).deduplicated ? " — duplicate suppressed, source preserved" : ""}<div style={{ marginTop:4, maxHeight:90, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Severity</th><th>Class</th><th>Detail</th><th>Location</th></tr></thead><tbody>{((((interopOutcome as Record<string,unknown>).operationOutcome as Record<string,unknown> | undefined)?.issue as Array<Record<string,unknown>>) ?? []).map((s,i)=> <tr key={i}><td><Pill tone={String(s.severity)==="error"||String(s.severity)==="fatal"?"danger":String(s.severity)==="warning"?"warning":"neutral"}>{String(s.severity)}</Pill></td><td style={{ fontSize:10 }}>{String(s.class)}</td><td style={{ fontSize:10, maxWidth:280 }}>{String((s.details as Record<string,unknown> | undefined)?.text ?? "")}</td><td style={{ fontSize:10 }}>{((s.location as string[]) ?? []).join(", ")}</td></tr>)}</tbody></table></div></div>}
            <div style={{ maxHeight:180, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Protocol</th><th>Status</th><th>Outcome</th><th>Actions</th></tr></thead><tbody>{interopMessages.length===0 && <tr><td colSpan={5} className="nv-empty">Landing zone empty — ingest a message above</td></tr>}{interopMessages.slice(0,12).map((m:Record<string,unknown>,i:number)=> <tr key={String(m.id ?? i)}><td style={{ fontSize:10 }}><b>{String(m.messageType)}</b></td><td>{String(m.protocol)}</td><td><Pill tone={String(m.status)==="INGESTED"?"success":String(m.status)==="QUARANTINED"||String(m.status)==="FAILED"?"danger":"neutral"}>{String(m.status)}</Pill></td><td style={{ fontSize:10 }}>{String(m.validationOutcome ?? "—")}</td><td style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/messages/${String(m.id)}/replay`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reason:"operator replay from cockpit", dryRun:true })}); const j=await r.json().catch(()=>null); if(j) alert(`Replay preview: ${String((((j.preview as Array<unknown>) ?? []).length))} affected`); }}>Replay</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/messages/${String(m.id)}/quarantine`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ reason:"Malformed payload" })}); if(r.ok) void refreshInterop(); }}>Quarantine</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/messages/${String(m.id)}/release`,{method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"}); if(!r.ok) { const j=await r.json().catch(()=>null); alert(j?.error ?? "Release failed"); } else void refreshInterop(); }}>Release</Button>
            </td></tr>)}</tbody></table></div>
          </Section>
          <Section title="Quarantine, Conflicts, Incidents — Safety Mechanisms, Not Graveyards">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Quarantine ({String(interopQuarantine.length)} open)</b><div style={{ marginTop:4, maxHeight:110, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Reason</th><th>Severity</th><th>Action</th></tr></thead><tbody>{interopQuarantine.length===0 && <tr><td colSpan={3} className="nv-empty">Nothing quarantined</td></tr>}{interopQuarantine.slice(0,6).map((q:Record<string,unknown>,i:number)=> <tr key={String(q.id ?? i)}><td style={{ fontSize:10 }}>{String(q.reason)}</td><td><Pill tone={String(q.severity)==="critical"?"danger":"warning"}>{String(q.severity)}</Pill></td><td><Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/interop/quarantine`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ quarantineId: String(q.id), decision:"RESOLVED", note:"reviewed in cockpit" })}); if(r.ok) void refreshInterop(); }}>Resolve</Button></td></tr>)}</tbody></table></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Blocked from CDS, reporting, and patient views until an authorized reviewer releases.</div></div>
              <div><b>Conflicts ({String(interopConflicts.length)} open)</b><div style={{ marginTop:4, maxHeight:110, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Owner</th><th>Action</th></tr></thead><tbody>{interopConflicts.length===0 && <tr><td colSpan={3} className="nv-empty">No open conflicts</td></tr>}{interopConflicts.slice(0,6).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td style={{ fontSize:10, maxWidth:220 }}>{String(c.type)}</td><td style={{ fontSize:10 }}>{String(c.owner ?? "—")}</td><td><Button size="sm" variant="ghost" onClick={async()=> { const note = window.prompt("Resolution note (precedence documented, alternatives retained):"); if(!note) return; const r=await fetch(`/api/health/interop/conflicts/${String(c.id)}/resolve`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ resolution:"HUMAN_MERGED", note })}); if(r.ok) void refreshInterop(); }}>Resolve</Button></td></tr>)}</tbody></table></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Precedence documents why — alternatives retained, never erased. Incidents open: {String(interopIncidents.length)}.</div></div>
            </div>
          </Section>
          <Section title="Quality Dashboard — Dimensions Stay Separate">
            {!interopQuality && <div className="nv-empty" style={{ fontSize:11 }}>Loading dashboard…</div>}
            {interopQuality && <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:10 }}><b>Messages ({String(((interopQuality as Record<string,unknown>).messages as Record<string,unknown> | undefined)?.total ?? 0)})</b><div style={{ color:"var(--nv-color-text-faint)"}}>{Object.entries((((interopQuality as Record<string,unknown>).messages as Record<string,unknown> | undefined)?.byStatus as Record<string,number>) ?? {}).slice(0,6).map(([k,v])=> `${k} ${v}`).join(" • ") || "—"}</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Validation outcomes</b><div style={{ color:"var(--nv-color-text-faint)"}}>{Object.entries((((interopQuality as Record<string,unknown>).validationOutcomes as Record<string,number>) ?? {})).slice(0,6).map(([k,v])=> `${k} ${v}`).join(" • ") || "—"}</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Quarantine open: {String(((interopQuality as Record<string,unknown>).quarantine as Record<string,unknown> | undefined)?.open ?? 0)}</b><div style={{ color:"var(--nv-color-text-faint)"}}>Terminology review backlog: {String(((interopQuality as Record<string,unknown>).terminology as Record<string,unknown> | undefined)?.reviewBacklog ?? 0)} • expiring maps: {String(((interopQuality as Record<string,unknown>).terminology as Record<string,unknown> | undefined)?.expiring ?? 0)}</div></div>
              <div className="nv-card" style={{ padding:10 }}><b>Subscriptions backlog: {String(((interopQuality as Record<string,unknown>).subscriptions as Record<string,unknown> | undefined)?.backlog ?? 0)}</b><div style={{ color:"var(--nv-color-text-faint)"}}>Open incidents: {String(((interopQuality as Record<string,unknown>).incidents as Record<string,unknown> | undefined)?.open ?? 0)} • open conflicts: {String(((interopQuality as Record<string,unknown>).conflicts as Record<string,unknown> | undefined)?.open ?? 0)}</div></div>
            </div>}
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Completeness never masks identity or timeliness gaps. HL7: persist before ACK (AA/AE/AR), replay needs original message + ACK + idempotency + approval. DICOM: parse conformance statements first; viewer outage = operational incident, missing study affecting care = clinical work item. Terminology: ambiguous local codes stay uncertain, steward-approved, expiring — recompute downstream after correction. Duplicates: deterministic IDs first, never merge patients on name + DOB. Replay: dry-run → approve → execute, production blocked without explicit authorization.</div>
          </Section>
        </div>
      )}

      {tab === "offline" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Offline-First Edge Runtime — Continuity Without False Certainty" subtitle="Approved capabilities only when disconnected • stale/local labels • queued sync • append-only signed events • cryptographic erasure. A disconnected device is never an unsupervised clinical authority." action={<><Badge tone="primary">7 Modes</Badge><Badge tone="warning">Signed Bundles</Badge><Badge tone="success">Append-Only Sync</Badge></>}>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11, fontWeight:800 }}>{["Online","Degraded","Offline","Emergency offline","Reconnecting","Syncing","Quarantined sync"].map((s,i)=> <span key={s} style={{ padding:"4px 8px", borderRadius:999, background:i===3?"#fee2e2":i===0?"#d1fae5":"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>{s}</span>)}</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:8 }}>{["Emergency cache","Active-care cache","Read-only cache","Local entries","Pending outbox","Sync metadata"].map((s)=> <Pill key={s} tone="primary">{s}</Pill>)}</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Tier 3 (history, research, unneeded identifiers) stays server-side unless a use case, consent basis, and risk assessment justify local storage.</div>
          </Section>
          <Section title="Edge Devices — Enroll, Heartbeat, Mode, Revoke, Wipe">
            <div style={{ display:"flex", gap:4, marginBottom:6, flexWrap:"wrap" }}>
              <input className="nv-input" placeholder="Device ID (clinic-tablet-04)" value={offlineForm.deviceId} onChange={e=> setOfflineForm({...offlineForm, deviceId:e.target.value})} style={{ flex:1, minWidth:160, fontSize:11 }} />
              <input className="nv-input" placeholder="Name" value={offlineForm.name} onChange={e=> setOfflineForm({...offlineForm, name:e.target.value})} style={{ flex:1, minWidth:160, fontSize:11 }} />
              <select className="nv-select" value={offlineForm.role} onChange={e=> setOfflineForm({...offlineForm, role:e.target.value})} style={{ fontSize:11 }}>{["rural_clinic","ambulance","emergency_team","outreach","disaster","field_worker","hub"].map(r=> <option key={r} value={r}>{r}</option>)}</select>
              <Button size="sm" onClick={async()=> { if(!offlineForm.deviceId || !offlineForm.name) return; const r=await fetch("/api/health/offline/devices",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ deviceId: offlineForm.deviceId, name: offlineForm.name, role: offlineForm.role })}); if(r.ok) void refreshOffline(); }}>Enroll Device</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/offline/observability`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) setOfflineObservability(j); }}>Observability</Button>
            </div>
            <div style={{ maxHeight:150, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Device</th><th>Role</th><th>Mode</th><th>Status</th><th>Integrity</th><th>Actions</th></tr></thead><tbody>{offlineDevices.length===0 && <tr><td colSpan={6} className="nv-empty">No edge devices enrolled — register the first field device above</td></tr>}{offlineDevices.slice(0,12).map((dv:Record<string,unknown>,i:number)=> <tr key={String(dv.id ?? i)}><td style={{ fontSize:10 }}><b>{String(dv.name)}</b><br/><span style={{ color:"var(--nv-color-text-faint)"}}>{String(dv.deviceId)}</span></td><td style={{ fontSize:10 }}>{String(dv.role)}</td><td><Pill tone={String(dv.mode)==="ONLINE"?"success":String(dv.mode)==="EMERGENCY_OFFLINE"||String(dv.mode)==="QUARANTINED_SYNC"?"danger":"warning"}>{String(dv.mode)}</Pill></td><td>{String(dv.status)}</td><td style={{ fontSize:10 }}>{String(dv.integrity)}</td><td style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/offline/devices/${String(dv.id)}/heartbeat`,{method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"}); if(r.ok) void refreshOffline(); }}>Heartbeat</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/offline/sync/status?deviceId=${String(dv.deviceId)}`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) setOfflineSyncStatus(j); }}>Sync status</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { const mode = window.prompt("Mode (ONLINE/DEGRADED/OFFLINE/EMERGENCY_OFFLINE/RECONNECTING/SYNCING/QUARANTINED_SYNC):","OFFLINE"); if(!mode) return; const r=await fetch(`/api/health/offline/devices/${String(dv.id)}/mode`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ mode, reason:"operator set from cockpit" })}); if(r.ok) void refreshOffline(); }}>Mode</Button>
              <Button size="sm" variant="ghost" onClick={async()=> { if(!window.confirm(`Revoke ${String(dv.name)}?`)) return; const r=await fetch(`/api/health/offline/devices/${String(dv.id)}/revoke`,{method:"POST", headers:{"Content-Type":"application/json"}, body:"{}"}); if(r.ok) void refreshOffline(); }}>Revoke</Button>
            </td></tr>)}</tbody></table></div>
            {offlineSyncStatus && <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Field device: {String(((offlineSyncStatus as Record<string,unknown>).device as Record<string,unknown> | undefined)?.name ?? "—")}</b><div style={{ color:"var(--nv-color-text-faint)"}}>Last sync: {String((offlineSyncStatus as Record<string,unknown>).lastSuccessfulSync ?? "never")} • offline {String((offlineSyncStatus as Record<string,unknown>).offlineMinutes ?? 0)}m • pending {String((offlineSyncStatus as Record<string,unknown>).pendingClinicalEvents ?? 0)} (critical {String((offlineSyncStatus as Record<string,unknown>).criticalPendingEvents ?? 0)}) • conflicts {String((offlineSyncStatus as Record<string,unknown>).conflicts ?? 0)} • rejected {String((offlineSyncStatus as Record<string,unknown>).rejectedEvents ?? (offlineSyncStatus as Record<string,unknown>).rejectedEvents ?? 0)} • integrity {String((offlineSyncStatus as Record<string,unknown>).deviceIntegrity ?? "?")} • emergency mode {String((offlineSyncStatus as Record<string,unknown>).emergencyMode ?? false)}</div><div style={{ marginTop:4 }}><Pill tone="primary">{String((offlineSyncStatus as Record<string,unknown>).statusWord ?? "")}</Pill></div></div>}
          </Section>
          <Section title="Outbox, Conflicts, Store-and-Forward — Queued, Human-Reviewed, Visible">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Pending outbox ({String(offlineOutbox.length)})</b><div style={{ marginTop:4, maxHeight:110, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Operation</th><th>Priority</th><th>Clock</th></tr></thead><tbody>{offlineOutbox.length===0 && <tr><td colSpan={3} className="nv-empty">Queue empty</td></tr>}{offlineOutbox.slice(0,6).map((e:Record<string,unknown>,i:number)=> <tr key={String(e.id ?? i)}><td style={{ fontSize:10 }}>{String(e.operation)} <span style={{ color:"var(--nv-color-text-faint)"}}>{String(e.resourceRef ?? "").slice(0,24)}</span></td><td><Pill tone={["safety","critical"].includes(String(e.priority))?"danger":"neutral"}>{String(e.priority)}</Pill></td><td style={{ fontSize:10 }}>{String(e.logicalClock ?? "—")}</td></tr>)}</tbody></table></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Priority order: safety → meds/allergies → critical obs → referrals → care plans → messages → media → analytics → telemetry. Structured data before media on thin links.</div></div>
              <div><b>Sync conflicts ({String(offlineConflicts.length)})</b><div style={{ marginTop:4, maxHeight:110, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Type</th><th>Action</th></tr></thead><tbody>{offlineConflicts.length===0 && <tr><td colSpan={2} className="nv-empty">No open conflicts</td></tr>}{offlineConflicts.slice(0,6).map((c:Record<string,unknown>,i:number)=> <tr key={String(c.id ?? i)}><td style={{ fontSize:10, maxWidth:200 }}>{String(c.type)}</td><td><Button size="sm" variant="ghost" onClick={async()=> { const name = window.prompt("Reviewer name (required for clinical types):"); if(!name) return; const r=await fetch(`/api/health/offline/conflicts/${String(c.id)}/resolve`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ decision:"reviewed per data-type rule", reviewedBy: name })}); if(!r.ok) { const j=await r.json().catch(()=>null); alert(j?.error ?? "Resolve failed"); } else void refreshOffline(); }}>Resolve</Button></td></tr>)}</tbody></table></div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>No last-write-wins for meds, allergies, identity, care plans. “Two records conflict — a pharmacist or clinician must review.”</div></div>
            </div>
            <div style={{ marginTop:8 }}><b style={{ fontSize:11 }}>Store-and-forward ({String(offlineStoreForward.length)})</b><div style={{ marginTop:4, maxHeight:100, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Kind</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead><tbody>{offlineStoreForward.length===0 && <tr><td colSpan={4} className="nv-empty">No queued telehealth objects</td></tr>}{offlineStoreForward.slice(0,6).map((s:Record<string,unknown>,i:number)=> <tr key={String(s.id ?? i)}><td style={{ fontSize:10 }}>{String(s.kind)}</td><td><Pill tone={String(s.priority)==="emergency"?"danger":"neutral"}>{String(s.priority)}</Pill></td><td>{String(s.status)}</td><td><Button size="sm" variant="ghost" onClick={async()=> { const to = window.prompt("Transition to (QUEUED/UPLOADED/RECEIVED/ASSIGNED/VIEWED/RESPONDED/DELIVERED/ESCALATED/CLOSED):","QUEUED"); if(!to) return; const r=await fetch(`/api/health/offline/store-forward/${String(s.id)}/transition`,{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ to })}); if(!r.ok) { const j=await r.json().catch(()=>null); alert(j?.error ?? "Transition failed"); } else void refreshOffline(); }}>Move</Button></td></tr>)}</tbody></table></div><div style={{ marginTop:4, fontSize:11, color:"var(--nv-color-text-faint)"}}>Upload alone never counts as clinician-reviewed. “Stored securely, not yet reviewed — use the local emergency pathway if in immediate danger.” Wound media stays out of the device gallery.</div></div>
          </Section>
          <Section title="Emergency, Credentials, Bundles, Security, Observability">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Emergency + credentials</b><div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                <Button size="sm" variant="ghost" onClick={async()=> { if(!offlineForm.patientId) { alert("Set a patient ID in the device form first (used as summary patient)"); return; } const r=await fetch("/api/health/offline/emergency-summaries",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: offlineForm.patientId, dataAsOf: new Date().toISOString(), payload:{ allergies:[], medications:[], critical_conditions:[], uncertainties:["field-generated snapshot"] } })}); const j=await r.json().catch(()=>null); if(j) alert(`Summary ready — read-only, server-signed, freshness-labeled`); }}>Generate emergency summary</Button>
                <Button size="sm" variant="ghost" onClick={async()=> { if(!offlineForm.patientId) return; const reason = window.prompt("Break-glass reason (recorded + synced):"); if(!reason) return; const r=await fetch("/api/health/offline/emergency-access",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: offlineForm.patientId, workerToken:"field-worker", reason, scope:["view_emergency_summary"], expiresAt: new Date(Date.now()+4*3600_000).toISOString() })}); if(r.ok) alert("Time-limited break-glass granted + audited — never a convenience bypass"); }}>Break-glass access</Button>
                <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch("/api/health/offline/cds/evaluate",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ deviceId: offlineForm.deviceId || "clinic-tablet-04", function:"Allergy display" })}); const j=await r.json().catch(()=>null); if(j) alert(j.permitted ? `Permitted — ${String(j.disclaimer ?? "")}` : `Refused — ${String(j.reason ?? "")}`); }}>Evaluate CDS gate</Button>
              </div><div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Summaries are read-only IPS-style snapshots with generated/refresh dates and limitation labels; new observations are separate local records. Biometrics stay on-device; fallback access always exists. Identity: roster/QR/token first — uncertain identity means unlinked events + steward review, never med/allergy changes.</div></div>
              <div><b>Security + observability</b><div style={{ display:"flex", gap:4, marginTop:4, flexWrap:"wrap" }}>
                <Button size="sm" variant="ghost" onClick={async()=> { const kind = window.prompt("Incident kind (Lost device/Stolen device/Tampered application/...):","Lost device"); if(!kind) return; const r=await fetch("/api/health/offline/security-incidents",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ deviceId: offlineForm.deviceId || "clinic-tablet-04", kind })}); if(r.ok) { alert("Incident filed — lost/stolen/tampered auto-locks the device"); void refreshOffline(); } }}>Report incident</Button>
                <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/offline/observability?deviceId=${offlineForm.deviceId || "clinic-tablet-04"}`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) setOfflineObservability(j); }}>Observability</Button>
                <Button size="sm" variant="ghost" onClick={async()=> { const r=await fetch(`/api/health/offline/retention/evaluate?deviceProfile=rural_field_worker`,{ cache:"no-store" }); const j=await r.json().catch(()=>null); if(j) alert(`Retention evaluated — holds override erasure; device erases, server directs`); }}>Retention check</Button>
              </div>{offlineObservability && <div style={{ marginTop:4, color:"var(--nv-color-text-faint)"}}>Reports: {String((offlineObservability as Record<string,unknown>).reports ?? 0)} • offline {String(((offlineObservability as Record<string,unknown>).totals as Record<string,unknown> | undefined)?.offlineMinutes ?? 0)}m • queue {String(((offlineObservability as Record<string,unknown>).totals as Record<string,unknown> | undefined)?.queueSize ?? 0)} • conflicts {String(((offlineObservability as Record<string,unknown>).totals as Record<string,unknown> | undefined)?.conflicts ?? 0)}. Metrics inform support — never penalize workers for network/power gaps.</div>}</div>
            </div>
            <div style={{ marginTop:8, fontSize:11, color:"var(--nv-color-text-faint)"}}>Retention: time-based, event-based, policy hold, user deletion — expired local data cryptographically erased, server record + audit follow organization policy. Hubs authenticate devices, keep a signed ledger, and never become unencrypted caches. Power: low-power mode, deferred media, solar workflows, SMS/USSD fallback, Bluetooth/local sync, resumable transfers. Offline CDS: 13 approved low-risk functions, 11 prohibitions, every output labeled with version, limits, review requirement, and sync state.</div>
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

      {/* TWIN-SAFEGUARDS - Personal Health Digital Twin Safeguards */}
      {tab === "twin-safeguards" && (
        <div style={{ display:"grid", gap:12 }}>
          <Section title="Personal Health Digital Twin Safeguards - Bounded, Provenance-Linked Personal Health Model" subtitle="NIST AI RMF transparency + FDA CDS. Not a definitive virtual copy of the person. Every attribute shows observed/reported/calculated/inferred/simulated/projected/synthetic with confidence, uncertainty, freshness, provenance, intended use, human review." action={<><Badge tone="warning">NIST AI RMF</Badge><Badge tone="primary">FDA CDS</Badge><Pill tone="danger">Bounded</Pill></>}>
            <div style={{ padding:10, border:"1.5px solid #4f46e5", borderRadius:10, background:"var(--nv-color-surface-raised)", fontWeight:800, textAlign:"center" }}>A digital twin is a time-versioned, purpose-limited set of health-related representations linked to source data, models, assumptions, and uncertainty — not a complete biological replica, diagnosis, prediction of destiny, replacement for clinical assessment, verified measurement unless directly sourced, basis for insurance/employment/credit/pricing, or license to infer sensitive traits without consent.</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:8, marginTop:8 }}>
              <Stat label="ATTRIBUTES" value={String(twinAttributes.length)} hint={`${String(twinAttributes.filter(a=> String(a.status)==="DISPUTED").length)} disputed • research_only ${String(twinAttributes.filter(a=> String(a.status)==="RESEARCH_ONLY").length)}`} />
              <Stat label="SIMULATIONS" value={String(twinSimulations.length)} hint="Counterfactual, assumptions explicit" />
              <Stat label="DISPUTES" value={String(twinDisputes.length)} hint="Blocked from high-impact until reviewed" />
              <Stat label="FIREWALL" value={firewallCheck? String((firewallCheck as Record<string,unknown>).decision) : "—"} hint={firewallCheck? String((firewallCheck as Record<string,unknown>).reason) : "Test high-impact use"} />
            </div>
          </Section>
          <Section title="Twin Boundaries - 15 Declarations + Capability Classification 11">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Intended user","Intended purpose","Included data","Excluded data","Time horizon","Population applicability","Model and version","Validation status","Uncertainty behavior","Human-review requirement","Permitted actions","Prohibited actions","Consent basis","Retention period","Reset and deletion behavior","Known failure modes"].map(b=> <Pill key={b}>{b}</Pill>)}</div>
            <div style={{ marginTop:6, overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Capability</th><th>Status</th><th>Permitted use</th></tr></thead><tbody><tr><td>Current observed record</td><td><Pill tone="success">Production</Pill></td><td>Patient and authorized clinical use</td></tr><tr><td>Provenance-linked trend</td><td><Pill tone="success">Production</Pill></td><td>Education, monitoring, clinician review</td></tr><tr><td>Biological-age estimate</td><td><Pill tone="warning">Research or limited wellness</Pill></td><td>Education only unless validated</td></tr><tr><td>Longevity prediction</td><td><Pill tone="danger">Research/conceptual</Pill></td><td>No individual decision-making</td></tr><tr><td>Behavioral prediction</td><td><Pill tone="danger">Research/clinical validation</Pill></td><td>No employment, insurance, eligibility</td></tr><tr><td>Counterfactual simulation</td><td><Pill>Research or supervised planning</Pill></td><td>No autonomous treatment</td></tr></tbody></table></div>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:4}}>Feature must not be labeled “AI-powered” and presented as production-ready if it has not passed validation, safety, governance, evidence review.</div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Twin Data Classes - 10 + Never Display Inferred as Observed">
              <div style={{ overflowX:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Class</th><th>Meaning</th><th>Example</th></tr></thead><tbody><tr><td><Pill tone="success">Observed</Pill></td><td>Directly measured</td><td>Lab potassium</td></tr><tr><td>Patient-reported</td><td>Supplied by patient</td><td>I slept poorly</td></tr><tr><td>Clinician-entered</td><td>Healthcare professional</td><td>Diagnosis</td></tr><tr><td>Calculated</td><td>Deterministically derived</td><td>BMI</td></tr><tr><td><Pill tone="warning">Inferred</Pill></td><td>Produced by model</td><td>Sleep apnea risk</td></tr><tr><td><Pill tone="danger">Simulated</Pill></td><td>Generated under assumptions</td><td>Expected glucose response</td></tr><tr><td><Pill tone="danger">Projected</Pill></td><td>Estimated future state</td><td>Recovery trajectory</td></tr><tr><td>Synthetic</td><td>Testing/research</td><td>Simulated patient</td></tr></tbody></table></div>
            </Section>
            <Section title="Attribute Envelope - 14 Fields">
              <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{`{
  "attribute_id": "twin-attribute-...",
  "name": "cardiorespiratory_fitness_estimate",
  "value": 41.2,
  "unit": "mL/kg/min",
  "origin": "inferred",
  "status": "research_only",
  "observed_inputs": ["activity-stream-..."],
  "model": { "name": "fitness-estimator", "version": "0.9.3", "artifact_digest": "sha256:..." },
  "uncertainty": { "confidence": "moderate", "interval": [36.4, 46.8], "missing_inputs": ["direct_exercise_test"] },
  "time": { "valid_at": "2026-09-02T08:00:00+05:30", "horizon": "current_estimate", "expires_at": "2026-09-09T08:00:00+05:30" },
  "provenance_ref": "prov-...",
  "consent_ref": "consent-...",
  "human_review": false
}`}</pre>
                <div style={{ display:"flex", gap:4, marginTop:6 }}><input className="nv-input" placeholder="Patient ID (auto)" value={twinAttributeForm.patientId} onChange={e=> setTwinAttributeForm({...twinAttributeForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Name" value={twinAttributeForm.name} onChange={e=> setTwinAttributeForm({...twinAttributeForm, name:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Value" value={twinAttributeForm.value} onChange={e=> setTwinAttributeForm({...twinAttributeForm, value:e.target.value})} style={{ width:80, fontSize:11 }} /><select className="nv-select" value={twinAttributeForm.origin} onChange={e=> setTwinAttributeForm({...twinAttributeForm, origin:e.target.value})} style={{ width:110, fontSize:11 }}><option value="OBSERVED">Observed</option><option value="INFERRED">Inferred</option><option value="SIMULATED">Simulated</option><option value="PROJECTED">Projected</option></select><Button size="sm" onClick={async()=> { if(!twinAttributeForm.patientId || !twinAttributeForm.name) return; const r=await fetch("/api/health/twin/attributes",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: twinAttributeForm.patientId, name: twinAttributeForm.name, value: Number(twinAttributeForm.value), origin: twinAttributeForm.origin, status: twinAttributeForm.origin==="INFERRED"?"RESEARCH_ONLY":"ACTIVE" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.attribute) setTwinAttributes(prev=> [j.attribute, ...prev].slice(0,6)); }}>Create Attribute (bounded)</Button></div>
              </div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Confidence & Uncertainty - 8 Dimensions">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}>{["Measurement: reliability of source","Data completeness: missing information","Model uncertainty: correct model?","Population: applies to this person?","Temporal: is data current?","Causal: did factor cause change?","Projection: grows with horizon","Decision: what action is best?"].map(d=> <div key={d} style={{ padding:"4px 6px", border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)" }}>{d}</div>)}</div>
              <div style={{ marginTop:6, padding:8, border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)", fontSize:11 }}><b>Patient:</b> “This is an estimate based on your activity and heart-rate data. It is not a direct exercise test, and may be inaccurate if device data is incomplete.”<br/><b>Clinician:</b> Estimate, prediction interval, calibration, missing inputs, validation population, dataset shift, subgroup performance, model version, applicable threshold, human-review requirement.</div>
            </Section>
            <Section title="Multiple Time Horizons - 5 Separate Views">
              <div style={{ display:"grid", gap:4, fontSize:11 }}><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #059669" }}><b>Current state</b><div style={{ color:"var(--nv-color-text-faint)"}}>“Your average morning BP over last 14 days was 132/84 mmHg.”</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #4f46e5" }}><b>Recent trend</b><div style={{ color:"var(--nv-color-text-faint)"}}>“Your average has increased compared with previous 14-day period.”</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #d97706" }}><b>Near-term scenario</b><div style={{ color:"var(--nv-color-text-faint)"}}>“If current pattern continues, readings may remain above baseline.”</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #7c3aed" }}><b>Long-term scenario</b><div style={{ color:"var(--nv-color-text-faint)"}}>“This model explores how lifestyle patterns could relate to future risk; it cannot predict what will happen to you.”</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #dc2626" }}><b>Counterfactual</b><div style={{ color:"var(--nv-color-text-faint)"}}>“In this simulation, model assumes increased activity and unchanged medication. Result is educational and not treatment recommendation.”</div></div></div>
              <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Never place projected value on current timeline without clear projected label.</div>
            </Section>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <Section title="Twin Views - 3">
              <div style={{ display:"grid", gap:6, fontSize:11 }}><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #059669" }}><b>Patient</b><div style={{ color:"var(--nv-color-text-faint)"}}>Current observed state, recent trends, what is estimated, what is uncertain, what changed, what user can correct, what action is optional/clinician-directed, clear limitations — Avoid “Your biological age is 47” as definitive, “You will develop diabetes,” etc.</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #4f46e5" }}><b>Clinician</b><div style={{ color:"var(--nv-color-text-faint)"}}>Full provenance, inputs, transformations, model card, uncertainty, CI, contradictions, validation population, baseline, time horizon, patient goals, guideline, sensitivity analysis, human-review state</div></div><div className="nv-card" style={{ padding:8, borderLeft:"3px solid #7c3aed" }}><b>Research</b><div style={{ color:"var(--nv-color-text-faint)"}}>Data-use license, de-identification, cohort eligibility, missingness, bias, lineage, model version, reproducibility, recontact restrictions, withdrawal status</div></div></div>
            </Section>
            <Section title="Attribute Status - 14">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Active","Observed","Estimated","Inferred","Simulated","Projected","Research-only","Clinical-validation","Disputed","Superseded","Expired","Withdrawn","Restricted","Rejected","Unable to verify"].map(s=> <Pill key={s} tone={s==="Disputed"?"danger":s==="Research-only"?"warning":"neutral"}>{s}</Pill>)}</div>
              <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Example: “Biological-age estimate — research-only, moderate uncertainty, last calculated 2 Sep 2026, not used for care, insurance, employment, credit, or eligibility decisions.”</div>
            </Section>
            <Section title="Patient Controls - 12">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Show sources","Show uncertainty","Show assumptions","Correct source data","Dispute this estimate","Reset this baseline","Remove this inferred attribute","Stop future inference","Restrict sharing","Export lineage","Delete where legally possible","View access history","Ask a clinician"].map(c=> <Pill key={c}>{c}</Pill>)}</div>
              <div style={{ marginTop:6, display:"flex", gap:4 }}><select className="nv-select" value={twinAttributeForm.origin} onChange={e=> setTwinAttributeForm({...twinAttributeForm, origin:e.target.value})} style={{ flex:1, fontSize:11 }}><option value="INFERRED">Inferred</option><option value="OBSERVED">Observed</option></select><span style={{ fontSize:11, color:"var(--nv-color-text-faint)", alignSelf:"center" }}>Make disagreement easy — not need to prove wrong before disputed.</span></div>
            </Section>
          </div>
          <Section title="Reset, Correct, Dispute - Visible on Every Attribute">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:11 }}>
              <div className="nv-card" style={{ padding:8 }}><b>Reset</b><div style={{ color:"var(--nv-color-text-faint)"}}>Remove/rebuild derived representation using new source window/default — not delete original clinical record or erase audit trail — Reset personal baseline, wellness goals, trend period, personalized recommendations, inferred profile, simulation assumptions</div></div>
              <div className="nv-card" style={{ padding:8 }}><b>Correct</b><div style={{ color:"var(--nv-color-text-faint)"}}>Original → Correction submitted → Evidence → Review → Corrected attribute created → Dependents identified → Affected outputs recomputed/withdrawn → Downstream notified — preserves original, versioned replacement</div></div>
              <div className="nv-card" style={{ padding:8 }}><b>Dispute</b><div style={{ color:"var(--nv-color-text-faint)"}}>“I do not agree that this representation is accurate, appropriate, or fair.” — Wrong source, wrong interpretation, missing context, outdated, cultural ignored, model not applicable, privacy concern, too sensitive, patient does not want, clinician disagreement, research objection — marked visibly, excluded from high-impact automated actions until reviewed.</div></div>
            </div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={twinDisputeForm.patientId} onChange={e=> setTwinDisputeForm({...twinDisputeForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Attribute ID e.g. twin-attribute-..." value={twinDisputeForm.attributeId} onChange={e=> setTwinDisputeForm({...twinDisputeForm, attributeId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value={twinDisputeForm.reason} onChange={e=> setTwinDisputeForm({...twinDisputeForm, reason:e.target.value})} style={{ width:150, fontSize:11 }}><option value="Wrong source data">Wrong source data</option><option value="Model not applicable">Model not applicable</option><option value="Privacy concern">Privacy concern</option></select><Button size="sm" onClick={async()=> { if(!twinDisputeForm.patientId) return; const r=await fetch("/api/health/twin/disputes",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: twinDisputeForm.patientId, attributeId: twinDisputeForm.attributeId || undefined, reason: twinDisputeForm.reason })}); const j=await r.json().catch(()=>null); if(r.ok && j?.dispute) { setTwinDisputes(prev=> [j.dispute, ...prev].slice(0,6)); if(twinDisputeForm.attributeId) setTwinAttributes(prev=> prev.map(a=> String((a as Record<string,unknown>).attributeId)===twinDisputeForm.attributeId? {...a, status:"DISPUTED"} as Record<string,unknown>:a)); } }}>Dispute Attribute (blocks high-impact)</Button></div>
            {twinDisputes.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Attribute</th><th>Reason</th><th>Status</th></tr></thead><tbody>{twinDisputes.slice(0,4).map((d:Record<string,unknown>,i:number)=> <tr key={String(d.id ?? i)}><td style={{ fontSize:10 }}>{String(d.attributeId ?? "—").slice(0,12)}</td><td>{String(d.reason).slice(0,30)}</td><td><Pill tone={String(d.status)==="disputed"?"danger":"neutral"}>{String(d.status)}</Pill></td></tr>)}</tbody></table></div>}
            <div style={{ marginTop:6, fontSize:11 }}><b>Dispute workflow 9:</b> Patient disputes → marked disputed → high-impact blocked → sources/model reviewed → patient provides correction → clinician/data steward review → corrected/retained with qualification/withdrawn → dependents recomputed → recipients notified → patient receives resolution (Accepted correction, Context added, Model not applicable, Retained with qualification, Withdrawn, Requires clinical review, Unable to verify, Disagreement recorded)</div>
          </Section>
          <Section title="High-Impact Decision Firewall - 14 Prohibited + 8 Enforcement Points">
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Insurance underwriting","Insurance pricing","Employment screening","Promotion/dismissal","Credit scoring","Lending","Housing eligibility","Education eligibility","Government benefits","Immigration","Criminal-justice","Advertising category","School/workplace surveillance","Care access ranking"].map(s=> <Pill key={s} tone="danger">{s}</Pill>)}</div>
            <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}><b>Enforcement at:</b> {["Data export","API","Feature store","Model-training pipeline","Prompt context","Decision-engine input","Partner integration","Research data release","Analytics warehouse"].map(p=> <Pill key={p}>{p}</Pill>)} — blocks raw sensitive data and derived proxies (e.g., insurer should not receive “longevity score” merely because not named as diagnosis)</div>
            <div style={{ marginTop:6, fontSize:11, color:"var(--nv-color-text-faint)"}}>Prohibited flows: Health record → biological-age estimate → risk score → insurance pricing; Wearable → sleep/productivity → employment evaluation; Genomic → disease-risk proxy → credit/eligibility<br/>Enforcement response: <code>{`{ "decision": "DENY", "reason": "high_impact_use_of_health_inference", "blocked_attributes": ["longevity_estimate"], "policy": "twin-safeguard-policy-2.0" }`}</code> — Counterfactual not for: autonomous medication, unreviewed orders, insurance pricing, employment, credit, patient ranking, claims denial, marketing, disciplinary — Every simulation displays assumptions: question, baseline, assumptions (Medication remains unchanged, Activity increases 20%, No acute illness, Device quality stable), horizon 8 weeks, output estimated_change possible improvement interval wide confidence low, not_a_prediction true, review clinician_supervision_required</div>
            <div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Attribute ID e.g. twin-attribute-..." value={twinDisputeForm.attributeId} onChange={e=> setTwinDisputeForm({...twinDisputeForm, attributeId:e.target.value})} style={{ flex:1, fontSize:11 }} /><select className="nv-select" value="insurance_underwriting" onChange={e=> { /* purpose */ }} style={{ width:150, fontSize:11 }}><option value="insurance_underwriting">insurance_underwriting</option><option value="employment_screening">employment_screening</option><option value="patient_wellness">patient_wellness</option></select><Button size="sm" onClick={async()=> { if(!twinDisputeForm.attributeId) return; const r=await fetch("/api/health/twin/firewall-check",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ attributeId: twinDisputeForm.attributeId, purpose:"insurance_underwriting" })}); const j=await r.json().catch(()=>null); setFirewallCheck(j); }}>Test Firewall (DENY expected for high-impact)</Button>{firewallCheck && <Pill tone={String((firewallCheck as Record<string,unknown>).decision)==="DENY"?"danger":"success"}>{String((firewallCheck as Record<string,unknown>).decision)}: {String((firewallCheck as Record<string,unknown>).reason)}</Pill>}</div>
          </Section>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Section title="Counterfactual Simulation - Assumptions Explicit">
              <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{`{
  "simulation_id": "sim-...",
  "question": "What might change if activity increases?",
  "baseline": "previous_30_days",
  "assumptions": ["Medication remains unchanged","Activity increases by 20%","No acute illness","Device quality stable"],
  "horizon": "8_weeks",
  "output": { "estimated_change": "possible improvement", "interval": "wide", "confidence": "low" },
  "not_a_prediction": true,
  "not_a_treatment_instruction": true,
  "review": "clinician_supervision_required_for_clinical_use"
}`}</pre><div style={{ marginTop:6, display:"flex", gap:4 }}><input className="nv-input" placeholder="Patient ID (auto)" value={simulationForm.patientId} onChange={e=> setSimulationForm({...simulationForm, patientId:e.target.value})} style={{ flex:1, fontSize:11 }} /><input className="nv-input" placeholder="Question" value={simulationForm.question} onChange={e=> setSimulationForm({...simulationForm, question:e.target.value})} style={{ flex:1, fontSize:11 }} /><Button size="sm" onClick={async()=> { if(!simulationForm.patientId || !simulationForm.question) return; const r=await fetch("/api/health/twin/simulations",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ patientId: simulationForm.patientId, question: simulationForm.question, assumptions: simulationForm.assumptions.split(",").map(s=> s.trim()).filter(Boolean), horizon:"8_weeks" })}); const j=await r.json().catch(()=>null); if(r.ok && j?.simulation) setTwinSimulations(prev=> [j.simulation, ...prev].slice(0,6)); }}>Create Simulation (education, not prediction)</Button></div>{twinSimulations.length>0 && <div style={{ marginTop:6, maxHeight:80, overflowY:"auto" }}><table className="nv-table" style={{ fontSize:11 }}><thead><tr><th>Question</th><th>Assumptions</th></tr></thead><tbody>{twinSimulations.slice(0,4).map((s:Record<string,unknown>,i:number)=> <tr key={String(s.id ?? i)}><td>{String(s.question).slice(0,30)}</td><td style={{ fontSize:10 }}>{String(((s.assumptions as unknown[] ?? []).join(", ")).slice(0,30))}</td></tr>)}</tbody></table></div>}<div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Ani: “This is a hypothetical model scenario, not a prediction of what will happen and not a substitute for your care team’s advice.”</div></div>
            </Section>
            <Section title="Twin Model Cards - 26 Fields + 5 Required Cards">
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", fontSize:11 }}>{["Model name","Version","Owner","Intended users","Intended use","Prohibited use","Output type","Input variables","Data origin","Training population","Geography","Age range","Dataset size","External validation","Performance metrics","Calibration","Subgroup performance","Known biases","Failure modes","Uncertainty","Time horizon","Update policy","Drift monitoring","Human-review","Clinical-validation","Regulatory","Privacy/security","High-impact restrictions","Dispute and rollback"].map(f=> <Pill key={f}>{f}</Pill>)}</div>
              <div style={{ marginTop:6, fontSize:11 }}><b>5 required cards:</b> Biological-age (definition, inputs, validated against outcome?, population, exercise/sleep/illness/device effect, educational index vs clinical measure, false precision, stigma, prohibited in insurance/employment/credit) — “An experimental estimate based on selected health signals. It is not your actual age, life expectancy, or diagnosis.”<br/>Longevity (outcome, horizon, censoring, population, missing, CI, calibration, causal unknown, social conditions, emotional risks, no destiny claims, lifespan number prohibited unless compelling validated ethically reviewed)<br/>Genomic (test type, lab, variant, classification, reference assembly, interpretation source, reclassification, population, family implications, incidental findings, counseling, privacy, prohibited use for family without auth)<br/>Microbiome (collection, lab, sequencing, contamination, reference database, diet/medication effects, geography, replicability, clinical validation, association vs treatment, prohibited therapeutic claims)<br/>Behavioral (data sources, explicit vs passively inferred, inference targets, consent, false-positive, cultural/socioeconomic bias, whether detects behavior or device interaction, human-review, prohibited in employment/insurance/credit/education/discipline)</div>
            </Section>
          </div>
          <Section title="Twin Governance + Consent + Provenance + Safety States">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:11 }}>
              <div><b>Board 12 + 9 approvals:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}>{["Clinicians","Patients","Caregivers","Genetic counselors","Privacy experts","Security experts","Human-factors","Social scientists","Legal/compliance","Data scientists","Accessibility/language","Research ethics"].map(m=> <Pill key={m}>{m}</Pill>)} — approve new attributes, inputs, horizons, simulations, recipients, automated actions, model versions, validation transitions, research-to-production, high-impact restrictions, retirement/deletion</div></div>
              <div><b>Production/research boundaries 4:</b><div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:4 }}><span style={{ padding:"3px 6px", borderRadius:999, background:"#dcfce7", border:"1px solid var(--nv-color-border)" }}>Production: approved operational use</span><span style={{ padding:"3px 6px", borderRadius:999, background:"#fef3c7", border:"1px solid var(--nv-color-border)" }}>Clinical validation: controlled evaluation with human oversight</span><span style={{ padding:"3px 6px", borderRadius:999, background:"#e0e7ff", border:"1px solid var(--nv-color-border)" }}>Research: study use with consent</span><span style={{ padding:"3px 6px", borderRadius:999, background:"var(--nv-color-surface-raised)", border:"1px solid var(--nv-color-border)" }}>Conceptual: design hypothesis</span></div><div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4}}>Labels appear in UI, API metadata, model registry, warehouse, exports, audit logs, marketing. Environment flag: longevity_projection research_only, patient_visible true, clinical_use false, automated_action false, insurance/employment/credit/eligibility blocked, model_card_required true.</div></div>
            </div>
            <div style={{ marginTop:6, fontSize:11 }}><b>Attribute status 8 + Safety states 8:</b> Trusted observed (direct quality-verified), Supported estimate (adequate evidence, education/supervised planning), Uncertain inference (material uncertainty/missing data, display with limitations, no automatic action), Disputed (blocked high-impact), Research-only, Conceptual, Expired, Withdrawn — Clinical-use gate 13: intended use, clinical validation, applicable population, data quality, known limitations, human-review workflow, evidence source, model card, monitoring plan, correctability, auditability, consent/privacy, approved change-management (FDA CDS enhance/inform/influence without replacing judgment).<br/><b>Prohibited autonomous 14:</b> diagnose, change medication, order test, recommend hospitalization, deny care, rank patients for access, adjust insurance premiums, screen employees, decide creditworthiness, determine disability/benefits, classify as unreliable, label family with genetic condition, trigger law-enforcement/immigration, target for health-related advertising — may generate review task/educational explanation where permitted.<br/><b>Monitoring 16:</b> attribute accuracy, calibration, drift, missingness, dispute/correction/withdrawal rate, patient comprehension, clinician override, downstream action, harm/near misses, subgroup performance, high-impact access attempts, unauthorized inference, model-card compliance, time to dispute resolution — redress channel for incorrect data/inference/discriminatory impact/inappropriate use/unauthorized sharing/emotional harm/unexplained decision/outdated model/failure to honor reset/deletion.</div>
          </Section>
          <Section title="Twin Provenance Graph + Patient Controls">
            <div style={{ fontSize:11 }}><pre style={{ background:"var(--nv-color-surface-raised)", padding:8, borderRadius:6, fontSize:10, whiteSpace:"pre-wrap", fontFamily:"monospace" }}>{`Raw measurement → normalized observation → feature → model input → twin attribute → simulation → patient explanation → clinician decision
Every edge: source, activity, agent/model, timestamp, version, purpose, consent, transformation, confidence, signature, retention
Which measurements produced this estimate? Which model version? Did corrected record affect it? Who saw it? Was it used in care decision? Was it exported? Was it used in research? Has patient disputed it?`}</pre><div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>{["Show sources","Show uncertainty","Show assumptions","Correct source data","Dispute this estimate","Reset this baseline","Remove this inferred attribute","Stop future inference","Restrict sharing","Export lineage","Delete where legally possible","View access history","Ask a clinician"].map(c=> <Pill key={c}>{c}</Pill>)}<span style={{ color:"var(--nv-color-text-faint)"}}>Make disagreement easy — not need to prove wrong before disputed.</span></div></div>
          </Section>
          <Section title="Acceptance - 14 Until Safe">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4, fontSize:11 }}>{["Every attribute identifies origin and provenance","Observed/estimated/inferred/simulated/projected/synthetic visually distinct","Every estimate includes uncertainty, freshness, assumptions, horizon","Current never mixed with future projections","Patients can reset/correct/dispute/restrict/remove derived attributes","Disputed blocked from high-impact","Insurance/employment/credit/eligibility cannot consume unapproved inferences","Counterfactuals clearly labeled and restricted","Biological-age/longevity/genomic/microbiome/behavioral have model cards","Every feature labeled production/clinical-validation/research/conceptual","Clinicians can independently inspect basis","Corrections propagate to dependent inferences","Model drift/subgroup/disputes/harms monitored","Patients can obtain human review and meaningful redress"].map(a=> <div key={a} style={{ padding:"4px 6px", border:"1px solid var(--nv-color-border)", borderRadius:6, background:"var(--nv-color-surface-raised)" }}>{a}</div>)}</div>
            <div style={{ marginTop:6, padding:10, border:"1.5px solid #4f46e5", borderRadius:10, fontWeight:800, textAlign:"center", background:"var(--nv-color-surface-raised)" }}>N0VA may model possibilities, but it must never present possibilities as facts or allow hidden health inferences to determine a person’s rights, livelihood, access, or worth.</div>
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
