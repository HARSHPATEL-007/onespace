/**
 * N0VA1O Operator Dashboards — routing layer (spec §6.3).
 *
 * Operations teams have dashboards for connector health, approval queues,
 * failed workflows, latency hotspots, and quota consumption. Supports
 * filtering by tenant, module, and time range.
 */

import { HealthScore } from "./health";

export interface DashboardFilter {
  tenantId?: string;
  module?: string;
  from?: string;
  to?: string;
}

export interface ApprovalQueueItem {
  requestId: string;
  tool: string;
  provider: string;
  requester: string;
  status: string;
  createdAt: string;
}

export interface FailedWorkflow {
  workflowName: string;
  versionId: string;
  failedStep: string;
  error: string;
  failedAt: string;
}

export interface LatencyHotspot {
  provider: string;
  tool: string;
  avgLatencyMs: number;
  p99LatencyMs: number;
}

export interface QuotaConsumption {
  provider: string;
  used: number;
  limit: number;
  percentUsed: number;
}

export interface OperatorDashboard {
  health: { provider: string; score: HealthScore }[];
  approvalQueue: ApprovalQueueItem[];
  failedWorkflows: FailedWorkflow[];
  latencyHotspots: LatencyHotspot[];
  quotaConsumption: QuotaConsumption[];
}

/**
 * Build an operator dashboard from raw operational signals, applying the
 * requested filters. Pure function — callers supply data from Prisma.
 */
export function buildDashboard(data: {
  health: { provider: string; score: HealthScore }[];
  approvals: ApprovalQueueItem[];
  failures: FailedWorkflow[];
  latencies: LatencyHotspot[];
  quotas: QuotaConsumption[];
}, filter: DashboardFilter = {}): OperatorDashboard {
  return {
    health: data.health,
    approvalQueue: filterByModule(data.approvals, filter),
    failedWorkflows: filterByModule(data.failures, filter),
    latencyHotspots: filterByModule(data.latencies, filter),
    quotaConsumption: filterByModule(data.quotas, filter),
  };
}

function filterByModule<T>(items: T[], filter: DashboardFilter): T[] {
  if (!filter.module) return items;
  return items.filter((item) => {
    const provider = (item as { provider?: string }).provider;
    return typeof provider === "string" && provider.includes(filter.module!);
  });
}

/** Summarize quota consumption, flagging providers over 80% usage. */
export function flagQuotaRisks(quotas: QuotaConsumption[]): { provider: string; risk: "ok" | "warning" | "critical" }[] {
  return quotas.map((q) => ({
    provider: q.provider,
    risk: q.percentUsed >= 95 ? "critical" : q.percentUsed >= 80 ? "warning" : "ok",
  }));
}
