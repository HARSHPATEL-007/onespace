"use client";
import { useState } from "react";

interface ActionButton { id: string; label: string; type: "approve" | "reject" | "assign" | "snooze" | "escalate" | "open" | "resolve"; style: "primary" | "secondary" | "danger"; }

interface InteractiveMessageProps {
  messageId: string;
  channelId: string;
  title: string;
  description?: string;
  actions?: ActionButton[];
  selectConfig?: { id: string; label: string; options: { value: string; label: string }[]; defaultValue?: string };
  dateConfig?: { id: string; label: string; minDate?: string };
  onAction?: (actionId: string, value?: string) => void;
}

export function InteractiveMessage({ title, description, actions, selectConfig, dateConfig, onAction }: InteractiveMessageProps) {
  const [selectedValue, setSelectedValue] = useState(selectConfig?.defaultValue ?? "");
  const [selectedDate, setSelectedDate] = useState("");

  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "var(--nv-space-3)", background: "var(--nv-color-surface)", maxWidth: 400 }}>
      <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", marginBottom: 4 }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)", marginBottom: "var(--nv-space-2)" }}>{description}</div>}

      {selectConfig && (
        <div style={{ marginBottom: "var(--nv-space-2)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>{selectConfig.label}</div>
          <select value={selectedValue} onChange={(e) => setSelectedValue(e.target.value)} className="nv-select" style={{ fontSize: "var(--nv-font-sm)" }}>
            {selectConfig.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      )}

      {dateConfig && (
        <div style={{ marginBottom: "var(--nv-space-2)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--nv-color-text-faint)", marginBottom: 4 }}>{dateConfig.label}</div>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} min={dateConfig.minDate} className="nv-input" style={{ fontSize: "var(--nv-font-sm)" }} />
        </div>
      )}

      {actions && actions.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "var(--nv-space-2)" }}>
          {actions.map(action => (
            <button
              key={action.id}
              onClick={() => onAction?.(action.id, selectConfig ? selectedValue : selectedDate || undefined)}
              style={{
                padding: "5px 12px", borderRadius: "var(--nv-radius-md)", fontSize: 12, fontWeight: 600, border: "1px solid transparent",
                cursor: "pointer", color: action.style === "danger" ? "#fff" : action.style === "primary" ? "#fff" : "var(--nv-color-text)",
                background: action.style === "danger" ? "var(--nv-color-danger)" : action.style === "primary" ? "var(--nv-color-primary)" : "var(--nv-color-surface-2)",
                borderColor: action.style === "secondary" ? "var(--nv-color-border)" : "transparent",
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PollWidget({ question, options, onVote }: { question: string; options: { id: string; label: string; votes: number }[]; onVote: (optionId: string) => void }) {
  const total = options.reduce((s, o) => s + o.votes, 0);
  return (
    <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: "var(--nv-space-3)", background: "var(--nv-color-surface)", maxWidth: 360 }}>
      <div style={{ fontWeight: 700, fontSize: "var(--nv-font-sm)", marginBottom: "var(--nv-space-2)" }}>📊 {question}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {options.map(opt => (
          <button key={opt.id} onClick={() => onVote(opt.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: "var(--nv-radius-md)", border: "1px solid var(--nv-color-border)", background: "transparent", cursor: "pointer", textAlign: "left" }}>
            <span style={{ flex: 1, fontSize: "var(--nv-font-sm)" }}>{opt.label}</span>
            <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>{total > 0 ? Math.round((opt.votes / total) * 100) : 0}%</span>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)", marginTop: 6 }}>{total} vote{total !== 1 ? "s" : ""}</div>
    </div>
  );
}
