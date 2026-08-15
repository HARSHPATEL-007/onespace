import { prisma } from "@n0va/db";
import { STATUS } from "./constants";
import { ApprovalService } from "./server";

const RUNNING = new Set<string>();

/**
 * Background approval sweep: escalations, reminders, ERP sync retries.
 * Safe to run per-process (globalThis-cached); DB idempotent.
 * Interval defaults to 60s; pass 0 to run once and return.
 */
export function startApprovalSweep(opts: { intervalMs?: number; now?: boolean } = {}): { stop: () => void } {
  const intervalMs = opts.intervalMs ?? 60_000;
  const id = `approvals-sweep:${Math.random().toString(36).slice(2, 8)}`;

  const tick = async () => {
    if (RUNNING.has(id)) return;
    RUNNING.add(id);
    try {
      const workspaces = await prisma.approvalRequest.findMany({
        where: { status: STATUS.PENDING },
        distinct: ["workspaceId"],
        select: { workspaceId: true },
      });
      for (const { workspaceId } of workspaces) {
        try {
          const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
            orderBy: { joinedAt: "asc" },
            select: { userId: true, role: true },
          });
          if (!member) continue;
          const svc = new ApprovalService(workspaceId, member.userId, member.role);
          await svc.escalateForSweepAll();
          await svc.remindForSweep();
        } catch {
          // one workspace must not break the sweep
        }
      }
      const syncCandidates = await prisma.approvalRequest.findMany({
        where: { erpSyncStatus: "SYNC_FAILED" },
        distinct: ["workspaceId"],
        select: { workspaceId: true },
      });
      for (const { workspaceId } of syncCandidates) {
        try {
          const member = await prisma.workspaceMember.findFirst({
            where: { workspaceId, role: { in: ["OWNER", "ADMIN"] } },
            orderBy: { joinedAt: "asc" },
            select: { userId: true, role: true },
          });
          if (!member) continue;
          const svc = new ApprovalService(workspaceId, member.userId, member.role);
          await svc.retrySyncForSweep();
        } catch {
          // best-effort
        }
      }
    } catch {
      // sweep must never crash the host
    } finally {
      RUNNING.delete(id);
    }
  };

  if (opts.now ?? true) void tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref?.();
  return {
    stop: () => clearInterval(handle),
  };
}