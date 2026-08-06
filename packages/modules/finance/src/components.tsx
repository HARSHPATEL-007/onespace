"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { Invoice } from "@n0va/db";

export interface FinanceActions {
  create: (formData: FormData) => Promise<void>;
  markSent: (formData: FormData) => Promise<void>;
  markPaid: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "nv-badge",
  SENT: "nv-badge nv-badge-amber",
  PAID: "nv-badge nv-badge-green",
  OVERDUE: "nv-badge",
};

const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export function InvoiceLedger({ invoices, actions }: { invoices: Invoice[]; actions: FinanceActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const outstanding = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce((a, i) => a + i.amountCents, 0);
  const collected = invoices.filter((i) => i.status === "PAID").reduce((a, i) => a + i.amountCents, 0);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA FINANCE</h1>
        <span className="nv-badge nv-badge-amber">ledger · invoices</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New invoice</Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>OUTSTANDING</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--nv-color-warning)" }}>
            {fmtMoney(outstanding, "USD")}
          </div>
        </div>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>COLLECTED</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "var(--nv-color-success)" }}>
            {fmtMoney(collected, "USD")}
          </div>
        </div>
      </div>

      <div className="nv-card" style={{ padding: 0 }}>
        <table className="nv-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th style={{ textAlign: "right" }}>Amount</th>
              <th>Status</th>
              <th>Due</th>
              <th style={{ width: 150 }}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{i.number}</td>
                <td style={{ fontWeight: 600 }}>{i.customer}</td>
                <td style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(i.amountCents, i.currency)}</td>
                <td>
                  <span className={STATUS_BADGE[i.status] ?? "nv-badge"}>{i.status}</span>
                </td>
                <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                  {i.dueDate ? i.dueDate.toLocaleDateString() : "—"}
                </td>
                <td>
                  {i.status === "DRAFT" && (
                    <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", i.id); void actions.markSent(fd).then(() => router.refresh()); }}>Send</Button>
                  )}
                  {(i.status === "SENT" || i.status === "OVERDUE") && (
                    <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("id", i.id); void actions.markPaid(fd).then(() => router.refresh()); }}>Mark paid</Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm(`Delete invoice ${i.number}?`)) return; const fd = new FormData(); fd.set("id", i.id); void actions.remove(fd).then(() => router.refresh()); }}>✕</Button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} className="nv-empty">No invoices yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New invoice"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-invoice-form">Create</Button>
          </>
        }
      >
        <form
          id="create-invoice-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input className="nv-input" name="number" placeholder="INV-0001" required autoFocus style={{ width: 130 }} />
            <input className="nv-input" name="customer" placeholder="Customer name" required style={{ flex: 1 }} />
          </div>
          <input className="nv-input" name="amountCents" type="number" min={0} step={100} placeholder="Amount (cents)" required />
          <input className="nv-input" name="dueDate" type="date" />
        </form>
      </Dialog>
    </div>
  );
}
