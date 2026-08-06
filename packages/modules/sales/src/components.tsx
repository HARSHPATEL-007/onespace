"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Deal } from "@n0va/db";

export interface SalesActions {
  create: (formData: FormData) => Promise<void>;
  setStage: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const;
type Stage = (typeof STAGES)[number];

const STAGE_COLOR: Record<string, string> = {
  LEAD: "var(--nv-color-text-faint)",
  QUALIFIED: "#0ea5e9",
  PROPOSAL: "#f59e0b",
  NEGOTIATION: "#7c5cff",
  WON: "var(--nv-color-success)",
  LOST: "#ef4444",
};

const fmtMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export function Pipeline({ deals, actions }: { deals: Deal[]; actions: SalesActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const won = deals.filter((d) => d.stage === "WON").reduce((a, d) => a + d.valueCents, 0);
  const open = deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST").reduce((a, d) => a + d.valueCents, 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA SALES</h1>
        <span className="nv-badge nv-badge-amber">pipeline CRM</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
          Open <b>{fmtMoney(open)}</b> · Won <b style={{ color: "var(--nv-color-success)" }}>{fmtMoney(won)}</b>
        </span>
        <Button size="sm" onClick={() => setCreating(true)}>+ New deal</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 10 }}>
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          const stageTotal = stageDeals.reduce((a, d) => a + d.valueCents, 0);
          return (
            <div key={stage} style={{ background: "var(--nv-color-surface-raised)", borderRadius: 12, padding: 10, minHeight: 280, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: STAGE_COLOR[stage] }}>
                {stage.toUpperCase()} · {fmtMoney(stageTotal)}
              </div>
              {stageDeals.map((d) => (
                <div key={d.id} className="nv-card" style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{d.title}</div>
                  <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{d.company || "—"}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtMoney(d.valueCents)}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {stage !== "WON" && stage !== "LOST" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const idx = STAGES.indexOf(stage);
                          const next = STAGES[Math.min(idx + 1, STAGES.length - 1)] as Stage;
                          const fd = new FormData();
                          fd.set("id", d.id);
                          fd.set("stage", next);
                          void actions.setStage(fd).then(() => router.refresh());
                        }}
                      >
                        →
                      </Button>
                    )}
                    {stage === "WON" && (
                      <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", d.id); fd.set("stage", "NEGOTIATION"); void actions.setStage(fd).then(() => router.refresh()); }}>↺</Button>
                    )}
                    {stage === "LOST" && (
                      <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", d.id); fd.set("stage", "LEAD"); void actions.setStage(fd).then(() => router.refresh()); }}>↺</Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Delete deal "${d.title}"?`)) return;
                        const fd = new FormData();
                        fd.set("id", d.id);
                        void actions.remove(fd).then(() => router.refresh());
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              {stageDeals.length === 0 && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", textAlign: "center", paddingTop: 12 }}>—</div>}
            </div>
          );
        })}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New deal"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-deal-form">Create</Button>
          </>
        }
      >
        <form
          id="create-deal-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="Deal title" required autoFocus />
          <input className="nv-input" name="company" placeholder="Company" />
          <input className="nv-input" name="valueCents" type="number" min={0} step={100} placeholder="Value (cents)" defaultValue={0} />
          <select className="nv-input" name="stage" defaultValue="LEAD">
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </form>
      </Dialog>
    </div>
  );
}
