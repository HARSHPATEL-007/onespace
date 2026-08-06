"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { EndpointDevice } from "@n0va/db";

export interface EndpointActions {
  enroll: (formData: FormData) => Promise<void>;
  revoke: (formData: FormData) => Promise<void>;
  reinstate: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const TYPE_BADGE: Record<string, string> = { LAPTOP: "nv-badge", MOBILE: "nv-badge nv-badge-amber", OTHER: "nv-badge" };

export function Endpoints({
  devices,
  actions,
}: {
  devices: Array<EndpointDevice & { owner: { id: string; name: string | null; email: string } | null }>;
  actions: EndpointActions;
}) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>ENDPOINT MANAGEMENT</h1>
        <span className="nv-badge nv-badge-amber">{devices.length} devices</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setEnrolling(true)}>+ Enroll device</Button>
      </div>

      <div className="nv-card" style={{ padding: 0 }}>
        <table className="nv-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Type</th>
              <th>OS</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Last seen</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td style={{ fontWeight: 700 }}>{d.name}</td>
                <td><span className={TYPE_BADGE[d.type] ?? "nv-badge"}>{d.type}</span></td>
                <td style={{ fontSize: 12 }}>{d.os}</td>
                <td style={{ fontSize: 12 }}>{d.owner?.name ?? d.owner?.email ?? "—"}</td>
                <td>
                  {d.status === "ACTIVE" ? (
                    <span className="nv-badge nv-badge-green">Active</span>
                  ) : d.status === "REVOKED" ? (
                    <span className="nv-badge" style={{ background: "#ef4444" }}>Revoked</span>
                  ) : (
                    <span className="nv-badge">Inactive</span>
                  )}
                </td>
                <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{d.lastSeenAt.toLocaleString()}</td>
                <td>
                  {d.status === "ACTIVE" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Revoke ${d.name}?`)) return;
                        const fd = new FormData();
                        fd.set("id", d.id);
                        void actions.revoke(fd).then(() => router.refresh());
                      }}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("id", d.id);
                        void actions.reinstate(fd).then(() => router.refresh());
                      }}
                    >
                      Restore
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`Remove ${d.name} from inventory?`)) return;
                      const fd = new FormData();
                      fd.set("id", d.id);
                      void actions.remove(fd).then(() => router.refresh());
                    }}
                  >
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr><td colSpan={7} className="nv-empty">No enrolled devices</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={enrolling}
        onClose={() => setEnrolling(false)}
        title="Enroll a device"
        actions={
          <>
            <Button variant="secondary" onClick={() => setEnrolling(false)}>Cancel</Button>
            <Button type="submit" form="enroll-device-form">Enroll</Button>
          </>
        }
      >
        <form
          id="enroll-device-form"
          action={(fd) => {
            void actions.enroll(fd).then(() => {
              setEnrolling(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Device name (e.g. Work laptop)" required autoFocus />
          <select className="nv-input" name="type" defaultValue="LAPTOP">
            <option value="LAPTOP">Laptop</option>
            <option value="MOBILE">Mobile</option>
            <option value="OTHER">Other</option>
          </select>
          <input className="nv-input" name="os" placeholder="OS (leave blank to auto-detect)" />
        </form>
      </Dialog>
    </div>
  );
}
