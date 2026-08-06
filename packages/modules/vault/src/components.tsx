"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { VaultEntry } from "@n0va/db";

export interface VaultActions {
  create: (formData: FormData) => Promise<void>;
  reveal: (id: string) => Promise<string>;
  remove: (formData: FormData) => Promise<void>;
}

export function VaultManager({ entries, actions }: { entries: Array<VaultEntry & { masked: string }>; actions: VaultActions }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA VAULT</h1>
        <span className="nv-badge nv-badge-green">AES-256-GCM</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setAdding(true)}>+ Add secret</Button>
      </div>

      {entries.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No secrets stored yet</div>
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>Store your first secret</Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map((e) => {
            const value = revealed[e.id];
            return (
              <div key={e.id} className="nv-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    {e.name}
                    {e.hint && <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", fontWeight: 400 }}>{e.hint}</span>}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "var(--nv-color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {value ?? e.masked}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (value) {
                        setRevealed((r) => { const n = { ...r }; delete n[e.id]; return n; });
                      } else {
                        void actions.reveal(e.id).then((v) => setRevealed((r) => ({ ...r, [e.id]: v })));
                      }
                    }}
                  >
                    {value ? "Hide" : "Reveal"}
                  </Button>
                  {value && (
                    <Button variant="secondary" size="sm" onClick={() => void copy(value)}>
                      {copied ? "✓" : "Copy"}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`Delete "${e.name}"?`)) return;
                      const fd = new FormData();
                      fd.set("id", e.id);
                      void actions.remove(fd).then(() => router.refresh());
                    }}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Store a secret"
        actions={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" form="add-secret-form">Encrypt & store</Button>
          </>
        }
      >
        <form
          id="add-secret-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setAdding(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 340, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="name" placeholder="Name (e.g. Stripe API key)" autoFocus required />
          <input className="nv-input" name="hint" placeholder="Hint (visible in the list)" />
          <textarea className="nv-input" name="value" rows={3} placeholder="Secret value" required style={{ resize: "vertical", fontFamily: "monospace" }} />
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>Encrypted with AES-256-GCM before it touches the database.</div>
        </form>
      </Dialog>
    </div>
  );
}
