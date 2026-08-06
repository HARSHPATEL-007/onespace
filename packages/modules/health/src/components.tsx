"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { HealthCheckin } from "@n0va/db";
import type { CheckinStats } from "./server";

export interface HealthActions {
  create: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

const MOODS = ["LOW", "OK", "GOOD", "GREAT"] as const;
const ENERGIES = ["LOW", "OK", "HIGH"] as const;

const MOOD_EMOJI: Record<string, string> = { LOW: "😕", OK: "😐", GOOD: "🙂", GREAT: "😄" };
const ENERGY_EMOJI: Record<string, string> = { LOW: "🪫", OK: "🔋", HIGH: "⚡" };

export function WellnessBoard({
  checkins,
  stats,
  actions,
}: {
  checkins: HealthCheckin[];
  stats: CheckinStats;
  actions: HealthActions;
}) {
  const router = useRouter();
  const [mood, setMood] = useState<(typeof MOODS)[number]>("OK");
  const [energy, setEnergy] = useState<(typeof ENERGIES)[number]>("OK");
  const [sleep, setSleep] = useState("7");
  const [note, setNote] = useState("");

  const submit = () => {
    const fd = new FormData();
    fd.set("mood", mood);
    fd.set("energy", energy);
    fd.set("sleepHours", sleep);
    fd.set("note", note);
    void actions.create(fd).then(() => {
      setNote("");
      router.refresh();
    });
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>N0VA HEALTH</h1>
        <span className="nv-badge nv-badge-amber">wellness check-ins</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>CHECK-INS (30d)</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.checkinCount}</div>
        </div>
        <div className="nv-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>AVG SLEEP</div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{stats.avgSleep.toFixed(1)}h</div>
        </div>
      </div>

      <div className="nv-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Today's check-in</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Mood</div>
            <div style={{ display: "flex", gap: 8 }}>
              {MOODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 10,
                    border: mood === m ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                    background: mood === m ? "var(--nv-color-surface-raised)" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: mood === m ? 800 : 600,
                  }}
                >
                  {MOOD_EMOJI[m]} {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginBottom: 6 }}>Energy</div>
            <div style={{ display: "flex", gap: 8 }}>
              {ENERGIES.map((e) => (
                <button
                  key={e}
                  onClick={() => setEnergy(e)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 10,
                    border: energy === e ? "2px solid var(--nv-color-primary)" : "1px solid var(--nv-color-border)",
                    background: energy === e ? "var(--nv-color-surface-raised)" : "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: energy === e ? 800 : 600,
                  }}
                >
                  {ENERGY_EMOJI[e]} {e}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Sleep:</span>
            <input
              className="nv-input"
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={sleep}
              onChange={(e) => setSleep(e.target.value)}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>hours</span>
            <input
              className="nv-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything on your mind? (optional)"
              style={{ flex: 1 }}
            />
            <Button onClick={submit} disabled={!sleep}>Save</Button>
          </div>
        </div>
      </div>

      <div className="nv-card" style={{ padding: 0 }}>
        <table className="nv-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Mood</th>
              <th>Energy</th>
              <th>Sleep</th>
              <th>Note</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {checkins.map((c) => (
              <tr key={c.id}>
                <td style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{c.createdAt.toLocaleString()}</td>
                <td>{MOOD_EMOJI[c.mood] ?? c.mood} {c.mood}</td>
                <td>{ENERGY_EMOJI[c.energy] ?? c.energy} {c.energy}</td>
                <td style={{ fontSize: 12 }}>{c.sleepHours}h</td>
                <td style={{ fontSize: 12, color: "var(--nv-color-text-muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.note || "—"}
                </td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm("Delete check-in?")) return; const fd = new FormData(); fd.set("id", c.id); void actions.remove(fd).then(() => router.refresh()); }}>✕</Button>
                </td>
              </tr>
            ))}
            {checkins.length === 0 && <tr><td colSpan={6} className="nv-empty">No check-ins yet — save your first one above</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
