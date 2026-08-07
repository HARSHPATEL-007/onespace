"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { IntegrationLog } from "@n0va/db";
import type { IntegrationWithLogs } from "./server";

export interface N0va1oActions {
  connect: (formData: FormData) => Promise<void>;
  sync: (formData: FormData) => Promise<{ message: string }>;
  toggle: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
  activity: (formData: FormData) => Promise<IntegrationLog[]>;
}

const PROVIDER_META: Record<string, { label: string; badge: string }> = {
  slack: { label: "Slack", badge: "nv-badge" },
  discord: { label: "Discord", badge: "nv-badge nv-badge-amber" },
  gdrive: { label: "Google Drive", badge: "nv-badge nv-badge-green" },
  github: { label: "GitHub", badge: "nv-badge" },
  custom: { label: "Custom webhook", badge: "nv-badge nv-badge-green" },
};

export function Integrations({ integrations, actions }: { integrations: IntegrationWithLogs[]; actions: N0va1oActions }) {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  const [syncMsg, setSyncMsg] = useState<Record<string, string | undefined>>({});
  const [openLogs, setOpenLogs] = useState<Record<string, IntegrationLog[] | null | undefined>>({});

  const toggleActivity = (id: string) => {
    if (openLogs[id] !== undefined) {
      setOpenLogs((m) => ({ ...m, [id]: undefined }));
      return;
    }
    setOpenLogs((m) => ({ ...m, [id]: null }));
    const fd = new FormData();
    fd.set("id", id);
    void actions.activity(fd).then((logs) => setOpenLogs((m) => ({ ...m, [id]: logs })));
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA1O</h1>
        <span className="nv-badge nv-badge-amber">integrations hub</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setConnecting(true)}>+ Connect app</Button>
      </div>

      {integrations.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No integrations connected</div>
          <Button variant="secondary" size="sm" onClick={() => setConnecting(true)}>Connect the first app</Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {integrations.map((i) => {
            const meta = PROVIDER_META[i.provider] ?? { label: i.provider, badge: "nv-badge" };
            return (
              <div key={i.id} className="nv-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 800 }}>{i.name}</span>
                      <span className={meta.badge}>{meta.label}</span>
                      <span className={i.enabled ? "nv-badge nv-badge-green" : "nv-badge"}>{i.enabled ? "Connected" : "Paused"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                      {syncMsg[i.id] ?? (i.logs[0] ? `Last sync: ${i.logs[0].message}` : "Not synced yet")}
                      {i.lastSyncAt ? ` · ${i.lastSyncAt.toLocaleString()}` : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActivity(i.id)}
                  >
                    Activity {openLogs[i.id] !== undefined ? "▴" : "▾"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!i.enabled}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", i.id);
                      void actions.sync(fd).then((r) => setSyncMsg((m) => ({ ...m, [i.id]: r.message })));
                    }}
                  >
                    Sync
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("id", i.id);
                      fd.set("enabled", i.enabled ? "false" : "true");
                      void actions.toggle(fd).then(() => router.refresh());
                    }}
                  >
                    {i.enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`Disconnect ${i.name}?`)) return;
                      const fd = new FormData();
                      fd.set("id", i.id);
                      void actions.remove(fd).then(() => router.refresh());
                    }}
                  >
                    ✕
                  </Button>
                </div>
                {openLogs[i.id] !== undefined && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--nv-color-border)" }}>
                    {openLogs[i.id] === null ? (
                      <div className="nv-empty" style={{ padding: "8px 0", minHeight: 0 }}>Loading…</div>
                    ) : openLogs[i.id]!.length === 0 ? (
                      <div className="nv-empty" style={{ padding: "8px 0", minHeight: 0 }}>No activity yet</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {openLogs[i.id]!.map((l) => (
                          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 }}>
                            <span
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                flexShrink: 0,
                                background:
                                  l.level === "error"
                                    ? "var(--nv-color-danger)"
                                    : "color-mix(in srgb, var(--nv-color-success) 45%, transparent)",
                              }}
                            />
                            <span style={{ color: "var(--nv-color-text-faint)", whiteSpace: "nowrap" }}>{l.createdAt.toLocaleString()}</span>
                            <span
                              style={{
                                color: l.level === "error" ? "var(--nv-color-danger)" : "color-mix(in srgb, var(--nv-color-success) 70%, var(--nv-color-text-muted))",
                              }}
                            >
                              {l.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={connecting}
        onClose={() => setConnecting(false)}
        title="Connect an app"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConnecting(false)}>Cancel</Button>
            <Button type="submit" form="connect-integration-form">Connect</Button>
          </>
        }
      >
        <form
          id="connect-integration-form"
          action={(fd) => {
            void actions.connect(fd).then(() => {
              setConnecting(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <select className="nv-input" name="provider" defaultValue="slack">
            {Object.entries(PROVIDER_META).map(([value, m]) => (
              <option key={value} value={value}>{m.label}</option>
            ))}
          </select>
          <input className="nv-input" name="name" placeholder="Display name (e.g. Design channel)" required autoFocus />
          <input className="nv-input" name="token" placeholder="API token / webhook URL (optional)" />
        </form>
      </Dialog>
    </div>
  );
}
