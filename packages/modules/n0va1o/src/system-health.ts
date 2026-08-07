/**
 * N0VA1O System Health Check — aggregates all subsystem statuses into a single
 * operational endpoint for load balancers, orchestrators, and operators.
 */

export type SubsystemStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface SubsystemHealth {
  name: string;
  status: SubsystemStatus;
  latencyMs: number;
  message: string;
  lastChecked: string;
}

export interface SystemHealth {
  status: SubsystemStatus;
  version: string;
  uptimeSeconds: number;
  subsystems: SubsystemHealth[];
  checkedAt: string;
}

/**
 * Check the health of a single subsystem. Pure — callers supply the check fn.
 */
export function checkSubsystem(name: string, check: () => { ok: boolean; message: string }): SubsystemHealth {
  const start = Date.now();
  try {
    const result = check();
    return { name, status: result.ok ? "healthy" : "degraded", latencyMs: Date.now() - start, message: result.message, lastChecked: new Date().toISOString() };
  } catch (err) {
    return { name, status: "unhealthy", latencyMs: Date.now() - start, message: err instanceof Error ? err.message : "Check failed", lastChecked: new Date().toISOString() };
  }
}

/**
 * Aggregate subsystem health into overall system health. Pure.
 */
export function aggregateHealth(subsystems: SubsystemHealth[], version: string, uptimeSeconds: number): SystemHealth {
  const hasUnhealthy = subsystems.some((s) => s.status === "unhealthy");
  const hasDegraded = subsystems.some((s) => s.status === "degraded");
  const status: SubsystemStatus = hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy";
  return { status, version, uptimeSeconds, subsystems, checkedAt: new Date().toISOString() };
}
