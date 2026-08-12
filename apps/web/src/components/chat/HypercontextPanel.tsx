"use client";

import { useEffect, useState } from "react";
import { Button } from "@n0va/ui";
import { useRouter } from "next/navigation";
import type { HyperInput } from "@/app/(app)/m/chat/actions";

interface LinkRow {
  id: string;
  module: string;
  objectId: string;
  relation: string;
  score: number;
  confidence: number;
  status: string;
  reweight?: number | null;
}

interface PanelData {
  context: {
    causalChain: unknown[];
    links: Array<{ module: string; objectId: string; relation: string; score: number; confidence: number }>;
    actions: Array<{ type: string; status: string; confidence?: number; proposalId?: string; dueDate?: string | null; startsAt?: string | null; amount?: number | null }>;
  } | null;
  suggestions: LinkRow[];
  taskProposal: { id: string; title: string; status: string; confidence: number; dueDate?: Date | string | null } | null;
  eventProposal: { id: string; title: string; status: string; startsAt?: Date | string | null } | null;
  approval: { id: string; requestType: string; status: string; amount?: number | null; rationale: string } | null;
  config: { autoCreateTasks: boolean; autoCreateEvents: boolean; autoRaiseApprovals: boolean };
}

export function HypercontextPanel({
  messageId,
  hyper,
  onClose,
}: {
  messageId: string;
  hyper: (input: HyperInput) => Promise<unknown>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    void hyper({ op: "getContext", messageId })
      .then((res) => setData(res as PanelData))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [messageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (input: HyperInput, label: string) => {
    setBusy(label);
    setError("");
    void hyper(input)
      .then(() => {
        router.refresh();
        load();
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(""));
  };

  const pct = (n?: number) => `${Math.round((n ?? 0) * 100)}%`;

  const fmtDate = (d?: Date | string | null) =>
    d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", width: "min(560px, 92vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--nv-space-3) var(--nv-space-4)", borderBottom: "1px solid var(--nv-color-border)" }}>
          <div>
            <strong style={{ fontSize: 14 }}>🔗 Hyper-context</strong>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>message {messageId.slice(0, 8)}…</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "var(--nv-color-text)" }}>✕</button>
        </div>

        <div style={{ padding: "var(--nv-space-3) var(--nv-space-4)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
          {loading && <div className="nv-empty">Extracting context…</div>}
          {error && <div style={{ color: "var(--nv-color-danger)", fontSize: 12 }}>{error}</div>}
          {!loading && !data && <div className="nv-empty">No hyper-context found for this message.</div>}

          {data && (
            <>
              <section>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Linked objects</div>
                {data.suggestions.length === 0 && <div className="nv-empty" style={{ fontSize: 12 }}>No links suggested.</div>}
                {data.suggestions.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", marginBottom: 4 }}>
                    <span style={{ width: 16, textAlign: "center" }}>{moduleEmoji(s.module)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                        <span style={{ fontWeight: 600, fontSize: 12 }}>{s.module}.{shortId(s.objectId)}</span>
                        <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{s.relation}</span>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>
                        score {pct(s.score)} · confidence {pct(s.confidence)} · <StatusTag status={s.status} />{s.reweight != null ? ` · reweighted ${s.reweight}` : ""}
                      </div>
                    </div>
                    {s.status === "SUGGESTED" && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button title="Confirm link" onClick={() => run({ op: "confirmLink", suggestionId: s.id }, "confirm")} disabled={busy !== ""} style={chipStyle("var(--nv-color-success)")}>✓</button>
                        <button title="Downgrade (reweight 0.3)" onClick={() => run({ op: "reweightLink", suggestionId: s.id, reweight: 0.3 }, "reweight")} disabled={busy !== ""} style={chipStyle("var(--nv-color-warning)")}>↻</button>
                        <button title="Reject link" onClick={() => run({ op: "rejectLink", suggestionId: s.id }, "reject")} disabled={busy !== ""} style={chipStyle("var(--nv-color-danger)")}>✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <section>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Suggested actions</div>
                {data.taskProposal && (
                  <ActionRow
                    emoji="✅"
                    title={`Task: ${data.taskProposal.title}`}
                    meta={`${pct(data.taskProposal.confidence)} confidence · ${data.taskProposal.status} · due ${fmtDate(data.taskProposal.dueDate)}`}
                    action={{ label: "Create task", onClick: () => run({ op: "commitTask", proposalId: data.taskProposal!.id }, "task"), disabled: busy !== "" || data.taskProposal!.status === "COMMITTED" }}
                  />
                )}
                {data.eventProposal && (
                  <ActionRow
                    emoji="📅"
                    title={`Event: ${data.eventProposal.title}`}
                    meta={`${data.eventProposal.status} · ${fmtDate(data.eventProposal.startsAt)}`}
                    action={{ label: "Schedule", onClick: () => run({ op: "commitEvent", proposalId: data.eventProposal!.id }, "event"), disabled: busy !== "" || data.eventProposal!.status === "COMMITTED" || data.eventProposal!.status === "DUPLICATE" }}
                  />
                )}
                {data.approval && (
                  <ActionRow
                    emoji="🛂"
                    title={`Approval: ${data.approval.requestType}${data.approval.amount ? ` (${fmtMoney(data.approval.amount)})` : ""}`}
                    meta={`${data.approval.status} · ${data.approval.rationale.slice(0, 60)}`}
                    action={{ label: "Raise approval", onClick: () => run({ op: "raiseApproval", proposalId: data.approval!.id }, "approval"), disabled: busy !== "" || data.approval!.status === "RAISED" }}
                  />
                )}
                {!data.taskProposal && !data.eventProposal && !data.approval && <div className="nv-empty" style={{ fontSize: 12 }}>No actions extracted.</div>}
              </section>

              {data.context && (data.context.causalChain?.length ?? 0) > 0 && (
                <section>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Causal chain</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 10 }}>
                    {(data.context.causalChain as Array<{ step: string; actionType?: string }>).map((c, i) => (
                      <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ padding: "2px 6px", borderRadius: 999, background: "var(--nv-color-surface-2)", border: "1px solid var(--nv-color-border)" }}>
                          {c.step}{c.actionType ? ` (${c.actionType})` : ""}
                        </span>
                        {i < (data.context!.causalChain as unknown[]).length - 1 && <span style={{ color: "var(--nv-color-text-faint)" }}>→</span>}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {data.config && (
                <section style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
                  Policy: tasks auto-create {data.config.autoCreateTasks ? "on" : "off"} · events auto-create {data.config.autoCreateEvents ? "on" : "off"} · approvals auto-raise {data.config.autoRaiseApprovals ? "on" : "off"}.
                </section>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "var(--nv-space-3) var(--nv-space-4)", borderTop: "1px solid var(--nv-color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{busy ? `Working (${busy})…` : "Links are suggestions — confirm what matters."}</span>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ emoji, title, meta, action }: { emoji: string; title: string; meta: string; action: { label: string; onClick: () => void; disabled: boolean } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-bg)", marginBottom: 4 }}>
      <span>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{title}</div>
        <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{meta}</div>
      </div>
      <Button size="sm" disabled={action.disabled} onClick={action.onClick}>{action.label}</Button>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const color = status === "CONFIRMED" ? "var(--nv-color-success)" : status === "REJECTED" ? "var(--nv-color-danger)" : status === "REWEIGHTED" ? "var(--nv-color-warning)" : "var(--nv-color-text-faint)";
  return <span style={{ color }}>{status.toLowerCase()}</span>;
}

function moduleEmoji(module: string): string {
  switch (module) {
    case "mail": return "✉️";
    case "calendar": return "📅";
    case "tasks": return "✅";
    case "docs": return "📄";
    case "crm": return "👤";
    case "erp": return "📦";
    case "finance": return "💸";
    case "voice": return "📞";
    case "health": return "❤️";
    default: return "🔗";
  }
}

function shortId(id: string): string {
  if (id.startsWith("kw:")) return "(keyword)";
  if (id.startsWith("amt:")) return `amount ${id.split(":")[1]}`;
  return id.slice(0, 12) + "…";
}

function fmtMoney(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function chipStyle(color: string): React.CSSProperties {
  return { border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: 6, width: 22, height: 22, cursor: "pointer", color, fontSize: 12 };
}