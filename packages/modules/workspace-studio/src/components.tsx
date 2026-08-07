"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { AutomationWithRuns, RunHistory } from "./server";

export interface StudioActions {
  create: (formData: FormData) => Promise<void>;
  toggle: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  run: (formData: FormData) => Promise<{ status: string; detail: string; durationMs: number }>;
  runHistory: (formData: FormData) => Promise<RunHistory>;
}

const TRIGGER_LABEL: Record<string, string> = { MANUAL: "Manual", SCHEDULE: "Schedule", EVENT: "Event" };
const ACTION_LABEL: Record<string, string> = { LOG: "Log event", NOTIFY: "Notify members", CREATE_DOC: "Create doc" };

export function Studio({ automations, actions }: { automations: AutomationWithRuns[]; actions: StudioActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<Record<string, { status: string; detail: string } | undefined>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const [histories, setHistories] = useState<Record<string, RunHistory>>({});

  const toggleHistory = (id: string) => {
    if (historyOpen[id]) {
      setHistoryOpen((m) => ({ ...m, [id]: false }));
      return;
    }
    setHistoryOpen((m) => ({ ...m, [id]: true }));
    if (!histories[id]) {
      const fd = new FormData();
      fd.set("id", id);
      void actions.runHistory(fd).then((h) => setHistories((m) => ({ ...m, [id]: h })));
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA WORKSPACE STUDIO</h1>
        <span className="nv-badge nv-badge-amber">automations</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New automation</Button>
      </div>

      {automations.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No automations yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Create one</Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {automations.map((a) => {
            const lastRun = running[a.id] ?? (a.runs[0] ? { status: a.runs[0].status, detail: a.runs[0].detail } : undefined);
            return (
              <div key={a.id} className="nv-card" style={{ padding: 0 }}>
                <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 800 }}>{a.name}</span>
                      <span className="nv-badge">{TRIGGER_LABEL[a.trigger]}</span>
                      <span className="nv-badge nv-badge-green">{ACTION_LABEL[a.action]}</span>
                      <span className={a.enabled ? "nv-badge nv-badge-green" : "nv-badge"}>{a.enabled ? "Enabled" : "Paused"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                      {lastRun ? (
                        <>
                          Last run:
                          <span
                            className={lastRun.status === "success" ? "nv-badge nv-badge-green" : "nv-badge nv-badge-danger"}
                            style={{ margin: "0 6px" }}
                          >
                            {lastRun.status === "success" ? "✓" : "✕"}
                          </span>
                          {lastRun.detail}
                        </>
                      ) : (
                        "Never run"
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleHistory(a.id)}>
                    History
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!a.enabled}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", a.id);
                      void actions.run(fd).then((r) => {
                        setRunning((m) => ({ ...m, [a.id]: { status: r.status, detail: r.detail } }));
                        router.refresh();
                      });
                    }}
                  >
                    Run now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", a.id);
                      fd.set("enabled", a.enabled ? "false" : "true");
                      void actions.toggle(fd).then(() => router.refresh());
                    }}
                  >
                    {a.enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`Delete "${a.name}"?`)) return;
                      const fd = new FormData();
                      fd.set("id", a.id);
                      void actions.remove(fd).then(() => router.refresh());
                    }}
                  >
                    ✕
                  </Button>
                </div>
                {historyOpen[a.id] ? (
                  <div style={{ borderTop: "1px solid var(--nv-color-border)", padding: "10px 14px", fontSize: 12 }}>
                    {histories[a.id] ? (
                      histories[a.id]!.runs.length === 0 ? (
                        <div className="nv-empty" style={{ minHeight: 48 }}>No runs recorded yet</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div style={{ color: "var(--nv-color-text-faint)" }}>
                            {histories[a.id]!.total} total run{histories[a.id]!.total === 1 ? "" : "s"}
                          </div>
                          {histories[a.id]!.runs.map((r) => (
                            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className={r.status === "success" ? "nv-badge nv-badge-green" : "nv-badge nv-badge-danger"}>
                                {r.status === "success" ? "✓" : "✕"}
                              </span>
                              <span style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{r.startedAt.toLocaleString()}</span>
                              <span style={{ color: "var(--nv-color-text-faint)", whiteSpace: "nowrap" }}>{r.durationMs}ms</span>
                              <span style={{ color: "var(--nv-color-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.detail}</span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <div className="nv-empty" style={{ minHeight: 48 }}>Loading…</div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New automation"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-automation-form">Create</Button>
          </>
        }
      >
        <form
          id="create-automation-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Automation name" required autoFocus />
          <select className="nv-input" name="trigger" defaultValue="MANUAL">
            <option value="MANUAL">Trigger: Manual (run button)</option>
            <option value="SCHEDULE">Trigger: Schedule</option>
            <option value="EVENT">Trigger: Event</option>
          </select>
          <select className="nv-input" name="action" defaultValue="LOG">
            <option value="LOG">Action: Log event</option>
            <option value="NOTIFY">Action: Notify members</option>
            <option value="CREATE_DOC">Action: Create a doc</option>
          </select>
          <textarea
            className="nv-input"
            name="config"
            rows={3}
            placeholder={'Config (JSON) — e.g. {"title":"Daily digest"}'}
            style={{ resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
          />
        </form>
      </Dialog>
    </div>
  );
}
