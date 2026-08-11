import { prisma } from "@n0va/db";

const MODULE = "analytics";

export interface AnalyticsEvent {
  module: string;
  action: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageSummary {
  module: string;
  actionCount: number;
  uniqueActors: number;
  lastActivity: Date;
}

export class AnalyticsService {
  constructor(private readonly workspaceId: string) {}

  async track(input: AnalyticsEvent) {
    return prisma.auditLog.create({
      data: {
        workspaceId: this.workspaceId,
        actorId: input.actorId ?? null,
        module: input.module,
        action: input.action,
        targetType: "AnalyticsEvent",
        targetId: null,
        metadata: input.metadata as never,
      },
    });
  }

  async usageByModule(days = 30): Promise<UsageSummary[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const results = await prisma.auditLog.groupBy({
      by: ["module"],
      where: { workspaceId: this.workspaceId, createdAt: { gte: since } },
      _count: { action: true, actorId: true },
      _max: { createdAt: true },
      orderBy: { _count: { action: "desc" } },
    });

    return results.map((r) => ({
      module: r.module,
      actionCount: r._count.action,
      uniqueActors: r._count.actorId,
      lastActivity: r._max.createdAt!,
    }));
  }

  async actorActivity(actorId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return prisma.auditLog.groupBy({
      by: ["module", "action"],
      where: { workspaceId: this.workspaceId, actorId, createdAt: { gte: since } },
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
    });
  }

  async dailyActiveUsers(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const results = await prisma.auditLog.groupBy({
      by: ["createdAt"],
      where: { workspaceId: this.workspaceId, createdAt: { gte: since } },
      _count: { actorId: true },
    });

    return results.map((r) => ({
      date: r.createdAt,
      uniqueUsers: r._count.actorId,
    }));
  }

  async topActions(limit = 20) {
    return prisma.auditLog.groupBy({
      by: ["module", "action"],
      where: { workspaceId: this.workspaceId },
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: limit,
    });
  }
}

export { MODULE };
