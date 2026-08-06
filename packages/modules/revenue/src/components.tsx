"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Payment, Subscription } from "@n0va/db";

export interface RevenueActions {
  createSubscription: (formData: FormData) => Promise<void>;
  setSubscriptionStatus: (formData: FormData) => Promise<void>;
  removeSubscription: (formData: FormData) => Promise<void>;
  recordPayment: (formData: FormData) => Promise<void>;
  removePayment: (formData: FormData) => Promise<void>;
}

const SUB_BADGE: Record<string, string> = {
  ACTIVE: "nv-badge nv-badge-green",
  TRIAL: "nv-badge nv-badge-amber",
  CHURNED: "nv-badge",
};

const PAY_BADGE: Record<string, string> = {
  SUCCEEDED: "nv-badge nv-badge-green",
  FAILED: "nv-badge",
  REFUNDED: "nv-badge nv-badge-amber",
};

const fmtMoney = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function RevenueBoard({
  data,
  actions,
}: {
  data: { subscriptions: Array<Subscription & { payments: Payment[] }>; payments: Payment[] };
  actions: RevenueActions;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState(false);

  const mrr = data.subscriptions.filter((s) => s.status !== "CHURNED").reduce((a, s) => a + s.mrrCents, 0);
  const collected = data.payments.filter((p) => p.status === "SUCCEEDED").reduce((a, p) => a + p.amountCents, 0);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA REVENUE</h1>
        <span className="nv-badge nv-badge-amber">billing · subscriptions</span>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={() => setPaying(true)}>+ Record payment</Button>
        <Button size="sm" onClick={() => setCreating(true)}>+ Subscription</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>MONTHLY RECURRING</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--nv-color-success)" }}>{fmtMoney(mrr)}/mo</div>
        </div>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>COLLECTED</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{fmtMoney(collected)}</div>
        </div>
      </div>

      <div style={{ fontWeight: 800, marginBottom: 8 }}>Subscriptions</div>
      <div className="nv-card" style={{ padding: 0, marginBottom: 16 }}>
        <table className="nv-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th style={{ textAlign: "right" }}>MRR</th>
              <th>Status</th>
              <th>Started</th>
              <th style={{ width: 130 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.subscriptions.map((s) => (
              <tr key={s.id}>
                <td style={{ fontWeight: 700 }}>{s.plan}</td>
                <td style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(s.mrrCents)}</td>
                <td><span className={SUB_BADGE[s.status] ?? "nv-badge"}>{s.status}</span></td>
                <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{s.startedAt.toLocaleDateString()}</td>
                <td>
                  {s.status === "TRIAL" && (
                    <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", s.id); fd.set("status", "ACTIVE"); void actions.setSubscriptionStatus(fd).then(() => router.refresh()); }}>Activate</Button>
                  )}
                  {s.status !== "CHURNED" && (
                    <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", s.id); fd.set("status", "CHURNED"); void actions.setSubscriptionStatus(fd).then(() => router.refresh()); }}>Churn</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm(`Remove ${s.plan}?`)) return; const fd = new FormData(); fd.set("id", s.id); void actions.removeSubscription(fd).then(() => router.refresh()); }}>✕</Button>
                </td>
              </tr>
            ))}
            {data.subscriptions.length === 0 && <tr><td colSpan={5} className="nv-empty">No subscriptions</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight: 800, marginBottom: 8 }}>Payments</div>
      <div className="nv-card" style={{ padding: 0 }}>
        <table className="nv-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Method</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{p.occurredAt.toLocaleString()}</td>
                <td style={{ fontSize: 12 }}>{p.method}</td>
                <td style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(p.amountCents)}</td>
                <td><span className={PAY_BADGE[p.status] ?? "nv-badge"}>{p.status}</span></td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm("Delete payment?")) return; const fd = new FormData(); fd.set("id", p.id); void actions.removePayment(fd).then(() => router.refresh()); }}>✕</Button>
                </td>
              </tr>
            ))}
            {data.payments.length === 0 && <tr><td colSpan={5} className="nv-empty">No payments recorded</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New subscription"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-sub-form">Create</Button>
          </>
        }
      >
        <form
          id="create-sub-form"
          action={(fd) => {
            void actions.createSubscription(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="plan" placeholder="Plan name (e.g. Pro annual)" required autoFocus />
          <input className="nv-input" name="mrrCents" type="number" min={0} step={100} placeholder="MRR (cents)" required />
          <select className="nv-input" name="status" defaultValue="TRIAL">
            <option value="TRIAL">Trial</option>
            <option value="ACTIVE">Active</option>
            <option value="CHURNED">Churned</option>
          </select>
        </form>
      </Dialog>

      <Dialog
        open={paying}
        onClose={() => setPaying(false)}
        title="Record a payment"
        actions={
          <>
            <Button variant="secondary" onClick={() => setPaying(false)}>Cancel</Button>
            <Button type="submit" form="pay-form">Record</Button>
          </>
        }
      >
        <form
          id="pay-form"
          action={(fd) => {
            void actions.recordPayment(fd).then(() => {
              setPaying(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <select className="nv-input" name="subscriptionId">
            <option value="">— No subscription —</option>
            {data.subscriptions.map((s) => (
              <option key={s.id} value={s.id}>{s.plan}</option>
            ))}
          </select>
          <input className="nv-input" name="amountCents" type="number" min={0} step={100} placeholder="Amount (cents)" required />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="nv-input" name="method" placeholder="Method (card / ach / wire)" style={{ flex: 1 }} />
            <select className="nv-input" name="status" defaultValue="SUCCEEDED" style={{ width: 140 }}>
              <option value="SUCCEEDED">Succeeded</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
