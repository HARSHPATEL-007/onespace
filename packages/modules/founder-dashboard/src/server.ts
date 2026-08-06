import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "founder-dashboard";

export interface FounderSnapshot {
  mrrCents: number;
  collectedCents: number;
  outstandingCents: number;
  openPipelineCents: number;
  wonCents: number;
  campaignsRunning: number;
  campaignSpentCents: number;
  openTickets: number;
  employees: number;
  members: number;
  docs: number;
  meetings: number;
  tasksOpen: number;
  sites: number;
  automations: number;
  integrations: number;
  devices: number;
  vaultEntries: number;
  incidentsOpen: number;
  avgSleep: number;
  checkinCount: number;
  activity: Array<{ date: string; count: number }>;
  recentAudit: Array<{ id: string; module: string; action: string; createdAt: Date }>;
}

export class FounderDashboardService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (!(await can(this.workspaceId, this.role, MODULE, "READ"))) {
      throw new Error("Missing READ permission for founder-dashboard");
    }
  }

  async snapshot(): Promise<FounderSnapshot> {
    await this.assert();
    const w = this.workspaceId;

    const [subscriptions, payments, invoices, deals, campaigns, tickets, employees, members, docs, meetRoomCount, tasks, sites, automations, integrations, devices, vaultEntries, incidents, checkins, auditLogs] =
      await Promise.all([
        prisma.subscription.findMany({ where: { workspaceId: w } }),
        prisma.payment.findMany({ where: { workspaceId: w, status: "SUCCEEDED" } }),
        prisma.invoice.findMany({ where: { workspaceId: w } }),
        prisma.deal.findMany({ where: { workspaceId: w } }),
        prisma.campaign.findMany({ where: { workspaceId: w } }),
        prisma.ticket.findMany({ where: { workspaceId: w } }),
        prisma.employee.findMany({ where: { workspaceId: w } }),
        prisma.workspaceMember.count({ where: { workspaceId: w } }),
        prisma.doc.count({ where: { workspaceId: w } }),
        prisma.meetRoom.count({ where: { workspaceId: w } }),
        prisma.task.findMany({ where: { workspaceId: w } }),
        prisma.site.count({ where: { workspaceId: w } }),
        prisma.automation.count({ where: { workspaceId: w } }),
        prisma.integration.count({ where: { workspaceId: w } }),
        prisma.endpointDevice.count({ where: { workspaceId: w } }),
        prisma.vaultEntry.count({ where: { workspaceId: w } }),
        prisma.incident.findMany({ where: { workspaceId: w } }),
        prisma.healthCheckin.findMany({ where: { workspaceId: w, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
        prisma.auditLog.findMany({ where: { workspaceId: w }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, module: true, action: true, createdAt: true } }),
      ]);

    const mrrCents = subscriptions.filter((s) => s.status !== "CHURNED").reduce((a, s) => a + s.mrrCents, 0);
    const collectedCents = payments.reduce((a, p) => a + p.amountCents, 0);
    const outstandingCents = invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce((a, i) => a + i.amountCents, 0);
    const openPipelineCents = deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST").reduce((a, d) => a + d.valueCents, 0);
    const wonCents = deals.filter((d) => d.stage === "WON").reduce((a, d) => a + d.valueCents, 0);
    const campaignSpentCents = campaigns.reduce((a, c) => a + c.spentCents, 0);
    const openTickets = tickets.filter((t) => t.status !== "RESOLVED").length;
    const activeEmployees = employees.filter((e) => e.status === "ACTIVE").length;
    const tasksOpen = tasks.filter((t) => t.completedAt === null).length;
    const incidentsOpen = incidents.filter((i) => i.status !== "RESOLVED").length;
    const avgSleep = checkins.length > 0 ? checkins.reduce((a, c) => a + c.sleepHours, 0) / checkins.length : 0;

    const buckets = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      buckets.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
    }
    for (const log of auditLogs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const activity = [...buckets.entries()].map(([date, count]) => ({ date, count }));

    return {
      mrrCents,
      collectedCents,
      outstandingCents,
      openPipelineCents,
      wonCents,
      campaignsRunning: campaigns.filter((c) => c.status === "RUNNING").length,
      campaignSpentCents,
      openTickets,
      employees: activeEmployees,
      members,
      docs,
      meetings: meetRoomCount,
      tasksOpen,
      sites,
      automations,
      integrations,
      devices,
      vaultEntries,
      incidentsOpen,
      avgSleep,
      checkinCount: checkins.length,
      activity,
      recentAudit: auditLogs.slice(0, 12),
    };
  }

  async logView(): Promise<void> {
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action: "founder_dashboard.viewed",
      targetType: "Dashboard",
      targetId: this.workspaceId,
    });
  }
}
