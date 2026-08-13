/**
 * Normalized domain events. Raw module actions are translated into the stable
 * cross-platform language used across chat, tasks, calendar, CRM, finance,
 * and compliance.
 */
import type { CanonicalEvent, EventInput, EventVisibility } from "./envelope";
import { EVENT_TYPES } from "./envelope";

export interface NormalizeOptions {
  producer: string;
  tenantId?: string;
  correlationId?: string;
  causationId?: string;
  traceId?: string;
  visibility?: EventVisibility;
}

let seq = 0;

function build(type: string, version: string, payload: Record<string, unknown>, opts: NormalizeOptions): CanonicalEvent {
  const now = new Date().toISOString();
  seq = (seq + 1) % 0xffffff;
  return {
    eventId: `evt_${now.replace(/[-:]/g, "").replace(/\./g, "").slice(0, 14)}_${opts.producer.replace(/[^a-z0-9]/gi, "").slice(0, 8)}_${seq.toString(36).padStart(5, "0")}`,
    eventType: type,
    version,
    schemaVersion: 1,
    timestamp: now,
    producer: opts.producer,
    tenantId: opts.tenantId,
    correlationId: opts.correlationId,
    causationId: opts.causationId,
    traceId: opts.traceId,
    payload,
    visibility: opts.visibility ?? "INTERNAL",
    meta: { retryCount: 0, dedupKey: `${type}:${(payload as Record<string, unknown>).id ?? now}` },
  };
}

export function messageCreated(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.CHAT_MESSAGE_CREATED, "1.0", payload, opts);
}

export function threadDecisionConfirmed(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.CHAT_THREAD_DECISION, "1.0", payload, opts);
}

export function taskCreated(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.TASK_CREATED, "2.0", payload, opts);
}

export function taskCompleted(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.TASK_COMPLETED, "1.0", payload, opts);
}

export function calendarEventScheduled(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.CALENDAR_EVENT_SCHEDULED, "1.0", payload, opts);
}

export function approvalRequested(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.APPROVAL_REQUESTED, "1.0", payload, opts);
}

export function invoiceFlagged(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.INVOICE_FLAGGED, "1.0", payload, opts);
}

export function connectorSyncFailed(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.CONNECTOR_SYNC_FAILED, "1.0", payload, opts);
}

export function crmLeadUpdated(payload: EventInput["payload"], opts: NormalizeOptions): CanonicalEvent {
  return build(EVENT_TYPES.CRM_LEAD_UPDATED, "1.0", payload, opts);
}

export function sagaEvent(type: string, workflowId: string, payload: Record<string, unknown>, opts: NormalizeOptions): CanonicalEvent {
  return build(type, "1.0", { workflowId, ...payload }, opts);
}