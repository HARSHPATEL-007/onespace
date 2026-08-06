import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import type { MoodLevel, EnergyLevel } from "@n0va/db";

const MODULE = "business-dashboard";

const MOOD_SCORE: Record<MoodLevel, number> = { LOW: 1, OK: 2, GOOD: 3, GREAT: 4 };
const ENERGY_SCORE: Record<EnergyLevel, number> = { LOW: 1, OK: 2, HIGH: 3 };

export interface DepartmentRow {
  name: string;
  employees: number;
  onLeave: number;
}

export interface BusinessSnapshot {
  departments: DepartmentRow[];
  ops: {
    deals: number;
    openDeals: number;
    dealValueCents: number;
    openPipelineCents: number;
    tickets: number;
    openTickets: number;
    campaigns: number;
    runningCampaigns: number;
    campaignSpentCents: number;
    incidents: number;
    openIncidents: number;
    invoices: number;
    outstandingCents: number;
    collectedCents: number;
    checkinCount: number;
    avgMood: number;
    avgEnergy: number;
  };
}

export class BusinessDashboardService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (!(await can(this.workspaceId, this.role, MODULE, "READ"))) {
      throw new Error("Missing READ permission for business-dashboard");
    }
  }

  async snapshot(): Promise<BusinessSnapshot> {
    await this.assert();
    const w = this.workspaceId;

    const [employees, deals, tickets, campaigns, incidents, invoices, payments, checkins] = await Promise.all([
      prisma.employee.findMany({ where: { workspaceId: w }, select: { id: true, department: true, status: true } }),
      prisma.deal.findMany({ where: { workspaceId: w } }),
      prisma.ticket.findMany({ where: { workspaceId: w } }),
      prisma.campaign.findMany({ where: { workspaceId: w } }),
      prisma.incident.findMany({ where: { workspaceId: w } }),
      prisma.invoice.findMany({ where: { workspaceId: w } }),
      prisma.payment.findMany({ where: { workspaceId: w, status: "SUCCEEDED" } }),
      prisma.healthCheckin.findMany({
        where: { workspaceId: w, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        select: { mood: true, energy: true },
      }),
    ]);

    const deptMap = new Map<string, DepartmentRow>();
    for (const e of employees) {
      const row = deptMap.get(e.department) ?? { name: e.department, employees: 0, onLeave: 0 };
      row.employees += 1;
      if (e.status === "INVITED" || e.status === "OFFBOARDED") row.onLeave += 1;
      deptMap.set(e.department, row);
    }

    const dealValueCents = deals.reduce((a, d) => a + d.valueCents, 0);
    const openPipelineCents = deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST").reduce((a, d) => a + d.valueCents, 0);

    return {
      departments: [...deptMap.values()].sort((a, b) => b.employees - a.employees),
      ops: {
        deals: deals.length,
        openDeals: deals.filter((d) => d.stage !== "WON" && d.stage !== "LOST").length,
        dealValueCents,
        openPipelineCents,
        tickets: tickets.length,
        openTickets: tickets.filter((t) => t.status !== "RESOLVED").length,
        campaigns: campaigns.length,
        runningCampaigns: campaigns.filter((c) => c.status === "RUNNING").length,
        campaignSpentCents: campaigns.reduce((a, c) => a + c.spentCents, 0),
        incidents: incidents.length,
        openIncidents: incidents.filter((i) => i.status !== "RESOLVED").length,
        invoices: invoices.length,
        outstandingCents: invoices.filter((i) => i.status === "SENT" || i.status === "OVERDUE").reduce((a, i) => a + i.amountCents, 0),
        collectedCents: payments.reduce((a, p) => a + p.amountCents, 0),
        checkinCount: checkins.length,
        avgMood: checkins.length > 0 ? checkins.reduce((a, c) => a + MOOD_SCORE[c.mood], 0) / checkins.length : 0,
        avgEnergy: checkins.length > 0 ? checkins.reduce((a, c) => a + ENERGY_SCORE[c.energy], 0) / checkins.length : 0,
      },
    };
  }

  async logView(): Promise<void> {
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action: "business_dashboard.viewed",
      targetType: "Dashboard",
      targetId: this.workspaceId,
    });
  }
}
