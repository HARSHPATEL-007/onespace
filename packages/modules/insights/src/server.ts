import { prisma, type AuditLog } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "insights";

export interface WorkspaceSnapshot {
  totalDocs: number;
  totalSlides: number;
  totalSheets: number;
  totalTasks: number;
  totalMeetings: number;
  totalMessages: number;
  totalFiles: number;
  totalSites: number;
  totalLearningSets: number;
  totalCallLogs: number;
  totalMembers: number;
  totalAutomations: number;
  totalIntegrations: number;
  totalDevices: number;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export class InsightsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (!(await can(this.workspaceId, this.role, MODULE, "READ"))) {
      throw new Error("Missing READ permission for insights");
    }
  }

  async snapshot(): Promise<WorkspaceSnapshot> {
    await this.assert();
    const w = this.workspaceId;
    const [
      totalDocs, totalSlides, totalSheets, totalTasks, totalMeetings, totalMessages,
      totalFiles, totalSites, totalLearningSets, totalCallLogs, totalMembers,
      totalAutomations, totalIntegrations, totalDevices,
    ] = await Promise.all([
      prisma.doc.count({ where: { workspaceId: w } }),
      prisma.presentation.count({ where: { workspaceId: w } }),
      prisma.spreadsheet.count({ where: { workspaceId: w } }),
      prisma.task.count({ where: { workspaceId: w } }),
      prisma.meetRoom.count({ where: { workspaceId: w } }),
      prisma.meetMessage.count({ where: { workspaceId: w } }),
      prisma.file.count({ where: { workspaceId: w } }),
      prisma.site.count({ where: { workspaceId: w } }),
      prisma.learningSet.count({ where: { workspaceId: w } }),
      prisma.callLog.count({ where: { workspaceId: w } }),
      prisma.workspaceMember.count({ where: { workspaceId: w } }),
      prisma.automation.count({ where: { workspaceId: w } }),
      prisma.integration.count({ where: { workspaceId: w } }),
      prisma.endpointDevice.count({ where: { workspaceId: w } }),
    ]);
    return {
      totalDocs, totalSlides, totalSheets, totalTasks, totalMeetings, totalMessages,
      totalFiles, totalSites, totalLearningSets, totalCallLogs, totalMembers,
      totalAutomations, totalIntegrations, totalDevices,
    };
  }

  async activity(days = 14): Promise<ActivityDay[]> {
    await this.assert();
    const since = new Date(Date.now() - days * 86_400_000);
    const logs = await prisma.auditLog.findMany({
      where: { workspaceId: this.workspaceId, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const log of logs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  async recentAudit(take = 40): Promise<AuditLog[]> {
    await this.assert();
    return prisma.auditLog.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
