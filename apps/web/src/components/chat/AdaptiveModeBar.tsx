"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { WorkspaceModeValue, ModeSource } from "@n0va/modules-chat";

interface ModeMeta { key: WorkspaceModeValue; label: string; icon: string }
interface EffectiveState { mode: WorkspaceModeValue; source: ModeSource; confidence: number; expiresAt: string | null; overrides: Record<string, unknown>; fade: number; reason: string }
interface StoredState { currentMode: WorkspaceModeValue; stateSource: ModeSource; expiresAt: string | null; suggestedMode: WorkspaceModeValue | null; suggestedConfidence: number; suggestedReasons: string[] }

const LOCK_MINUTES = [30, 60, 180];
const MODE_HINTS: Record<string, string> = {
  FOCUS: "Non-essential UI hidden; only urgent mentions break through.",
  COLLABORATION: "Presence, shared context, and synchronous tools emphasized.",
  REVIEW: "Decisions, diffs, and unresolved items foregrounded.",
  PRESENTATION: "Large type, high contrast, noise stripped for sharing.",
  CRISIS: "War-room: incident status and priority traffic only.",
  FLOW: "Quiet, soft feedback, deep-work timer running.",
  MEDITATION: "Do-not-disturb. Everything is queued until you return.",
};

export function AdaptiveModeBar({
  mode,
  source,
  onModeChange,
}: {
  mode: WorkspaceModeValue;
  source: ModeSource;
  onModeChange?: (mode: WorkspaceModeValue, source: ModeSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const [modes, setModes] = useState<ModeMeta[]>([]);
  const [stored, setStored] = useState<StoredState | null>(null);
  const [reason, setReason] = useState("");
  const [suggestion, setSuggestion] = useState<{ mode: WorkspaceModeValue; confidence: number; reasons: string[] } | null>(null);
  const [announce, setAnnounce] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/chat/adaptive/state");
      if (!r.ok) return;
      const d = await r.json();
      setModes(d.modes ?? []);
      setStored(d.stored ?? null);
      setReason(d.effective?.reason ?? "");
    } catch { /* offline — keep defaults */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const switchMode = async (next: WorkspaceModeValue, lockMinutes?: number) => {
    const body: Record<string, unknown> = { mode: next };
    if (lockMinutes) body.lockMinutes = lockMinutes;
    const r = await fetch("/api/chat/adaptive/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return;
    const d = await r.json();
    setStored(d.stored ?? null);
    setReason(d.effective?.reason ?? "");
    setAnnounce(`Mode changed to ${next}. ${d.effective?.reason ?? ""}`);
    onModeChange?.(d.effective?.mode ?? next, d.effective?.source ?? "manual");
    setOpen(false);
  };

  const revert = async () => {
    const r = await fetch("/api/chat/adaptive/state", { method: "DELETE" });
    if (!r.ok) return;
    const d = await r.json();
    setStored(d.stored ?? null);
    setReason(d.effective?.reason ?? "");
    setAnnounce(`Mode reverted. ${d.effective?.reason ?? ""}`);
    onModeChange?.(d.effective?.mode ?? "COLLABORATION", d.effective?.source ?? "default");
    setOpen(false);
  };

  const fetchSuggestion = async () => {
    const r = await fetch("/api/chat/adaptive/suggest");
    if (!r.ok) return;
    const d = await r.json();
    setSuggestion(d.suggestion ?? null);
  };

  const activeMeta = modes.find((m) => m.key === mode) ?? { key: mode, label: mode, icon: "◆" };

  return (
    <div ref={ref} style={{ position: "relative" }} data-adaptive-bar>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Workspace mode: ${activeMeta.label}. ${reason}`}
        style={{
          border: "1px solid var(--nv-color-border)",
          background: open ? "var(--nv-color-surface-2)" : "transparent",
          borderRadius: "var(--nv-radius-md)",
          padding: "4px 8px",
          fontSize: 12,
          cursor: "pointer",
          color: "var(--nv-color-text)",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>{activeMeta.icon}</span>
        <span style={{ fontWeight: 700 }}>{activeMeta.label}</span>
        <span style={{ color: "var(--nv-color-text-faint)", fontSize: 10 }}>{source === "manual" ? "· you" : source === "locked" ? "· locked" : source === "inferred" ? "· inferred" : ""}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Workspace mode"
          style={{
            position: "absolute", top: 30, right: 0, zIndex: 70, width: 300,
            background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)",
            borderRadius: "var(--nv-radius-lg)", boxShadow: "var(--nv-shadow-lg)", padding: 8,
          }}
        >
          <div role="radiogroup" aria-label="Select workspace mode" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {modes.map((m) => (
              <button
                key={m.key}
                role="radio"
                aria-checked={m.key === mode}
                onClick={() => switchMode(m.key)}
                title={MODE_HINTS[m.key]}
                style={{
                  display: "flex", alignItems: "center", gap: 8, textAlign: "left", width: "100%",
                  border: "none", background: m.key === mode ? "var(--nv-color-primary-alpha)" : "transparent",
                  padding: "6px 8px", borderRadius: "var(--nv-radius-md)", cursor: "pointer",
                  fontSize: 13, color: "var(--nv-color-text)", fontWeight: m.key === mode ? 700 : 500,
                }}
              >
                <span>{m.icon}</span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {m.key === mode && <span style={{ fontSize: 10, color: "var(--nv-color-primary)" }}>active</span>}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 8, padding: "6px 8px", borderRadius: "var(--nv-radius-md)", background: "var(--nv-color-surface-2)", fontSize: 11, color: "var(--nv-color-text-muted)" }}>
            <div style={{ fontWeight: 700, marginBottom: 2, color: "var(--nv-color-text)" }}>Why this mode</div>
            {reason || (MODE_HINTS[mode] ?? "")}
          </div>

          {source !== "inferred" && source !== "default" && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, alignItems: "center" }}>
              <button onClick={revert} style={{ flex: 1, border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "5px 8px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)" }}>↩ Revert to inferred</button>
              <span style={{ fontSize: 10, color: "var(--nv-color-text-faint)" }}>lock</span>
              {LOCK_MINUTES.map((m) => (
                <button key={m} onClick={() => switchMode(mode, m)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "5px 6px", fontSize: 11, cursor: "pointer", color: "var(--nv-color-text)" }}>{m}m</button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 8, borderTop: "1px solid var(--nv-color-border)", paddingTop: 6 }}>
            {!suggestion && (
              <button onClick={fetchSuggestion} style={{ width: "100%", textAlign: "left", border: "none", background: "none", padding: "4px 6px", fontSize: 11, cursor: "pointer", color: "var(--nv-color-primary)" }}>
                ✨ Suggest a mode from your activity
              </button>
            )}
            {suggestion && (
              <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>
                <div style={{ fontWeight: 700, color: "var(--nv-color-text)" }}>
                  Suggested: {MODE_HINTS[suggestion.mode] ? modes.find((m) => m.key === suggestion.mode)?.icon ?? "◆" : ""} {suggestion.mode} ({Math.round(suggestion.confidence * 100)}%)
                </div>
                <div style={{ margin: "2px 0 4px" }}>{suggestion.reasons.join(" · ")}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => switchMode(suggestion.mode)} style={{ border: "none", background: "var(--nv-color-primary)", color: "#fff", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>Try it</button>
                  <button onClick={() => setSuggestion(null)} style={{ border: "1px solid var(--nv-color-border)", background: "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>Dismiss</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <span aria-live="polite" role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {announce}
      </span>
    </div>
  );
}