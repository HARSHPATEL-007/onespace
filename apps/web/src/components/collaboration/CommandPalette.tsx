"use client";
import { useState, useEffect, useCallback } from "react";

const COMMANDS = [
  { phrase: "send message", icon: "📨", desc: "Send the current draft" },
  { phrase: "reply to last", icon: "↩️", desc: "Reply to the last message" },
  { phrase: "mute channel", icon: "🔕", desc: "Mute notifications for this channel" },
  { phrase: "find message", icon: "🔍", desc: "Search in current channel" },
  { phrase: "pin message", icon: "📌", desc: "Pin the selected message" },
  { phrase: "next unread", icon: "⏭️", desc: "Jump to next unread message" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    fetch("/api/collaboration/subvocal").then(r => r.json()).then(d => { if (d.config) { setEnabled(d.config.enabled); } }).catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    fetch("/api/collaboration/subvocal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
  }, [enabled]);

  if (!enabled) {
    return (
      <button onClick={toggle} title="Enable sub-vocal input" style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>
        🎙️ Sub-vocal
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{ border: "1px solid var(--nv-color-primary)", background: "var(--nv-color-primary-alpha)", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-primary)", display: "flex", alignItems: "center", gap: 4 }}>
        🎙️ Sub-vocal <span style={{ fontSize: 9, opacity: 0.7 }}>ON</span>
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", right: 0, width: 280, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-lg)", boxShadow: "var(--nv-shadow-lg)", padding: "var(--nv-space-2)", zIndex: 50 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nv-color-text-faint)", padding: "4px 8px" }}>Voice Commands</div>
          {COMMANDS.map(c => (
            <div key={c.phrase} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text)" }}>
              <span>{c.icon}</span>
              <div>
                <div style={{ fontFamily: "var(--nv-font-mono)", fontSize: 11 }}>{c.phrase}</div>
                <div style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>{c.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--nv-color-border)", marginTop: 4, paddingTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>Confidence: {(confidence * 100).toFixed(0)}%</span>
            <button onClick={toggle} style={{ fontSize: 11, padding: "3px 8px", borderRadius: "var(--nv-radius-sm)", border: "1px solid var(--nv-color-border)", background: "transparent", cursor: "pointer", color: "var(--nv-color-danger)" }}>Disable</button>
          </div>
        </div>
      )}
    </div>
  );
}
