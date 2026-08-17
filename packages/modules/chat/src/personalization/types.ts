/** Personalization layer types — spec §1–§10. */

export const RULE_SCOPES = ["room", "sender", "keyword", "mention", "thread", "file", "task", "approval", "channel", "global"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

export const RULE_MODES = ["ALWAYS", "MENTIONS_ONLY", "DIGEST", "SILENT"] as const;
export type RuleMode = (typeof RULE_MODES)[number];

export const CHANNEL_TYPES = ["desktop", "mobile", "email", "push"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const DND_KINDS = ["ONE_OFF", "RECURRING", "WORKDAY", "CALENDAR_BLOCK", "TRAVEL", "WEEKEND", "MEETING"] as const;
export type DndKind = (typeof DND_KINDS)[number];

export const PIN_KINDS = ["MESSAGE", "THREAD", "ROOM", "FILE", "TASK", "APPROVAL"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

export const MESSAGE_TYPES = ["normal", "mention", "thread_reply", "file", "task", "approval"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const PRESETS = ["FOCUS", "MEETINGS", "OFF_HOURS", "VIP_ONLY", "APPROVALS_ONLY", "CRISIS"] as const;
export type PresetName = (typeof PRESETS)[number];

export interface NotificationDecision {
  allowed: boolean; // deliver an interruptive notification now
  mode: "DELIVER" | "DIGEST" | "SUPPRESS";
  dnd: { active: boolean; windowId: string | null; kind: DndKind | null; expiresAt: Date | null; source: string | null };
  bypassedDnd: boolean;
  urgency: number;
  reason: string; // why-fired / why-suppressed, shown in UI
  matchedRuleId: string | null;
  matchedRuleScope: RuleScope | null;
  channelType: ChannelType;
}

export interface NotificationInput {
  userId: string;
  workspaceId: string;
  roomId?: string;
  senderId?: string;
  text?: string;
  messageType?: MessageType;
  threadOfMessageId?: string; // for thread_reply: does the user own the thread
  channelType?: ChannelType;
  messageId?: string;
  record?: boolean;
  now?: Date;
}

export interface PriorityInboxItem {
  messageId: string;
  roomId: string;
  roomName: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: Date;
  bucket: "NEEDS_REPLY" | "NEEDS_ACTION" | "FYI";
  queue: "internal" | "external";
  score: number;
  pinned: boolean;
  vips: boolean;
  unread: boolean;
}

export interface Suggestion {
  id: string;
  kind: "MUTE_RULE" | "VIP" | "DIGEST_WINDOW" | "PIN_ROOM" | "PRIORITY_CATEGORY";
  payload: Record<string, unknown>;
  reason: string;
  evidence: Array<{ metric: string; value: number | string }>;
}

export interface Metrics {
  acceptanceRate: number | null; // DELIVERED / (DELIVERED + SUPPRESSED)
  dndOverrideFrequency: number | null; // BYPASSED / DND-active decisions
  clickThroughRate: number | null; // CLICK / DELIVERED
  pinUsage: number; // PIN events
  digestOpenRate: number | null; // DIGEST_OPEN / DIGESTED
  missedImportantRate: number | null; // suppressed urgency>=2 / suppressed
  recommendationAdjustRate: number | null; // ACCEPTED / (ACCEPTED + REJECTED)
  totals: Record<string, number>;
}

export interface DndWindowInput {
  id?: string;
  kind: DndKind;
  days?: string[]; // ["mon","tue",...]
  startMin: number;
  endMin: number;
  startDate?: Date;
  endDate?: Date;
  calendarEventId?: string;
  active?: boolean;
}

export interface RuleInput {
  id?: string;
  scope: RuleScope;
  value: string;
  mode: RuleMode;
  urgency?: number;
  bypassDnd?: boolean;
  snoozeUntil?: Date | null;
  source?: "USER" | "SUGGESTED" | "PRESET";
  reason?: string;
  active?: boolean;
}

export interface PinInput {
  kind: PinKind;
  refId: string;
  shared?: boolean;
  pinUntil?: Date | null;
  pinUntilResolved?: boolean;
  note?: string;
  position?: number;
  pinned?: boolean;
}

/** §8 — sample event for the rule tester. */
export interface SampleEvent {
  roomId: string;
  senderId: string;
  text: string;
  messageType: MessageType;
  channelType: ChannelType;
}