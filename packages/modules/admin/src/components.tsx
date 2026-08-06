"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { ModulePolicy } from "./server";

export interface AdminActions {
  setPolicy: (formData: FormData) => Promise<void>;
  resetModule: (formData: FormData) => Promise<void>;
  setModuleStatus: (formData: FormData) => Promise<void>;
}

const ROLES = ["VIEWER", "MEMBER", "ADMIN", "OWNER"] as const;
type RoleLiteral = (typeof ROLES)[number];
const ACTIONS = ["READ", "CREATE", "UPDATE", "DELETE", "ADMIN"] as const;

const DEFAULTS: Record<RoleLiteral, string[]> = {
  VIEWER: ["READ"],
  MEMBER: ["READ", "CREATE", "UPDATE"],
  ADMIN: ["READ", "CREATE", "UPDATE", "DELETE"],
  OWNER: ["READ", "CREATE", "UPDATE", "DELETE", "ADMIN"],
};

const STATUS_STYLE: Record<string, string> = {
  live: "var(--nv-color-success)",
  building: "var(--nv-color-warning)",
  planned: "var(--nv-color-text-faint)",
};

export function GovernancePanel({ policies, actions }: { policies: ModulePolicy[]; actions: AdminActions }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (moduleId: string, role: string, action: string, current: boolean) => {
    const fd = new FormData();
    fd.set("module", moduleId);
    fd.set("role", role);
    fd.set("action", action);
    fd.set("allowed", current ? "false" : "true");
    void actions.setPolicy(fd).then(() => router.refresh());
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA ADMIN</h1>
        <span className="nv-badge nv-badge-amber">governance</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
          {policies.filter((p) => p.hasOverrides).length} modules with custom policies
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {policies.map((p) => {
          const isOpen = open[p.module.id] ?? false;
          const overrideMap = new Map(p.overrides.map((o) => [`${o.role}:${o.action}`, o.allowed]));
          return (
            <div key={p.module.id} className="nv-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_STYLE[p.module.status ?? "planned"] ?? STATUS_STYLE.planned, flexShrink: 0 }}
                />
                <span style={{ fontWeight: 800, width: 240 }}>{p.module.name}</span>
                <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)", flex: 1 }}>{p.module.layer} · {p.module.description}</span>
                {p.hasOverrides && <span className="nv-badge nv-badge-amber">custom policy</span>}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("module", p.module.id);
                    void actions.setModuleStatus(fd).then(() => router.refresh());
                  }}
                >
                  Log status change
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen((o) => ({ ...o, [p.module.id]: !isOpen }))}>
                  {isOpen ? "Close" : "Policy"}
                </Button>
              </div>

              {isOpen && (
                <div style={{ marginTop: 12, overflowX: "auto" }}>
                  <table className="nv-table" style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 120 }}>Role</th>
                        {ACTIONS.map((a) => (
                          <th key={a} style={{ textAlign: "center" }}>{a}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ROLES.map((role) => (
                        <tr key={role}>
                          <td style={{ fontWeight: 700 }}>{role}</td>
                          {ACTIONS.map((a) => {
                            const allowed = overrideMap.get(`${role}:${a}`);
                            const checked = allowed !== undefined ? allowed : DEFAULTS[role].includes(a);
                            const isOverride = allowed !== undefined;
                            return (
                              <td key={a} style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggle(p.module.id, role, a, checked)}
                                  title={isOverride ? "Custom override" : "Default"}
                                  style={{ accentColor: "var(--nv-color-primary)", cursor: "pointer" }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {p.hasOverrides && (
                    <div style={{ marginTop: 8 }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!window.confirm(`Reset "${p.module.name}" to role defaults?`)) return;
                          const fd = new FormData();
                          fd.set("module", p.module.id);
                          void actions.resetModule(fd).then(() => router.refresh());
                        }}
                      >
                        Reset to defaults
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
