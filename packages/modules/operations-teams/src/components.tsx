"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Incident, OpsRunbook } from "@n0va/db";

export interface OpsActions {
  createRunbook: (formData: FormData) => Promise<void>;
  setRunbookStatus: (formData: FormData) => Promise<void>;
  removeRunbook: (formData: FormData) => Promise<void>;
  createIncident: (formData: FormData) => Promise<void>;
  advanceIncident: (formData: FormData) => Promise<void>;
  removeIncident: (formData: FormData) => Promise<void>;
}

const RUNBOOK_BADGE: Record<string, string> = {
  ACTIVE: "nv-badge nv-badge-green",
  DRAFT: "nv-badge",
  ARCHIVED: "nv-badge",
};

const SEVERITY_BADGE: Record<string, string> = {
  SEV1: "nv-badge",
  SEV2: "nv-badge nv-badge-amber",
  SEV3: "nv-badge nv-badge-amber",
  SEV4: "nv-badge nv-badge-green",
};

const INCIDENT_BADGE: Record<string, string> = {
  OPEN: "nv-badge",
  INVESTIGATING: "nv-badge nv-badge-amber",
  RESOLVED: "nv-badge nv-badge-green",
};

export function OpsCenter({
  runbooks,
  incidents,
  actions,
}: {
  runbooks: OpsRunbook[];
  incidents: Incident[];
  actions: OpsActions;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"runbooks" | "incidents">("runbooks");
  const [creatingRunbook, setCreatingRunbook] = useState(false);
  const [creatingIncident, setCreatingIncident] = useState(false);
  const [openRunbook, setOpenRunbook] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA OPERATIONS & TEAMS</h1>
        <span className="nv-badge nv-badge-amber">runbooks · incidents</span>
        <div style={{ flex: 1 }} />
        {tab === "runbooks" && <Button size="sm" onClick={() => setCreatingRunbook(true)}>+ New runbook</Button>}
        {tab === "incidents" && <Button size="sm" onClick={() => setCreatingIncident(true)}>+ Log incident</Button>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <Button variant={tab === "runbooks" ? "primary" : "secondary"} size="sm" onClick={() => setTab("runbooks")}>
          Runbooks ({runbooks.length})
        </Button>
        <Button variant={tab === "incidents" ? "primary" : "secondary"} size="sm" onClick={() => setTab("incidents")}>
          Incidents ({incidents.filter((i) => i.status !== "RESOLVED").length} open)
        </Button>
      </div>

      {tab === "runbooks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {runbooks.map((r) => {
            const steps = Array.isArray(r.steps) ? (r.steps as string[]) : [];
            return (
              <div key={r.id} className="nv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 800, flex: 1 }}>{r.title}</span>
                  <span className={RUNBOOK_BADGE[r.status] ?? "nv-badge"}>{r.status}</span>
                  <Button variant="ghost" size="sm" onClick={() => setOpenRunbook(openRunbook === r.id ? null : r.id)}>
                    {openRunbook === r.id ? "Hide" : "Steps"}
                  </Button>
                  {r.status === "DRAFT" && (
                    <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", r.id); fd.set("status", "ACTIVE"); void actions.setRunbookStatus(fd).then(() => router.refresh()); }}>Activate</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm(`Delete runbook "${r.title}"?`)) return; const fd = new FormData(); fd.set("id", r.id); void actions.removeRunbook(fd).then(() => router.refresh()); }}>✕</Button>
                </div>
                {r.description && <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)", marginTop: 4 }}>{r.description}</div>}
                {openRunbook === r.id && (
                  <ol style={{ marginTop: 10, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
                    {steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                    {steps.length === 0 && <li style={{ color: "var(--nv-color-text-faint)" }}>No steps defined</li>}
                  </ol>
                )}
              </div>
            );
          })}
          {runbooks.length === 0 && <div className="nv-empty" style={{ minHeight: 220 }}>No runbooks yet</div>}
        </div>
      )}

      {tab === "incidents" && (
        <div className="nv-card" style={{ padding: 0 }}>
          <table className="nv-table">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Reported</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontWeight: 700 }}>{i.title}</td>
                  <td><span className={SEVERITY_BADGE[i.severity] ?? "nv-badge"}>{i.severity}</span></td>
                  <td><span className={INCIDENT_BADGE[i.status] ?? "nv-badge"}>{i.status}</span></td>
                  <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{i.createdAt.toLocaleString()}</td>
                  <td>
                    {i.status !== "RESOLVED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const fd = new FormData();
                          fd.set("id", i.id);
                          void actions.advanceIncident(fd).then(() => router.refresh());
                        }}
                      >
                        {i.status === "OPEN" ? "Investigate" : "Resolve"}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm("Delete incident?")) return; const fd = new FormData(); fd.set("id", i.id); void actions.removeIncident(fd).then(() => router.refresh()); }}>✕</Button>
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && <tr><td colSpan={5} className="nv-empty">No incidents logged</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={creatingRunbook}
        onClose={() => setCreatingRunbook(false)}
        title="New runbook"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreatingRunbook(false)}>Cancel</Button>
            <Button type="submit" form="create-runbook-form">Create</Button>
          </>
        }
      >
        <form
          id="create-runbook-form"
          action={(fd) => {
            void actions.createRunbook(fd).then(() => {
              setCreatingRunbook(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="Runbook title" required autoFocus />
          <input className="nv-input" name="description" placeholder="Short description" />
          <textarea
            className="nv-input"
            name="steps"
            rows={6}
            placeholder={"One step per line:\n1. Check dashboard\n2. Escalate if red\n3. Post update to Chat"}
            style={{ resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
          />
        </form>
      </Dialog>

      <Dialog
        open={creatingIncident}
        onClose={() => setCreatingIncident(false)}
        title="Log incident"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreatingIncident(false)}>Cancel</Button>
            <Button type="submit" form="create-incident-form">Log</Button>
          </>
        }
      >
        <form
          id="create-incident-form"
          action={(fd) => {
            void actions.createIncident(fd).then(() => {
              setCreatingIncident(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="Incident title" required autoFocus />
          <select className="nv-input" name="severity" defaultValue="SEV3">
            <option value="SEV1">SEV1 — Critical</option>
            <option value="SEV2">SEV2 — High</option>
            <option value="SEV3">SEV3 — Medium</option>
            <option value="SEV4">SEV4 — Low</option>
          </select>
        </form>
      </Dialog>
    </div>
  );
}
