/**
 * Causal commands — intent, not state (Project Nexus).
 *
 * A command carries intent plus causality: command_id, actor identity,
 * target aggregate, expected version, idempotency key, and the prior event
 * it causally follows. Executing a command runs a domain handler whose
 * emitted events are chained (command → event₁ → event₂ → …) so the cause
 * chain is traceable end-to-end and safely replayable.
 */
import type { CanonicalEvent } from "../envelope";
import { EVENT_TYPES, dedupKeyFor } from "../envelope";

export interface CommandEnvelope {
  /** Unique command id, e.g. "cmd_<ts>_<producer>_<seq>". */
  commandId: string;
  /** Intent type, e.g. "approval.decision". */
  commandType: string;
  /** Actor identity (user/agent id) issuing the command. */
  actorId: string;
  tenantId?: string;
  /** Aggregate the command targets. */
  targetAggregate?: string;
  /** Expected version (optimistic concurrency) — optional. */
  expectedVersion?: string;
  /** Dedup across retries. */
  idempotencyKey?: string;
  /** Causal link: the event/command that caused this command. */
  causationId?: string;
  /** Strict chain: previous event in this causal sequence. */
  priorEventId?: string;
  /** Workflow-wide correlation id. */
  correlationId?: string;
  /** End-to-end trace id. */
  traceId?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface CommandOptions {
  actorId?: string;
  tenantId?: string;
  targetAggregate?: string;
  expectedVersion?: string;
  idempotencyKey?: string;
  causationId?: string;
  priorEventId?: string;
  correlationId?: string;
  traceId?: string;
}

/** Stamp a fresh command id (eventId-compatible so it lives in the envelope store). */
export function commandId(producer = "command-bus"): string {
  return `cmd_${Date.now().toString(36)}_${producer.replace(/[^a-z0-9]/gi, "")}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a command envelope. */
export function newCommand(commandType: string, payload: Record<string, unknown>, opts: CommandOptions = {}): CommandEnvelope {
  return {
    commandId: commandId(opts.actorId),
    commandType,
    actorId: opts.actorId ?? "system",
    tenantId: opts.tenantId,
    targetAggregate: opts.targetAggregate,
    expectedVersion: opts.expectedVersion,
    idempotencyKey: opts.idempotencyKey,
    causationId: opts.causationId,
    priorEventId: opts.priorEventId,
    correlationId: opts.correlationId,
    traceId: opts.traceId,
    timestamp: new Date().toISOString(),
    payload,
  };
}

/** Persist a command as a bus node (envelope row with eventType "command.<type>"). */
export function commandNode(cmd: CommandEnvelope): CanonicalEvent {
  return {
    eventId: cmd.commandId,
    eventType: `command.${cmd.commandType}`,
    version: "1.0",
    schemaVersion: 1,
    timestamp: cmd.timestamp,
    producer: "command-bus",
    tenantId: cmd.tenantId,
    aggregateId: cmd.targetAggregate,
    correlationId: cmd.correlationId ?? cmd.commandId,
    causationId: cmd.causationId,
    traceId: cmd.traceId,
    idempotencyKey: cmd.idempotencyKey,
    payload: {
      ...cmd.payload,
      actorId: cmd.actorId,
      targetAggregate: cmd.targetAggregate,
      expectedVersion: cmd.expectedVersion,
      priorEventId: cmd.priorEventId,
    },
  };
}

export interface ExecuteCommandResult {
  ok: boolean;
  command: CommandEnvelope;
  /** Emitted caused events in causal order. */
  caused: CanonicalEvent[];
  errors: string[];
}

/**
 * Execute a command: persist the command node, run the handler, then emit its
 * caused events with the causal chain stitched (causationId/priorEventId/
 * correlationId/traceId/idempotencyKey propagate from the command).
 */
export async function executeCommand(
  cmd: CommandEnvelope,
  handler: (payload: Record<string, unknown>) => Promise<CanonicalEvent[]>,
  emit: (ev: CanonicalEvent) => Promise<{ ok: boolean; errors: string[] }>,
): Promise<ExecuteCommandResult> {
  const errors: string[] = [];
  const caused: CanonicalEvent[] = [];

  const nodeResult = await emit(commandNode(cmd));
  if (!nodeResult.ok) {
    return { ok: false, command: cmd, caused: [], errors: [...nodeResult.errors, "command failed to persist"] };
  }

  let previousId = cmd.priorEventId ?? cmd.commandId;
  try {
    const raw = await handler(cmd.payload);
    for (const ev of raw) {
      const chained: CanonicalEvent = {
        ...ev,
        causationId: cmd.causationId ?? previousId,
        correlationId: cmd.correlationId ?? cmd.commandId,
        traceId: cmd.traceId ?? cmd.correlationId ?? cmd.commandId,
        idempotencyKey: cmd.idempotencyKey && ev.idempotencyKey === undefined ? cmd.idempotencyKey : ev.idempotencyKey ?? dedupKeyFor(ev),
        tenantId: ev.tenantId ?? cmd.tenantId,
      };
      // store the strict chain link inside the payload (auditable, not transport)
      chained.payload = { ...chained.payload, priorEventId: previousId, commandId: cmd.commandId, actorId: cmd.actorId };
      const result = await emit(chained);
      if (result.ok) {
        caused.push(chained);
        previousId = chained.eventId;
      } else {
        errors.push(`${ev.eventType}: ${result.errors.join(", ")}`);
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push(message);
    const failEvent: CanonicalEvent = {
      ...commandNode(cmd),
      eventId: `cmd_${Date.now().toString(36)}_fail`,
      eventType: EVENT_TYPES.COMMAND_FAILED,
      payload: { commandId: cmd.commandId, commandType: cmd.commandType, error: message, actorId: cmd.actorId },
      causationId: cmd.commandId,
    };
    await emit(failEvent);
  }

  return { ok: errors.length === 0, command: cmd, caused, errors };
}