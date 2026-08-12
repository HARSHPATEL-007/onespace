/**
 * N0VA1O Gateway Commands — workspace/connector-scoped command reader and
 * dispatcher (spec §gateway CLI / server command surface).
 *
 * Commands map to gateway.gov ("governance") verbs; each returns a
 * structured result. Pure workspace-scoped; caller handles auth.
 */

import { prisma } from "@n0va/db";
import { N0va1oGateway } from "./gateway";
import { runRotationScan } from "./rotation";
import { resetCircuit, retryDlqEvent, connectorHealth, writeEventLog } from "./reliability";
import { listCheckpoints } from "./sync";

export type GatewayCommand =
  | "status"
  | "rotate"
  | "reset-circuit"
  | "retry-event"
  | "checkpoint"
  | "reset-checkpoint"
  | "health"
  | "replay";

export interface CommandContext {
  workspaceId: string;
  integrationId?: string;
  provider?: string;
  args?: Record<string, unknown>;
}

export interface CommandResult {
  command: GatewayCommand;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const COMMAND_HELP: Record<GatewayCommand, string> = {
  status: "gateway status [--provider p] — gateway + provider health",
  rotate: "gateway rotate [--integration id|--provider p] — force token rotation",
  "reset-circuit": "gateway reset-circuit --integration id — clear circuit breaker",
  "retry-event": "gateway retry-event --event id — re-queue a dead-lettered event",
  checkpoint: "gateway checkpoint --integration id --object type — show sync cursor",
  "reset-checkpoint": "gateway reset-checkpoint --integration id [--object type] — clear all cursors",
  health: "gateway health --integration id — connector health score",
  replay: "gateway replay [--limit 50] — replay N recent events",
};

export function gatewayHelp(): string[] {
  return Object.values(COMMAND_HELP);
}

export async function runCommand(command: GatewayCommand, ctx: CommandContext): Promise<CommandResult> {
  try {
    switch (command) {
      case "status": {
        if (ctx.provider) {
          const total = await prisma.integration.count({ where: { status: "ACTIVE" } });
          return { command, ok: true, data: { provider: ctx.provider, connections: total } };
        }
        const [active, circuits, pendingEvents] = await Promise.all([
          prisma.integration.count({ where: { status: "ACTIVE" } }),
          prisma.connectorCircuit.findMany({ where: { workspaceId: ctx.workspaceId } }),
          prisma.connectorEventLog.count({ where: { workspaceId: ctx.workspaceId, status: "PENDING" } }),
        ]);
        const open = circuits.filter((c) => c.state === "OPEN").map((c) => c.integrationId);
        return {
          command,
          ok: true,
          data: { active, openCircuits: open, pendingEvents },
        };
      }

      case "rotate": {
        const gateway = new N0va1oGateway();
        const all = await runRotationScan(gateway, ctx.workspaceId);
        const outcomes = all.filter(
          (o) => (!ctx.integrationId || o.connectionId === ctx.integrationId) && (!ctx.provider || o.provider === ctx.provider),
        );
        const ok = outcomes.length > 0 && outcomes.every((o) => o.outcome.refreshed);
        return { command, ok, data: outcomes, ...(ok ? {} : { error: "Nothing rotated or one or more rotations failed" }) };
      }

      case "reset-circuit": {
        if (!ctx.integrationId) return { command, ok: false, error: "--integration id required" };
        await resetCircuit(ctx.integrationId, ctx.workspaceId);
        return { command, ok: true, data: { integrationId: ctx.integrationId, state: "CLOSED" } };
      }

      case "retry-event": {
        const eventId = String(ctx.args?.event ?? "");
        if (!eventId) return { command, ok: false, error: "--event id required" };
        const result = await retryDlqEvent(eventId, ctx.workspaceId);
        return { command, ok: true, data: result };
      }

      case "checkpoint": {
        if (!ctx.integrationId) return { command, ok: false, error: "--integration id required" };
        const objectType = String(ctx.args?.object ?? "");
        if (objectType) {
          const cp = await prisma.connectorSyncCheckpoint.findUnique({ where: { integrationId_objectType: { integrationId: ctx.integrationId, objectType } } });
          return { command, ok: true, data: cp };
        }
        return { command, ok: true, data: await listCheckpoints(ctx.integrationId) };
      }

      case "reset-checkpoint": {
        if (!ctx.integrationId) return { command, ok: false, error: "--integration id required" };
        const objectType = String(ctx.args?.object ?? "");
        if (objectType) {
          await prisma.connectorSyncCheckpoint.deleteMany({ where: { integrationId: ctx.integrationId, objectType } });
        } else {
          await prisma.connectorSyncCheckpoint.deleteMany({ where: { integrationId: ctx.integrationId } });
        }
        return { command, ok: true, data: { integrationId: ctx.integrationId, cleared: objectType || "all" } };
      }

      case "health": {
        if (!ctx.integrationId) return { command, ok: false, error: "--integration id required" };
        return { command, ok: true, data: await connectorHealth(ctx.workspaceId, ctx.integrationId) };
      }

      case "replay": {
        const limit = Math.min(200, Number(ctx.args?.limit ?? 50));
        const events = await prisma.connectorEventLog.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { createdAt: "desc" },
          take: limit,
        });
        return { command, ok: true, data: events.map(({ id, direction, actionType, status, createdAt, error }) => ({ id, direction, actionType, status, createdAt, error })) };
      }
    }
  } catch (err) {
    return { command, ok: false, error: err instanceof Error ? err.message : "Command failed" };
  }
}

export async function listRecentCommands(workspaceId: string, limit = 20) {
  return prisma.connectorEventLog.findMany({
    where: { workspaceId, actionType: { startsWith: "CMD_" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function logCommand(workspaceId: string, command: GatewayCommand, ok: boolean, detail?: string) {
  await writeEventLog({
    workspaceId,
    integrationId: null,
    direction: "OUTBOUND",
    actionType: `CMD_${command.toUpperCase()}`,
    payload: { detail, ok },
    idempotencyKey: `cmd:${workspaceId}:${command}:${Date.now()}`,
  });
}