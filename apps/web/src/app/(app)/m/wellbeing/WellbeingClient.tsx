"use client";

import { useCallback, useEffect, useState } from "react";
import type { OverviewResponse, RoomMetrics } from "@n0va/modules-wellbeing/server";

const RISK_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

function pct(v: number | undefined | null) {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function Bar({ label, value, color = "var(--nv-color-primary)", invert }: { label: string; value: number | null | undefined; color?: string; invert?: boolean }) {
  const v = value ?? 0;
  const fill = invert ? Math.max(0, Math.min(1, 1 - v)) : Math.max(0, Math.min(1, v));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 90 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{pct(value)}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: "var(--nv-color-surface)", overflow: "hidden" }}>
        <div
          style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 4, background: color, transition: "width .9s ease" }}
        />
      </div>
    </div>
  );
}

function Delta({ v }: { v: number | null | undefined }) {
  if (v == null) return <span style={{ opacity: 0.4 }}>—</span>;
  const up = v > 0.02;
  const down = v < -0.02;
  const color = down ? "#ef4444" : up ? "#22c55e" : "rgba(255,255,255,.4)";
  const arrow = down ? "↓" : up ? "↑" : "→";
  return <span style={{ color, fontWeight: 700, fontSize: 12 }}>{arrow} {Math.abs(v).toFixed(2)}</span>;
}

function Sparkline({ points, color, height = 40 }: { points: number[]; color: string; height?: number }) {
  if (points.length < 2) return <div style={{ height, opacity: 0.35, fontSize: 11 }}>insufficient history</div>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const last = points[points.length - 1] ?? 0;
  const span = max - min || 1;
  const w = 220;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - 6 - ((p - min) / span) * (height - 12)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={height} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <circle cx={w} cy={height - 6 - ((last - min) / span) * (height - 12)} r={3} fill={color} />
    </svg>
  );
}

function IntervBadge({ status }: { status: string }) {
  const c = status === "SUGGESTED" ? "#f97316" : status === "SNOOZED" ? "#eab308" : status === "ACKNOWLEDGED" ? "#3b82f6" : "rgba(255,255,255,.35)";
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: c, color: "#0b0f14" }}>{status}</span>;
}

interface RoomDetail {
  channel: { id: string; name: string; topic: string; kind: string; members: number };
  latest: RoomMetrics | null;
  series: { id: string; windowStart: string; sentimentScore: number; toxicityScore: number; engagementScore: number; burnoutRisk: number; roomHealthScore: number }[];
  handled: { id: string; title: string; status: string; updatedAt: string }[];
}

export function WellbeingClient({ initial }: { initial: OverviewResponse }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, RoomDetail>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wellbeing/refresh", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "refresh failed");
      const ov = await (await fetch("/api/wellbeing/overview")).json();
      if (ov.ok) setData(ov.data);
      else throw new Error(ov.error ?? "overview failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "refresh failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const evaluate = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/wellbeing/interventions", { method: "POST", body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "evaluate failed");
      const ov = await (await fetch("/api/wellbeing/overview")).json();
      if (ov.ok) setData(ov.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "evaluate failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const respond = useCallback(
    async (id: string, action: string) => {
      const res = await fetch(`/api/wellbeing/interventions/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "respond failed");
        return;
      }
      setData((d) => ({ ...d, interventions: d.interventions.map((i) => (i.id === id ? { ...i, status: action === "ACK" ? "ACKNOWLEDGED" : action === "SNOOZE" ? "SNOOZED" : "DISMISSED" } : i)) }));
    },
    [],
  );

  const openDetail = useCallback(
    async (id: string) => {
      if (open === id) {
        setOpen(null);
        return;
      }
      setOpen(id);
      if (!detail[id]) {
        try {
          const res = await fetch(`/api/wellbeing/rooms/${id}`);
          const json = await res.json();
          if (json.ok) setDetail((d) => ({ ...d, [id]: json.data }));
        } catch {
          /* ignore */
        }
      }
    },
    [open, detail],
  );

  const [consent, setConsent] = useState(data.biometrics.consent?.granted ?? false);
  const applyConsent = useCallback(
    async (granted: boolean) => {
      const res = await fetch("/api/wellbeing/biometrics/consent", {
        method: "PUT",
        body: JSON.stringify({ granted, signals: ["hrv", "sleep", "stress", "activity"], sharedWith: ["team"] }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "consent failed");
        return;
      }
      setConsent(json.data.granted);
    },
    [],
  );

  useEffect(() => {
    setConsent(data.biometrics.consent?.granted ?? false);
  }, [data.biometrics.consent?.granted]);

  const ws = data.workspace.snapshot;
  const rooms = data.rooms ?? [];

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 80px", display: "flex", flexDirection: "column", gap: 22, fontFamily: "var(--nv-font-sans, system-ui)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800, margin: 0 }}>N0VA WELL-BEING OBSERVATORY</h1>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Fused room, team and workspace signals — aggregates only, no individual exposure.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="nv-card"
            onClick={evaluate}
            disabled={busy}
            style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "8px 14px", border: "1px solid var(--nv-color-border)", background: "transparent", color: "inherit" }}
          >
            {busy ? "Running…" : "Evaluate interventions"}
          </button>
          <button
            className="nv-card"
            onClick={refresh}
            disabled={busy}
            style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, padding: "8px 14px", border: "1px solid var(--nv-color-primary)", background: "var(--nv-color-primary)", color: "#0b0f14" }}
          >
            {busy ? "Refreshing…" : "Refresh all rooms"}
          </button>
        </div>
      </div>

      {error && (
        <div className="nv-card" style={{ borderColor: "#ef4444", padding: "10px 14px", fontSize: 13 }}>
          {error}
        </div>
      )}

      {ws && (
        <div className="nv-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 900 }}>Workspace health</span>
            <span style={{ fontWeight: 900, color: RISK_COLORS[ws.fusion.riskLevel] ?? "#fff", fontSize: 15, padding: "3px 12px", borderRadius: 20, background: "var(--nv-color-surface)", border: `1px solid ${RISK_COLORS[ws.fusion.riskLevel] ?? "transparent"}` }}>
              {ws.fusion.riskLevel}
            </span>
            <Delta v={ws.sentiment.trend} />
            <span style={{ fontSize: 12, opacity: 0.55 }}>window {Math.round(((ws.windowEnd.getTime ? ws.windowEnd.getTime() : Date.now()) - new Date(ws.windowStart as unknown as string).getTime()) / 3_600_000)}h</span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Bar label="Room health" value={ws.fusion.roomHealthScore} color="#22c55e" />
            <Bar label="Sentiment" value={(ws.sentiment.score + 1) / 2} color="#3b82f6" />
            <Bar label="Toxicity" value={ws.toxicity.score} color="#ef4444" />
            <Bar label="Engagement" value={ws.engagement.score} color="#8b5cf6" />
            <Bar label="Burnout" value={ws.burnout.risk} color="#f97316" />
            <Bar label="Culture alignment" value={ws.culture.alignment} color="#eab308" />
          </div>
          {ws.fusion.teamStressScore != null && (
            <div style={{ fontSize: 13, opacity: 0.75 }}>
              Team stress index <strong style={{ color: "#f97316" }}>{pct(ws.fusion.teamStressScore)}</strong> — weighted across {rooms.length} active rooms.
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ws.fusion.contributingFactors.slice(0, 4).map((f) => (
              <span key={f.signal} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--nv-color-surface)", border: "1px solid var(--nv-color-border)" }}>
                {f.signal} {f.value.toFixed(2)} · impact {f.impact.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="nv-card" style={{ padding: 16, display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "space-around", textAlign: "center" }}>
        {Object.entries(data.workspace.funnel).map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{v}</div>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: "capitalize" }}>{k.replace(/([A-Z])/g, " $1")}</div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{rooms.length}</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>rooms monitored</div>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 10px" }}>Rooms</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {rooms.map((room) => {
            const m = room.metrics;
            if (!m) return null;
            const active = detail[room.id];
            const series = active?.series?.map((s) => s.roomHealthScore ?? 0) ?? [];
            return (
              <div key={room.id} className="nv-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer" }} onClick={() => void openDetail(room.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{room.name}</div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 20, background: RISK_COLORS[room.riskLevel] ?? "#333", color: "#0b0f14" }}>{room.riskLevel}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.6, minHeight: 14 }}>{room.topic}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Bar label="Sentiment" value={(room.sentimentScore + 1) / 2} color="#3b82f6" />
                  <Bar label="Engagement" value={room.engagementScore} color="#8b5cf6" />
                  <Bar label="Burnout" value={room.burnoutRisk} color="#f97316" />
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11, opacity: 0.8 }}>
                  <span>sent <Delta v={room.trend?.sentiment} /></span>
                  <span>tox <Delta v={room.trend?.toxicity} /></span>
                  <span>burnout <Delta v={room.trend?.burnout} /></span>
                </div>
                {open === room.id && active && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--nv-color-border)", paddingTop: 10 }}>
                    <Sparkline points={series} color="#22c55e" />
                    <div style={{ fontSize: 11, opacity: 0.7 }}>members {active.channel.members} · messages {m.messages} · senders {m.senders}</div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      reply latency {(m.engagement.replyLatencySec / 60).toFixed(1)}m · unanswered {m.engagement.unanswered} · thread completion {pct(m.engagement.threadCompletion)} · after-hours {pct(m.engagement.afterHoursRatio)}
                    </div>
                    {active.handled.length > 0 && (
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        handled: {active.handled.map((h) => h.title).join(" · ")}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
        <div className="nv-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Interventions</h2>
            <button onClick={evaluate} disabled={busy} style={{ cursor: "pointer", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, border: "1px solid var(--nv-color-border)", background: "transparent", color: "inherit" }}>
              Re-evaluate
            </button>
          </div>
          {data.interventions.length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>No active recommendations. Thresholds are calm.</div>}
          {data.interventions.map((i) => (
            <div key={i.id as string} style={{ display: "flex", flexDirection: "column", gap: 6, border: "1px solid var(--nv-color-border)", borderRadius: 10, padding: 10, background: "var(--nv-color-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>{i.title as string}</strong>
                <IntervBadge status={i.status as string} />
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{i.message as string}</div>
              <div style={{ display: "flex", gap: 6, fontSize: 10 }}>
                {typeof i.severity === "string" && <span style={{ color: RISK_COLORS[i.severity] ?? "#fff" }}>{i.severity}</span>}
                <span>{i.kind as string}</span>
              </div>
              {(i.status === "SUGGESTED" || i.status === "SNOOZED") && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => void respond(i.id as string, "ACK")} style={{ cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--nv-color-border)", background: "transparent", color: "inherit" }}>Acknowledge</button>
                  <button onClick={() => void respond(i.id as string, "SNOOZE")} style={{ cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--nv-color-border)", background: "transparent", color: "inherit" }}>Snooze</button>
                  <button onClick={() => void respond(i.id as string, "DISMISS")} style={{ cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1px solid #ef4444", background: "transparent", color: "#ef4444" }}>Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="nv-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Environment</h2>
          {data.environment.length === 0 && <div style={{ fontSize: 12, opacity: 0.55 }}>No sensor readings yet — ingest via POST /api/wellbeing/environment.</div>}
          {data.environment.map((env) => {
            const d = env.details as Record<string, number | null>;
            return (
            <div key={env.roomRef} style={{ border: "1px solid var(--nv-color-border)", borderRadius: 10, padding: 10, background: "var(--nv-color-surface)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <strong>{env.roomRef}</strong>
                <span style={{ fontWeight: 800, color: env.comfort >= 0.6 ? "#22c55e" : env.comfort >= 0.45 ? "#eab308" : "#ef4444" }}>{pct(env.comfort)}</span>
              </div>
              <Bar label="Comfort" value={env.comfort} color={env.comfort >= 0.6 ? "#22c55e" : env.comfort >= 0.45 ? "#eab308" : "#ef4444"} />
              <div style={{ fontSize: 11, opacity: 0.7, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {d.co2 != null && <span>CO2 {d.co2}ppm</span>}
                {d.temperatureC != null && <span>{d.temperatureC}°C</span>}
                {d.noiseDb != null && <span>{d.noiseDb}dB</span>}
                {d.humidity != null && <span>{d.humidity}%RH</span>}
                {d.lightLux != null && <span>{d.lightLux}lx</span>}
                {d.occupancy != null && <span>{d.occupancy} people</span>}
              </div>
            </div>
            );
          })}
        </div>

        <div className="nv-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Biometrics</h2>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Optional, revocable, aggregate-only. Raw samples are never exposed — only team-level means.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => void applyConsent(!consent)}
              style={{ cursor: "pointer", fontWeight: 800, fontSize: 12, padding: "8px 14px", borderRadius: 20, border: "1px solid var(--nv-color-primary)", background: consent ? "var(--nv-color-primary)" : "transparent", color: consent ? "#0b0f14" : "inherit" }}
            >
              {consent ? "Consent granted — revoke" : "Grant consent"}
            </button>
            <span style={{ fontSize: 11, opacity: 0.6 }}>signals: hrv · sleep · stress · activity</span>
          </div>
          {data.biometrics.trends.available ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
              {Object.entries(data.biometrics.trends.data).map(([k, v]) => (
                <div key={k} style={{ border: "1px solid var(--nv-color-border)", borderRadius: 10, padding: 8, background: "var(--nv-color-surface)", textAlign: "center" }}>
                  <div style={{ fontWeight: 900, fontSize: 15 }}>{v ?? "—"}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>{k}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.55 }}>
              Team aggregates hidden: {data.biometrics.trends.found}/{data.biometrics.trends.minRequired} consented users (privacy floor).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}