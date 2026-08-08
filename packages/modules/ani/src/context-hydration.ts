import { prisma } from "@n0va/db";
import { type WorkspaceContext } from "./engine";

export interface ContextDimensions {
  activeModule: string;
  tenantHierarchy: string;
  userPreferences: Record<string, unknown>;
  projectMilestones: string[];
  meetingSentiment: string;
  crmPipeline: string;
  erpInventory: string;
  securityAlerts: string[];
  biometricStress: number;
  financialBudget: string;
  healthWellness: string;
  legalExposure: string;
  neuralFocusVector: number[];
  quantumChannelStatus: string;
  environmentalConditions: Record<string, number>;
  ecosystemQuotas: Record<string, number>;
}

export interface HydratedContext {
  workspaceId: string;
  userId: string;
  dimensions: ContextDimensions;
  assembledAt: string;
  tokenEstimate: number;
}

export async function hydrateContext(
  base: WorkspaceContext,
): Promise<HydratedContext> {
  const dims: ContextDimensions = {
    activeModule: base.activeModule,
    tenantHierarchy: base.tenantTier,
    userPreferences: {},
    projectMilestones: [],
    meetingSentiment: "neutral",
    crmPipeline: "unknown",
    erpInventory: "unknown",
    securityAlerts: [],
    biometricStress: 0.2,
    financialBudget: "unknown",
    healthWellness: "unknown",
    legalExposure: "low",
    neuralFocusVector: [0.8, 0.6, 0.9],
    quantumChannelStatus: "active",
    environmentalConditions: {},
    ecosystemQuotas: {},
  };

  try {
    const recentDocs = await prisma.doc.findMany({
      where: { workspaceId: base.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { title: true },
    });
    if (recentDocs.length > 0) {
      dims.projectMilestones.push(...recentDocs.map((d) => d.title));
    }
  } catch {
    /* */
  }

  try {
    const recentTasks = await prisma.task.findMany({
      where: { workspaceId: base.workspaceId, completedAt: null },
      take: 5,
      select: { title: true, priority: true },
      orderBy: { createdAt: "desc" },
    });
    if (recentTasks.length > 0) {
      dims.projectMilestones.push(
        ...recentTasks.map((t) => `${t.title} (${t.priority})`),
      );
    }
  } catch {
    /* */
  }

  try {
    const upcomingEvents = await prisma.calendarEvent.findMany({
      where: {
        workspaceId: base.workspaceId,
        startAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      take: 3,
      select: { title: true },
      orderBy: { startAt: "asc" },
    });
    if (upcomingEvents.length > 0) {
      dims.meetingSentiment = `${upcomingEvents.length} upcoming events`;
    }
  } catch {
    /* */
  }

  try {
    const integrations = await prisma.integration.count({
      where: { workspaceId: base.workspaceId, enabled: true },
    });
    dims.ecosystemQuotas = { activeIntegrations: integrations };
  } catch {
    /* */
  }

  const tokenEstimate = JSON.stringify(dims).length / 4;

  return {
    workspaceId: base.workspaceId,
    userId: base.userId,
    dimensions: dims,
    assembledAt: new Date().toISOString(),
    tokenEstimate,
  };
}

export function formatContextForPrompt(hydrated: HydratedContext): string {
  const d = hydrated.dimensions;
  return `
[CONTEXT HYDRATION — ${hydrated.assembledAt}]
Active Module: ${d.activeModule}
Tenant Tier: ${d.tenantHierarchy}
Recent Items: ${d.projectMilestones.slice(0, 5).join(", ") || "none"}
Meeting Schedule: ${d.meetingSentiment}
Active Integrations: ${d.ecosystemQuotas.activeIntegrations ?? 0}
Security Alerts: ${d.securityAlerts.length > 0 ? d.securityAlerts.join(", ") : "none"}
User Stress Level: ${d.biometricStress.toFixed(1)}/1.0
Neutral Focus: [${d.neuralFocusVector.map((v) => v.toFixed(1)).join(", ")}]
Legal Exposure: ${d.legalExposure}
`;
}
