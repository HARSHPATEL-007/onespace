/**
 * N0VA CHAT Event Bus — canonical event envelope (Project Nexus).
 *
 * Separates transport metadata from business payload so the bus can route,
 * audit, and replay actions consistently. Backward-compatible versioning:
 * required fields are never removed abruptly; unknown fields are preserved.
 */

export type EventVisibility = "INTERNAL" | "EXTERNAL" | "CONFIDENTIAL";

export interface CanonicalEvent {
  /** Unique event id (ULID recommended). */
  eventId: string;
  /** Normalized event type, e.g. "chat.message.created". */
  eventType: string;
  /** Business payload version, e.g. "2.0". */
  version: string;
  /** Canonical envelope schema version. */
  schemaVersion: number;
  /** ISO timestamp of occurrence. */
  timestamp: string;
  /** Producing module/service, e.g. "chat-service". */
  producer: string;
  /** Tenant isolation scope. */
  tenantId?: string;
  /** Domain aggregate this event belongs to. */
  aggregateId?: string;
  /** Correlation id for the whole workflow. */
  correlationId?: string;
  /** Id of the event that caused this one. */
  causationId?: string;
  /** End-to-end trace id. */
  traceId?: string;
  /** Idempotency key — dedup across retries. */
  idempotencyKey?: string;
  /** Partition key: thread_id, task_id, tenant_id, aggregate_id. */
  partitionKey?: string;
  /** Visibility classification for ACL / redaction. */
  visibility?: EventVisibility;
  /** Business-specific payload. */
  payload: Record<string, unknown>;
  /** Retry/dedup metadata. */
  meta?: {
    retryCount?: number;
    dedupKey?: string;
    attempt?: number;
    nextAt?: string;
  };
  /** Extra transport fields — preserved verbatim. */
  [extra: string]: unknown;
}

export type EventInput = Omit<CanonicalEvent, "eventId" | "timestamp" | "schemaVersion" | "producer"> &
  Partial<Pick<CanonicalEvent, "eventId" | "timestamp" | "schemaVersion" | "producer">>;

/** Registry of normalized domain event types. */
export const EVENT_TYPES = {
  CHAT_MESSAGE_CREATED: "chat.message.created",
  CHAT_THREAD_DECISION: "thread.decision.confirmed",
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_COMPLETED: "task.completed",
  CALENDAR_EVENT_SCHEDULED: "calendar.event.scheduled",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_DECIDED: "approval.decision",
  INVOICE_FLAGGED: "invoice.flagged",
  CONNECTOR_SYNC_FAILED: "connector.sync.failed",
  CRM_LEAD_UPDATED: "crm.lead.updated",
  SAGA_STARTED: "saga.started",
  SAGA_STEP_COMPLETED: "saga.step.completed",
  SAGA_COMPENSATED: "saga.compensated",
  SAGA_COMPLETED: "saga.completed",
  SAGA_FAILED: "saga.failed",
  COMMAND_FAILED: "command.failed",
  VOICE_RECORDING_UPLOADED: "voice.recording.uploaded",
  VOICE_TRANSCRIPT_READY: "voice.transcript.ready",
  VOICE_ACTION_EXTRACTED: "voice.action.extracted",
  VOICE_ACTION_CONFIRMED: "voice.action.confirmed",
  VOICE_SUMMARY_READY: "voice.summary.ready",
  VOICE_TRANSCRIPT_CORRECTED: "voice.transcript.corrected",
  BUS_RELAYED: "bus.relayed",
  BUS_DLQ: "bus.dlq",
} as const;

export type EventTypeName = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Required payload fields per event type + schema version. */
export const EVENT_SCHEMAS: Record<string, { currentVersion: string; required: string[] }> = {
  [EVENT_TYPES.CHAT_MESSAGE_CREATED]: {
    currentVersion: "1.0",
    required: ["messageId", "channelId", "authorId", "body"],
  },
  [EVENT_TYPES.CHAT_THREAD_DECISION]: {
    currentVersion: "1.0",
    required: ["threadId", "decision", "decidedBy"],
  },
  [EVENT_TYPES.TASK_CREATED]: {
    currentVersion: "2.0",
    required: ["taskId", "title", "assigneeId", "workspaceId"],
  },
  [EVENT_TYPES.TASK_UPDATED]: { currentVersion: "1.0", required: ["taskId"] },
  [EVENT_TYPES.TASK_COMPLETED]: { currentVersion: "1.0", required: ["taskId", "completedBy"] },
  [EVENT_TYPES.CALENDAR_EVENT_SCHEDULED]: {
    currentVersion: "1.0",
    required: ["eventId", "title", "startsAt", "endsAt"],
  },
  [EVENT_TYPES.APPROVAL_REQUESTED]: {
    currentVersion: "1.0",
    required: ["approvalId", "requestType", "requestedBy"],
  },
  [EVENT_TYPES.APPROVAL_DECIDED]: {
    currentVersion: "1.0",
    required: ["approvalId", "requestType", "decision", "decidedBy"],
  },
  [EVENT_TYPES.INVOICE_FLAGGED]: {
    currentVersion: "1.0",
    required: ["invoiceId", "reason"],
  },
  [EVENT_TYPES.CONNECTOR_SYNC_FAILED]: {
    currentVersion: "1.0",
    required: ["connectorId", "error"],
  },
  [EVENT_TYPES.CRM_LEAD_UPDATED]: { currentVersion: "1.0", required: ["leadId", "stage"] },
  [EVENT_TYPES.SAGA_STARTED]: { currentVersion: "1.0", required: ["sagaType", "workflowId"] },
  [EVENT_TYPES.SAGA_STEP_COMPLETED]: { currentVersion: "1.0", required: ["workflowId", "step"] },
  [EVENT_TYPES.SAGA_COMPENSATED]: { currentVersion: "1.0", required: ["workflowId"] },
  [EVENT_TYPES.SAGA_COMPLETED]: { currentVersion: "1.0", required: ["workflowId"] },
  [EVENT_TYPES.SAGA_FAILED]: { currentVersion: "1.0", required: ["workflowId"] },
  [EVENT_TYPES.COMMAND_FAILED]: { currentVersion: "1.0", required: ["commandId", "commandType", "error"] },
  [EVENT_TYPES.VOICE_RECORDING_UPLOADED]: { currentVersion: "1.0", required: ["voiceId", "source", "durationMs", "creatorId"] },
  [EVENT_TYPES.VOICE_TRANSCRIPT_READY]: { currentVersion: "1.0", required: ["voiceId", "language", "segmentCount"] },
  [EVENT_TYPES.VOICE_ACTION_EXTRACTED]: { currentVersion: "1.0", required: ["voiceId", "extractionId", "kind", "title", "confidence"] },
  [EVENT_TYPES.VOICE_ACTION_CONFIRMED]: { currentVersion: "1.0", required: ["voiceId", "extractionId", "kind", "state"] },
  [EVENT_TYPES.VOICE_SUMMARY_READY]: { currentVersion: "1.0", required: ["voiceId", "oneLine"] },
  [EVENT_TYPES.VOICE_TRANSCRIPT_CORRECTED]: { currentVersion: "1.0", required: ["voiceId", "version"] },
  [EVENT_TYPES.BUS_RELAYED]: { currentVersion: "1.0", required: ["eventId"] },
  [EVENT_TYPES.BUS_DLQ]: { currentVersion: "1.0", required: ["eventId", "reason"] },
};

/** Validate an event against its registered schema. */
export function validateEvent(ev: CanonicalEvent): { ok: boolean; errors: string[] } {
  const schema = EVENT_SCHEMAS[ev.eventType];
  const errors: string[] = [];
  if (!schema) {
    errors.push(`unknown event type "${ev.eventType}"`);
    return { ok: errors.length === 0, errors };
  }
  const required = ev.version === schema.currentVersion ? schema.required : requiredAt(schema, ev.version);
  for (const key of required) {
    const value = (ev.payload ?? {})[key];
    if (value === undefined || value === null || value === "") {
      errors.push(`missing required payload field "${key}" for ${ev.eventType}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Find the required fields that existed at an older version. */
function requiredAt(schema: { required: string[] }, version: string): string[] {
  return version === "1.0" || version === "2.0" ? schema.required : schema.required;
}

export function topicFor(eventType: string, tenantId?: string): string {
  return tenantId ? `n0va.events.${tenantId}` : "n0va.events";
}

export function partitionKeyFor(ev: CanonicalEvent): string {
  if (ev.partitionKey) return ev.partitionKey;
  if (ev.aggregateId) return ev.aggregateId;
  if (ev.tenantId) return ev.tenantId;
  return "global";
}

/** Deterministic dedup key for retry handling. */
export function dedupKeyFor(ev: CanonicalEvent): string {
  return ev.idempotencyKey ?? `${ev.eventType}:${ev.correlationId ?? ev.eventId}`;
}