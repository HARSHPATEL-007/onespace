import { prisma } from "@n0va/db";
import {
  CHANNEL_TYPES, DND_KINDS, PRESETS, PIN_KINDS, RULE_MODES, RULE_SCOPES,
  type ChannelType, type DndKind, type DndWindowInput, type MessageType, type Metrics,
  type NotificationDecision, type NotificationInput, type PinInput, type PinKind, type PresetName,
  type PriorityInboxItem, type RuleInput, type RuleMode, type RuleScope, type SampleEvent, type Suggestion,
} from "./types";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SCOPE_RANK: RuleScope[] = ["room", "sender", "keyword", "mention", "thread", "file", "task", "approval", "channel", "global"];
const BUCKET_RANK: Record<string, number> = { NEEDS_REPLY: 0, NEEDS_ACTION: 1, FYI: 2 };

function nowParts(now: Date, tz: string): { weekday: string; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = fmt.formatToParts(now);
  const weekday = (p.find((x) => x.type === "weekday")?.value ?? "mon").toLowerCase();
  let hour = Number(p.find((x) => x.type === "hour")?.value ?? "0");
  if (hour === 24) hour = 0;
  const minute = Number(p.find((x) => x.type === "minute")?.value ?? "0");
  return { weekday, minutes: hour * 60 + minute };
}

/** §8 — presets as rule + DND templates. */
const PRESET_TEMPLATES: Record<PresetName, { rules: Array<Pick<RuleInput, "scope" | "value" | "mode" | "urgency" | "bypassDnd">>; dnd: Array<DndWindowInput> }> = {
  FOCUS: {
    rules: [{ scope: "global", value: "*", mode: "MENTIONS_ONLY", urgency: 0, bypassDnd: false }],
    dnd: [{ kind: "RECURRING", days: ["mon", "tue", "wed", "thu", "fri"], startMin: 540, endMin: 720 }],
  },
  MEETINGS: {
    rules: [],
    dnd: [{ kind: "MEETING", startMin: 0, endMin: 1440 }],
  },
  OFF_HOURS: {
    rules: [],
    dnd: [
      { kind: "WORKDAY", days: ["mon", "tue", "wed", "thu", "fri"], startMin: 0, endMin: 1440 },
      { kind: "WEEKEND", days: ["sat", "sun"], startMin: 0, endMin: 1440 },
    ],
  },
  VIP_ONLY: {
    rules: [{ scope: "global", value: "*", mode: "SILENT", urgency: 0, bypassDnd: false }, { scope: "mention", value: "*", mode: "ALWAYS", urgency: 2, bypassDnd: true }],
    dnd: [],
  },
  APPROVALS_ONLY: {
    rules: [{ scope: "global", value: "*", mode: "SILENT", urgency: 0, bypassDnd: false }, { scope: "approval", value: "*", mode: "ALWAYS", urgency: 3, bypassDnd: true }],
    dnd: [],
  },
  CRISIS: {
    rules: [
      { scope: "global", value: "*", mode: "SILENT", urgency: 0, bypassDnd: false },
      { scope: "keyword", value: "crisis|urgent|p0|p1|incident", mode: "ALWAYS", urgency: 3, bypassDnd: true },
    ],
    dnd: [],
  },
};

/** Personalization engine — §1–§10. Instance per user+workspace (mirrors ChatEngine). */
export class PersonalizationEngine {
  constructor(public readonly userId: string, public readonly workspaceId: string) {}

  // ── profile ────────────────────────────────────────────────────────────────

  async getProfile() {
    const existing = await prisma.chatPersonalizationProfile.findUnique({ where: { userId: this.userId } });
    if (existing) return existing;
    return prisma.chatPersonalizationProfile.create({
      data: { userId: this.userId, workspaceId: this.workspaceId },
    });
  }

  async updateProfile(patch: { prioritySort?: string; digestEnabled?: boolean; workingHoursStart?: number; workingHoursEnd?: number; workdays?: string[]; timezone?: string; calendarAwareDnd?: boolean; aiSuggestionsEnabled?: boolean; pauseUntil?: Date | null }) {
    const profile = await this.getProfile();
    return prisma.chatPersonalizationProfile.update({
      where: { id: profile.id },
      data: {
        prioritySort: patch.prioritySort,
        digestEnabled: patch.digestEnabled,
        workingHoursStart: patch.workingHoursStart,
        workingHoursEnd: patch.workingHoursEnd,
        workdays: patch.workdays ? JSON.stringify(patch.workdays) : undefined,
        timezone: patch.timezone,
        calendarAwareDnd: patch.calendarAwareDnd,
        aiSuggestionsEnabled: patch.aiSuggestionsEnabled,
        pauseUntil: patch.pauseUntil === undefined ? undefined : patch.pauseUntil,
      },
    });
  }

  // ── §1 notification rules ─────────────────────────────────────────────────

  async listRules() {
    const profile = await this.getProfile();
    return prisma.chatNotificationRule.findMany({ where: { profileId: profile.id }, orderBy: [{ urgency: "desc" }, { createdAt: "desc" }] });
  }

  async upsertRule(input: RuleInput) {
    const profile = await this.getProfile();
    if (input.id) {
      return prisma.chatNotificationRule.update({
        where: { id: input.id },
        data: { scope: input.scope, value: input.value, mode: input.mode, urgency: input.urgency ?? 0, bypassDnd: input.bypassDnd ?? false, snoozeUntil: input.snoozeUntil ?? null, source: input.source ?? "USER", reason: input.reason, active: input.active ?? true },
      });
    }
    const existing = await prisma.chatNotificationRule.findFirst({ where: { profileId: profile.id, scope: input.scope, value: input.value } });
    if (existing) {
      return prisma.chatNotificationRule.update({
        where: { id: existing.id },
        data: { mode: input.mode, urgency: input.urgency ?? 0, bypassDnd: input.bypassDnd ?? false, snoozeUntil: input.snoozeUntil ?? null, source: input.source ?? "USER", reason: input.reason, active: input.active ?? true },
      });
    }
    return prisma.chatNotificationRule.create({
      data: {
        profileId: profile.id, scope: input.scope, value: input.value, mode: input.mode,
        urgency: input.urgency ?? 0, bypassDnd: input.bypassDnd ?? false, snoozeUntil: input.snoozeUntil ?? null,
        source: input.source ?? "USER", reason: input.reason, active: input.active ?? true,
      },
    });
  }

  async deleteRule(id: string) {
    const profile = await this.getProfile();
    return prisma.chatNotificationRule.deleteMany({ where: { id, profileId: profile.id } });
  }

  /** §1 — temporary snooze vs permanent suppression. */
  async snoozeRule(id: string, until: Date | null) {
    const profile = await this.getProfile();
    return prisma.chatNotificationRule.updateMany({ where: { id, profileId: profile.id }, data: { snoozeUntil: until } });
  }

  // ── §4/§5 DND schedules ───────────────────────────────────────────────────

  async listDnd() {
    const profile = await this.getProfile();
    return prisma.chatDndWindow.findMany({ where: { profileId: profile.id }, orderBy: [{ kind: "asc" }, { startMin: "asc" }] });
  }

  async upsertDnd(input: DndWindowInput) {
    const profile = await this.getProfile();
    if (input.id) {
      return prisma.chatDndWindow.update({
        where: { id: input.id },
        data: { kind: input.kind, days: JSON.stringify(input.days ?? []), startMin: input.startMin, endMin: input.endMin, startDate: input.startDate, endDate: input.endDate, calendarEventId: input.calendarEventId, active: input.active ?? true },
      });
    }
    return prisma.chatDndWindow.create({
      data: { profileId: profile.id, kind: input.kind, days: JSON.stringify(input.days ?? []), startMin: input.startMin, endMin: input.endMin, startDate: input.startDate, endDate: input.endDate, calendarEventId: input.calendarEventId, active: input.active ?? true },
    });
  }

  async deleteDnd(id: string) {
    const profile = await this.getProfile();
    return prisma.chatDndWindow.deleteMany({ where: { id, profileId: profile.id } });
  }

  /** §5 — evaluate DND now, including calendar-aware and meeting-mode windows. */
  async dndStatus(now = new Date()) {
    const profile = await this.getProfile();
    const windows = await prisma.chatDndWindow.findMany({ where: { profileId: profile.id, active: true } });
    const { weekday, minutes } = nowParts(now, profile.timezone);
    let active: { windowId: string | null; kind: DndKind | null; expiresAt: Date | null; source: string | null } = { windowId: null, kind: null, expiresAt: null, source: null };

    const isWorkday = profile.workdays ? (JSON.parse(profile.workdays) as string[]).includes(weekday) : ["mon", "tue", "wed", "thu", "fri"].includes(weekday);

    for (const w of windows) {
      const days = JSON.parse(w.days || "[]") as string[];
      let hit = false;
      let expiresAt: Date | null = null;
      switch (w.kind) {
        case "ONE_OFF": {
          hit = minutes >= w.startMin && minutes < w.endMin;
          if (w.startDate && now < w.startDate) hit = false;
          if (w.endDate && now > w.endDate) hit = false;
          expiresAt = expiryFromMinutes(now, w.endMin);
          break;
        }
        case "RECURRING": {
          hit = (days.length === 0 || days.includes(weekday)) && minutes >= w.startMin && minutes < w.endMin;
          expiresAt = expiryFromMinutes(now, w.endMin);
          break;
        }
        case "WORKDAY": {
          hit = days.includes(weekday) && (minutes < profile.workingHoursStart || minutes >= profile.workingHoursEnd);
          expiresAt = minutes < profile.workingHoursStart ? todayAt(now, profile.workingHoursStart) : nextDayAt(now, profile.workingHoursStart);
          break;
        }
        case "WEEKEND": {
          hit = weekday === "sat" || weekday === "sun";
          expiresAt = nextWeekdayAt(now, "mon", 0);
          break;
        }
        case "TRAVEL": {
          hit = !!w.startDate && !!w.endDate && now >= w.startDate && now <= w.endDate;
          expiresAt = w.endDate;
          break;
        }
        case "CALENDAR_BLOCK":
        case "MEETING": {
          if (profile.calendarAwareDnd || w.kind === "MEETING") {
            const evs = await prisma.calendarEvent.findMany({
              where: { workspaceId: this.workspaceId, startAt: { lte: now }, endAt: { gte: now }, OR: [{ createdById: this.userId }, { attendees: { has: this.userId } }] },
              take: 5,
              orderBy: { startAt: "asc" },
            });
            if (evs.length > 0) {
              hit = true;
              expiresAt = evs[0]!.endAt;
              active.source = `calendar:${evs[0]!.title}`;
            }
          }
          break;
        }
      }
      if (hit) {
        active = { windowId: w.id, kind: w.kind as DndKind, expiresAt, source: active.source ?? w.kind };
        break;
      }
    }
    // Workday/weekend DNDs are profile-driven; re-derive a plain source label.
    if (active.kind === "WORKDAY") active.source = `workday (${weekday})`;
    if (active.kind === "WEEKEND") active.source = "weekend";
    if (!isWorkday && active.kind === "WORKDAY") {
      active = { windowId: null, kind: null, expiresAt: null, source: null };
    }
    return { active: active.windowId !== null || active.source !== null, ...active };
  }

  // ── §6 decision hierarchy ─────────────────────────────────────────────────

  /**
   * Resolve whether a notification should interrupt now.
   * Hierarchy: emergency override > temporary override (pause/snooze) >
   * explicit per-room/per-sender rule > user global preference >
   * team/workspace default > organization policy.
   */
  async evaluateNotification(input: NotificationInput): Promise<NotificationDecision> {
    const now = input.now ?? new Date();
    const profile = await this.getProfile();
    const channelType: ChannelType = input.channelType ?? "desktop";
    const messageType: MessageType = input.messageType ?? "normal";
    const rules = await prisma.chatNotificationRule.findMany({ where: { profileId: profile.id, active: true } });
    const activeRules = rules.filter((r) => !r.snoozeUntil || r.snoozeUntil <= now);

    const matches: Array<{ rule: (typeof activeRules)[number]; rank: number }> = [];
    for (const r of activeRules) {
      let hit = false;
      switch (r.scope) {
        case "room": hit = input.roomId === r.value; break;
        case "sender": hit = input.senderId === r.value; break;
        case "keyword": hit = (input.text ?? "").toLowerCase().includes(r.value.toLowerCase()); break;
        case "mention": hit = messageType === "mention"; break;
        case "thread": hit = messageType === "thread_reply"; break;
        case "file": hit = messageType === "file"; break;
        case "task": hit = messageType === "task"; break;
        case "approval": hit = messageType === "approval"; break;
        case "channel": hit = r.value === channelType; break;
        case "global": hit = true; break;
      }
      if (hit) matches.push({ rule: r, rank: SCOPE_RANK.indexOf(r.scope as RuleScope) });
    }
    matches.sort((a, b) => a.rank - b.rank || b.rule.urgency - a.rule.urgency);
    const matched = matches[0] ?? null;

    // §6 — team/workspace default rules sit between user rules and org policy.
    const wsDefaults = await prisma.chatWorkspaceDefaultRule.findMany({ where: { workspaceId: this.workspaceId, active: true } });
    let wsMatched: (typeof wsDefaults)[number] | null = null;
    if (!matched) {
      const wsMatches: Array<{ rule: (typeof wsDefaults)[number]; rank: number }> = [];
      for (const r of wsDefaults) {
        let hit = false;
        switch (r.scope) {
          case "room": hit = input.roomId === r.value; break;
          case "sender": hit = input.senderId === r.value; break;
          case "keyword": hit = (input.text ?? "").toLowerCase().includes(r.value.toLowerCase()); break;
          case "mention": hit = messageType === "mention"; break;
          case "thread": hit = messageType === "thread_reply"; break;
          case "file": hit = messageType === "file"; break;
          case "task": hit = messageType === "task"; break;
          case "approval": hit = messageType === "approval"; break;
          case "channel": hit = r.value === channelType; break;
          case "global": hit = true; break;
        }
        if (hit) wsMatches.push({ rule: r, rank: SCOPE_RANK.indexOf(r.scope as RuleScope) });
      }
      wsMatches.sort((a, b) => a.rank - b.rank || b.rule.urgency - a.rule.urgency);
      wsMatched = wsMatches[0]?.rule ?? null;
    }

    const dnd = await this.dndStatus(now);

    // Organization-policy default: state-changing message types interrupt.
    const defaultMode: RuleMode = messageType === "approval" || messageType === "task" ? "ALWAYS" : "MENTIONS_ONLY";
    const mode: RuleMode = matched ? (matched.rule.mode as RuleMode) : wsMatched ? (wsMatched.mode as RuleMode) : defaultMode;
    const urgency = matched ? matched.rule.urgency : wsMatched ? wsMatched.urgency : messageType === "approval" ? 3 : messageType === "task" ? 2 : 0;

    // 1) Emergency/compliance override — crisis rules bypass DND explicitly.
    const emergency = matched && matched.rule.urgency >= 3 && matched.rule.bypassDnd;
    // 2) Temporary override — global "pause notifications until <time>".
    const paused = !!profile.pauseUntil && now < profile.pauseUntil;
    // 3/4/5/6) resolved mode.
    const dndBlocks = dnd.active && !emergency;

    let allowed: boolean;
    let outcome: "DELIVER" | "DIGEST" | "SUPPRESS";
    let reason: string;

    const who = matched ? `${matched.rule.scope}:"${matched.rule.value}"` : wsMatched ? `workspace default ${wsMatched.scope}:"${wsMatched.value}"` : "policy default";
    if (emergency) {
      allowed = true;
      outcome = "DELIVER";
      reason = `emergency override (${who}) — bypassed DND`;
    } else if (paused) {
      allowed = false;
      outcome = profile.digestEnabled ? "DIGEST" : "SUPPRESS";
      reason = `notifications paused until ${profile.pauseUntil!.toISOString().slice(0, 16)} → ${outcome.toLowerCase()}`;
    } else if (dndBlocks) {
      allowed = false;
      outcome = profile.digestEnabled ? "DIGEST" : "SUPPRESS";
      reason = `dnd active (${dnd.source}) → ${outcome.toLowerCase()}${matched ? ` (rule ${who} is not urgent enough)` : ""}`;
    } else if (mode === "ALWAYS") {
      allowed = true;
      outcome = "DELIVER";
      reason = `rule ${who} → always notify`;
    } else if (mode === "MENTIONS_ONLY") {
      if (messageType === "mention" || messageType === "approval" || messageType === "task") {
        allowed = true;
        outcome = "DELIVER";
        reason = `rule ${who} → mentions only (mention/state change)`;
      } else {
        allowed = false;
        outcome = profile.digestEnabled ? "DIGEST" : "SUPPRESS";
        reason = `rule ${who} → mentions only; this message is not a mention → ${outcome.toLowerCase()}`;
      }
    } else if (mode === "DIGEST") {
      allowed = false;
      outcome = "DIGEST";
      reason = `rule ${who} → digest mode`;
    } else {
      allowed = false;
      outcome = "SUPPRESS";
      reason = `rule ${who} → silent`;
    }

    if (input.record !== false) {
      await this.recordEvent("NOTIFICATION", outcome === "DELIVER" ? "DELIVERED" : outcome, {
        roomId: input.roomId,
        messageId: input.messageId,
        channelType,
        reason: `${reason} (urgency=${urgency})`,
      }).catch(() => {});
    }

    return {
      allowed,
      mode: outcome,
      dnd: { active: dnd.active, windowId: dnd.windowId, kind: dnd.kind, expiresAt: dnd.expiresAt, source: dnd.source },
      bypassedDnd: !!emergency,
      urgency,
      reason,
      matchedRuleId: matched?.rule.id ?? null,
      matchedRuleScope: matched ? (matched.rule.scope as RuleScope) : wsMatched ? (wsMatched.scope as RuleScope) : null,
      channelType,
    };
  }

  async recordEvent(kind: string, action: string, opts: { messageId?: string; roomId?: string; channelType?: string; reason?: string } = {}) {
    const profile = await this.getProfile();
    return prisma.chatPreferenceEvent.create({
      data: { profileId: profile.id, kind, action, messageId: opts.messageId, roomId: opts.roomId, channelType: opts.channelType, reason: opts.reason },
    });
  }
  /** Chat hook — §10 telemetry for every message fanout (best-effort). */
  async fanOutNotifications(channelId: string, messageId: string, senderId: string, text: string) {
    const members = await prisma.chatMember.findMany({ where: { channelId, userId: { not: senderId } }, select: { userId: true }, take: 200 });
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { body: true, createdById: true } }).catch(() => null);
    const isMention = (message?.body ?? text).includes("@");
    for (const m of members) {
      const engine = new PersonalizationEngine(m.userId, this.workspaceId);
      const exists = await prisma.chatPersonalizationProfile.findUnique({ where: { userId: m.userId } }).catch(() => null);
      if (!exists) continue; // only profile-enabled members get telemetry
      await engine
        .evaluateNotification({ userId: m.userId, workspaceId: this.workspaceId, roomId: channelId, senderId, text: message?.body ?? text, messageType: isMention ? "mention" : "normal", messageId })
        .catch(() => {});
    }
  }

  // ── §2 priority inbox ─────────────────────────────────────────────────────

  async priorityInbox(opts: { limit?: number; now?: Date } = {}): Promise<{ items: PriorityInboxItem[]; buckets: Record<string, number>; queues: Record<string, number> }> {
    const now = opts.now ?? new Date();
    const limit = opts.limit ?? 50;
    const profile = await this.getProfile();
    const memberships = await prisma.chatMember.findMany({ where: { userId: this.userId }, select: { channelId: true, lastReadAt: true } });
    const channelIds = memberships.map((m) => m.channelId);
    if (channelIds.length === 0) return { items: [], buckets: {}, queues: {} };
    const messages = await prisma.chatMessage.findMany({
      where: { channelId: { in: channelIds } },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { channel: { select: { name: true, kind: true } } },
    });
    const vips = new Set(
      (await prisma.chatNotificationRule.findMany({ where: { profileId: profile.id, scope: "sender", mode: "ALWAYS", active: true }, select: { value: true, urgency: true } })).filter((r) => r.urgency >= 2).map((r) => r.value),
    );
    const pins = await prisma.chatPinnedItem.findMany({ where: { profileId: profile.id, pinned: true, OR: [{ pinUntil: null }, { pinUntil: { gte: now } }] }, select: { kind: true, refId: true } });
    const pinnedRefs = new Set(pins.map((p) => `${p.kind}:${p.refId}`));
    const lastRead = new Map(memberships.map((m) => [m.channelId, m.lastReadAt?.getTime() ?? 0]));

    const ACTION_PATTERN = /\b(approve|approval|task|todo|action|decision|needs your|sign off|review request)\b/i;
    const items: PriorityInboxItem[] = [];
    const seen = new Set<string>();
    for (const m of messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const unread = (m.createdById !== this.userId) && (m.createdAt.getTime() > (lastRead.get(m.channelId) ?? 0));
      const actionable = ACTION_PATTERN.test(m.body) || m.body.includes("@");
      const pinned = pinnedRefs.has(`MESSAGE:${m.id}`) || pinnedRefs.has(`ROOM:${m.channelId}`);
      const isVip = !!m.createdById && vips.has(m.createdById);
      const recency = Math.max(0, 1 - (now.getTime() - m.createdAt.getTime()) / (7 * 24 * 3600 * 1000));
      const score = Math.round((pinned ? 100 : 0) + (isVip ? 50 : 0) + (actionable ? 30 : 0) + recency * 10);
      let bucket: PriorityInboxItem["bucket"] = "FYI";
      if (unread && actionable) bucket = m.body.includes("@") ? "NEEDS_REPLY" : "NEEDS_ACTION";
      else if (unread) bucket = "FYI";
      const queue: PriorityInboxItem["queue"] = m.channel.kind === "ANNOUNCEMENT" ? "external" : "internal";
      items.push({
        messageId: m.id, roomId: m.channelId, roomName: m.channel!.name, senderId: m.createdById,
        senderName: m.authorName || "unknown", body: m.body.slice(0, 200), createdAt: m.createdAt,
        bucket, queue, score, pinned, vips: isVip, unread,
      });
    }
    const sortMode = profile.prioritySort;
    items.sort((a, b) => {
      if (sortMode === "PINNED_FIRST") return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.score - a.score;
      if (sortMode === "RECENCY") return b.createdAt.getTime() - a.createdAt.getTime();
      return (BUCKET_RANK[a.bucket]! - BUCKET_RANK[b.bucket]!) || b.score - a.score;
    });
    const sliced = items.slice(0, limit);
    const buckets = sliced.reduce<Record<string, number>>((acc, i) => { acc[i.bucket] = (acc[i.bucket] ?? 0) + 1; return acc; }, {});
    const APPROVAL_PATTERN = /\b(approve|approval|sign off|review request)\b/i;
    const TASK_PATTERN = /\b(task|todo|action item|decision)\b/i;
    const queues = {
      approvals: sliced.filter((i) => APPROVAL_PATTERN.test(i.body)).length,
      tasks: sliced.filter((i) => TASK_PATTERN.test(i.body)).length,
      replies: sliced.filter((i) => i.bucket === "NEEDS_REPLY").length,
    };
    return { items: sliced, buckets, queues };
  }

  /** §10 — record an inbox click for click-through metrics. */
  async recordClick(messageId: string, roomId?: string) {
    return this.recordEvent("CLICK", "CLICK", { messageId, roomId });
  }

  // ── §3 bookmarks and pins ─────────────────────────────────────────────────

  async pin(input: PinInput) {
    const profile = await this.getProfile();
    await this.recordEvent("PIN", input.pinned === false ? "UNPIN" : "PIN", { roomId: input.kind === "ROOM" ? input.refId : undefined, reason: `${input.kind}:${input.refId}` }).catch(() => {});
    return prisma.chatPinnedItem.upsert({
      where: { profileId_kind_refId: { profileId: profile.id, kind: input.kind, refId: input.refId } },
      create: { profileId: profile.id, kind: input.kind, refId: input.refId, shared: input.shared ?? false, pinned: true, pinUntil: input.pinUntil ?? null, pinUntilResolved: input.pinUntilResolved ?? false, note: input.note, position: input.position ?? 0 },
      update: { pinned: input.pinned === false ? false : true, shared: input.shared, pinUntil: input.pinUntil ?? null, pinUntilResolved: input.pinUntilResolved, note: input.note, position: input.position },
    });
  }

  async unpin(kind: PinKind, refId: string) {
    const profile = await this.getProfile();
    await this.recordEvent("PIN", "UNPIN", { reason: `${kind}:${refId}` }).catch(() => {});
    return prisma.chatPinnedItem.updateMany({ where: { profileId: profile.id, kind, refId }, data: { pinned: false, pinUntil: null, pinUntilResolved: false } });
  }

  async listPins(now = new Date()) {
    const profile = await this.getProfile();
    const pins = await prisma.chatPinnedItem.findMany({ where: { profileId: profile.id }, orderBy: [{ pinned: "desc" }, { position: "asc" }, { createdAt: "desc" }] });
    const unresolved = new Set<string>();
    const approvals = pins.filter((p) => p.kind === "APPROVAL");
    const tasks = pins.filter((p) => p.kind === "TASK");
    if (approvals.length > 0) {
      const reqs = await prisma.approvalRequest.findMany({
        where: { sourceMessageId: { in: approvals.map((p) => p.refId) } },
        select: { sourceMessageId: true, status: true },
      });
      for (const r of reqs) {
        if (r.status !== "APPROVED" && r.status !== "REJECTED") unresolved.add(`APPROVAL:${r.sourceMessageId}`);
      }
      for (const p of approvals) {
        if (!reqs.some((r) => r.sourceMessageId === p.refId)) unresolved.add(`APPROVAL:${p.refId}`); // no request row yet → not resolved
      }
    }
    if (tasks.length > 0) {
      const done = await prisma.task.findMany({ where: { id: { in: tasks.map((p) => p.refId) }, completedAt: { not: null } }, select: { id: true } });
      const doneIds = new Set(done.map((t) => t.id));
      for (const p of tasks) {
        if (!doneIds.has(p.refId)) unresolved.add(`TASK:${p.refId}`);
      }
    }
    return pins.filter((p) => (!p.pinUntil || p.pinUntil > now) && (!p.pinUntilResolved || unresolved.has(`${p.kind}:${p.refId}`)));
  }

  async deletePin(kind: PinKind, refId: string) {
    const profile = await this.getProfile();
    return prisma.chatPinnedItem.deleteMany({ where: { profileId: profile.id, kind, refId } });
  }

  // ── §8 presets ────────────────────────────────────────────────────────────

  async applyPreset(name: PresetName) {
    const profile = await this.getProfile();
    const tpl = PRESET_TEMPLATES[name];
    await prisma.chatNotificationRule.deleteMany({ where: { profileId: profile.id, source: "PRESET" } });
    await prisma.chatDndWindow.deleteMany({ where: { profileId: profile.id, kind: { in: ["WORKDAY", "MEETING", "WEEKEND"] } } });
    const rules = [];
    for (const r of tpl.rules) {
      rules.push(await this.upsertRule({ ...r, source: "PRESET", reason: `preset: ${name}` }));
    }
    const dnd = [];
    for (const w of tpl.dnd) {
      dnd.push(await this.upsertDnd(w));
    }
    if (name === "MEETINGS" || name === "OFF_HOURS") {
      await this.updateProfile({ calendarAwareDnd: true });
    }
    await this.recordEvent("RECOMMENDATION", "PRESET", { reason: `preset: ${name}` }).catch(() => {});
    return { preset: name, rules: rules.length, dnd: dnd.length };
  }

  // ── §7 AI suggestions ─────────────────────────────────────────────────────

  async suggestions(): Promise<Suggestion[]> {
    const profile = await this.getProfile();
    if (!profile.aiSuggestionsEnabled) return [];
    const events = await prisma.chatPreferenceEvent.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 500 });
    const out: Suggestion[] = [];

    // Suggested mutes: rooms where the user suppresses a lot.
    const suppressedByRoom = new Map<string, { count: number; last: string }>();
    const deliveredByRoom = new Map<string, number>();
    const clicksByRoom = new Map<string, number>();
    const deliveredBySender = new Map<string, number>();
    const clicksBySender = new Map<string, number>();
    for (const e of events) {
      if (!e.roomId) continue;
      if (e.action === "SUPPRESSED" || e.action === "DIGESTED") {
        const cur = suppressedByRoom.get(e.roomId) ?? { count: 0, last: "" };
        cur.count += 1;
        cur.last = e.reason ?? "";
        suppressedByRoom.set(e.roomId, cur);
      }
      if (e.action === "DELIVERED") {
        deliveredByRoom.set(e.roomId, (deliveredByRoom.get(e.roomId) ?? 0) + 1);
        if (e.reason) {
          const m = /sender:"([^"]+)"/.exec(e.reason);
          if (m) deliveredBySender.set(m[1]!, (deliveredBySender.get(m[1]!) ?? 0) + 1);
        }
      }
      if (e.action === "CLICK") {
        clicksByRoom.set(e.roomId, (clicksByRoom.get(e.roomId) ?? 0) + 1);
        if (e.reason) {
          const m = /sender:"([^"]+)"/.exec(e.reason);
          if (m) clicksBySender.set(m[1]!, (clicksBySender.get(m[1]!) ?? 0) + 1);
        }
      }
    }
    for (const [roomId, s] of suppressedByRoom) {
      if (s.count >= 3) {
        out.push({
          id: `mute:${roomId}`,
          kind: "MUTE_RULE",
          payload: { scope: "room", value: roomId, mode: "DIGEST" },
          reason: `You ignored or suppressed ${s.count} alerts in this room recently.`,
          evidence: [{ metric: "suppressed", value: s.count }],
        });
      }
    }
    // Suggested VIPs: senders who get clicks.
    for (const [senderId, clicks] of clicksBySender) {
      const delivered = deliveredBySender.get(senderId) ?? 0;
      if (delivered >= 2 && clicks >= 1) {
        out.push({
          id: `vip:${senderId}`,
          kind: "VIP",
          payload: { scope: "sender", value: senderId, mode: "ALWAYS", urgency: 2, bypassDnd: false },
          reason: `You open ${clicks} of ${delivered} messages from this sender — promote to priority?`,
          evidence: [{ metric: "delivered", value: delivered }, { metric: "clicks", value: clicks }],
        });
      }
    }
    // Digest window suggestion.
    const offHours = events.filter((e) => {
      const h = e.createdAt.getUTCHours();
      return h >= 18 || h < 8;
    }).length;
    if (offHours >= 5 && !profile.digestEnabled) {
      out.push({
        id: "digest:window",
        kind: "DIGEST_WINDOW",
        payload: { digestEnabled: true },
        reason: `${offHours} notifications arrived outside working hours — collect them into a digest instead?`,
        evidence: [{ metric: "off-hours notifications", value: offHours }],
      });
    }
    // Pin suggestion for high-attention rooms.
    for (const [roomId, clicks] of clicksByRoom) {
      const delivered = deliveredByRoom.get(roomId) ?? 0;
      if (delivered >= 3 && clicks / delivered >= 0.5) {
        out.push({
          id: `pin:${roomId}`,
          kind: "PIN_ROOM",
          payload: { kind: "ROOM", refId: roomId },
          reason: `This room gets your attention ${Math.round((clicks / delivered) * 100)}% of the time — pin it to your priority inbox?`,
          evidence: [{ metric: "click-through", value: `${Math.round((clicks / delivered) * 100)}%` }],
        });
      }
    }
    // §7 — priority inbox category suggestion: busy rooms worth promoting.
    const alreadyPinned = new Set((await this.listPins()).filter((p) => p.kind === "ROOM").map((p) => p.refId));
    for (const [roomId, delivered] of deliveredByRoom) {
      if (delivered >= 5 && !alreadyPinned.has(roomId) && !suppressedByRoom.has(roomId)) {
        out.push({
          id: `cat:${roomId}`,
          kind: "PRIORITY_CATEGORY",
          payload: { kind: "ROOM", refId: roomId },
          reason: `${delivered} alerts from this room recently — add it to your priority inbox categories?`,
          evidence: [{ metric: "delivered", value: delivered }],
        });
      }
    }
    return out.slice(0, 8);
  }

  async acceptSuggestion(s: Suggestion) {
    const profile = await this.getProfile();
    await this.recordEvent("RECOMMENDATION", "ACCEPTED", { reason: s.kind }).catch(() => {});
    switch (s.kind) {
      case "MUTE_RULE":
      case "VIP":
        return this.upsertRule({ scope: s.payload.scope as RuleScope, value: String(s.payload.value), mode: s.payload.mode as RuleMode, urgency: Number(s.payload.urgency ?? 0), bypassDnd: Boolean(s.payload.bypassDnd), source: "SUGGESTED", reason: s.reason });
      case "DIGEST_WINDOW":
        return this.updateProfile({ digestEnabled: true });
      case "PIN_ROOM":
        return this.pin({ kind: "ROOM", refId: String(s.payload.refId) });
      case "PRIORITY_CATEGORY":
        return this.pin({ kind: "ROOM", refId: String(s.payload.refId) });
      default:
        return null;
    }
  }

  async dismissSuggestion(s: Suggestion) {
    await this.recordEvent("RECOMMENDATION", "REJECTED", { reason: s.kind }).catch(() => {});
    return { dismissed: true };
  }

  // ── §6 team/workspace defaults ───────────────────────────────────────────

  async listWorkspaceDefaults() {
    return prisma.chatWorkspaceDefaultRule.findMany({ where: { workspaceId: this.workspaceId }, orderBy: [{ urgency: "desc" }, { createdAt: "asc" }] });
  }

  async upsertWorkspaceDefault(input: RuleInput) {
    return prisma.chatWorkspaceDefaultRule.upsert({
      where: { workspaceId_scope_value: { workspaceId: this.workspaceId, scope: input.scope, value: input.value } },
      create: { workspaceId: this.workspaceId, scope: input.scope, value: input.value, mode: input.mode, urgency: input.urgency ?? 0, bypassDnd: input.bypassDnd ?? false, active: input.active ?? true, reason: input.reason },
      update: { mode: input.mode, urgency: input.urgency ?? 0, bypassDnd: input.bypassDnd ?? false, active: input.active ?? true, reason: input.reason },
    });
  }

  async deleteWorkspaceDefault(id: string) {
    return prisma.chatWorkspaceDefaultRule.deleteMany({ where: { id, workspaceId: this.workspaceId } });
  }

  // ── §8 rule tester ────────────────────────────────────────────────────────

  /** Evaluate a candidate rule against sample events without persisting. */
  async testRule(rule: RuleInput, samples: SampleEvent[]) {
    const out: Array<{ sample: SampleEvent; hit: boolean; mode: string | null; wouldNotify: boolean; note: string }> = [];
    for (const s of samples) {
      let hit = false;
      switch (rule.scope) {
        case "room": hit = s.roomId === rule.value; break;
        case "sender": hit = s.senderId === rule.value; break;
        case "keyword": hit = s.text.toLowerCase().includes(rule.value.toLowerCase()); break;
        case "mention": hit = s.messageType === "mention"; break;
        case "thread": hit = s.messageType === "thread_reply"; break;
        case "file": hit = s.messageType === "file"; break;
        case "task": hit = s.messageType === "task"; break;
        case "approval": hit = s.messageType === "approval"; break;
        case "channel": hit = s.channelType === rule.value; break;
        case "global": hit = true; break;
      }
      if (!hit) {
        out.push({ sample: s, hit: false, mode: null, wouldNotify: false, note: "no match — default behavior applies" });
        continue;
      }
      const mode = rule.mode;
      const wouldNotify = mode === "ALWAYS" || (mode === "MENTIONS_ONLY" && s.messageType === "mention");
      out.push({ sample: s, hit: true, mode, wouldNotify, note: `${mode}${rule.bypassDnd ? " (bypasses DND)" : ""}` });
    }
    return out;
  }

  // ── §10 telemetry ─────────────────────────────────────────────────────────

  async recentEvents(limit = 10) {
    const profile = await this.getProfile();
    return prisma.chatPreferenceEvent.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: limit });
  }

  async metrics(): Promise<Metrics> {
    const profile = await this.getProfile();
    const events = await prisma.chatPreferenceEvent.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 3000 });
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.action] = (counts[e.action] ?? 0) + 1;
    const delivered = counts.DELIVERED ?? 0;
    const suppressed = counts.SUPPRESSED ?? 0;
    const digested = counts.DIGESTED ?? 0;
    const bypassed = counts.BYPASSED ?? 0;
    const clicks = counts.CLICK ?? 0;
    const digestOpen = counts.DIGEST_OPEN ?? 0;
    const accepted = counts.ACCEPTED ?? 0;
    const rejected = counts.REJECTED ?? 0;
    const missedImportant = events.filter((e) => e.action === "SUPPRESSED" && (e.reason ?? "").includes("urgency=2") || e.action === "SUPPRESSED" && (e.reason ?? "").includes("urgency=3")).length;
    return {
      acceptanceRate: delivered + suppressed > 0 ? +(delivered / (delivered + suppressed)).toFixed(3) : null,
      dndOverrideFrequency: bypassed + suppressed > 0 ? +(bypassed / (bypassed + suppressed)).toFixed(3) : null,
      clickThroughRate: delivered > 0 ? +(clicks / delivered).toFixed(3) : null,
      pinUsage: counts.PIN ?? 0,
      digestOpenRate: digested > 0 ? +(digestOpen / digested).toFixed(3) : null,
      missedImportantRate: suppressed > 0 ? +(missedImportant / suppressed).toFixed(3) : null,
      recommendationAdjustRate: accepted + rejected > 0 ? +(accepted / (accepted + rejected)).toFixed(3) : null,
      totals: counts,
    };
  }

  /** Workspace-level rollup for admin dashboards. */
  static async workspaceMetrics(workspaceId: string) {
    const profiles = await prisma.chatPersonalizationProfile.findMany({ where: { workspaceId }, select: { id: true } });
    const events = await prisma.chatPreferenceEvent.findMany({ where: { profileId: { in: profiles.map((p) => p.id) } }, take: 20000 });
    const counts: Record<string, number> = {};
    for (const e of events) counts[e.action] = (counts[e.action] ?? 0) + 1;
    return { profiles: profiles.length, events: events.length, counts };
  }
}

function todayAt(now: Date, minutes: number): Date {
  const d = new Date(now);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function nextDayAt(now: Date, minutes: number): Date {
  const d = todayAt(now, minutes);
  d.setDate(d.getDate() + 1);
  return d;
}

function expiryFromMinutes(now: Date, endMin: number): Date {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin < endMin ? todayAt(now, endMin) : nextDayAt(now, endMin);
}

function nextWeekdayAt(now: Date, target: string, minutes: number): Date {
  const d = todayAt(now, minutes);
  const targetIdx = WEEKDAYS.indexOf(target as (typeof WEEKDAYS)[number]);
  for (let i = 1; i <= 7; i++) {
    const next = new Date(d);
    next.setDate(d.getDate() + i);
    if (next.getDay() === targetIdx) return next;
  }
  return d;
}

export { CHANNEL_TYPES, DND_KINDS, PRESETS, PIN_KINDS, RULE_MODES, RULE_SCOPES };
export type { ChannelType, DndKind, DndWindowInput, MessageType, Metrics, NotificationDecision, NotificationInput, PinInput, PinKind, PresetName, PriorityInboxItem, RuleInput, RuleMode, RuleScope, SampleEvent, Suggestion };