"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { PersonalizationInput } from "@/app/(app)/m/chat/actions";
import type { PresetName, RuleMode, RuleScope, Suggestion, Metrics, PriorityInboxItem } from "@n0va/modules-chat/personalization";

interface Row {
  id: string;
  [key: string]: unknown;
}

const MODE_COLORS: Record<string, string> = {
  ALWAYS: "var(--nv-color-success)",
  MENTIONS_ONLY: "var(--nv-color-warning)",
  DIGEST: "var(--nv-color-primary)",
  SILENT: "var(--nv-color-text-faint)",
};

const PRESET_INFO: Array<{ id: PresetName; label: string; desc: string }> = [
  { id: "FOCUS", label: "Focus", desc: "Mentions only + deep-work DND 09:00–12:00" },
  { id: "MEETINGS", label: "Meetings", desc: "Silence during calendar meetings" },
  { id: "OFF_HOURS", label: "Off-hours", desc: "Quiet outside working hours + weekends" },
  { id: "VIP_ONLY", label: "VIP only", desc: "Only mentions and priority sources" },
  { id: "APPROVALS_ONLY", label: "Approvals only", desc: "Only approval requests interrupt" },
  { id: "CRISIS", label: "Crisis", desc: "Silent unless urgent/crisis keywords" },
];

const SCOPES: RuleScope[] = ["room", "sender", "keyword", "mention", "thread", "file", "task", "approval", "channel", "global"];
const MODES: RuleMode[] = ["ALWAYS", "MENTIONS_ONLY", "DIGEST", "SILENT"];
const DND_KINDS = ["ONE_OFF", "RECURRING", "WORKDAY", "CALENDAR_BLOCK", "TRAVEL", "WEEKEND", "MEETING"];

export function PersonalizationDashboard({
  role,
  profile,
  rules,
  workspaceDefaults,
  dnd,
  dndStatus,
  pins,
  suggestions,
  metrics,
  events,
  inbox,
  action,
}: {
  role: string;
  profile: Record<string, unknown> & { digestEnabled: boolean; calendarAwareDnd: boolean; aiSuggestionsEnabled: boolean; prioritySort: string; workingHoursStart: number; workingHoursEnd: number; timezone: string; pauseUntil: Date | string | null };
  rules: Array<Row & { scope: string; value: string; mode: string; urgency: number; bypassDnd: boolean; snoozeUntil: Date | string | null; source: string; reason: string | null; active: boolean }>;
  workspaceDefaults: Array<Row & { scope: string; value: string; mode: string; urgency: number; bypassDnd: boolean; active: boolean; reason: string | null }>;
  dnd: Array<Row & { kind: string; days: string; startMin: number; endMin: number; startDate: Date | string | null; endDate: Date | string | null; active: boolean }>;
  dndStatus: { active: boolean; kind: string | null; expiresAt: Date | string | null; source: string | null };
  pins: Array<Row & { kind: string; refId: string; pinned: boolean; pinUntil: Date | string | null; pinUntilResolved: boolean; shared: boolean; note: string | null }>;
  suggestions: Suggestion[];
  metrics: Metrics;
  events: Array<Row & { kind: string; action: string; roomId: string | null; channelType: string | null; reason: string | null; createdAt: Date | string }>;
  inbox: { items: PriorityInboxItem[]; buckets: Record<string, number>; queues: Record<string, number> };
  action: (input: PersonalizationInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "rules" | "dnd" | "inbox" | "pins" | "suggestions" | "insights">("overview");
  const [busy, setBusy] = useState(false);
  const [newRule, setNewRule] = useState<{ scope: string; value: string; mode: string; urgency: number; bypassDnd: boolean }>({ scope: "room", value: "", mode: "MENTIONS_ONLY", urgency: 0, bypassDnd: false });
  const [newDnd, setNewDnd] = useState<{ kind: string; days: string; startMin: number; endMin: number }>({ kind: "RECURRING", days: "mon,tue,wed,thu,fri", startMin: 540, endMin: 720 });
  const [newPin, setNewPin] = useState<{ kind: string; refId: string; pinUntil: string; pinUntilResolved: boolean }>({ kind: "ROOM", refId: "", pinUntil: "", pinUntilResolved: false });
  const [pauseUntil, setPauseUntil] = useState<string>("");
  const [tester, setTester] = useState<{ scope: string; value: string; mode: string; bypassDnd: boolean; samples: string[] }>({ scope: "keyword", value: "", mode: "ALWAYS", bypassDnd: false, samples: [] });
  const [testResults, setTestResults] = useState<Array<{ sample: { text: string; messageType: string }; hit: boolean; mode: string | null; wouldNotify: boolean; note: string }> | null>(null);
  const [wsDefault, setWsDefault] = useState<{ scope: string; value: string; mode: string; urgency: number }>({ scope: "room", value: "", mode: "MENTIONS_ONLY", urgency: 0 });

  const run = async (input: PersonalizationInput) => {
    setBusy(true);
    try {
      await action(input);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (v: unknown): string => (v == null ? "—" : String(v));
  const fmtDate = (d: unknown): string => {
    if (!d) return "—";
    try {
      return new Date(d as string).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return String(d);
    }
  };

  const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  return (
    <div style={{ padding: "var(--nv-space-4)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Personalization</h1>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>
            Notification rules · priority inbox · pins · DND · AI suggestions
          </div>
        </div>
        <div style={{ fontSize: 12, color: dndStatus.active ? "var(--nv-color-warning)" : "var(--nv-color-success)" }}>
          {dndStatus.active ? `DND active${dndStatus.source ? ` (${dndStatus.source})` : ""}${dndStatus.expiresAt ? ` until ${fmtDate(dndStatus.expiresAt)}` : ""}` : "DND off"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {(["overview", "rules", "dnd", "inbox", "pins", "suggestions", "insights"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ border: "1px solid var(--nv-color-border)", background: tab === t ? "var(--nv-color-primary-alpha)" : "transparent", borderRadius: "var(--nv-radius-md)", padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "var(--nv-color-text)", textTransform: "capitalize" }}>
            {t} {t === "suggestions" && suggestions.length > 0 ? `(${suggestions.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-muted)" }}>Presets — one click applies a rule + DND template (reversible).</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            {PRESET_INFO.map((p) => (
              <div key={p.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{p.desc}</div>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "applyPreset", preset: p.id })}>Apply {p.label}</Button>
              </div>
            ))}
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Profile</div>
            <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={profile.digestEnabled} onChange={(e) => run({ op: "updateProfile", patch: { digestEnabled: e.target.checked } })} />
                Digest mode — collect low-priority notifications instead of interrupting
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={profile.calendarAwareDnd} onChange={(e) => run({ op: "updateProfile", patch: { calendarAwareDnd: e.target.checked } })} />
                Calendar-aware DND — quiet during calendar blocks
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={profile.aiSuggestionsEnabled} onChange={(e) => run({ op: "updateProfile", patch: { aiSuggestionsEnabled: e.target.checked } })} />
                AI suggestions enabled
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span>Working hours</span>
                <input type="time" defaultValue={hhmm(profile.workingHoursStart)} style={{ fontSize: 12 }} onChange={(e) => run({ op: "updateProfile", patch: { workingHoursStart: toMin(e.target.value) } })} />
                <span>→</span>
                <input type="time" defaultValue={hhmm(profile.workingHoursEnd)} style={{ fontSize: 12 }} onChange={(e) => run({ op: "updateProfile", patch: { workingHoursEnd: toMin(e.target.value) } })} />
                <span>tz {profile.timezone}</span>
              </div>
              <div>
                <select value={profile.prioritySort} style={{ fontSize: 12 }} onChange={(e) => run({ op: "updateProfile", patch: { prioritySort: e.target.value } })}>
                  <option value="ACTIONABILITY_RECENCY">Actionability then recency</option>
                  <option value="PINNED_FIRST">Pinned first</option>
                  <option value="RECENCY">Pure recency</option>
                </select>
                <span style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginLeft: 8 }}>priority inbox sort</span>
              </div>
            </div>
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Pause notifications</span>
            {profile.pauseUntil && <span style={{ fontSize: 11, color: "var(--nv-color-warning)" }}>paused until {fmtDate(profile.pauseUntil)}</span>}
            <input type="datetime-local" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} style={{ fontSize: 12 }} />
            <Button size="sm" variant="secondary" disabled={busy || !pauseUntil} onClick={() => run({ op: "updateProfile", patch: { pauseUntil: new Date(pauseUntil).toISOString() } })}>Pause until</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "updateProfile", patch: { pauseUntil: null } })}>Clear</Button>
          </div>
        </div>
      )}

      {tab === "rules" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ fontSize: 12 }} value={newRule.scope} onChange={(e) => setNewRule({ ...newRule, scope: e.target.value })}>
              {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input placeholder={newRule.scope === "channel" ? "desktop|mobile|email|push" : "value (room/sender id, keyword)"} value={newRule.value} onChange={(e) => setNewRule({ ...newRule, value: e.target.value })} style={{ fontSize: 12, minWidth: 200 }} />
            <select style={{ fontSize: 12 }} value={newRule.mode} onChange={(e) => setNewRule({ ...newRule, mode: e.target.value })}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select style={{ fontSize: 12 }} value={newRule.urgency} onChange={(e) => setNewRule({ ...newRule, urgency: Number(e.target.value) })}>
              <option value={0}>urgency 0</option>
              <option value={1}>urgency 1</option>
              <option value={2}>urgency 2</option>
              <option value={3}>urgency 3 (crisis)</option>
            </select>
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={newRule.bypassDnd} onChange={(e) => setNewRule({ ...newRule, bypassDnd: e.target.checked })} /> bypass DND
            </label>
            <Button size="sm" variant="secondary" disabled={busy || !newRule.value} onClick={() => { run({ op: "upsertRule", rule: newRule as never }); }}>Add rule</Button>
          </div>
          {rules.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No rules — the organization default applies (mentions + approvals interrupt).</div>}
          {rules.map((r) => (
            <div key={r.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, minWidth: 80 }}>{r.scope}</span>
              <span style={{ minWidth: 120 }} title={r.value}>{r.value.slice(0, 40)}</span>
              <span style={{ color: MODE_COLORS[r.mode] ?? "var(--nv-color-text)", fontWeight: 700 }}>{r.mode}</span>
              <span>u{r.urgency}</span>
              {r.bypassDnd && <span style={{ color: "var(--nv-color-danger)" }}>bypasses DND</span>}
              {r.snoozeUntil && <span style={{ color: "var(--nv-color-text-faint)" }}>snoozed till {fmtDate(r.snoozeUntil)}</span>}
              <span style={{ color: "var(--nv-color-text-faint)", flex: 1 }} title={r.reason ?? ""}>{r.source !== "USER" ? r.source : ""}{r.reason ? ` — ${r.reason.slice(0, 60)}` : ""}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "snoozeRule", ruleId: r.id, snoozeUntil: new Date(Date.now() + 3600_000).toISOString() })}>snooze 1h</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "snoozeRule", ruleId: r.id, snoozeUntil: null })}>unsnooze</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "deleteRule", ruleId: r.id })}>delete</Button>
            </div>
          ))}
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Workspace defaults <span style={{ color: "var(--nv-color-text-faint)", fontWeight: 400 }}>— apply to everyone who hasn't set their own rule (hierarchy: user rule {">"} workspace default {">"} org policy)</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ fontSize: 12 }} value={wsDefault.scope} onChange={(e) => setWsDefault({ ...wsDefault, scope: e.target.value })}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input placeholder="value" value={wsDefault.value} onChange={(e) => setWsDefault({ ...wsDefault, value: e.target.value })} style={{ fontSize: 12, minWidth: 160 }} />
              <select style={{ fontSize: 12 }} value={wsDefault.mode} onChange={(e) => setWsDefault({ ...wsDefault, mode: e.target.value })}>
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select style={{ fontSize: 12 }} value={wsDefault.urgency} onChange={(e) => setWsDefault({ ...wsDefault, urgency: Number(e.target.value) })}>
                <option value={0}>urgency 0</option>
                <option value={3}>urgency 3 (crisis)</option>
              </select>
              <Button size="sm" variant="secondary" disabled={busy || !wsDefault.value} onClick={() => run({ op: "upsertWorkspaceDefault", rule: wsDefault as never })}>Add default</Button>
            </div>
            {workspaceDefaults.length === 0 && <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)" }}>No workspace defaults — org policy applies.</div>}
            {workspaceDefaults.map((d) => (
              <div key={d.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, minWidth: 80 }}>{d.scope}</span>
                <span style={{ minWidth: 120 }} title={d.value}>{d.value.slice(0, 40)}</span>
                <span style={{ color: MODE_COLORS[d.mode] ?? "var(--nv-color-text)", fontWeight: 700 }}>{d.mode}</span>
                <span>u{d.urgency}</span>
                <span style={{ flex: 1 }} />
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "deleteWorkspaceDefault", ruleId: d.id })}>delete</Button>
              </div>
            ))}
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Rule preview — test how a rule affects incoming messages</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select style={{ fontSize: 12 }} value={tester.scope} onChange={(e) => setTester({ ...tester, scope: e.target.value })}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input placeholder={tester.scope === "keyword" ? "keyword (e.g. urgent)" : "value"} value={tester.value} onChange={(e) => setTester({ ...tester, value: e.target.value })} style={{ fontSize: 12, minWidth: 140 }} />
              <select style={{ fontSize: 12 }} value={tester.mode} onChange={(e) => setTester({ ...tester, mode: e.target.value })}>
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" checked={tester.bypassDnd} onChange={(e) => setTester({ ...tester, bypassDnd: e.target.checked })} /> bypass DND
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>Sample messages:</span>
              {["mention", "normal", "approval", "task"].map((t) => (
                <button key={t} onClick={() => setTester({ ...tester, samples: [t, ...tester.samples.filter((s) => s !== t)] })} style={{ fontSize: 11, border: "1px solid var(--nv-color-border)", borderRadius: 999, padding: "2px 8px", background: tester.samples.includes(t) ? "var(--nv-color-primary-alpha)" : "transparent", cursor: "pointer", color: "var(--nv-color-text)" }}>{t}</button>
              ))}
              <input placeholder={"custom text (e.g. 'p0 incident on prod')"} value={tester.samples.find((s) => s.startsWith("text:")) ?? ""} onChange={(e) => setTester({ ...tester, samples: [...tester.samples.filter((s) => !s.startsWith("text:")), `text:${e.target.value}`] })} style={{ fontSize: 12, minWidth: 200 }} />
              <Button size="sm" variant="secondary" disabled={busy || !tester.value || tester.samples.length === 0} onClick={async () => {
                const res = await action({ op: "testRule", rule: { scope: tester.scope as never, value: tester.value, mode: tester.mode as never, bypassDnd: tester.bypassDnd }, samples: tester.samples.map((s) => ({ roomId: "r1", senderId: "u1", text: s.startsWith("text:") ? s.slice(5) : "", messageType: s as never, channelType: "desktop" })) as never });
                setTestResults(res as Array<{ sample: { text: string; messageType: string }; hit: boolean; mode: string | null; wouldNotify: boolean; note: string }>);
              }}>Run test</Button>
            </div>
            {testResults && (
              <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>
                {testResults.map((r, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: r.wouldNotify ? "var(--nv-color-success)" : "var(--nv-color-text-faint)", fontWeight: 700, minWidth: 110 }}>{r.wouldNotify ? "notifies" : "silent"}</span>
                    <span style={{ minWidth: 90 }}>[{r.sample.messageType}]</span>
                    <span style={{ color: "var(--nv-color-text-muted)", flex: 1 }}>{r.sample.text || `(sample ${r.sample.messageType})`}</span>
                    <span style={{ color: "var(--nv-color-text-faint)" }}>{r.hit ? `${r.mode}${r.note ? ` — ${r.note}` : ""}` : "no match"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "dnd" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ fontSize: 12 }} value={newDnd.kind} onChange={(e) => setNewDnd({ ...newDnd, kind: e.target.value })}>
              {DND_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={newDnd.days} onChange={(e) => setNewDnd({ ...newDnd, days: e.target.value })} placeholder="days mon,tue,..." style={{ fontSize: 12, minWidth: 140 }} />
            <input type="time" value={hhmm(newDnd.startMin)} style={{ fontSize: 12 }} onChange={(e) => setNewDnd({ ...newDnd, startMin: toMin(e.target.value) })} />
            <span>→</span>
            <input type="time" value={hhmm(newDnd.endMin)} style={{ fontSize: 12 }} onChange={(e) => setNewDnd({ ...newDnd, endMin: toMin(e.target.value) })} />
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "upsertDnd", dnd: newDnd as never })}>Add window</Button>
          </div>
          {dnd.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No DND windows.</div>}
          {dnd.map((w) => (
            <div key={w.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, minWidth: 110 }}>{w.kind}</span>
              <span>{w.days === "[]" ? "any day" : w.days.slice(1, -1).replace(/"/g, "")}</span>
              <span>{hhmm(w.startMin)}–{hhmm(w.endMin)}</span>
              {w.startDate && <span style={{ color: "var(--nv-color-text-faint)" }}>{fmtDate(w.startDate)}</span>}
              {!w.active && <span style={{ color: "var(--nv-color-text-faint)" }}>inactive</span>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "deleteDnd", dndId: w.id })}>delete</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "inbox" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(inbox.buckets).map(([b, n]) => (
              <span key={b} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--nv-color-border)" }}>{b} {n}</span>
            ))}
            {Object.entries(inbox.queues).map(([q, n]) => (
              <span key={q} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--nv-color-primary)", color: "var(--nv-color-primary)" }}>{q}: {n}</span>
            ))}
          </div>
          {inbox.items.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No messages to rank yet.</div>}
          {inbox.items.map((i) => (
            <div key={i.messageId} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, minWidth: 100 }}>{i.bucket}</span>
              <span style={{ color: "var(--nv-color-text-muted)", minWidth: 60 }}>{i.queue}</span>
              {i.pinned && <span style={{ color: "var(--nv-color-warning)" }}>📌</span>}
              {i.vips && <span style={{ color: "var(--nv-color-warning)" }}>VIP</span>}
              {!i.unread && <span style={{ color: "var(--nv-color-text-faint)" }}>read</span>}
              <span style={{ fontWeight: 700 }}>{i.roomName}</span>
              <span style={{ color: "var(--nv-color-text-muted)" }}>{i.senderName}</span>
              <span style={{ color: "var(--nv-color-text-faint)", flex: 1, minWidth: 120 }}>{i.body.slice(0, 80)}</span>
              <span style={{ color: "var(--nv-color-text-faint)" }}>score {i.score}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "recordClick", messageId: i.messageId, roomId: i.roomId })}>open</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "pins" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select style={{ fontSize: 12 }} value={newPin.kind} onChange={(e) => setNewPin({ ...newPin, kind: e.target.value })}>
              {["MESSAGE", "THREAD", "ROOM", "FILE", "TASK", "APPROVAL"].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input placeholder="refId" value={newPin.refId} onChange={(e) => setNewPin({ ...newPin, refId: e.target.value })} style={{ fontSize: 12, minWidth: 200 }} />
            <input type="datetime-local" value={newPin.pinUntil} onChange={(e) => setNewPin({ ...newPin, pinUntil: e.target.value })} style={{ fontSize: 12 }} />
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={newPin.pinUntilResolved} onChange={(e) => setNewPin({ ...newPin, pinUntilResolved: e.target.checked })} /> until resolved
            </label>
            <Button size="sm" variant="secondary" disabled={busy || !newPin.refId} onClick={() => run({ op: "pin", pin: { kind: newPin.kind as never, refId: newPin.refId, pinUntil: newPin.pinUntil ? new Date(newPin.pinUntil) : null, pinUntilResolved: newPin.pinUntilResolved } })}>Pin</Button>
          </div>
          {pins.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No pins yet. Pins rank higher in the priority inbox.</div>}
          {pins.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, minWidth: 80 }}>{p.kind}</span>
              <span style={{ flex: 1, minWidth: 120 }} title={p.refId}>{p.refId.slice(0, 50)}</span>
              {p.pinned && <span style={{ color: "var(--nv-color-warning)" }}>📌 pinned</span>}
              {p.shared && <span style={{ color: "var(--nv-color-text-muted)" }}>shared</span>}
              {p.pinUntil && <span style={{ color: "var(--nv-color-text-faint)" }}>until {fmtDate(p.pinUntil)}</span>}
              {p.pinUntilResolved && <span style={{ color: "var(--nv-color-text-faint)" }}>until resolved</span>}
              {p.note && <span style={{ color: "var(--nv-color-text-faint)" }}>{p.note}</span>}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "unpin", pin: { kind: p.kind as never, refId: p.refId } })}>unpin</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "deletePin", pin: { kind: p.kind as never, refId: p.refId } })}>delete</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "suggestions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {suggestions.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No suggestions yet — they appear as the system learns from your notification behavior.</div>}
          {suggestions.map((s) => (
            <div key={s.id} style={{ border: "1px solid var(--nv-color-primary)", borderRadius: "var(--nv-radius-md)", padding: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap", background: "var(--nv-color-primary-alpha, transparent)" }}>
              <span style={{ fontWeight: 700, minWidth: 110 }}>{s.kind.replace(/_/g, " ")}</span>
              <span style={{ flex: 1, minWidth: 200 }}>{s.reason}</span>
              {s.evidence.map((e) => <span key={e.metric} style={{ color: "var(--nv-color-text-faint)" }}>{e.metric}: {e.value}</span>)}
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ op: "acceptSuggestion", suggestion: s })}>Apply</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ op: "dismissSuggestion", suggestion: s })}>Dismiss</Button>
            </div>
          ))}
        </div>
      )}

      {tab === "insights" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {[
              { label: "Acceptance rate", value: metrics.acceptanceRate == null ? "—" : (Number(metrics.acceptanceRate) * 100).toFixed(0) + "%" },
              { label: "DND override freq", value: metrics.dndOverrideFrequency == null ? "—" : (Number(metrics.dndOverrideFrequency) * 100).toFixed(0) + "%" },
              { label: "Click-through", value: metrics.clickThroughRate == null ? "—" : (Number(metrics.clickThroughRate) * 100).toFixed(0) + "%" },
              { label: "Pin usage", value: fmt(metrics.pinUsage) },
              { label: "Digest open rate", value: metrics.digestOpenRate == null ? "—" : (Number(metrics.digestOpenRate) * 100).toFixed(0) + "%" },
              { label: "Missed-important rate", value: metrics.missedImportantRate == null ? "—" : (Number(metrics.missedImportantRate) * 100).toFixed(0) + "%" },
              { label: "Recommendation adjust", value: metrics.recommendationAdjustRate == null ? "—" : (Number(metrics.recommendationAdjustRate) * 100).toFixed(0) + "%" },
            ].map((c) => (
              <div key={c.label} style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
                <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)" }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{c.value}</div>
              </div>
            ))}
          </div>
          <div style={{ border: "1px solid var(--nv-color-border)", borderRadius: "var(--nv-radius-md)", padding: 10, background: "var(--nv-color-surface-2)" }}>
            <div style={{ fontSize: 11, color: "var(--nv-color-text-muted)", marginBottom: 6 }}>Last 10 decisions — why each notification fired or was suppressed</div>
            {events.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No decisions recorded yet.</div>}
            {events.map((e) => (
              <div key={e.id} style={{ fontSize: 11, padding: "4px 0", borderBottom: "1px solid var(--nv-color-border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, minWidth: 100 }}>{e.action}</span>
                <span style={{ color: "var(--nv-color-text-muted)" }}>{e.kind}</span>
                {e.channelType && <span style={{ color: "var(--nv-color-text-faint)" }}>{e.channelType}</span>}
                <span style={{ color: "var(--nv-color-text-faint)", flex: 1 }}>{e.reason ?? ""}</span>
                <span style={{ color: "var(--nv-color-text-faint)" }}>{fmtDate(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function toMin(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}