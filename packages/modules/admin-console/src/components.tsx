"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { AuditLog } from "@n0va/db";
import type { MemberRow } from "./server";

export interface ConsoleActions {
  setRole: (formData: FormData) => Promise<void>;
  invite: (formData: FormData) => Promise<string>;
  removeMember: (formData: FormData) => Promise<void>;
  setSecurity: (formData: FormData) => Promise<void>;
}

const ROLE_BADGE: Record<string, string> = {
  OWNER: "nv-badge",
  ADMIN: "nv-badge nv-badge-amber",
  MEMBER: "nv-badge nv-badge-green",
  VIEWER: "nv-badge",
};

export function AdminConsole({
  members,
  auditLog,
  security,
  actions,
}: {
  members: MemberRow[];
  auditLog: AuditLog[];
  security: { mfaEnabled: boolean; sessionTimeoutMin: number };
  actions: ConsoleActions;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"users" | "audit" | "security">("users");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [mfa, setMfa] = useState(security.mfaEnabled);
  const [timeoutMin, setTimeoutMin] = useState(security.sessionTimeoutMin);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA ADMIN CONSOLE</h1>
        <span className="nv-badge nv-badge-amber">users · security · audit</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "var(--nv-space-4)" }}>
        {(["users", "audit", "security"] as const).map((t) => (
          <Button key={t} variant={tab === t ? "primary" : "secondary"} size="sm" onClick={() => setTab(t)}>
            {t === "users" ? "Users & roles" : t === "audit" ? "Audit log" : "Security"}
          </Button>
        ))}
      </div>

      {tab === "users" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <Button size="sm" onClick={() => { setInviting(true); setInviteResult(null); }}>+ Invite member</Button>
          </div>
          <div className="nv-card">
            <table className="nv-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th>Role</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.user.name ?? "—"}</td>
                    <td>{m.user.email}</td>
                    <td>{m.joinedAt.toLocaleDateString()}</td>
                    <td>
                      <select
                        className="nv-input"
                        value={m.role}
                        disabled={m.role === "OWNER"}
                        onChange={(e) => {
                          const fd = new FormData();
                          fd.set("memberId", m.id);
                          fd.set("role", e.target.value);
                          void actions.setRole(fd).then(() => router.refresh());
                        }}
                        style={{ padding: "4px 8px", fontSize: 13 }}
                      >
                        {["VIEWER", "MEMBER", "ADMIN"].map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={m.userId === undefined}
                        onClick={() => {
                          if (!window.confirm(`Remove ${m.user.email} from this workspace?`)) return;
                          const fd = new FormData();
                          fd.set("memberId", m.id);
                          void actions.removeMember(fd).then(() => router.refresh());
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="nv-card" style={{ padding: 0 }}>
          <table className="nv-table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>When</th>
                <th>Module</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((l) => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{l.createdAt.toLocaleString()}</td>
                  <td>{l.module}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{l.action}</td>
                  <td style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>{l.targetId ?? "—"}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan={4} className="nv-empty">No audit events yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "security" && (
        <div className="nv-card" style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontWeight: 700, flex: 1 }}>Require two-factor authentication</label>
            <input type="checkbox" checked={mfa} onChange={(e) => setMfa(e.target.checked)} style={{ accentColor: "var(--nv-color-primary)", width: 18, height: 18 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontWeight: 700, flex: 1 }}>Session timeout (minutes)</label>
            <input
              type="number"
              className="nv-input"
              value={timeoutMin}
              min={5}
              max={240}
              onChange={(e) => setTimeoutMin(Number(e.target.value))}
              style={{ width: 90 }}
            />
          </div>
          <div>
            <Button
              size="sm"
              onClick={() => {
                const fd = new FormData();
                fd.set("mfa", mfa ? "true" : "false");
                fd.set("timeout", String(timeoutMin));
                void actions.setSecurity(fd).then(() => router.refresh());
              }}
            >
              Save security settings
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={inviting}
        onClose={() => setInviting(false)}
        title="Invite a member"
        actions={
          <>
            <Button variant="secondary" onClick={() => setInviting(false)}>Close</Button>
            <Button type="submit" form="invite-form">Invite</Button>
          </>
        }
      >
        {inviteResult ? (
          <div style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="nv-empty" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700 }}>Member invited</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Email: <b>{inviteResult.split(" / ")[0]}</b></div>
              <div style={{ fontSize: 13 }}>Temporary password: <code>{inviteResult.split(" / ")[1]}</code></div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setInviting(false); setInviteResult(null); }}>Done</Button>
          </div>
        ) : (
          <form
            id="invite-form"
            action={(fd) => {
              void actions.invite(fd).then((result) => setInviteResult(result));
            }}
            style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <input className="nv-input" name="email" type="email" placeholder="name@company.com" required autoFocus />
            <input className="nv-input" name="name" placeholder="Display name" />
            <select className="nv-input" name="role" defaultValue="MEMBER">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </form>
        )}
      </Dialog>
    </div>
  );
}
