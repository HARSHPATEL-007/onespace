import { prisma, logAudit, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

export const MODULE = "wellbeing";

const ROOM = "ROOM" as const;
const TEAM = "TEAM" as const;
const WORKSPACE = "WORKSPACE" as const;
type Scope = typeof ROOM | typeof TEAM | typeof WORKSPACE;
type Risk = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
type InterventionAction = "ACK" | "DISMISS" | "SNOOZE" | "APPLY";
export type { InterventionAction };

export interface RoomMetrics {
  scope: Scope;
  scopeId: string;
  scopeLabel: string | null;
  windowStart: Date;
  windowEnd: Date;
  messages: number;
  senders: number;
  members: number;
  sentiment: { score: number; trend: number; confidence: number; sampleSize: number };
  toxicity: { score: number; trend: number; confidence: number; sampleSize: number; flagged: number };
  engagement: {
    score: number;
    activeRatio: number;
    replyLatencySec: number;
    unanswered: number;
    threadCompletion: number;
    afterHoursRatio: number;
    balance: number;
    focusScore: number;
  };
  burnout: { risk: number; components: { workload: number; temporal: number; social: number; sentiment: number } };
  culture: {
    alignment: number;
    components: {
      toneConsistency: number;
      inclusion: number;
      decisionClarity: number;
      respectfulDisagreement: number;
      followThrough: number;
    };
  };
  environment: { comfort: number; available: boolean; details: Record<string, unknown> | null };
  fusion: {
    roomHealthScore: number;
    teamStressScore: number | null;
    riskLevel: Risk;
    contributingFactors: { signal: string; value: number; impact: number }[];
  };
}

export interface SnapshotInput {
  channelId?: string;
  windowHours?: number;
}

export interface EnvSample {
  roomRef: string;
  co2?: number;
  voc?: number;
  pm25?: number;
  temperatureC?: number;
  humidity?: number;
  lightLux?: number;
  noiseDb?: number;
  occupancy?: number;
  source?: string;
  recordedAt?: string;
}

export interface ConsentInput {
  granted: boolean;
  signals?: string[];
  sharedWith?: string[];
}

export interface BiometricInput {
  userId: string;
  signals: Record<string, number>;
  source?: string;
  recordedAt?: string;
}

export interface OverviewResponse {
  workspace: {
    snapshot: RoomMetrics | null;
    snapshotRow: Record<string, unknown> | null;
    funnel: { messages: number; replies: number; threads: number; decisions: number; actionItems: number };
  };
  rooms: {
    id: string;
    name: string;
    topic: string;
    kind: string;
    metrics: RoomMetrics | null;
    riskLevel: Risk;
    sentimentScore: number;
    engagementScore: number;
    burnoutRisk: number;
    trend: { sentiment: number; toxicity: number; burnout: number } | null;
  }[];
  interventions: Record<string, unknown>[];
  environment: { roomRef: string; comfort: number; details: Record<string, unknown> }[];
  biometrics: {
    consent: { granted: boolean; signals: string[]; sharedWith: string[] } | null;
    trends: { available: boolean; found: number; minRequired: number; data: Record<string, number | null> };
  };
}

export interface RoomDetailResponse {
  channel: { id: string; name: string; topic: string; kind: string; members: number };
  latest: RoomMetrics | null;
  series: Record<string, unknown>[];
  handled: Record<string, unknown>[];
}

const POS_WORDS = new Set([
  "good", "great", "excellent", "amazing", "awesome", "fantastic", "wonderful", "nice", "love", "loved",
  "thanks", "thank", "appreciate", "appreciated", "helpful", "helped", "solved", "clear", "agree", "agreed",
  "yes", "perfect", "happy", "glad", "support", "supports", "works", "worked", "win", "won", "success",
  "successful", "proud", "celebrate", "congrats", "congratulations", "progress", "improvement", "cheers",
  "best", "enjoy", "greatly", "brilliant", "impressive", "greatful", "grateful", "cool",
]);

const NEG_WORDS = new Set([
  "bad", "terrible", "awful", "horrible", "hate", "hated", "sucks", "stupid", "frustrating", "frustrated",
  "annoyed", "annoying", "angry", "upset", "worried", "stress", "stressed", "stressful", "burnout",
  "burnt", "overwhelmed", "unhelpful", "useless", "broken", "fails", "failed", "fail", "stuck", "blocked",
  "blocker", "late", "missed", "wrong", "issue", "issues", "bug", "bugs", "problem", "problems", "error",
  "errors", "confused", "confusing", "slow", "lag", "painful", "pain", "dislike", "disappointed",
  "disappointing", "sick", "tired", "exhausted", "delay", "delayed", "urgent", "unclear", "unfair",
]);

const INTENSIFIERS = new Set(["very", "really", "extremely", "super", "so", "totally", "absolutely", "quite", "way"]);
const NEGATORS = new Set(["not", "no", "never", "cannot", "can't", "didn't", "doesn't", "don't", "hardly", "rarely"]);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function scoreText(text: string): { score: number; confidence: number; hits: number } {
  const words = text.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
  let s = 0;
  let hits = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? "";
    if (!POS_WORDS.has(w) && !NEG_WORDS.has(w)) continue;
    let v = POS_WORDS.has(w) ? 1 : -1;
    const prev1 = words[i - 1] ?? "";
    const prev2 = words[i - 2] ?? "";
    if (i > 0 && INTENSIFIERS.has(prev1)) v *= 1.5;
    if ((i > 0 && NEGATORS.has(prev1)) || (i > 1 && NEGATORS.has(prev2))) v *= -0.65;
    s += v;
    hits++;
  }
  if (hits === 0) return { score: 0, confidence: 0.15, hits: 0 };
  return {
    score: clamp(s / Math.sqrt(hits + 4), -1, 1),
    confidence: Math.min(0.9, 0.25 + 0.65 * Math.min(1, hits / 8)),
    hits,
  };
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export class WellbeingService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for wellbeing`);
    }
  }

  private async audit(action: string, targetType: string, targetId: string) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId });
  }

  private async safeCount(model: "toxicityFlag" | "conflictAlert", where: object): Promise<number> {
    try {
      return await (prisma[model] as unknown as { count: (args: unknown) => Promise<number> }).count({ where });
    } catch {
      return 0;
    }
  }

  private async safeFind(model: "toxicityFlag" | "conflictAlert", where: object): Promise<{ createdAt: Date; resolvedAt: Date | null }[]> {
    try {
      return await (prisma[model] as unknown as {
        findMany: (args: unknown) => Promise<{ createdAt: Date; resolvedAt: Date | null }[]>;
      }).findMany({ where });
    } catch {
      return [];
    }
  }

  // ── aggregation core ────────────────────────────────────────────────

  private async computeMetrics(scope: Scope, scopeId: string, scopeLabel: string | null, windowStart: Date, windowEnd: Date): Promise<RoomMetrics> {
    const msgs = await prisma.chatMessage.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(scope === ROOM ? { channelId: scopeId } : {}),
        deletedAt: null,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, body: true, createdById: true, parentId: true, createdAt: true },
    });

    const parentIds = [...new Set(msgs.map((m) => m.parentId).filter((p): p is string => !!p))];
    const parentTimes = new Map<string, Date>();
    if (parentIds.length > 0) {
      const parents = await prisma.chatMessage.findMany({
        where: { id: { in: parentIds } },
        select: { id: true, createdAt: true },
      });
      for (const p of parents) parentTimes.set(p.id, p.createdAt);
    }

    const memberCount =
      scope === ROOM
        ? await prisma.chatMember.count({ where: { channelId: scopeId } })
        : await prisma.chatMember.count({ where: { channel: { workspaceId: this.workspaceId } } });

    const flags = await this.safeFind("toxicityFlag", {
      workspaceId: this.workspaceId,
      ...(scope === ROOM ? { channelId: scopeId } : {}),
      createdAt: { gte: windowStart },
    });

    const conflicts = await this.safeFind("conflictAlert", {
      workspaceId: this.workspaceId,
      ...(scope === ROOM ? { channelId: scopeId } : {}),
      createdAt: { gte: windowStart },
    });

    const threadFilter = scope === ROOM ? { channelId: scopeId } : { workspaceId: this.workspaceId };
    const threads = await prisma.threadMetadata.findMany({
      where: { ...threadFilter, createdAt: { gte: windowStart } },
      select: { id: true, replyCount: true },
    });

    const decisionsCount = await prisma.threadDecision.count({ where: { workspaceId: this.workspaceId, createdAt: { gte: windowStart } } });
    const actionItemsTotal = await prisma.threadActionItem.count({ where: { workspaceId: this.workspaceId, createdAt: { gte: windowStart } } });
    const actionItemsDone = await prisma.threadActionItem.count({
      where: { workspaceId: this.workspaceId, createdAt: { gte: windowStart }, confirmedAt: { not: null } },
    });

    const n = msgs.length;
    const senders = new Set(msgs.map((m) => m.createdById));
    const elapsedMs = windowEnd.getTime() - windowStart.getTime();
    const hours = Math.max(1, elapsedMs / 3_600_000);
    const halfLifeMs = elapsedMs * 0.25;
    const nowMs = windowEnd.getTime();

    let sentSum = 0;
    let sentWeight = 0;
    let confSum = 0;
    let confWeight = 0;
    let hitsMessages = 0;
    const sentScores: number[] = [];
    let afterHours = 0;
    const bySender = new Map<string, number>();
    const repliesByParent = new Map<string, number>();
    let minLatencySum = 0;
    let minLatencyCount = 0;
    const zeroAge = nowMs - windowStart.getTime() || 1;

    for (const m of msgs) {
      const weight = Math.exp(-Math.max(0, nowMs - m.createdAt.getTime()) / halfLifeMs);
      const scored = scoreText(m.body ?? "");
      if (scored.hits > 0) {
        sentSum += scored.score * weight;
        sentWeight += weight;
        confSum += scored.confidence * weight;
        confWeight += weight;
        hitsMessages++;
        sentScores.push(scored.score);
      }
      const d = m.createdAt;
      const hour = d.getUTCHours();
      const day = d.getUTCDay();
      const isAfterHours = hour < 9 || hour >= 17;
      const isWeekend = day === 0 || day === 6;
      if (isAfterHours || isWeekend) afterHours++;
      bySender.set(m.createdById, (bySender.get(m.createdById) ?? 0) + 1);
      if (m.parentId) {
        const pTime = parentTimes.get(m.parentId);
        repliesByParent.set(m.parentId, (repliesByParent.get(m.parentId) ?? 0) + 1);
        if (pTime) {
          const latency = Math.max(0, (m.createdAt.getTime() - pTime.getTime()) / 1000);
          const isFirstReply = repliesByParent.get(m.parentId) === 1;
          if (isFirstReply && latency <= 86_400) {
            minLatencySum += latency;
            minLatencyCount++;
          }
        }
      }
    }

    const sentimentScore = sentWeight > 0 ? clamp(sentSum / sentWeight, -1, 1) : 0;
    const sentimentConfidence = confWeight > 0 ? Math.min(0.95, 0.2 + confSum / confWeight) : 0.1;

    const sorted = [...msgs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const splitAt = Math.floor(sorted.length * 0.75);
    const recent = sorted.slice(splitAt);
    const older = sorted.slice(0, splitAt);
    const meanScore = (list: typeof sorted) => {
      let s = 0;
      let c = 0;
      for (const m of list) {
        const sc = scoreText(m.body ?? "");
        if (sc.hits > 0) {
          s += sc.score;
          c++;
        }
      }
      return c > 0 ? s / c : 0;
    };
    const sentimentTrend = clamp((meanScore(recent) - meanScore(older)) * 2.2, -1, 1);

    const flagged = flags.length;
    const toxicityScore = n > 0 ? clamp((flagged / n) * 12, 0, 1) : 0;
    const recentFlags = flags.filter((f) => f.createdAt.getTime() >= windowStart.getTime() + zeroAge * 0.75).length;
    const olderFlags = flagged - recentFlags;
    const toxicityTrend =
      n > 8 ? clamp(((recentFlags / Math.max(1, recent.length)) - (olderFlags / Math.max(1, older.length))) * 6, -1, 1) : 0;
    const toxicityConfidence = Math.min(0.9, 0.2 + flagged / 10);

    const activeRatio = n > 0 ? clamp(senders.size / Math.max(memberCount, 1), 0, 1) : 0;
    const replyLatencySec = minLatencyCount > 0 ? minLatencySum / minLatencyCount : 0;
    const latencyNorm = clamp(replyLatencySec / 1800, 0, 1);
    const rootMessages = msgs.filter((m) => !m.parentId);
    const unanswered = rootMessages.filter((m) => (m.body ?? "").includes("?") && !repliesByParent.has(m.id)).length;
    const unansweredNorm = clamp(unanswered / 20, 0, 1);
    const threadCompletion = threads.length > 0 ? threads.filter((t) => t.replyCount > 0).length / threads.length : 0;
    const afterHoursRatio = n > 0 ? afterHours / n : 0;
    const shares = [...bySender.values()].map((c) => c / n);
    const hhi = shares.reduce((a, b) => a + b * b, 0);
    const balance = shares.length > 1 ? (1 - hhi) / (1 - 1 / shares.length) : shares.length === 1 ? 0.5 : 0;
    const focusScore = clamp(1 - afterHoursRatio * 0.7 - latencyNorm * 0.3, 0, 1);
    const engagementScore = n > 0 ? 0.3 * activeRatio + 0.2 * (1 - latencyNorm) + 0.2 * threadCompletion + 0.15 * (1 - unansweredNorm) + 0.15 * balance : 0;

    const velocity = n / hours;
    const workload = clamp(velocity / 1.5, 0, 1);
    const temporal = clamp(afterHoursRatio * 1.4, 0, 1);
    const social = 1 - balance;
    const sentimentBurn = clamp((1 - sentimentScore) / 2, 0, 1);
    const burnout = clamp(0.4 * workload + 0.3 * temporal + 0.15 * social + 0.15 * sentimentBurn, 0, 1);

    const toneConsistency = 1 - clamp(stdev(sentScores), 0, 1);
    const decisionClarity = threads.length > 0 ? clamp(decisionsCount / threads.length, 0, 1) : 0;
    const resolvedConflicts = conflicts.filter((c) => c.resolvedAt !== null).length;
    const respectfulDisagreement = conflicts.length > 0 ? resolvedConflicts / conflicts.length : 1;
    const followThrough = actionItemsTotal > 0 ? actionItemsDone / actionItemsTotal : 0.5;
    const cultureAlignment = clamp(
      0.25 * toneConsistency + 0.25 * balance + 0.2 * decisionClarity + 0.15 * respectfulDisagreement + 0.15 * followThrough,
      0,
      1,
    );

    const d1 = clamp(((1 - sentimentScore) / 2) * 1.1, 0, 0.4);
    const d2 = clamp(toxicityScore, 0, 0.4);
    const d3 = clamp(burnout, 0, 0.4);
    const d4 = clamp((1 - engagementScore) * 0.6, 0, 0.3);
    const roomHealthScore = clamp(1 - (d1 + d2 + d3 + d4), 0, 1);
    const riskLevel: Risk = roomHealthScore >= 0.75 ? "LOW" : roomHealthScore >= 0.55 ? "MODERATE" : roomHealthScore >= 0.35 ? "HIGH" : "CRITICAL";
    const contributingFactors = [
      { signal: "sentiment", value: sentimentScore, impact: d1 },
      { signal: "toxicity", value: toxicityScore, impact: d2 },
      { signal: "burnout", value: burnout, impact: d3 },
      { signal: "engagement", value: engagementScore, impact: d4 },
    ]
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);

    return {
      scope,
      scopeId,
      scopeLabel,
      windowStart,
      windowEnd,
      messages: n,
      senders: senders.size,
      members: memberCount,
      sentiment: { score: sentimentScore, trend: sentimentTrend, confidence: sentimentConfidence, sampleSize: hitsMessages },
      toxicity: { score: toxicityScore, trend: toxicityTrend, confidence: toxicityConfidence, sampleSize: flagged, flagged },
      engagement: {
        score: engagementScore,
        activeRatio,
        replyLatencySec,
        unanswered,
        threadCompletion,
        afterHoursRatio,
        balance,
        focusScore,
      },
      burnout: { risk: burnout, components: { workload, temporal, social, sentiment: sentimentBurn } },
      culture: {
        alignment: cultureAlignment,
        components: { toneConsistency, inclusion: balance, decisionClarity, respectfulDisagreement, followThrough },
      },
      environment: { comfort: 0, available: false, details: null },
      fusion: { roomHealthScore, teamStressScore: null, riskLevel, contributingFactors },
    };
  }

  private async mergeEnvironment(metrics: RoomMetrics): Promise<RoomMetrics> {
    const readings = await prisma.environmentalReading.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ roomRef: "asc" }, { recordedAt: "desc" }],
      take: 50,
    });
    const latest = new Map<string, Prisma.EnvironmentalReadingGetPayload<{}>>();
    for (const r of readings) if (!latest.has(r.roomRef)) latest.set(r.roomRef, r);
    if (latest.size === 0) return metrics;
    const comfort = [...latest.values()].reduce((a, r) => a + computeComfort(r), 0) / latest.size;
    const details: Record<string, unknown> = Object.fromEntries(
      [...latest.entries()].map(([roomRef, r]) => [roomRef, { comfort: computeComfort(r), temperatureC: r.temperatureC, noiseDb: r.noiseDb, co2: r.co2 }]),
    );
    return { ...metrics, environment: { comfort, available: true, details } };
  }

  // ── snapshots ───────────────────────────────────────────────────────

  private async persistSnapshot(metrics: RoomMetrics, windowHours: number) {
    const start = metrics.windowStart;
    const existing = await prisma.healthSnapshot.findFirst({
      where: { workspaceId: this.workspaceId, scope: metrics.scope, scopeId: metrics.scopeId, windowHours, windowStart: start },
      orderBy: { createdAt: "desc" },
    });
    const row: Prisma.HealthSnapshotUncheckedCreateInput = {
      workspaceId: this.workspaceId,
      scope: metrics.scope as Prisma.HealthSnapshotUncheckedCreateInput["scope"],
      scopeId: metrics.scopeId,
      scopeLabel: metrics.scopeLabel,
      windowHours,
      windowStart: metrics.windowStart,
      windowEnd: metrics.windowEnd,
      sentimentScore: metrics.sentiment.score,
      sentimentTrend: metrics.sentiment.trend,
      sentimentConfidence: metrics.sentiment.confidence,
      sentimentSampleSize: metrics.sentiment.sampleSize,
      toxicityScore: metrics.toxicity.score,
      toxicityTrend: metrics.toxicity.trend,
      toxicityConfidence: metrics.toxicity.confidence,
      toxicitySampleSize: metrics.toxicity.sampleSize,
      engagementScore: metrics.engagement.score,
      engagementDetails: { ...metrics.engagement } as Prisma.InputJsonValue,
      burnoutRisk: metrics.burnout.risk,
      burnoutComponents: metrics.burnout.components as Prisma.InputJsonValue,
      cultureAlignment: metrics.culture.alignment,
      cultureComponents: metrics.culture.components as Prisma.InputJsonValue,
      environmentComfort: metrics.environment.comfort,
      environmentDetails: metrics.environment.details as Prisma.HealthSnapshotUncheckedCreateInput["environmentDetails"],
      roomHealthScore: metrics.fusion.roomHealthScore,
      teamStressScore: metrics.fusion.teamStressScore ?? undefined,
      riskLevel: metrics.fusion.riskLevel as Prisma.HealthSnapshotUncheckedCreateInput["riskLevel"],
      contributingFactors: metrics.fusion.contributingFactors as Prisma.InputJsonValue,
      createdById: this.userId,
    };
    if (existing) {
      const { workspaceId: _ws, ...update } = row;
      void _ws;
      return prisma.healthSnapshot.update({ where: { id: existing.id }, data: update });
    }
    return prisma.healthSnapshot.create({ data: row });
  }

  private rowToMetrics(row: {
    scope: string;
    scopeId: string;
    scopeLabel: string | null;
    windowStart: Date;
    windowEnd: Date;
    sentimentScore: number;
    sentimentTrend: number;
    sentimentConfidence: number;
    sentimentSampleSize: number;
    toxicityScore: number;
    toxicityTrend: number;
    toxicityConfidence: number;
    toxicitySampleSize: number;
    engagementScore: number;
    engagementDetails: unknown;
    burnoutRisk: number;
    burnoutComponents: unknown;
    cultureAlignment: number;
    cultureComponents: unknown;
    environmentComfort: number;
    environmentDetails: unknown;
    roomHealthScore: number;
    teamStressScore: number | null;
    riskLevel: Risk;
    contributingFactors: unknown;
  }): RoomMetrics {
    const engagement = (row.engagementDetails ?? {}) as Record<string, number>;
    const burnoutComponents = (row.burnoutComponents ?? {}) as RoomMetrics["burnout"]["components"];
    const cultureComponents = (row.cultureComponents ?? {}) as RoomMetrics["culture"]["components"];
    return {
      scope: row.scope as Scope,
      scopeId: row.scopeId,
      scopeLabel: row.scopeLabel,
      windowStart: row.windowStart,
      windowEnd: row.windowEnd,
      messages: row.sentimentSampleSize,
      senders: 0,
      members: 0,
      sentiment: {
        score: row.sentimentScore,
        trend: row.sentimentTrend,
        confidence: row.sentimentConfidence,
        sampleSize: row.sentimentSampleSize,
      },
      toxicity: {
        score: row.toxicityScore,
        trend: row.toxicityTrend,
        confidence: row.toxicityConfidence,
        sampleSize: row.toxicitySampleSize,
        flagged: row.toxicitySampleSize,
      },
      engagement: {
        score: row.engagementScore,
        activeRatio: 0,
        replyLatencySec: (engagement.replyLatencySec as number) ?? 0,
        unanswered: 0,
        threadCompletion: 0,
        afterHoursRatio: 0,
        balance: 0,
        focusScore: 0,
      },
      burnout: { risk: row.burnoutRisk, components: burnoutComponents },
      culture: { alignment: row.cultureAlignment, components: cultureComponents },
      environment: {
        comfort: row.environmentComfort,
        available: row.environmentComfort > 0,
        details: (row.environmentDetails ?? null) as Record<string, unknown> | null,
      },
      fusion: {
        roomHealthScore: row.roomHealthScore,
        teamStressScore: row.teamStressScore,
        riskLevel: row.riskLevel,
        contributingFactors: (row.contributingFactors ?? []) as RoomMetrics["fusion"]["contributingFactors"],
      },
    };
  }

  async snapshotRoom(channelId: string, windowHours = 24): Promise<RoomMetrics> {
    await this.assert("CREATE");
    const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, workspaceId: this.workspaceId } });
    if (!channel) throw new Error("Channel not found");
    const end = new Date();
    const start = new Date(end.getTime() - windowHours * 3_600_000);
    let metrics = await this.computeMetrics(ROOM, channelId, channel.name, start, end);
    metrics = await this.mergeEnvironment(metrics);
    await this.persistSnapshot(metrics, windowHours);
    await this.audit("CREATE", "HealthSnapshot", metrics.scopeId);
    return metrics;
  }

  async snapshotWorkspace(windowHours = 24): Promise<RoomMetrics> {
    await this.assert("CREATE");
    const end = new Date();
    const start = new Date(end.getTime() - windowHours * 3_600_000);
    let metrics = await this.computeMetrics(WORKSPACE, this.workspaceId, null, start, end);
    metrics = await this.mergeEnvironment(metrics);
    const rooms = await prisma.chatChannel.findMany({ where: { workspaceId: this.workspaceId, archivedAt: null } });
    const roomBurnouts: { burnout: number; weight: number }[] = [];
    for (const room of rooms) {
      const roomMetrics = await this.computeMetrics(ROOM, room.id, room.name, start, end);
      const weight = Math.max(1, roomMetrics.messages);
      roomBurnouts.push({ burnout: roomMetrics.burnout.risk, weight });
    }
    if (roomBurnouts.length > 0) {
      const totalWeight = roomBurnouts.reduce((a, b) => a + b.weight, 0);
      metrics = {
        ...metrics,
        fusion: {
          ...metrics.fusion,
          teamStressScore: roomBurnouts.reduce((a, b) => a + (b.burnout * b.weight) / totalWeight, 0),
        },
      };
    }
    await this.persistSnapshot(metrics, windowHours);
    await this.audit("CREATE", "HealthSnapshot", this.workspaceId);
    return metrics;
  }

  async snapshotAllRooms(windowHours = 24): Promise<{ rooms: number }> {
    await this.assert("CREATE");
    const rooms = await prisma.chatChannel.findMany({ where: { workspaceId: this.workspaceId, archivedAt: null } });
    for (const room of rooms) {
      const end = new Date();
      const start = new Date(end.getTime() - windowHours * 3_600_000);
      let metrics = await this.computeMetrics(ROOM, room.id, room.name, start, end);
      metrics = await this.mergeEnvironment(metrics);
      await this.persistSnapshot(metrics, windowHours);
    }
    return { rooms: rooms.length };
  }

  async getLatest(scope: Scope, scopeId: string, windowHours: number): Promise<RoomMetrics | null> {
    const row = await prisma.healthSnapshot.findFirst({
      where: { workspaceId: this.workspaceId, scope, scopeId, windowHours },
      orderBy: { windowStart: "desc" },
    });
    return row ? this.rowToMetrics(row) : null;
  }

  // ── queries ─────────────────────────────────────────────────────────

  async getOverview(): Promise<OverviewResponse> {
    await this.assert("READ");
    let workspaceSnapshot = await this.getLatest(WORKSPACE, this.workspaceId, 24);
    if (!workspaceSnapshot) workspaceSnapshot = await this.snapshotWorkspace(24);
    const row = await prisma.healthSnapshot.findFirst({
      where: { workspaceId: this.workspaceId, scope: WORKSPACE, scopeId: this.workspaceId, windowHours: 24 },
      orderBy: { windowStart: "desc" },
    });

    const oneHourAgo = new Date(Date.now() - 3_600_000);
    const rooms = await prisma.chatChannel.findMany({ where: { workspaceId: this.workspaceId, archivedAt: null } });
    const roomCards: OverviewResponse["rooms"] = [];
    for (const room of rooms) {
      let metrics = await this.getLatest(ROOM, room.id, 24);
      let fresh = metrics && metrics.windowEnd >= oneHourAgo;
      if (!metrics || !fresh) {
        metrics = await this.snapshotRoom(room.id, 24);
        fresh = true;
      }
      const prev = await prisma.healthSnapshot.findFirst({
        where: { workspaceId: this.workspaceId, scope: ROOM, scopeId: room.id, windowHours: 24, windowStart: { lt: metrics.windowStart } },
        orderBy: { windowStart: "desc" },
      });
      roomCards.push({
        id: room.id,
        name: room.name,
        topic: room.topic ?? "",
        kind: room.kind,
        metrics,
        riskLevel: metrics.fusion.riskLevel,
        sentimentScore: metrics.sentiment.score,
        engagementScore: metrics.engagement.score,
        burnoutRisk: metrics.burnout.risk,
        trend: prev
          ? {
              sentiment: metrics.sentiment.score - (prev.sentimentScore ?? 0),
              toxicity: metrics.toxicity.score - (prev.toxicityScore ?? 0),
              burnout: metrics.burnout.risk - (prev.burnoutRisk ?? 0),
            }
          : null,
      });
    }

    const since = new Date(Date.now() - 24 * 3_600_000);
    const [messages, replies, threads, decisions, actionItems] = await Promise.all([
      prisma.chatMessage.count({ where: { workspaceId: this.workspaceId, deletedAt: null, createdAt: { gte: since } } }),
      prisma.chatMessage.count({ where: { workspaceId: this.workspaceId, deletedAt: null, createdAt: { gte: since }, parentId: { not: null } } }),
      prisma.threadMetadata.count({ where: { workspaceId: this.workspaceId, createdAt: { gte: since } } }),
      prisma.threadDecision.count({ where: { workspaceId: this.workspaceId, createdAt: { gte: since } } }),
      prisma.threadActionItem.count({ where: { workspaceId: this.workspaceId, createdAt: { gte: since } } }),
    ]);

    const interventions = await prisma.wellnessIntervention.findMany({
      where: {
        workspaceId: this.workspaceId,
        OR: [{ status: { in: ["SUGGESTED", "ACKNOWLEDGED", "SNOOZED"] } }, { status: "DISMISSED", dismissedAt: { gte: since } }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const sensorReadings = await prisma.environmentalReading.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ roomRef: "asc" }, { recordedAt: "desc" }],
      take: 200,
    });
    const latestByRoom = new Map<string, Prisma.EnvironmentalReadingGetPayload<{}>>();
    for (const r of sensorReadings) if (!latestByRoom.has(r.roomRef)) latestByRoom.set(r.roomRef, r);
    const environment = [...latestByRoom.entries()].map(([roomRef, r]) => ({
      roomRef,
      comfort: computeComfort(r),
      details: { co2: r.co2, temperatureC: r.temperatureC, noiseDb: r.noiseDb, humidity: r.humidity, lightLux: r.lightLux, occupancy: r.occupancy },
    }));

    const consent = await prisma.biometricConsent.findUnique({ where: { workspaceId_userId: { workspaceId: this.workspaceId, userId: this.userId } } });
    const biometrics: OverviewResponse["biometrics"] = {
      consent: consent
        ? { granted: consent.granted, signals: consent.signals, sharedWith: consent.sharedWith }
        : null,
      trends: await this.biometricTrends(),
    };

    await this.audit("READ", "HealthSnapshot", this.workspaceId);
    return {
      workspace: { snapshot: workspaceSnapshot, snapshotRow: row, funnel: { messages, replies, threads, decisions, actionItems } },
      rooms: roomCards,
      interventions,
      environment,
      biometrics,
    };
  }

  async getRoomDetail(channelId: string, days = 7, windowHours = 24): Promise<RoomDetailResponse> {
    await this.assert("READ");
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, workspaceId: this.workspaceId },
      include: { members: { select: { id: true } } },
    });
    if (!channel) throw new Error("Channel not found");
    const latest = await this.getLatest(ROOM, channelId, windowHours);
    const series = await prisma.healthSnapshot.findMany({
      where: { workspaceId: this.workspaceId, scope: ROOM, scopeId: channelId, windowHours, windowStart: { gte: new Date(Date.now() - days * 86_400_000) } },
      orderBy: { windowStart: "asc" },
    });
    const handled = await prisma.wellnessIntervention.findMany({
      where: { workspaceId: this.workspaceId, scope: ROOM, scopeId: channelId, status: { in: ["DISMISSED", "APPLIED"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    await this.audit("READ", "HealthSnapshot", channelId);
    return {
      channel: { id: channel.id, name: channel.name, topic: channel.topic ?? "", kind: channel.kind, members: channel.members.length },
      latest,
      series,
      handled,
    };
  }

  // ── interventions ───────────────────────────────────────────────────

  async evaluateInterventions(channelId?: string): Promise<{ created: number }> {
    await this.assert("CREATE");
    const scope: Scope = channelId ? ROOM : WORKSPACE;
    const scopeId = channelId ?? this.workspaceId;
    let metrics: RoomMetrics;
    if (channelId) {
      metrics = (await this.getLatest(ROOM, channelId, 24)) ?? (await this.snapshotRoom(channelId, 24));
    } else {
      metrics = (await this.getLatest(WORKSPACE, this.workspaceId, 24)) ?? (await this.snapshotWorkspace(24));
    }

    const existing = await prisma.wellnessIntervention.findMany({
      where: { workspaceId: this.workspaceId, scope, scopeId, status: { in: ["SUGGESTED", "ACKNOWLEDGED", "SNOOZED"] } },
    });
    const activeKinds = new Set<string>(existing.filter((i) => !i.snoozedUntil || i.snoozedUntil > new Date()).map((i) => i.kind));

    type Rule = { kind: string; severity: Risk; title: string; message: string; actions?: string[]; fires: boolean };
    const rules: Rule[] = [
      {
        kind: "BREAK_HUDDLE",
        severity: metrics.burnout.risk >= 0.75 ? "HIGH" : "MODERATE",
        title: "Break huddle for the room",
        message: `Burnout risk is ${Math.round(metrics.burnout.risk * 100)}% — sustained load detected. A short break huddle would help.`,
        actions: ["create_break_huddle", "suggest_focus_time"],
        fires: metrics.burnout.risk >= 0.6,
      },
      {
        kind: "REST_SUGGESTION",
        severity: "HIGH",
        title: "Rest suggested before escalation",
        message: "Workload pressure and after-hours activity are both elevated. Consider protecting the next hour.",
        actions: ["protect_next_hour", "defer_noncritical"],
        fires: metrics.burnout.risk >= 0.75,
      },
      {
        kind: "MODERATION_REVIEW",
        severity: metrics.toxicity.score >= 0.7 ? "HIGH" : "MODERATE",
        title: "Toxicity review recommended",
        message: `Toxicity signal is ${Math.round(metrics.toxicity.score * 100)}/100 with ${metrics.toxicity.flagged} flagged message(s). Review the queue.`,
        actions: ["open_moderation_queue", "notify_manager"],
        fires: metrics.toxicity.score >= 0.5 || metrics.toxicity.trend > 0.2,
      },
      {
        kind: "WORKLOAD_REBALANCE",
        severity: metrics.engagement.afterHoursRatio >= 0.6 ? "HIGH" : "MODERATE",
        title: "After-hours volume detected",
        message: `${Math.round(metrics.engagement.afterHoursRatio * 100)}% of recent activity is outside core hours. Consider rebalancing.`,
        actions: ["rebalance_assignments", "review_deadlines"],
        fires: metrics.engagement.afterHoursRatio >= 0.4,
      },
      {
        kind: "MANAGER_CHECKIN",
        severity: "MODERATE",
        title: "Sentiment dip — manager check-in",
        message: "Room sentiment is negative and sliding. A lightweight check-in could surface blockers early.",
        actions: ["start_checkin"],
        fires: metrics.sentiment.score < -0.15 && metrics.sentiment.trend < -0.2 && metrics.sentiment.sampleSize >= 5,
      },
      {
        kind: "ENVIRONMENT_ALERT",
        severity: "MODERATE",
        title: "Room environment outside comfort band",
        message: `Comfort index is ${Math.round(metrics.environment.comfort * 100)}/100. Check CO2, temperature or noise in the space.`,
        actions: ["open_environment_panel"],
        fires: metrics.environment.available && metrics.environment.comfort < 0.45,
      },
      {
        kind: "CELEBRATE_WINS",
        severity: "LOW",
        title: "High energy and warmth — celebrate",
        message: "Engagement and sentiment are both strong. Naming the win keeps the culture loop going.",
        actions: ["post_celebration"],
        fires: metrics.engagement.score >= 0.7 && metrics.sentiment.score > 0.2 && metrics.sentiment.sampleSize >= 10,
      },
    ];

    let created = 0;
    for (const rule of rules) {
      if (!rule.fires || activeKinds.has(rule.kind)) continue;
      await prisma.wellnessIntervention.create({
        data: {
          workspaceId: this.workspaceId,
          scope,
          scopeId,
          kind: rule.kind as Prisma.WellnessInterventionCreateInput["kind"],          severity: rule.severity,
          title: rule.title,
          message: rule.message,
          actions: (rule.actions ?? []) as Prisma.InputJsonValue,
          createdById: this.userId,
        },
      });
      created++;
    }
    if (created > 0) await this.audit("CREATE", "WellnessIntervention", scopeId);
    return { created };
  }

  async listInterventions(): Promise<Record<string, unknown>[]> {
    await this.assert("READ");
    return prisma.wellnessIntervention.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30,
    });
  }

  async respondToIntervention(id: string, action: InterventionAction, hours = 8): Promise<Record<string, unknown>> {
    await this.assert("UPDATE");
    const intervention = await prisma.wellnessIntervention.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!intervention) throw new Error("Intervention not found");
    const data: Prisma.WellnessInterventionUpdateInput = {};
    if (action === "ACK") data.status = "ACKNOWLEDGED";
    else if (action === "DISMISS") {
      data.status = "DISMISSED";
      data.dismissedBy = this.userId;
      data.dismissedAt = new Date();
    } else if (action === "SNOOZE") {
      data.status = "SNOOZED";
      data.snoozedUntil = new Date(Date.now() + hours * 3_600_000);
    } else {
      data.status = "APPLIED";
    }
    const updated = await prisma.wellnessIntervention.update({ where: { id }, data });
    await this.audit("UPDATE", "WellnessIntervention", id);
    return updated;
  }

  // ── environment ─────────────────────────────────────────────────────

  async ingestEnvironment(batch: EnvSample[]): Promise<{ ingested: number }> {
    await this.assert("CREATE");
    if (batch.length === 0) return { ingested: 0 };
    const now = new Date();
    await prisma.environmentalReading.createMany({
      data: batch.map((s) => ({
        workspaceId: this.workspaceId,
        roomRef: s.roomRef,
        co2: s.co2 ?? null,
        voc: s.voc ?? null,
        pm25: s.pm25 ?? null,
        temperatureC: s.temperatureC ?? null,
        humidity: s.humidity ?? null,
        lightLux: s.lightLux ?? null,
        noiseDb: s.noiseDb ?? null,
        occupancy: s.occupancy ?? null,
        source: s.source ?? "sensor",
        recordedAt: s.recordedAt ? new Date(s.recordedAt) : now,
      })),
    });
    await this.audit("CREATE", "EnvironmentalReading", batch.map((s) => s.roomRef).join(","));
    const latest = await prisma.environmentalReading.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ roomRef: "asc" }, { recordedAt: "desc" }],
      take: 200,
    });
    const latestByRoom = new Map<string, Prisma.EnvironmentalReadingGetPayload<{}>>();
    for (const r of latest) if (!latestByRoom.has(r.roomRef)) latestByRoom.set(r.roomRef, r);
    void latestByRoom;
    return { ingested: batch.length };
  }

  async roomComfort(roomRef: string): Promise<{ roomRef: string; comfort: number; details: Record<string, unknown> }> {
    await this.assert("READ");
    const latest = await prisma.environmentalReading.findFirst({
      where: { workspaceId: this.workspaceId, roomRef },
      orderBy: { recordedAt: "desc" },
    });
    if (!latest) return { roomRef, comfort: 0, details: {} };
    return {
      roomRef,
      comfort: computeComfort(latest),
      details: { co2: latest.co2, temperatureC: latest.temperatureC, noiseDb: latest.noiseDb, humidity: latest.humidity, lightLux: latest.lightLux, occupancy: latest.occupancy },
    };
  }

  // ── biometrics ──────────────────────────────────────────────────────

  async getConsent(): Promise<{ granted: boolean; signals: string[]; sharedWith: string[] } | null> {
    await this.assert("READ");
    const consent = await prisma.biometricConsent.findUnique({
      where: { workspaceId_userId: { workspaceId: this.workspaceId, userId: this.userId } },
    });
    return consent ? { granted: consent.granted, signals: consent.signals, sharedWith: consent.sharedWith } : null;
  }

  async setConsent(input: ConsentInput): Promise<{ granted: boolean; signals: string[]; sharedWith: string[] }> {
    await this.assert("UPDATE");
    const allowed = new Set(["hrv", "resting_hr", "sleep", "stress", "activity"]);
    const signals = (input.signals ?? []).filter((s) => allowed.has(s));
    const shared = (input.sharedWith ?? ["team"]).filter((s) => ["self", "team", "manager", "workspace"].includes(s));
    const existing = await prisma.biometricConsent.findUnique({
      where: { workspaceId_userId: { workspaceId: this.workspaceId, userId: this.userId } },
    });
    const consent = existing
      ? await prisma.biometricConsent.update({
          where: { id: existing.id },
          data: { granted: input.granted, signals, sharedWith: shared, optOutAt: input.granted ? null : new Date() },
        })
      : await prisma.biometricConsent.create({
          data: { workspaceId: this.workspaceId, userId: this.userId, granted: input.granted, signals, sharedWith: shared },
        });
    await this.audit(input.granted ? "UPDATE" : "DELETE", "BiometricConsent", consent.id);
    return { granted: consent.granted, signals: consent.signals, sharedWith: consent.sharedWith };
  }

  async ingestBiometrics(batch: BiometricInput[]): Promise<{ accepted: number; rejected: { userId: string; reason: string }[] }> {
    await this.assert("CREATE");
    const consents = await prisma.biometricConsent.findMany({ where: { workspaceId: this.workspaceId, granted: true } });
    const granted = new Map(consents.map((c) => [c.userId, c]));
    const accepted: Prisma.BiometricReadingCreateManyInput[] = [];
    const rejected: { userId: string; reason: string }[] = [];
    const now = new Date();
    for (const sample of batch) {
      const consent = granted.get(sample.userId);
      if (!consent) {
        rejected.push({ userId: sample.userId, reason: "no_active_consent" });
        continue;
      }
      const usable = Object.fromEntries(Object.entries(sample.signals).filter(([k]) => consent.signals.includes(k)));
      if (Object.keys(usable).length === 0) {
        rejected.push({ userId: sample.userId, reason: "no_consented_signals" });
        continue;
      }
      accepted.push({
        workspaceId: this.workspaceId,
        userId: sample.userId,
        signals: usable as Prisma.InputJsonValue,
        source: sample.source ?? "device",
        recordedAt: sample.recordedAt ? new Date(sample.recordedAt) : now,
      });
    }
    if (accepted.length > 0) await prisma.biometricReading.createMany({ data: accepted });
    await this.audit("CREATE", "BiometricReading", `${accepted.length} readings`);
    return { accepted: accepted.length, rejected };
  }

  async biometricTrends(): Promise<{ available: boolean; found: number; minRequired: number; data: Record<string, number | null> }> {
    await this.assert("READ");
    const since = new Date(Date.now() - 14 * 86_400_000);
    const readings = await prisma.biometricReading.findMany({
      where: { workspaceId: this.workspaceId, recordedAt: { gte: since } },
      select: { userId: true, signals: true },
    });
    const users = new Set(readings.map((r) => r.userId));
    const MIN = 3;
    if (users.size < MIN) return { available: false, found: users.size, minRequired: MIN, data: {} };
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const r of readings) {
      const signals = r.signals as Record<string, number>;
      for (const [k, v] of Object.entries(signals)) {
        if (typeof v !== "number") continue;
        acc[k] = acc[k] ?? { sum: 0, n: 0 };
        acc[k].sum += v;
        acc[k].n++;
      }
    }
    const data: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(acc)) data[k] = v.n > 0 ? Math.round((v.sum / v.n) * 10) / 10 : null;
    return { available: true, found: users.size, minRequired: MIN, data };
  }
}

function computeComfort(r: { co2?: number | null; temperatureC?: number | null; humidity?: number | null; lightLux?: number | null; noiseDb?: number | null }): number {
  const parts: number[] = [];
  if (r.co2 != null) parts.push(clamp(1 - Math.max(0, (r.co2 - 600)) / 900, 0, 1));
  if (r.temperatureC != null) parts.push(clamp(1 - Math.abs(r.temperatureC - 21) / 8, 0, 1));
  if (r.humidity != null) parts.push(clamp(1 - Math.abs(r.humidity - 50) / 25, 0, 1));
  if (r.noiseDb != null) parts.push(clamp(1 - Math.abs(r.noiseDb - 47.5) / 27.5, 0, 1));
  if (r.lightLux != null) parts.push(clamp(1 - Math.abs(r.lightLux - 550) / 500, 0, 1));
  if (parts.length === 0) return 0;
  return Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) / 100;
}