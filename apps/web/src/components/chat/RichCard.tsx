"use client";

import { useEffect, useState, useCallback } from "react";

type RichCardData = {
  version: 1;
  id: string;
  kind: string;
  collapsed: boolean;
  icon: string;
  title: string;
  summaryLine: string;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  fields: Array<{ label: string; value: string }>;
  actions: Array<{ id: string; label: string; style: string; value?: string; confirm?: { title: string; text: string } }>;
  selects?: Array<{ id: string; placeholder: string; options: Array<{ label: string; value: string }>; value?: string }>;
  datePickers?: Array<{ id: string; placeholder: string; initialDate?: string; value?: string }>;
  source?: { url: string; domain?: string; objectType?: string; objectId?: string; fetchedAt?: string };
  provenance?: { actorId?: string; actorName?: string; triggeredAt?: string };
};

export function RichCards({ messageId, channelId }: { messageId: string; channelId: string }) {
  const [cards, setCards] = useState<RichCardData[]>([]);
  const [interactive, setInteractive] = useState<unknown>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rich/cards?messageId=${encodeURIComponent(messageId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setCards((data.cards as RichCardData[]) ?? []);
      if (data.interactive) setInteractive(data.interactive);
    } catch {}
  }, [messageId]);

  useEffect(() => { void load(); }, [load]);

  // Also poll for live widget updates via SSE? For now manual refresh button.

  if (cards.length === 0 && !interactive) return null;

  const handleAction = async (cardId: string, actionId: string, value?: string, confirm?: boolean) => {
    const key = `${cardId}:${actionId}`;
    setBusy(key);
    try {
      const action = cards.find((c) => c.id === cardId)?.actions.find((a) => a.id === actionId);
      if (action?.confirm && !confirm) {
        const ok = window.confirm(`${action.confirm.title}\n\n${action.confirm.text}`);
        if (!ok) { setBusy(null); return; }
        confirm = true;
      }
      const res = await fetch("/api/chat/rich/interactive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, channelId, actionId, value, confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        // If confirm required, retry with confirm
        if (data.message?.includes("Confirm")) {
          const ok = window.confirm(data.message);
          if (ok) await handleAction(cardId, actionId, value, true);
        }
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, maxWidth: 420 }}>
      {cards.map((card) => {
        const isExpanded = expanded[card.id] ?? !card.collapsed;
        const collapsed = !isExpanded;
        return (
          <div
            key={card.id}
            style={{
              border: "1px solid var(--nv-color-border)",
              borderRadius: "var(--nv-radius-md)",
              background: "var(--nv-color-surface-2)",
              overflow: "hidden",
              maxWidth: 420,
            }}
          >
            {/* Header — compact */}
            <div style={{ display: "flex", gap: 8, padding: "8px 10px", alignItems: "flex-start" }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{card.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.title}</div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.summaryLine}</div>
                {!collapsed && card.description && (
                  <div style={{ fontSize: 11, color: "var(--nv-color-text)", marginTop: 4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" as const }}>{card.description}</div>
                )}
                {/* Fields — 1 primary summary line per UX rule, rest compact */}
                {card.fields.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 6, fontSize: 11 }}>
                    {(collapsed ? card.fields.slice(0, 2) : card.fields).map((f) => (
                      <span key={f.label} style={{ color: "var(--nv-color-text-faint)" }}>
                        <span style={{ fontWeight: 600, color: "var(--nv-color-text)" }}>{f.label}:</span> {f.value}
                      </span>
                    ))}
                  </div>
                )}
                {/* Trust metadata */}
                {card.source?.fetchedAt && !collapsed && (
                  <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
                    via {card.siteName ?? card.source.domain ?? "internal"} • {new Date(card.source.fetchedAt).toLocaleTimeString()}
                    {card.source.objectId ? ` • ${card.source.objectType}:${card.source.objectId.slice(0, 8)}` : ""}
                  </div>
                )}
                {/* Provenance */}
                {card.provenance?.actorName && (
                  <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", fontStyle: "italic" as const }}>Triggered by {card.provenance.actorName}</div>
                )}
              </div>
              {card.imageUrl && !collapsed && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: "cover" as const, borderRadius: "var(--nv-radius-sm)", flexShrink: 0 }} />
              )}
              <button
                onClick={() => setExpanded((p) => ({ ...p, [card.id]: !collapsed ? false : true }))}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, color: "var(--nv-color-text-faint)", padding: 2 }}
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                {collapsed ? "▸" : "▾"}
              </button>
            </div>

            {/* Actions — one primary per card, expand shows selects/date pickers */}
            <div style={{ display: "flex", gap: 6, padding: collapsed ? "0 10px 8px" : "6px 10px 8px", flexWrap: "wrap" as const, borderTop: collapsed ? "none" : "1px solid var(--nv-color-border)", alignItems: "center" as const }}>
              {card.actions.slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  disabled={busy === `${card.id}:${a.id}`}
                  onClick={() => void handleAction(card.id, a.id, a.value)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "var(--nv-radius-full)",
                    fontSize: 12,
                    fontWeight: 600,
                    border: a.style === "primary" ? "none" : "1px solid var(--nv-color-border)",
                    background: a.style === "primary" ? "var(--nv-color-primary)" : a.style === "destructive" ? "var(--nv-color-danger)" : "var(--nv-color-surface)",
                    color: a.style === "primary" || a.style === "destructive" ? "#fff" : "var(--nv-color-text)",
                    cursor: "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {a.label}
                </button>
              ))}
              {/* Selects */}
              {!collapsed && card.selects?.map((sel) => (
                <select
                  key={sel.id}
                  defaultValue={sel.value ?? ""}
                  onChange={(e) => void handleAction(card.id, sel.id, e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: "var(--nv-radius-md)", border: "1px solid var(--nv-color-border)", fontSize: 11, background: "var(--nv-color-surface)" }}
                >
                  <option value="">{sel.placeholder}</option>
                  {sel.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ))}
              {!collapsed && card.datePickers?.map((dp) => (
                <input
                  key={dp.id}
                  type="date"
                  defaultValue={dp.value ?? (dp.initialDate ? dp.initialDate.slice(0, 10) : "")}
                  onChange={(e) => void handleAction(card.id, dp.id, e.target.value)}
                  style={{ padding: "4px 8px", borderRadius: "var(--nv-radius-md)", border: "1px solid var(--nv-color-border)", fontSize: 11 }}
                />
              ))}
            </div>
          </div>
        );
      })}
      {/* Interactive fallback rendering if no cards but interactive spec exists */}
      {cards.length === 0 && !!interactive && (
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", border: "1px dashed var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8 }}>
          Interactive content available — expand thread to act
        </div>
      )}
    </div>
  );
}
