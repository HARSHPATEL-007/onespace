import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "notifications";

const SIGNAL_WEIGHTS = {
  mention: 1.0,
  direct_message: 0.9,
  thread_owner: 0.8,
  keyword_match: 0.6,
  sender_importance: 0.7,
  sentiment_urgency: 0.5,
  time_sensitivity: 0.6,
  user_history: 0.4,
};

const CHANNEL_ESCALATION: Record<number, string[]> = {
  1: ["WEBSOCKET"],
  2: ["WEBSOCKET", "FCM"],
  3: ["WEBSOCKET", "FCM", "SMS"],
  4: ["WEBSOCKET", "FCM", "SMS", "EMAIL"],
};

export interface NotificationInput {
  recipientId: string;
  sourceType: string;
  sourceId?: string;
  roomId?: string;
  threadId?: string;
  title: string;
  body?: string;
  link?: string;
  signals?: Record<string, number>;
}

export interface ScoringResult {
  score: number;
  signals: Record<string, number>;
  channelPlan: string[];
  ruleHits: string[];
  suppressed: boolean;
  escalationLevel: number;
}

export class NotificationEngine {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for notifications`);
    }
  }

  async createEvent(input: NotificationInput): Promise<{ id: string; score: number; status: string }> {
    await this.assert("CREATE");

    const scoring = await this.scoreNotification(input);

    const event = await prisma.notificationEvent.create({
      data: {
        recipientId: input.recipientId,
        workspaceId: this.workspaceId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        roomId: input.roomId,
        threadId: input.threadId,
        title: input.title,
        body: input.body,
        link: input.link,
        signals: scoring.signals as any,
        priorityScore: scoring.score,
        channelPlan: scoring.channelPlan,
        ruleHits: scoring.ruleHits,
        status: scoring.suppressed ? "SUPPRESSED" : "DELIVERING",
        escalationLevel: scoring.escalationLevel,
      },
    });

    if (!scoring.suppressed && scoring.escalationLevel > 1) {
      await prisma.escalationRecord.create({
        data: {
          notificationId: event.id,
          userId: input.recipientId,
          workspaceId: this.workspaceId,
          currentLevel: 1,
          maxLevel: scoring.escalationLevel,
          nextEscalationAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    }

    return { id: event.id, score: scoring.score, status: event.status };
  }

  async scoreNotification(input: NotificationInput): Promise<ScoringResult> {
    const prefs = await prisma.userNotificationPrefs.findUnique({
      where: { userId_workspaceId: { userId: input.recipientId, workspaceId: this.workspaceId } },
    });

    const rules = await prisma.notificationRule.findMany({
      where: { userId: input.recipientId, workspaceId: this.workspaceId, enabled: true },
      orderBy: { order: "asc" },
    });

    const signals = this.computeSignals(input, prefs);
    let score = this.calculateScore(signals);
    const ruleHits: string[] = [];
    let suppressed = false;

    for (const rule of rules) {
      const matches = this.evaluateRule(rule, input, signals);
      if (matches) {
        ruleHits.push(rule.name);
        const actions = rule.actions as Array<{ type: string; value?: unknown }>;
        for (const action of actions) {
          if (action.type === "suppress") suppressed = true;
          if (action.type === "boost_score") score += Number(action.value) || 0;
          if (action.type === "reduce_score") score -= Number(action.value) || 0;
          if (action.type === "escalate") score = Math.max(score, 80);
        }
        if (rule.stopProcessing) break;
      }
    }

    if (prefs?.focusModeEnabled && score < 70) suppressed = true;
    if (this.isQuietHours(prefs) && score < 80) suppressed = true;

    score = Math.max(0, Math.min(100, score));
    const escalationLevel = this.determineEscalationLevel(score, prefs?.escalationLevel ?? 2);
    const channelPlan = CHANNEL_ESCALATION[escalationLevel] ?? ["WEBSOCKET"];

    return { score, signals, channelPlan, ruleHits, suppressed, escalationLevel };
  }

  private computeSignals(input: NotificationInput, prefs: any): Record<string, number> {
    const signals: Record<string, number> = { ...(input.signals ?? {}) };

    if (!signals.mention && input.sourceType.includes("mention")) signals.mention = 1.0;
    if (!signals.direct_message && input.sourceType.includes("dm")) signals.direct_message = 0.9;
    if (!signals.thread_owner && input.sourceType.includes("thread_reply")) signals.thread_owner = 0.8;

    if (prefs?.perRoomOverrides) {
      const roomBoost = (prefs.perRoomOverrides as any)[input.roomId ?? ""];
      if (roomBoost) signals.user_history = (signals.user_history || 0) + roomBoost;
    }

    return signals;
  }

  private calculateScore(signals: Record<string, number>): number {
    let score = 0;
    for (const [signal, value] of Object.entries(signals)) {
      const weight = (SIGNAL_WEIGHTS as any)[signal] ?? 0.3;
      score += value * weight * 100;
    }
    return Math.min(100, score);
  }

  private evaluateRule(rule: any, input: NotificationInput, signals: Record<string, number>): boolean {
    const conditions = rule.conditions as Array<{ field: string; operator: string; value: unknown }>;
    return conditions.every(cond => {
      const value = this.getFieldValue(cond.field, input, signals);
      switch (cond.operator) {
        case "from": return value === cond.value;
        case "in": return (value as string)?.includes(cond.value as string);
        case "has": return !!value;
        case "is": return value === cond.value;
        case "before": return new Date(value as string) < new Date(cond.value as string);
        case "after": return new Date(value as string) > new Date(cond.value as string);
        case "sentiment": return (signals.sentiment_urgency || 0) > 0.5;
        case "keyword": return (input.body ?? "").toLowerCase().includes((cond.value as string).toLowerCase());
        case "thread_owner": return (signals.thread_owner ?? 0) > 0;
        case "mentioned_me": return (signals.mention ?? 0) > 0;
        default: return false;
      }
    });
  }

  private getFieldValue(field: string, input: NotificationInput, signals: Record<string, number>): unknown {
    if (field === "roomId") return input.roomId;
    if (field === "sourceType") return input.sourceType;
    if (field === "senderId") return input.sourceId;
    if (field === "threadId") return input.threadId;
    return signals[field];
  }

  private isQuietHours(prefs: any): boolean {
    if (!prefs?.quietHoursStart || !prefs?.quietHoursEnd) return false;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = prefs.quietHoursStart.split(":").map(Number);
    const [endH, endM] = prefs.quietHoursEnd.split(":").map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
  }

  private determineEscalationLevel(score: number, maxLevel: number): number {
    if (score >= 90) return Math.min(4, maxLevel);
    if (score >= 70) return Math.min(3, maxLevel);
    if (score >= 40) return Math.min(2, maxLevel);
    return 1;
  }

  async acknowledgeEvent(eventId: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.notificationEvent.update({ where: { id: eventId }, data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() } });
    await prisma.escalationRecord.updateMany({ where: { notificationId: eventId }, data: { resolvedAt: new Date() } });
  }

  async getPriorityInbox(recipientId: string, limit = 50): Promise<any[]> {
    await this.assert("READ");
    return prisma.notificationEvent.findMany({
      where: { recipientId, workspaceId: this.workspaceId, status: { in: ["DELIVERING", "DELIVERED"] } },
      orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { deliveries: true },
    });
  }

  async createRule(userId: string, data: { name: string; conditions: any[]; actions: any[]; priority?: string; stopProcessing?: boolean }): Promise<any> {
    await this.assert("CREATE");
    const count = await prisma.notificationRule.count({ where: { userId, workspaceId: this.workspaceId } });
    return prisma.notificationRule.create({
      data: { userId, workspaceId: this.workspaceId, name: data.name, conditions: data.conditions as any, actions: data.actions as any, priority: (data.priority as any) ?? "NORMAL", stopProcessing: data.stopProcessing ?? false, order: count },
    });
  }

  async getDigest(recipientId: string, roomId?: string): Promise<any> {
    await this.assert("READ");
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const events = await prisma.notificationEvent.findMany({
      where: { recipientId, workspaceId: this.workspaceId, createdAt: { gte: since }, ...(roomId ? { roomId } : {}) },
      orderBy: { priorityScore: "desc" },
      take: 50,
    });

    if (events.length < 3) return null;

    return prisma.notificationDigest.create({
      data: {
        workspaceId: this.workspaceId, userId: recipientId, roomId,
        title: `${events.length} updates in the last hour`,
        summary: `Including ${events.filter(e => e.signals && (e.signals as any).mention > 0).length} mentions and ${events.filter(e => e.priorityScore >= 70).length} high-priority items.`,
        highlights: events.slice(0, 3).map(e => e.title) as any,
        messageCount: events.length, status: "READY",
      },
    });
  }
}
