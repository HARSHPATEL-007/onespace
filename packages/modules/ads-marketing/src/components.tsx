"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Campaign } from "@n0va/db";

export interface CampaignActions {
  create: (formData: FormData) => Promise<void>;
  setStatus: (formData: FormData) => Promise<void>;
  simulate: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const CHANNEL_BADGE: Record<string, string> = {
  SOCIAL: "nv-badge",
  SEARCH: "nv-badge nv-badge-amber",
  EMAIL: "nv-badge nv-badge-green",
  DISPLAY: "nv-badge",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "nv-badge",
  RUNNING: "nv-badge nv-badge-green",
  PAUSED: "nv-badge nv-badge-amber",
  COMPLETED: "nv-badge",
};

const fmtMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export function CampaignsBoard({ campaigns, actions }: { campaigns: Campaign[]; actions: CampaignActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const totalSpent = campaigns.reduce((a, c) => a + c.spentCents, 0);
  const totalClicks = campaigns.reduce((a, c) => a + c.clicks, 0);
  const totalConversions = campaigns.reduce((a, c) => a + c.conversions, 0);
  const ctr = totalClicks && totalClicks > 0 ? (totalClicks / Math.max(1, campaigns.reduce((a, c) => a + c.impressions, 0))) * 100 : 0;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA ADS & MARKETING</h1>
        <span className="nv-badge nv-badge-amber">campaigns</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New campaign</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>SPENT</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtMoney(totalSpent)}</div>
        </div>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>CLICKS</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0ea5e9" }}>{totalClicks.toLocaleString()}</div>
        </div>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>CTR · CONVERSIONS</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--nv-color-success)" }}>
            {ctr.toFixed(2)}% · {totalConversions}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {campaigns.map((c) => {
          const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00";
          const convRate = c.clicks > 0 ? ((c.conversions / c.clicks) * 100).toFixed(1) : "0.0";
          return (
            <div key={c.id} className="nv-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span className={CHANNEL_BADGE[c.channel] ?? "nv-badge"}>{c.channel}</span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className={STATUS_BADGE[c.status] ?? "nv-badge"}>{c.status}</span>
                <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                  {fmtMoney(c.spentCents)} / {fmtMoney(c.budgetCents)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                <span>{c.impressions.toLocaleString()} impressions</span>
                <span>{c.clicks.toLocaleString()} clicks</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>CTR {ctr}% · Conv {convRate}%</div>
              <div style={{ height: 6, borderRadius: 3, background: "var(--nv-color-border)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${c.budgetCents > 0 ? Math.min(100, (c.spentCents / c.budgetCents) * 100) : 0}%`,
                    background: "var(--nv-color-primary)",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {c.status === "DRAFT" && (
                  <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", c.id); fd.set("status", "RUNNING"); void actions.setStatus(fd).then(() => router.refresh()); }}>Launch</Button>
                )}
                {c.status === "RUNNING" && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", c.id); fd.set("status", "PAUSED"); void actions.setStatus(fd).then(() => router.refresh()); }}>Pause</Button>
                    <Button variant="secondary" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", c.id); void actions.simulate(fd).then(() => router.refresh()); }}>Deliver</Button>
                  </>
                )}
                {c.status === "PAUSED" && (
                  <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", c.id); fd.set("status", "RUNNING"); void actions.setStatus(fd).then(() => router.refresh()); }}>Resume</Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!window.confirm(`Delete campaign "${c.name}"?`)) return;
                    const fd = new FormData();
                    fd.set("id", c.id);
                    void actions.remove(fd).then(() => router.refresh());
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
          );
        })}
        {campaigns.length === 0 && <div className="nv-empty" style={{ gridColumn: "1 / -1", minHeight: 240 }}>No campaigns yet</div>}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New campaign"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-campaign-form">Create</Button>
          </>
        }
      >
        <form
          id="create-campaign-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Campaign name" required autoFocus />
          <select className="nv-input" name="channel" defaultValue="SOCIAL">
            <option value="SOCIAL">Social</option>
            <option value="SEARCH">Search</option>
            <option value="EMAIL">Email</option>
            <option value="DISPLAY">Display</option>
          </select>
          <input className="nv-input" name="budgetCents" type="number" min={0} step={100} placeholder="Budget (cents)" defaultValue={0} />
        </form>
      </Dialog>
    </div>
  );
}
