"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface QualityActions {
  reportArtifact: (artifactId: string) => Promise<{
    reportId: string; decision: string;
    dimensions: Record<string, { status: string }>;
    publication: { decision: string; reasons: string[] };
  }>;
  reports: (setId: string) => Promise<{
    id: string; subjectType: string; subjectId: string; decision: string;
    dimensions: Record<string, { status: string }>;
    createdAt: string; reviews: { queue: string; status: string }[];
  }[]>;
  queue: () => Promise<{ id: string; reportId: string; queue: string; status: string; note: string; createdAt: string }[]>;
  decide: (id: string, status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "WAIVED", note: string) => Promise<void>;
  rights: () => Promise<{ id: string; sourceKey: string; license: string; derivativeAllowed: boolean; attributionRequired: boolean; scope: string; expiresAt: string | null }[]>;
  rightsSave: (fd: FormData) => Promise<void>;
  freshness: (setId: string) => Promise<{ id: string; claimType: string; jurisdiction: string; validDays: number; refreshDays: number; requiredReviewer: string }[]>;
  freshnessSave: (fd: FormData) => Promise<void>;
  impact: (setId: string, source: string, kind: string) => Promise<{
    changedSource: string; affectedClaims: number;
    artifacts: { regenerateRequired: number; reviewRequired: number; notificationOnly: number };
    blockingItems: string[];
    items: { id: string; type: string; title: string; reviewStatus: string; category: string; blocking: boolean; action: string }[];
    note: string;
  }>;
  metrics: (setId: string) => Promise<{
    reports: number; decisions: Record<string, number>; reviewsOpen: number;
    remediationHrs: number; contradictionResolutionHrs: number;
    instructorOverrideRate: number; needsInstrumentation: string[];
  }>;
}

const DIM_LABELS: Record<string, string> = {
  grounding: "Source grounding", citations: "Citations", consistency: "Consistency",
  currency: "Currency", originality: "Originality", reading: "Reading level",
  fairness: "Fairness", cultural: "Cultural", accessibility: "Accessibility",
  rights: "Rights", safety: "Safety", instructor: "Instructor decision",
};

const STATUS_COLOR = (s: string) =>
  ["passed", "cleared", "unique", "current", "verified", "approved", "published"].includes(s.toLowerCase())
    ? "var(--nv-color-success)"
    : ["failed", "blocked", "duplicate", "prohibited", "stale", "remediation_required"].includes(s.toLowerCase())
      ? "var(--nv-color-danger)" : "var(--nv-color-warning, #b45309)";

export function QualityPanel({ setId, actions, isInstructor, artifactId }: {
  setId: string; actions: QualityActions; isInstructor: boolean; artifactId?: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [reports, setReports] = useState<Awaited<ReturnType<QualityActions["reports"]>> | null>(null);
  const [queue, setQueue] = useState<Awaited<ReturnType<QualityActions["queue"]>> | null>(null);
  const [rights, setRights] = useState<Awaited<ReturnType<QualityActions["rights"]>> | null>(null);
  const [rules, setRules] = useState<Awaited<ReturnType<QualityActions["freshness"]>> | null>(null);
  const [metrics, setMetrics] = useState<Awaited<ReturnType<QualityActions["metrics"]>> | null>(null);
  const [impact, setImpact] = useState<Awaited<ReturnType<QualityActions["impact"]>> | null>(null);
  const [source, setSource] = useState("");
  const [kind, setKind] = useState("source");
  const [note, setNote] = useState("");

  const load = () => {
    void actions.reports(setId).then((r) => setReports(r)).catch(() => undefined);
    if (isInstructor) {
      void actions.queue().then((q) => setQueue(q)).catch(() => undefined);
      void actions.rights().then((r) => setRights(r)).catch(() => undefined);
      void actions.freshness(setId).then((r) => setRules(r)).catch(() => undefined);
      void actions.metrics(setId).then((m) => setMetrics(m)).catch(() => undefined);
    }
  };
  if (reports === null) load();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Reports: multidimensional, never one number */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800 }}>✅ Quality reports (12 dimensions — no single score)</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
        </div>
        {(reports ?? []).map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6, fontSize: 12 }}>
            <div><b>{r.subjectType} {r.subjectId.slice(0, 8)}</b> → <b style={{ color: STATUS_COLOR(r.decision) }}>{r.decision.replace(/_/g, " ")}</b>
              <span style={{ color: "var(--nv-color-text-faint)" }}> · {new Date(r.createdAt).toLocaleDateString()}</span></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
              {Object.entries(r.dimensions).map(([k, v]) => (
                <span key={k}>{DIM_LABELS[k] ?? k}: <b style={{ color: STATUS_COLOR(String((v as { status: string }).status)) }}>{String((v as { status: string }).status).replace(/_/g, " ")}</b></span>
              ))}
            </div>
            {r.reviews.length > 0 && (
              <div style={{ color: "var(--nv-color-text-faint)" }}>Queues: {r.reviews.map((x) => `${x.queue.toLowerCase().replace(/_/g, " ")}:${x.status.toLowerCase()}`).join(" · ")}</div>
            )}
          </div>
        ))}
        {(reports ?? []).length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            No reports yet. {artifactId ? "Run one for the open artifact:" : "Open an artifact or document, then run its report."}
            {artifactId && <span style={{ marginLeft: 8 }}><Button variant="secondary" size="sm" onClick={() => void actions.reportArtifact(artifactId).then(() => { load(); refresh(); })}>Run report</Button></span>}
          </div>
        )}
      </div>

      {isInstructor && (
        <>
          {/* Review queues */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>📥 Review queues ({(queue ?? []).length} pending)</div>
            {(queue ?? []).map((q) => (
              <div key={q.id} style={{ fontSize: 12, borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6 }}>
                <div><b>{q.queue.toLowerCase().replace(/_/g, " ")}</b> · report {q.reportId.slice(0, 8)} · {q.status.toLowerCase()}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input className="nv-input" id={`qn-${q.id}`} placeholder="reviewer note…" style={{ flex: 1 }} defaultValue={note} onChange={(e) => setNote(e.target.value)} />
                  <Button variant="secondary" size="sm" onClick={() => {
                    const el = document.getElementById(`qn-${q.id}`) as HTMLInputElement | null;
                    void actions.decide(q.id, "APPROVED", el?.value ?? "").then(() => setQueue(null));
                  }}>Approve</Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const el = document.getElementById(`qn-${q.id}`) as HTMLInputElement | null;
                    void actions.decide(q.id, "CHANGES_REQUESTED", el?.value ?? "").then(() => setQueue(null));
                  }}>Changes</Button>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const el = document.getElementById(`qn-${q.id}`) as HTMLInputElement | null;
                    void actions.decide(q.id, "REJECTED", el?.value ?? "").then(() => setQueue(null));
                  }}>Reject</Button>
                </div>
              </div>
            ))}
            {(queue ?? []).length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Queues clear.</div>}
          </div>

          {/* Rights ledger */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>© Rights ledger (license evidence per source)</div>
            {(rights ?? []).map((r) => (
              <div key={r.id} style={{ fontSize: 12, marginTop: 2 }}>
                <b>{r.sourceKey}</b>: {r.license}{r.derivativeAllowed ? "" : " · no derivatives"}{r.attributionRequired ? " · attribution" : ""}
                <span style={{ color: "var(--nv-color-text-faint)" }}> · {r.scope}{r.expiresAt ? ` · expires ${new Date(r.expiresAt).toLocaleDateString()}` : ""}</span>
              </div>
            ))}
            <form action={(fd) => void actions.rightsSave(fd).then(() => { setRights(null); refresh(); })} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input className="nv-input" name="sourceKey" placeholder="source key" required style={{ width: 160 }} />
              <input className="nv-input" name="license" placeholder="license" defaultValue="unknown" style={{ width: 160 }} />
              <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="derivativeAllowed" /> derivatives</label>
              <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="attributionRequired" /> attribution</label>
              <input className="nv-input" name="scope" placeholder="scope" style={{ width: 130 }} />
              <Button size="sm" type="submit">Save</Button>
            </form>
          </div>

          {/* Freshness rules */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>⏳ Freshness rules (per subject / claim type)</div>
            {(rules ?? []).map((r) => (
              <div key={r.id} style={{ fontSize: 12, marginTop: 2 }}>
                <b>{r.claimType}</b>{r.jurisdiction ? ` (${r.jurisdiction})` : ""} · valid {r.validDays}d · refresh {r.refreshDays}d · reviewer: {r.requiredReviewer || "—"}
              </div>
            ))}
            <form action={(fd) => { (fd as FormData).set("setId", setId); void actions.freshnessSave(fd).then(() => { setRules(null); refresh(); }); }} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input className="nv-input" name="claimType" placeholder="claim type (regulation, finding…)" required style={{ width: 180 }} />
              <input className="nv-input" name="jurisdiction" placeholder="jurisdiction" style={{ width: 130 }} />
              <input className="nv-input" name="validDays" placeholder="valid days" defaultValue="365" style={{ width: 100 }} />
              <input className="nv-input" name="refreshDays" placeholder="refresh days" defaultValue="90" style={{ width: 110 }} />
              <input className="nv-input" name="requiredReviewer" placeholder="reviewer role" style={{ width: 140 }} />
              <Button size="sm" type="submit">Save rule</Button>
            </form>
          </div>

          {/* Impact analyzer */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>🌊 Change-impact analysis</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input className="nv-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="changed source key…" style={{ flex: 1, minWidth: 160 }} />
              <select className="nv-input" value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 170 }}>
                {["source", "citation-only", "wording", "definition", "safety", "rights"].map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <Button variant="secondary" size="sm" onClick={() => source.trim() && void actions.impact(setId, source.trim(), kind).then((r) => setImpact(r as never))}>Analyze</Button>
            </div>
            {impact && (
              <ImpactView impact={impact as { affectedClaims: number; artifacts: { regenerateRequired: number; reviewRequired: number; notificationOnly: number }; blockingItems: string[]; items: { id: string; type: string; title: string; reviewStatus: string; category: string; blocking: boolean; action: string }[]; note: string }} />
            )}
          </div>

          {/* Metrics */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>📊 Operational quality (no misleading claims)</div>
            {metrics ? (
              <div style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>Reports <b>{metrics.reports}</b></span>
                <span>Publish <b>{metrics.decisions.publish}</b> · blocked <b>{metrics.decisions.blocked}</b> · review <b>{metrics.decisions.review}</b></span>
                <span>Reviews open <b>{metrics.reviewsOpen}</b></span>
                <span>Remediation <b>{metrics.remediationHrs}h</b></span>
                <span>Contradiction resolution <b>{metrics.contradictionResolutionHrs}h</b></span>
                <span>Override rate <b>{Math.round(metrics.instructorOverrideRate * 100)}%</b></span>
              </div>
            ) : <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Loading…</div>}
            {metrics && (
              <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                Needs instrumentation: {metrics.needsInstrumentation.join("; ")}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ImpactView({ impact }: {
  impact: {
    affectedClaims: number;
    artifacts: { regenerateRequired: number; reviewRequired: number; notificationOnly: number };
    blockingItems: string[]; note: string;
    items: { id: string; type: string; title: string; reviewStatus: string; category: string; blocking: boolean; action: string }[];
  };
}) {
  return (
    <div style={{ fontSize: 12, marginTop: 6 }}>
      <div>Affected: <b>{impact.affectedClaims}</b> · regenerate {impact.artifacts.regenerateRequired} · review {impact.artifacts.reviewRequired} · notify {impact.artifacts.notificationOnly}</div>
      {impact.blockingItems.length > 0 && (
        <div style={{ color: "var(--nv-color-danger)" }}>Blocking: {impact.blockingItems.join("; ")}</div>
      )}
      {impact.items.slice(0, 15).map((i) => (
        <div key={i.id}>• {i.title} ({i.type}) — {i.category}: {i.action}{i.blocking ? " ⛔" : ""}</div>
      ))}
      <div style={{ color: "var(--nv-color-text-faint)" }}>{impact.note}</div>
    </div>
  );
}
