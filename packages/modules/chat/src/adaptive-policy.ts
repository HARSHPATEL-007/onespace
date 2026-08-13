/**
 * N0VA CHAT Workspace-Adaptive UI — state-aware control plane.
 *
 * Seven first-class workspace states (FOCUS / COLLABORATION / REVIEW /
 * PRESENTATION / CRISIS / FLOW / MEDITATION) that reshape layout,
 * notifications, module surfaces, and AI behavior — while keeping the core
 * UI stable.
 *
 * Rules (spec):
 * - Explicit mode always wins over inferred mode.
 * - Inferred mode fades in gently; it never snaps the interface.
 * - State changes are reversible with one click.
 * - The app always shows why the current mode is active.
 * - Inference is supportive, never authoritative: it only ever *suggests*.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type WorkspaceModeValue = "FOCUS" | "REVIEW" | "COLLABORATION" | "CRISIS" | "PRESENTATION" | "FLOW" | "MEDITATION";

export type ModeSource = "manual" | "locked" | "inferred" | "default";

export type NotificationOverride = "immediate" | "digest_only" | "silent";
export type AiOverride = "quiet" | "proactive" | "concise" | "decisive" | "dormant";

export interface ModeOverrides {
  notifications?: NotificationOverride;
  modules?: string[];
  ai_behavior?: AiOverride;
}

export type ModuleKey =
  | "tasks" | "active_thread" | "docs" | "chat" | "calendar" | "thread"
  | "huddles" | "diffs" | "approvals" | "comments" | "incidents" | "logs"
  | "slides" | "notes" | "captions" | "crm" | "embeds" | "health"
  | "runbooks" | "wellbeing" | "presence";

export type NotificationDisposition = "IMMEDIATE" | "DIGEST" | "QUEUE" | "SUPPRESS";

export interface QuietWindow {
  /** minutes from midnight, local */
  startMin: number;
  endMin: number;
}

export interface NotificationPolicy {
  /** events with priority >= floor are delivered immediately */
  immediateFloor: number;
  /** events with priority >= floor are batched into a digest */
  digestFloor: number;
  /** escalation exceptions — these classes always break through */
  allowMentions: boolean;
  allowOwnership: boolean;
  allowIncidents: boolean;
  quietWindows: QuietWindow[];
  digestIntervalMin: number;
}

export interface AiBehavior {
  style: "quiet" | "opportunistic" | "proactive" | "concise" | "decisive" | "dormant";
  /** prompt guidance injected into AI calls in this mode */
  guidance: string;
  /** only suggest actions when the model's confidence is >= this floor */
  suggestionConfidenceFloor: number;
}

export interface ModeDefinition {
  key: WorkspaceModeValue;
  label: string;
  icon: string;
  description: string;
  /** 0 = fullest UI, 4 = minimal chrome */
  chromeDensity: number;
  typography: "sm" | "md" | "lg" | "xl";
  /** module surface emphasis, 0-10 */
  modules: Record<ModuleKey, number>;
  notifications: NotificationPolicy;
  ai: AiBehavior;
}

// â”€â”€ Mode table (single source of truth for all 7 modes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const MODE_ORDER: WorkspaceModeValue[] = [
  "FOCUS", "COLLABORATION", "REVIEW", "PRESENTATION", "CRISIS", "FLOW", "MEDITATION",
];

export const MODES: Record<WorkspaceModeValue, ModeDefinition> = {
  FOCUS: {
    key: "FOCUS",
    label: "Focus",
    icon: "ðŸŽ¯",
    description: "Minimal chrome, only urgent mentions and direct messages, one primary task pane. Interruptions suppressed.",
    chromeDensity: 3,
    typography: "md",
    modules: { tasks: 9, active_thread: 9, docs: 2, chat: 7, calendar: 1, thread: 8, huddles: 0, diffs: 0, approvals: 0, comments: 0, incidents: 0, logs: 0, slides: 0, notes: 0, captions: 0, crm: 0, embeds: 1, health: 0, runbooks: 0, wellbeing: 0, presence: 0 },
    notifications: { immediateFloor: 90, digestFloor: 60, allowMentions: true, allowOwnership: true, allowIncidents: true, quietWindows: [], digestIntervalMin: 30 },
    ai: { style: "quiet", guidance: "Be quiet and opportunistic. Summarize on request, suggest only urgent actions, hold non-urgent notifications. Do not volunteer routine suggestions.", suggestionConfidenceFloor: 0.85 },
  },
  COLLABORATION: {
    key: "COLLABORATION",
    label: "Collaboration",
    icon: "ðŸ‘¥",
    description: "Maximize awareness: presence facepiles, live cursors, side panes for Docs/Tasks/Calendar, one-click huddles.",
    chromeDensity: 1,
    typography: "md",
    modules: { tasks: 6, active_thread: 6, docs: 9, chat: 9, calendar: 8, thread: 8, huddles: 9, diffs: 2, approvals: 3, comments: 9, incidents: 1, logs: 0, slides: 0, notes: 2, captions: 0, crm: 3, embeds: 7, health: 0, runbooks: 0, wellbeing: 0, presence: 10 },
    notifications: { immediateFloor: 40, digestFloor: 25, allowMentions: true, allowOwnership: true, allowIncidents: true, quietWindows: [], digestIntervalMin: 15 },
    ai: { style: "proactive", guidance: "Be proactive and context-rich: surface participants, unresolved threads, and linked docs. Prioritize synchronous coordination over quiet automation.", suggestionConfidenceFloor: 0.55 },
  },
  REVIEW: {
    key: "REVIEW",
    label: "Review",
    icon: "ðŸ§",
    description: "Foreground decisions, diffs, approvals, summaries, and unresolved items. Compare with previous, export-ready.",
    chromeDensity: 1,
    typography: "md",
    modules: { tasks: 4, active_thread: 7, docs: 8, chat: 6, calendar: 3, thread: 9, huddles: 3, diffs: 10, approvals: 10, comments: 9, incidents: 0, logs: 0, slides: 0, notes: 5, captions: 0, crm: 0, embeds: 4, health: 0, runbooks: 0, wellbeing: 0, presence: 2 },
    notifications: { immediateFloor: 70, digestFloor: 40, allowMentions: true, allowOwnership: true, allowIncidents: true, quietWindows: [], digestIntervalMin: 20 },
    ai: { style: "concise", guidance: "Extract decisions, compare versions, draft approvals, and summarize what changed. Show unresolved items first. Be precise and citation-minded.", suggestionConfidenceFloor: 0.6 },
  },
  PRESENTATION: {
    key: "PRESENTATION",
    label: "Presentation",
    icon: "ðŸ“½ï¸",
    description: "Large text, high contrast, stripped of noise. Speaker notes, auto-expanded embeds, optional live captions.",
    chromeDensity: 3,
    typography: "xl",
    modules: { tasks: 0, active_thread: 2, docs: 2, chat: 4, calendar: 0, thread: 2, huddles: 1, diffs: 0, approvals: 0, comments: 0, incidents: 0, logs: 0, slides: 10, notes: 9, captions: 8, crm: 0, embeds: 9, health: 0, runbooks: 0, wellbeing: 0, presence: 1 },
    notifications: { immediateFloor: 90, digestFloor: 70, allowMentions: false, allowOwnership: true, allowIncidents: true, quietWindows: [], digestIntervalMin: 60 },
    ai: { style: "concise", guidance: "Generate short speaker notes and smooth transitions. Surface only the current talking point. Keep responses brief and legible.", suggestionConfidenceFloor: 0.7 },
  },
  CRISIS: {
    key: "CRISIS",
    label: "Crisis",
    icon: "ðŸš¨",
    description: "War-room layout: incident dashboard, priority inbox only, escalation controls, health signals, timeline.",
    chromeDensity: 0,
    typography: "md",
    modules: { tasks: 3, active_thread: 5, docs: 2, chat: 8, calendar: 2, thread: 6, huddles: 7, diffs: 0, approvals: 4, comments: 4, incidents: 10, logs: 9, slides: 0, notes: 0, captions: 0, crm: 0, embeds: 1, health: 9, runbooks: 9, wellbeing: 0, presence: 6 },
    notifications: { immediateFloor: 10, digestFloor: 5, allowMentions: true, allowOwnership: true, allowIncidents: true, quietWindows: [], digestIntervalMin: 5 },
    ai: { style: "decisive", guidance: "Be decisive and concise. Produce incident summaries, escalation recommendations, and owner assignments. No hedging; state what to do next.", suggestionConfidenceFloor: 0.4 },
  },
  FLOW: {
    key: "FLOW",
    label: "Flow",
    icon: "ðŸŒŠ",
    description: "Adaptive notification suppression, soft feedback, task chunking, deep-work timer. Agency preserved — quick escape always available.",
    chromeDensity: 3,
    typography: "md",
    modules: { tasks: 9, active_thread: 8, docs: 3, chat: 5, calendar: 1, thread: 6, huddles: 0, diffs: 0, approvals: 0, comments: 0, incidents: 0, logs: 0, slides: 0, notes: 0, captions: 0, crm: 0, embeds: 1, health: 0, runbooks: 0, wellbeing: 2, presence: 0 },
    notifications: { immediateFloor: 85, digestFloor: 50, allowMentions: true, allowOwnership: true, allowIncidents: true, quietWindows: [], digestIntervalMin: 45 },
    ai: { style: "opportunistic", guidance: "Reduce interruptions without reducing agency. Suggest contextual actions only when confidence is high. Soft, brief feedback; never disruptive alerts.", suggestionConfidenceFloor: 0.9 },
  },
  MEDITATION: {
    key: "MEDITATION",
    label: "Meditation",
    icon: "ðŸ§˜",
    description: "Do-not-disturb by default, silent queue, ambient background, wellness dashboard. Re-entry into work is deliberate.",
    chromeDensity: 4,
    typography: "md",
    modules: { tasks: 1, active_thread: 1, docs: 0, chat: 2, calendar: 1, thread: 1, huddles: 0, diffs: 0, approvals: 0, comments: 0, incidents: 0, logs: 0, slides: 0, notes: 0, captions: 0, crm: 0, embeds: 0, health: 0, runbooks: 0, wellbeing: 10, presence: 0 },
    notifications: { immediateFloor: 95, digestFloor: 80, allowMentions: false, allowOwnership: false, allowIncidents: true, quietWindows: [{ startMin: 0, endMin: 1440 }], digestIntervalMin: 120 },
    ai: { style: "dormant", guidance: "Remain dormant unless explicitly invoked. No suggestions, no summaries unless asked. Preserve calm.", suggestionConfidenceFloor: 1 },
  },
};

export const DEFAULT_MODE: WorkspaceModeValue = "COLLABORATION";
export const FADE_MS = 20_000;

// â”€â”€ Overrides â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function parseOverrides(raw: unknown): ModeOverrides {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: ModeOverrides = {};
  if (typeof o.notifications === "string" && ["immediate", "digest_only", "silent"].includes(o.notifications)) {
    out.notifications = o.notifications as NotificationOverride;
  }
  if (Array.isArray(o.modules)) {
    out.modules = o.modules.filter((m): m is string => typeof m === "string");
  }
  if (typeof o.ai_behavior === "string" && ["quiet", "proactive", "concise", "decisive", "dormant"].includes(o.ai_behavior)) {
    out.ai_behavior = o.ai_behavior as AiOverride;
  }
  return out;
}

export function effectivePolicy(mode: WorkspaceModeValue, overrides?: ModeOverrides): NotificationPolicy {
  const base = MODES[mode].notifications;
  const ov = overrides?.notifications;
  if (!ov) return base;
  if (ov === "digest_only") return { ...base, immediateFloor: 95, digestFloor: 40 };
  if (ov === "silent") return { ...base, immediateFloor: 100, digestFloor: 90 };
  return base;
}

export function effectiveAi(mode: WorkspaceModeValue, overrides?: ModeOverrides): AiBehavior {
  const base = MODES[mode].ai;
  const ov = overrides?.ai_behavior;
  if (!ov) return base;
  const byStyle: Record<AiOverride, Partial<AiBehavior>> = {
    quiet: { style: "quiet", guidance: "Be quiet and opportunistic. Only urgent suggestions.", suggestionConfidenceFloor: 0.85 },
    proactive: { style: "proactive", guidance: "Be proactive and context-rich; surface participants, threads, and linked docs.", suggestionConfidenceFloor: 0.55 },
    concise: { style: "concise", guidance: "Be concise. Extract decisions and what changed. Show unresolved items first.", suggestionConfidenceFloor: 0.6 },
    decisive: { style: "decisive", guidance: "Be decisive and concise. State what to do next, no hedging.", suggestionConfidenceFloor: 0.4 },
    dormant: { style: "dormant", guidance: "Remain dormant unless explicitly invoked.", suggestionConfidenceFloor: 1 },
  };
  return { ...base, ...byStyle[ov] };
}

// â”€â”€ Notification policy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface NotificationEventInput {
  kind: string;
  priority: number;
  mentionsSelf?: boolean;
  ownedBySelf?: boolean;
  incidentRelated?: boolean;
  now?: Date;
}

export function inQuietWindow(quietWindows: QuietWindow[], now: Date): boolean {
  if (quietWindows.length === 0) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  return quietWindows.some((w) => {
    if (w.startMin <= w.endMin) return mins >= w.startMin && mins < w.endMin;
    return mins >= w.startMin || mins < w.endMin; // overnight window
  });
}

export function notificationDecision(
  mode: WorkspaceModeValue,
  evt: NotificationEventInput,
  overrides?: ModeOverrides,
): { disposition: NotificationDisposition; reason: string } {
  const policy = effectivePolicy(mode, overrides);
  const now = evt.now ?? new Date();

  // Escalation exceptions always break through (unless the override says silent).
  if (evt.incidentRelated && policy.allowIncidents && overrides?.notifications !== "silent") {
    return { disposition: "IMMEDIATE", reason: "Incident-related — always delivered" };
  }
  if (evt.mentionsSelf && policy.allowMentions && overrides?.notifications !== "silent") {
    return { disposition: "IMMEDIATE", reason: "Direct mention — escalation exception" };
  }
  if (evt.ownedBySelf && policy.allowOwnership && overrides?.notifications !== "silent") {
    return { disposition: "IMMEDIATE", reason: "Owned action — escalation exception" };
  }

  if (inQuietWindow(policy.quietWindows, now)) {
    return evt.priority >= policy.immediateFloor
      ? { disposition: "IMMEDIATE", reason: "Critical event during quiet window" }
      : { disposition: "DIGEST", reason: `Quiet window (${mode}) — deferred to digest` };
  }

  if (evt.priority >= policy.immediateFloor) {
    return { disposition: "IMMEDIATE", reason: `Priority ${evt.priority} meets ${mode} floor ${policy.immediateFloor}` };
  }
  if (evt.priority >= policy.digestFloor) {
    return { disposition: "DIGEST", reason: `Priority ${evt.priority} meets ${mode} digest floor ${policy.digestFloor}` };
  }
  return { disposition: "QUEUE", reason: `Below ${mode} thresholds — queued silently` };
}

// â”€â”€ Module surfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function moduleSurfaceFor(mode: WorkspaceModeValue, overrides?: ModeOverrides): Array<{ module: ModuleKey; weight: number }> {
  const base = MODES[mode].modules;
  const rank = Object.entries(base)
    .map(([module, weight]) => ({ module: module as ModuleKey, weight }))
    .filter((m) => m.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  if (!overrides?.modules?.length) return rank;
  return rank.map((r) => ({
    ...r,
    weight: overrides.modules!.includes(r.module) ? Math.max(r.weight, 6) : r.weight,
  }));
}

// â”€â”€ State resolution (explicit > inferred, fade-in) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface StoredAdaptiveState {
  currentMode: WorkspaceModeValue;
  stateSource: ModeSource;
  stateConfidence: number;
  expiresAt: Date | null;
  modeOverrides: ModeOverrides;
  suggestedMode: WorkspaceModeValue | null;
  suggestedConfidence: number;
  suggestedAt: Date | null;
  suggestedReasons: string[];
  inferredMode: WorkspaceModeValue | null;
  inferredConfidence: number;
  inferredAt: Date | null;
  lastSwitchAt: Date | null;
}

export interface EffectiveState {
  mode: WorkspaceModeValue;
  source: ModeSource;
  confidence: number;
  expiresAt: Date | null;
  overrides: ModeOverrides;
  /** 0..1 fade-in progress since the last switch (anti-snap) */
  fade: number;
  reason: string;
}

export function storedToState(row: Record<string, unknown> | null, defaultMode: WorkspaceModeValue = DEFAULT_MODE): StoredAdaptiveState {
  if (!row) {
    return {
      currentMode: defaultMode, stateSource: "default", stateConfidence: 1, expiresAt: null,
      modeOverrides: {}, suggestedMode: null, suggestedConfidence: 0, suggestedAt: null,
      suggestedReasons: [], inferredMode: null, inferredConfidence: 0, inferredAt: null, lastSwitchAt: null,
    };
  }
  const source = (row.stateSource as string) ?? "manual";
  return {
    currentMode: (row.currentMode as WorkspaceModeValue) ?? defaultMode,
    stateSource: (["manual", "locked", "inferred", "default"].includes(source) ? source : "manual") as ModeSource,
    stateConfidence: typeof row.stateConfidence === "number" ? row.stateConfidence : 1,
    expiresAt: row.expiresAt ? new Date(row.expiresAt as string) : null,
    modeOverrides: parseOverrides(row.modeOverrides),
    suggestedMode: (row.suggestedMode as WorkspaceModeValue) ?? null,
    suggestedConfidence: typeof row.suggestedConfidence === "number" ? row.suggestedConfidence : 0,
    suggestedAt: row.suggestedAt ? new Date(row.suggestedAt as string) : null,
    suggestedReasons: Array.isArray(row.suggestedReasons) ? row.suggestedReasons.map(String) : [],
    inferredMode: (row.inferredMode as WorkspaceModeValue) ?? null,
    inferredConfidence: typeof row.inferredConfidence === "number" ? row.inferredConfidence : 0,
    inferredAt: row.inferredAt ? new Date(row.inferredAt as string) : null,
    lastSwitchAt: row.lastSwitchAt ? new Date(row.lastSwitchAt as string) : null,
  };
}

export function resolveEffectiveState(stored: StoredAdaptiveState, now: Date = new Date()): EffectiveState {
  const isExplicit = stored.stateSource === "manual" || stored.stateSource === "locked";
  const expired = stored.expiresAt !== null && stored.expiresAt.getTime() <= now.getTime();

  if (isExplicit && !expired) {
    return {
      mode: stored.currentMode,
      source: stored.stateSource,
      confidence: stored.stateConfidence,
      expiresAt: stored.expiresAt,
      overrides: stored.modeOverrides,
      fade: fadeProgress(stored.lastSwitchAt, now),
      reason: stored.stateSource === "locked"
        ? `Locked in ${labelFor(stored.currentMode)}${stored.expiresAt ? ` until ${stored.expiresAt.toLocaleTimeString()}` : ""}`
        : `You chose ${labelFor(stored.currentMode)}`,
    };
  }

  // Explicit mode expired or never set â†’ fall back to inferred, gently.
  const canInfer = stored.inferredMode && stored.inferredConfidence >= 0.5 && stored.inferredAt;
  if (canInfer) {
    return {
      mode: stored.inferredMode!,
      source: "inferred",
      confidence: stored.inferredConfidence,
      expiresAt: null,
      overrides: {},
      fade: fadeProgress(stored.inferredAt, now),
      reason: `Inferred ${labelFor(stored.inferredMode!)} from your recent activity (${Math.round(stored.inferredConfidence * 100)}% confidence)`,
    };
  }

  return {
    mode: DEFAULT_MODE,
    source: "default",
    confidence: 1,
    expiresAt: null,
    overrides: {},
    fade: 1,
    reason: "Default collaboration mode",
  };
}

export function fadeProgress(since: Date | null, now: Date): number {
  if (!since) return 1;
  return Math.max(0, Math.min(1, (now.getTime() - since.getTime()) / FADE_MS));
}

export function labelFor(mode: WorkspaceModeValue): string {
  return MODES[mode]?.label ?? mode;
}

export function isWorkspaceModeValue(v: unknown): v is WorkspaceModeValue {
  return typeof v === "string" && v in MODES;
}

// ── Inference (supportive only — never authoritative) ────────────────────

export interface InferenceSignals {
  now: Date;
  /** active busy calendar block right now */
  busyCalendar?: boolean;
  calendarLabel?: string;
  unreadMentions?: number;
  messageRatePerMin?: number;
  typingBurst?: boolean;
  huddleActive?: boolean;
  activeIncidents?: number;
  incidentSeverity?: string;
  neuralFlowProb?: number;
  neuralStress?: number;
  recentlySuppressed?: boolean;
  lateNight?: boolean;
}

export interface InferenceResult {
  mode: WorkspaceModeValue;
  confidence: number;
  reasons: string[];
}

/**
 * Weighted vote over signals. Returns a *suggestion* — the caller decides
 * whether to surface it as a prompt; explicit user selection always wins.
 */
export function inferMode(signals: InferenceSignals): InferenceResult {
  const votes: Record<WorkspaceModeValue, number> = {
    FOCUS: 0, COLLABORATION: 0, REVIEW: 0, PRESENTATION: 0, CRISIS: 0, FLOW: 0, MEDITATION: 0,
  };
  const reasons: string[] = [];
  const s = signals;

  if ((s.activeIncidents ?? 0) > 0) {
    votes.CRISIS += 0.9 + Math.min(0.08 * s.activeIncidents!, 0.1);
    reasons.push(`${s.activeIncidents} active incident${s.activeIncidents! > 1 ? "s" : ""}${s.incidentSeverity ? ` (${s.incidentSeverity})` : ""}`);
  }

  if (s.busyCalendar) {
    votes.FOCUS += 0.45;
    reasons.push(`Busy calendar block${s.calendarLabel ? `: ${s.calendarLabel}` : ""}`);
    if ((s.neuralFlowProb ?? 0) > 0.5) votes.FLOW += 0.25;
  }

  if (typeof s.neuralFlowProb === "number") {
    if (s.neuralFlowProb > 0.7) {
      votes.FLOW += 0.6;
      reasons.push(`Neural flow probability ${Math.round(s.neuralFlowProb * 100)}%`);
    } else if (s.neuralFlowProb > 0.5 && (s.messageRatePerMin ?? 0) < 2) {
      votes.FLOW += 0.3;
    }
  }

  if (s.typingBurst || (s.messageRatePerMin ?? 0) >= 4) {
    votes.COLLABORATION += 0.55;
    reasons.push(`High conversation velocity (${s.messageRatePerMin?.toFixed(1)} msgs/min)`);
  }

  if (s.huddleActive) {
    votes.COLLABORATION += 0.5;
    reasons.push("Huddle in progress");
  }

  if ((s.unreadMentions ?? 0) >= 5) {
    votes.COLLABORATION += 0.25;
    votes.REVIEW += 0.2;
    reasons.push(`${s.unreadMentions} unread mentions need attention`);
  }

  if (s.recentlySuppressed) {
    votes.FOCUS += 0.3;
    reasons.push("You've been suppressing notifications");
  }

  if (s.lateNight && (s.messageRatePerMin ?? 0) < 1 && !s.busyCalendar && (s.neuralStress ?? 0) < 0.5) {
    votes.MEDITATION += 0.4;
    reasons.push("Late hour, low activity, low stress");
  }

  const entry = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]!;
  const confidence = Math.min(0.95, entry[1]);
  return {
    mode: confidence >= 0.3 ? (entry[0] as WorkspaceModeValue) : DEFAULT_MODE,
    confidence,
    reasons: reasons.slice(0, 4),
  };
}

// (continued in adaptive-policy.ts — pure logic lives there so client components can import it without pulling in prisma)
