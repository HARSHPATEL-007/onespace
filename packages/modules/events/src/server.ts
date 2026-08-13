/**
 * Event Bus — server-side entry (prisma + broker). Wire once at app startup:
 *
 *   const bus = createEventBus({ broker: createBroker() });
 *   await bus.start();
 *
 * Then emit events from any module via `emitEvent` (envelope + outbox in the
 * same tx); the relay loop pushes them to the broker; subscriptions drive
 * projections, sagas, and consumers. On shutdown call `bus.stop()`.
 */
import type { BrokerPort } from "./port";
import type { CanonicalEvent } from "./envelope";
import { topicFor } from "./envelope";
import { relayCycle, startRelayLoop, emitEvent } from "./server/outbox";
import { sweepIdempotency } from "./server/idempotency";
import { PROJECTORS, rebuildProjection } from "./server/projections";
import { driveSaga } from "./server/sagas";
import { busStats, replayEvents, traceEvent, traceLineage, latestEnvelopes, dlqItems, retryDlqItem, registerSubscription } from "./server/replay";
import { newCommand, executeCommand, commandNode, type CommandEnvelope, type CommandOptions, type ExecuteCommandResult } from "./server/commands";
import { redactPayload, redactForViewer, isSensitive } from "./security";

export * from "./envelope";
export * from "./normalize";
export * from "./port";
export * from "./adapters";
export * from "./security";
export {
  relayCycle,
  startRelayLoop,
  emitEvent,
  busStats,
  replayEvents,
  traceEvent,
  traceLineage,
  latestEnvelopes,
  dlqItems,
  retryDlqItem,
  registerSubscription,
  rebuildProjection,
  PROJECTORS,
  driveSaga,
  sweepIdempotency,
  newCommand,
  executeCommand,
  commandNode,
};
export type { CommandEnvelope, CommandOptions, ExecuteCommandResult };

export interface EventBusServerOptions {
  broker: BrokerPort;
  relayIntervalMs?: number;
  /** When true, relay loop + sweep loops run (set false for read-only workers). */
  runLoops?: boolean;
  logger?: (msg: string) => void;
}

export class EventBusServer {
  readonly broker: BrokerPort;
  private loops: Array<{ stop: () => void }> = [];
  private logger: (msg: string) => void;
  private started = false;

  constructor(opts: EventBusServerOptions) {
    this.broker = opts.broker;
    this.logger = opts.logger ?? (() => {});
    this.loops = [];
    if (opts.runLoops !== false) {
      this.loops.push(startRelayLoop({ broker: this.broker, intervalMs: opts.relayIntervalMs ?? 1500 }));
      this.loops.push({ stop: () => {} }); // sweep handled via setInterval below
      const sweepTimer = setInterval(() => {
        void sweepIdempotency().catch(() => {});
      }, 60_000);
      this.loops.push({ stop: () => clearInterval(sweepTimer) });
    }
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const health = await this.broker.health().catch(() => ({ ok: false }));
    this.logger(`[eventbus] broker=${this.broker.name} health=${health.ok ? "ok" : "degraded"}`);
  }

  /** Publish a pre-built event through the outbox + relay. */
  async emit(ev: CanonicalEvent): Promise<{ ok: boolean; errors: string[] }> {
    const result = await emitEvent(ev, this.broker.name);
    if (result.ok) {
      await relayCycle({ broker: this.broker });
    }
    return result;
  }

  /** Wire default subscriptions: projections + sagas consume the bus. */
  async wireDefaultSubscriptions(): Promise<void> {
    const sagaTriggers = ["approval.requested", "approval.decision", "calendar.event.scheduled", "crm.lead.updated", "invoice.flagged"];
    await registerSubscription("projections", PROJECTORS.flatMap((p) => p.handles));
    await registerSubscription("sagas", sagaTriggers);
    await this.broker.subscribe(sagaTriggers, "sagas", async ({ event }) => {
      await driveSaga(event).catch(() => {});
    });
    for (const projector of PROJECTORS) {
      await this.broker.subscribe(projector.handles, `projections:${projector.name}`, async ({ event }) => {
        await projector.apply(event).catch((e) => this.logger(`[projection:${projector.name}] error: ${e.message}`));
      });
    }
    this.logger("[eventbus] default subscriptions wired (projections + sagas)");
  }

  /** Topic routing helper. */
  topicFor(eventType: string, tenantId?: string): string {
    return topicFor(eventType, tenantId);
  }

  async stats(): Promise<Awaited<ReturnType<typeof busStats>>> {
    return busStats();
  }

  /** Broker consumer-group lag (redis streams) or null. */
  async lag(): Promise<number | null> {
    if (!this.broker.lag) return null;
    return this.broker.lag("n0va.events").catch(() => null);
  }

  /** Execute a causal command through this bus (command node + chained events). */
  async execute(
    commandType: string,
    payload: Record<string, unknown>,
    opts: CommandOptions,
    handler: (payload: Record<string, unknown>) => Promise<CanonicalEvent[]>,
  ): Promise<ExecuteCommandResult> {
    const cmd = newCommand(commandType, payload, opts);
    const emitFn = async (ev: CanonicalEvent) => this.emit(ev);
    return executeCommand(cmd, handler, emitFn);
  }

  async replay(opts: Parameters<typeof replayEvents>[0]): Promise<CanonicalEvent[]> {
    return replayEvents(opts);
  }

  async stop(): Promise<void> {
    for (const l of this.loops) l.stop();
    this.loops = [];
    await this.broker.disconnect();
    this.started = false;
    this.logger("[eventbus] stopped");
  }
}

/** Convenience factory. */
export function createEventBus(opts: Omit<EventBusServerOptions, "logger"> & { logger?: (msg: string) => void }): EventBusServer {
  return new EventBusServer(opts);
}