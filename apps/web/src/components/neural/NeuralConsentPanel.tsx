"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Badge } from "@n0va/ui";

type NeuralFeature = "FLOW_DETECTION" | "SUBVOCAL_DECODING" | "SHARED_ATTENTION" | "NEURAL_STATE_SHARING" | "TEAM_DASHBOARD";
type NeuralRecipient = "SELF_ONLY" | "TEAM" | "ROLE_BASED" | "WORKSPACE";
type ConsentDuration = "ONE_OFF" | "SESSION" | "PERSISTENT";
type PrivacyMode = "LOCAL_ONLY" | "AGGREGATE_ONLY" | "FULL";

interface ConsentRecord {
  id: string;
  feature: NeuralFeature;
  recipient: NeuralRecipient;
  duration: ConsentDuration;
  privacyMode: PrivacyMode;
  retentionDays: number;
  epsilon: number;
  enabled: boolean;
  revokedAt: string | null;
  lastConfirmedAt: string;
}

const FEATURE_LABELS: Record<NeuralFeature, { label: string; desc: string; icon: string }> = {
  FLOW_DETECTION: { label: "Flow Detection", desc: "Detect focus/flow state from BCI signals", icon: "🌊" },
  SUBVOCAL_DECODING: { label: "Sub-vocal Decoding", desc: "Decode sub-vocal speech for hands-free commands", icon: "🎙️" },
  SHARED_ATTENTION: { label: "Shared Attention", desc: "Share attention weights with collaborators", icon: "👁️" },
  NEURAL_STATE_SHARING: { label: "Neural State Sharing", desc: "Share cognitive state with team", icon: "🧠" },
  TEAM_DASHBOARD: { label: "Team Dashboard", desc: "Anonymized team focus heatmap", icon: "📊" },
};

const RECIPIENT_LABELS: Record<NeuralRecipient, string> = {
  SELF_ONLY: "Self only",
  TEAM: "My team",
  ROLE_BASED: "Role-based",
  WORKSPACE: "Full workspace",
};

const PRIVACY_LABELS: Record<PrivacyMode, { label: string; tone: "success" | "warning" | "danger" }> = {
  LOCAL_ONLY: { label: "Local only", tone: "success" },
  AGGREGATE_ONLY: { label: "Aggregate", tone: "warning" },
  FULL: { label: "Full sharing", tone: "danger" },
};

export function NeuralConsentPanel() {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConsents = useCallback(async () => {
    try {
      const res = await fetch("/api/neural/consent");
      if (res.ok) {
        const data = await res.json();
        setConsents(data.consents ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConsents(); }, [fetchConsents]);

  const toggleConsent = useCallback(async (feature: NeuralFeature, recipient: NeuralRecipient, currentEnabled: boolean) => {
    if (currentEnabled) {
      await fetch("/api/neural/consent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, recipient }),
      });
    } else {
      await fetch("/api/neural/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, recipient, duration: "PERSISTENT", privacyMode: "LOCAL_ONLY" }),
      });
    }
    fetchConsents();
  }, [fetchConsents]);

  const updatePrivacy = useCallback(async (feature: NeuralFeature, recipient: NeuralRecipient, privacyMode: PrivacyMode) => {
    await fetch("/api/neural/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature, recipient, duration: "PERSISTENT", privacyMode }),
    });
    fetchConsents();
  }, [fetchConsents]);

  if (loading) return <div className="nv-empty">Loading consent settings...</div>;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--nv-space-5)" }}>
        <h2 style={{ fontSize: "var(--nv-font-lg)", fontWeight: 800, marginBottom: 6 }}>🧠 Neural Consent</h2>
        <p style={{ color: "var(--nv-color-text-muted)", fontSize: "var(--nv-font-sm)" }}>
          Control how your neural data is used. Raw signals never leave your device.
          Only differentially-private embeddings are shared with explicit opt-in.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(Object.keys(FEATURE_LABELS) as NeuralFeature[]).map((feature) => {
          const info = FEATURE_LABELS[feature];
          const featureConsents = consents.filter(c => c.feature === feature);
          const hasActive = featureConsents.some(c => c.enabled && !c.revokedAt);

          return (
            <div key={feature} className="nv-card" style={{ padding: "var(--nv-space-4)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: "var(--nv-space-3)" }}>
                <span style={{ fontSize: 24 }}>{info.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{info.label}</div>
                  <div style={{ fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>{info.desc}</div>
                </div>
                <Badge tone={hasActive ? "success" : "neutral"}>
                  {hasActive ? "Enabled" : "Off"}
                </Badge>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Object.keys(RECIPIENT_LABELS) as NeuralRecipient[]).map((recipient) => {
                  const existing = featureConsents.find(c => c.recipient === recipient);
                  const isActive = existing?.enabled && !existing.revokedAt;
                  const privacyInfo = PRIVACY_LABELS[existing?.privacyMode ?? "LOCAL_ONLY"];

                  return (
                    <div key={recipient} style={{ flex: 1, minWidth: 140, padding: "var(--nv-space-2)", border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{RECIPIENT_LABELS[recipient]}</div>
                      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6 }}>
                        <Badge tone={privacyInfo.tone}>{privacyInfo.label}</Badge>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Button size="sm" variant={isActive ? "primary" : "secondary"} onClick={() => toggleConsent(feature, recipient, !!isActive)}>
                          {isActive ? "On" : "Off"}
                        </Button>
                        <select
                          value={existing?.privacyMode ?? "LOCAL_ONLY"}
                          onChange={(e) => updatePrivacy(feature, recipient, e.target.value as PrivacyMode)}
                          style={{ fontSize: 11, padding: "4px 6px", borderRadius: "var(--nv-radius-sm)", border: "1px solid var(--nv-color-border)", background: "var(--nv-color-surface)" }}
                        >
                          <option value="LOCAL_ONLY">Local only</option>
                          <option value="AGGREGATE_ONLY">Aggregate</option>
                          <option value="FULL">Full</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: "var(--nv-space-5)", padding: "var(--nv-space-3)", background: "var(--nv-color-surface-2)", borderRadius: "var(--nv-radius-md)", fontSize: "var(--nv-font-sm)", color: "var(--nv-color-text-muted)" }}>
        <strong>Privacy guarantee:</strong> Raw neural signals (EEG, EMG) are processed on-device.
        Only fixed-length, differentially-private embeddings (ε = 1.0) leave your device when you opt in.
        Consent can be revoked at any time, triggering cryptographic erasure of derived artifacts.
      </div>
    </div>
  );
}
