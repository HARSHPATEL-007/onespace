import { prisma } from "@n0va/db";
import type { ChatBreakerState as BreakerState } from "@n0va/db";
import { DeliveryError } from "./errors";
import type { DeliveryPolicy } from "./types";

/**
 * Spec §3 — per-endpoint circuit breakers.
 *
 *  - per-target + per-path (read/write) breakers
 *  - sliding failure window (counters reset when the window expires)
 *  - open → half-open → closed transitions with probe traffic
 *  - cooldown timers
 *  - when open: fail fast (BREAKER_OPEN)
 */

export interface BreakerCheck {
  allowed: boolean;
  state: BreakerState;
  error?: DeliveryError;
}

export async function checkBreaker(
  workspaceId: string,
  target: string,
  path: "read" | "write",
  policy: DeliveryPolicy,
  now = new Date(),
): Promise<BreakerCheck> {
  if (!policy.circuitBreaker.enabled) {
    return { allowed: true, state: "CLOSED" };
  }

  const breaker = await prisma.chatBreaker.upsert({
    where: { workspaceId_target_path: { workspaceId, target, path } },
    create: { workspaceId, target, path },
    update: {},
  });

  const windowMs = policy.circuitBreaker.windowMs;
  const windowExpired = now.getTime() - breaker.windowStartedAt.getTime() > windowMs;

  if (breaker.state === "OPEN") {
    const cooldownUntil = breaker.cooldownUntil?.getTime() ?? 0;
    if (now.getTime() < cooldownUntil) {
      return { allowed: false, state: "OPEN", error: DeliveryError.breakerOpen(`circuit OPEN for ${target}:${path}`) };
    }
    // Cooldown expired → transition to half-open and allow probe traffic.
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: { state: "HALF_OPEN", halfOpenProbes: 0, lastProbeAt: now },
    });
    return { allowed: true, state: "HALF_OPEN" };
  }

  if (breaker.state === "HALF_OPEN") {
    const maxProbes = Math.max(1, policy.circuitBreaker.halfOpenProbes);
    if (breaker.halfOpenProbes >= maxProbes) {
      // Probe budget exhausted this cooldown window.
      return { allowed: false, state: "HALF_OPEN", error: DeliveryError.breakerOpen(`circuit HALF_OPEN probe budget exhausted for ${target}:${path}`) };
    }
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: { halfOpenProbes: { increment: 1 }, lastProbeAt: now },
    });
    return { allowed: true, state: "HALF_OPEN" };
  }

  // CLOSED
  if (windowExpired) {
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: { failures: 0, total: 0, windowStartedAt: now },
    });
  }
  return { allowed: true, state: "CLOSED" };
}

export async function recordBreakerSuccess(
  workspaceId: string,
  target: string,
  path: "read" | "write",
  now = new Date(),
): Promise<void> {
  const breaker = await prisma.chatBreaker.findUnique({ where: { workspaceId_target_path: { workspaceId, target, path } } });
  if (!breaker) return;
  const windowMs = 60_000;
  const windowExpired = now.getTime() - breaker.windowStartedAt.getTime() > windowMs;

  if (breaker.state === "HALF_OPEN") {
    // Probe succeeded → close the circuit.
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: { state: "CLOSED", failures: 0, total: 0, halfOpenProbes: 0, openedAt: null, cooldownUntil: null, lastError: null, windowStartedAt: now },
    });
    return;
  }
  if (windowExpired) {
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: { failures: 0, total: 1, windowStartedAt: now },
    });
    return;
  }
  await prisma.chatBreaker.update({
    where: { workspaceId_target_path: { workspaceId, target, path } },
    data: { total: { increment: 1 } },
  });
}

export async function recordBreakerFailure(
  workspaceId: string,
  target: string,
  path: "read" | "write",
  policy: DeliveryPolicy,
  error?: string,
  now = new Date(),
): Promise<void> {
  const breaker = await prisma.chatBreaker.findUnique({ where: { workspaceId_target_path: { workspaceId, target, path } } });
  if (!breaker) return;
  const windowMs = policy.circuitBreaker.windowMs;
  const windowExpired = now.getTime() - breaker.windowStartedAt.getTime() > windowMs;

  if (breaker.state === "HALF_OPEN") {
    // Probe failed → re-open the circuit with a fresh cooldown.
    const cooldownUntil = new Date(now.getTime() + policy.circuitBreaker.cooldownSec * 1000);
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: { state: "OPEN", failures: { increment: 1 }, total: { increment: 1 }, openedAt: now, cooldownUntil, halfOpenProbes: 0, lastError: error ?? "probe_failed", windowStartedAt: now },
    });
    return;
  }

  const failures = windowExpired ? 1 : breaker.failures + 1;
  const total = windowExpired ? 1 : breaker.total + 1;
  const rate = total > 0 ? failures / total : 1;

  if (rate >= policy.circuitBreaker.failureThreshold) {
    const cooldownUntil = new Date(now.getTime() + policy.circuitBreaker.cooldownSec * 1000);
    await prisma.chatBreaker.update({
      where: { workspaceId_target_path: { workspaceId, target, path } },
      data: {
        state: "OPEN",
        failures,
        total,
        windowStartedAt: now,
        openedAt: now,
        cooldownUntil,
        lastError: error ?? `failure_rate_${rate.toFixed(2)}`,
      },
    });
    return;
  }

  await prisma.chatBreaker.update({
    where: { workspaceId_target_path: { workspaceId, target, path } },
    data: { failures, total, windowStartedAt: windowExpired ? now : breaker.windowStartedAt, lastError: error ?? undefined },
  });
}

export async function breakerStates(workspaceId: string) {
  return prisma.chatBreaker.findMany({ where: { workspaceId }, orderBy: [{ state: "asc" }, { updatedAt: "desc" }] });
}

export async function resetBreaker(workspaceId: string, target: string, path: "read" | "write") {
  await prisma.chatBreaker.updateMany({
    where: { workspaceId, target, path },
    data: { state: "CLOSED", failures: 0, total: 0, openedAt: null, cooldownUntil: null, halfOpenProbes: 0, lastError: null },
  });
}