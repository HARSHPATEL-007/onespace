"use client";

import { useState, useEffect } from "react";
import { Badge } from "@n0va/ui";

interface TeamFlowSummary {
  participantCount: number;
  avgFlowProb: number;
  avgAttention: number;
  avgStress: number;
  inFlowCount: number;
  inFocusCount: number;
}

export function TeamNeuralDashboard() {
  const [summary, setSummary] = useState<TeamFlowSummary | null>(null);

  useEffect(() => {
    fetch("/api/neural/team")
      .then((r) => r.json())
      .then(setSummary)
      .catch(() => {});
  }, []);

  if (!summary) return <div className="nv-empty">Loading team dashboard...</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h2 style={{ fontSize: "var(--nv-font-lg)", fontWeight: 800, marginBottom: "var(--nv-space-4)" }}>📊 Team Focus Dashboard</h2>
      <p style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)", marginBottom: "var(--nv-space-4)" }}>
        Anonymized aggregate of team cognitive states. Individual data is never exposed.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: "var(--nv-space-4)" }}>
        <div className="nv-card" style={{ padding: "var(--nv-space-3)", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{summary.participantCount}</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>Active participants</div>
        </div>
        <div className="nv-card" style={{ padding: "var(--nv-space-3)", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--nv-color-success)" }}>{summary.inFlowCount}</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>In flow</div>
        </div>
        <div className="nv-card" style={{ padding: "var(--nv-space-3)", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--nv-color-primary)" }}>{summary.inFocusCount}</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>In focus</div>
        </div>
        <div className="nv-card" style={{ padding: "var(--nv-space-3)", textAlign: "center" }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{Math.round(summary.avgAttention * 100)}%</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>Avg attention</div>
        </div>
      </div>

      <div className="nv-card" style={{ padding: "var(--nv-space-3)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--nv-color-text-muted)", marginBottom: 8 }}>Flow Distribution</div>
        <div style={{ display: "flex", gap: 4, height: 32, borderRadius: "var(--nv-radius-md)", overflow: "hidden" }}>
          <div style={{ flex: summary.inFlowCount, background: "var(--nv-color-success)" }} title={`${summary.inFlowCount} in flow`} />
          <div style={{ flex: summary.inFocusCount, background: "var(--nv-color-primary)" }} title={`${summary.inFocusCount} in focus`} />
          <div style={{ flex: Math.max(0, summary.participantCount - summary.inFlowCount - summary.inFocusCount), background: "var(--nv-color-surface-2)" }} />
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--nv-color-text-faint)" }}>
          <span>🟢 Flow ({summary.inFlowCount})</span>
          <span>🔵 Focus ({summary.inFocusCount})</span>
          <span>⚪ Other ({Math.max(0, summary.participantCount - summary.inFlowCount - summary.inFocusCount)})</span>
        </div>
      </div>

      <div style={{ marginTop: "var(--nv-space-3)", fontSize: 11, color: "var(--nv-color-text-faint)", textAlign: "center" }}>
        Avg stress: {Math.round(summary.avgStress * 100)}% · Only aggregate, differentially-private data shown
      </div>
    </div>
  );
}
