"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, cn } from "@n0va/ui";

type FlowState = "IDLE" | "FOCUS" | "FLOW" | "CRISIS" | "DISTRACTED";

interface FlowPolicy {
  state: FlowState;
  flowProb: number;
  uiMode: "normal" | "focus" | "flow" | "crisis";
  notificationsMuted: boolean;
  digestDeferred: boolean;
  subvocalReady: boolean;
  rationale: string;
}

const STATE_CONFIG: Record<FlowState, { label: string; color: string; bg: string; icon: string }> = {
  IDLE: { label: "Idle", color: "var(--nv-color-text-faint)", bg: "var(--nv-color-surface-2)", icon: "⚪" },
  FOCUS: { label: "Focus", color: "var(--nv-color-primary)", bg: "var(--nv-color-primary-alpha)", icon: "🎯" },
  FLOW: { label: "In Flow", color: "var(--nv-color-success)", bg: "color-mix(in srgb, var(--nv-color-success) 14%, transparent)", icon: "🌊" },
  CRISIS: { label: "Crisis", color: "var(--nv-color-danger)", bg: "var(--nv-color-danger-alpha)", icon: "🚨" },
  DISTRACTED: { label: "Distracted", color: "var(--nv-color-warning)", bg: "color-mix(in srgb, var(--nv-color-warning) 14%, transparent)", icon: "💭" },
};

export function FlowModePanel() {
  const [policy, setPolicy] = useState<FlowPolicy | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [focusTimer, setFocusTimer] = useState(0);
  const [showRationale, setShowRationale] = useState(false);

  const fetchPolicy = useCallback(async () => {
    try {
      const res = await fetch("/api/neural/flow");
      if (res.ok) setPolicy(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchPolicy();
    const interval = setInterval(fetchPolicy, 5000);
    return () => clearInterval(interval);
  }, [enabled, fetchPolicy]);

  useEffect(() => {
    if (!enabled || policy?.uiMode === "normal") return;
    const timer = setInterval(() => setFocusTimer((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [enabled, policy?.uiMode]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!enabled) {
    return (
      <div className="nv-card" style={{ padding: "var(--nv-space-4)", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-3)" }}>
          <span style={{ fontSize: 32 }}>🧠</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "var(--nv-font-md)" }}>Neural Flow Mode</div>
            <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>
              BCI-powered focus detection with adaptive UI
            </div>
          </div>
        </div>
        <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", marginBottom: "var(--nv-space-3)", lineHeight: 1.5 }}>
          Connect a compatible EEG/BCI device to enable real-time cognitive state detection.
          The system adapts your UI, notifications, and huddle behavior based on your focus level.
        </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" onClick={() => setEnabled(true)}>
              Enable Flow Mode
            </Button>
            <a href="/m/neural/consent" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 10px", borderRadius: "var(--nv-radius-md)", fontSize: "var(--nv-font-sm)", fontWeight: 600, border: "1px solid var(--nv-color-border)", color: "var(--nv-color-text)", background: "var(--nv-color-surface)", textDecoration: "none" }}>
              Manage Consent
            </a>
          </div>
      </div>
    );
  }

  const config = policy ? STATE_CONFIG[policy.state] : STATE_CONFIG.IDLE;

  return (
    <div className="nv-card" style={{ padding: "var(--nv-space-4)", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--nv-space-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>{config.icon}</span>
          <div>
            <div style={{ fontWeight: 700 }}>{config.label}</div>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
              flow_prob: {policy ? policy.flowProb.toFixed(2) : "—"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontFamily: "var(--nv-font-mono)", color: config.color, background: config.bg, padding: "2px 8px", borderRadius: 999 }}>
            {formatTime(focusTimer)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEnabled(false)}>✕</Button>
        </div>
      </div>

      <div style={{ height: 6, borderRadius: 999, background: "var(--nv-color-surface-2)", overflow: "hidden", marginBottom: "var(--nv-space-3)" }}>
        <div style={{ height: "100%", width: `${(policy?.flowProb ?? 0) * 100}%`, background: config.color, borderRadius: 999, transition: "width 0.5s ease" }} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "var(--nv-space-3)" }}>
        {policy?.notificationsMuted && (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--nv-color-surface-2)", color: "var(--nv-color-text-muted)" }}>
            🔕 Notifications muted
          </span>
        )}
        {policy?.digestDeferred && (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--nv-color-surface-2)", color: "var(--nv-color-text-muted)" }}>
            📬 Digest deferred
          </span>
        )}
        {policy?.subvocalReady && (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "var(--nv-color-primary-alpha)", color: "var(--nv-color-primary)" }}>
            🎙️ Sub-vocal ready
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button size="sm" variant="secondary" onClick={() => setShowRationale(!showRationale)}>
          {showRationale ? "Hide" : "Why?"}
        </Button>
        <a href="/m/neural/consent" style={{ fontSize: 12, color: "var(--nv-color-primary)" }}>Consent settings</a>
      </div>

      {showRationale && policy?.rationale && (
        <div style={{ marginTop: "var(--nv-space-3)", padding: "var(--nv-space-3)", background: "var(--nv-color-surface-2)", borderRadius: "var(--nv-radius-md)", fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>
          {policy.rationale}
        </div>
      )}
    </div>
  );
}

export function SubVocalControlPanel({ sessionId }: { sessionId?: string }) {
  const [active, setActive] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState(0);

  const toggleSubVocal = useCallback(async () => {
    const newActive = !active;
    setActive(newActive);

    if (newActive) {
      await fetch("/api/neural/subvocal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: "[sub-vocal activated]",
          command: "ACTIVATE",
          confidence: 1,
          latencyMs: 0,
          sessionId,
          executed: true,
        }),
      });
    }
  }, [active, sessionId]);

  return (
    <div style={{ padding: "var(--nv-space-3)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--nv-font-sm)" }}>🎙️ Sub-vocal Input</div>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>
            {active ? `Active — latency: ${latencyMs}ms` : "Inactive"}
          </div>
        </div>
        <Button size="sm" variant={active ? "primary" : "secondary"} onClick={toggleSubVocal}>
          {active ? "ON" : "OFF"}
        </Button>
      </div>
      {lastCommand && (
        <div style={{ marginTop: "var(--nv-space-2)", fontSize: 11, color: "var(--nv-color-text-muted)" }}>
          Last: <code>{lastCommand}</code> (conf: {confidence.toFixed(2)})
        </div>
      )}
    </div>
  );
}
