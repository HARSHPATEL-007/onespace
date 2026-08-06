"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog } from "@n0va/ui";
import type { LegalDocument } from "@n0va/db";

export interface LegalActions {
  create: (formData: FormData) => Promise<void>;
  advanceStatus: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const KIND_BADGE: Record<string, string> = {
  CONTRACT: "nv-badge nv-badge-amber",
  POLICY: "nv-badge",
  COMPLIANCE: "nv-badge nv-badge-green",
  OTHER: "nv-badge",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "nv-badge",
  IN_REVIEW: "nv-badge nv-badge-amber",
  APPROVED: "nv-badge nv-badge-green",
  ACTIVE: "nv-badge nv-badge-green",
};

const NEXT_LABEL: Record<string, string> = {
  DRAFT: "Send to review",
  IN_REVIEW: "Approve",
  APPROVED: "Activate",
  ACTIVE: "Active",
};

export function LegalDocs({ documents, actions }: { documents: LegalDocument[]; actions: LegalActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA LEGAL</h1>
        <span className="nv-badge nv-badge-amber">contracts · policies</span>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New document</Button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {documents.map((d) => (
          <div key={d.id} className="nv-card" style={{ padding: 14, display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 800 }}>{d.title}</span>
                <span className={KIND_BADGE[d.kind] ?? "nv-badge"}>{d.kind}</span>
                <span className={STATUS_BADGE[d.status] ?? "nv-badge"}>{d.status}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                Updated {d.updatedAt.toLocaleDateString()}
                {d.effectiveDate ? ` · effective ${d.effectiveDate.toLocaleDateString()}` : ""}
                {d.reviewDate ? ` · review by ${d.reviewDate.toLocaleDateString()}` : ""}
              </div>
              {openId === d.id && (
                <pre
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    lineHeight: 1.55,
                    background: "var(--nv-color-bg)",
                    borderRadius: 8,
                    padding: 12,
                    whiteSpace: "pre-wrap",
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  {d.content || "No content yet."}
                </pre>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={() => setOpenId(openId === d.id ? null : d.id)}>
                {openId === d.id ? "Hide" : "View"}
              </Button>
              {d.status !== "ACTIVE" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", d.id);
                    void actions.advanceStatus(fd).then(() => router.refresh());
                  }}
                >
                  {NEXT_LABEL[d.status] ?? "Advance"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!window.confirm(`Delete "${d.title}"?`)) return;
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
        {documents.length === 0 && <div className="nv-empty" style={{ minHeight: 240 }}>No legal documents yet</div>}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New legal document"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-legal-form">Create</Button>
          </>
        }
      >
        <form
          id="create-legal-form"
          action={(fd) => {
            void actions.create(fd).then(() => {
              setCreating(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="Document title" required autoFocus />
          <select className="nv-input" name="kind" defaultValue="CONTRACT">
            <option value="CONTRACT">Contract</option>
            <option value="POLICY">Policy</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="OTHER">Other</option>
          </select>
          <textarea
            className="nv-input"
            name="content"
            rows={7}
            placeholder="Body text (plain or markdown-ish)"
            style={{ resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
          />
        </form>
      </Dialog>
    </div>
  );
}
