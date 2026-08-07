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

const CATEGORIES = ["general", "api", "db", "deploy", "infra", "fintech"] as const;
type VaultCategory = (typeof CATEGORIES)[number];

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  general: "General",
  api: "API key",
  db: "Database",
  deploy: "Deploy",
  infra: "Infrastructure",
  fintech: "Fintech",
};

const CATEGORY_BADGES: Record<VaultCategory, { className?: string; color?: string }> = {
  general: { className: "nv-badge-neutral" },
  api: { className: "nv-badge-warning" },
  db: { className: "nv-badge-primary" },
  deploy: { color: "#a855f7" },
  infra: { className: "nv-badge-neutral" },
  fintech: { className: "nv-badge-success" },
};

const EXPIRY_DAY_MS = 86_400_000;

function CategoryBadge({ category }: { category: string }) {
  const key = (CATEGORIES as readonly string[]).includes(category) ? (category as VaultCategory) : "general";
  const badge = CATEGORY_BADGES[key];
  return (
    <span
      className={`nv-badge ${badge.className ?? ""}`.trim()}
      style={badge.color ? { background: `color-mix(in srgb, ${badge.color} 14%, transparent)`, color: badge.color } : undefined}
    >
      {CATEGORY_LABELS[key]}
    </span>
  );
}

function expiryInfo(expiresAt: Date | null, now: number): { text: string; className: string } | null {
  if (!expiresAt) return null;
  const date = expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const at = expiresAt.getTime();
  if (at <= now) return { text: `Expired ${date}`, className: "nv-badge-danger" };
  if (at - now <= 7 * EXPIRY_DAY_MS) return { text: `Expires soon ${date}`, className: "nv-badge-warning" };
  return { text: `Expires ${date}`, className: "nv-badge-neutral" };
}

export function VaultManager({ entries, actions }: { entries: Array<VaultEntry & { masked: string }>; actions: VaultActions }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<"all" | VaultCategory>("all");

  const now = Date.now();
  const visible = filter === "all" ? entries : entries.filter((e) => e.category === filter);

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
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--nv-space-4)" }}>
            {(["all", ...CATEGORIES] as const).map((f) => {
              const active = filter === f;
              const label = f === "all" ? "All" : CATEGORY_LABELS[f];
              const count = f === "all" ? entries.length : entries.filter((e) => e.category === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  style={{
                    border: "1px solid",
                    borderColor: active ? "var(--nv-color-primary)" : "var(--nv-color-border)",
                    background: active ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)",
                    color: active ? "#fff" : "var(--nv-color-text-muted)",
                    borderRadius: "var(--nv-radius-full)",
                    padding: "4px 10px",
                    fontSize: "var(--nv-font-xs)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {label} <span style={{ opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No secrets in this category.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {visible.map((e) => {
                const value = revealed[e.id];
                const exp = expiryInfo(e.expiresAt, now);
                return (
                  <div key={e.id} className="nv-card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {e.name}
                        <CategoryBadge category={e.category} />
                        {exp && <span className={`nv-badge ${exp.className}`}>{exp.text}</span>}
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
        </>
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
          <div style={{ display: "flex", gap: 10 }}>
            <select className="nv-select" name="category" defaultValue="general">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <input className="nv-input" type="date" name="expiresAt" />
          </div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
            Encrypted with AES-256-GCM before it touches the database. Leave the date empty for no expiry.
          </div>
        </form>
      </Dialog>
    </div>
  );
}