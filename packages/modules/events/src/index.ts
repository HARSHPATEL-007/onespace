/**
 * Event Bus public API — pure layer (no prisma, client-safe):
 * canonical envelope, event type registry with schema versioning,
 * normalized domain event factories, broker port types.
 */

export * from "./envelope";
export * from "./normalize";
export * from "./port";

import { EVENT_TYPES, EVENT_SCHEMAS, validateEvent, topicFor, partitionKeyFor, dedupKeyFor } from "./envelope";
import { messageCreated, threadDecisionConfirmed, taskCreated, taskCompleted, calendarEventScheduled, approvalRequested, invoiceFlagged, connectorSyncFailed, crmLeadUpdated, sagaEvent } from "./normalize";

export const eventBusCore = {
  EVENT_TYPES,
  EVENT_SCHEMAS,
  validateEvent,
  topicFor,
  partitionKeyFor,
  dedupKeyFor,
  normalize: {
    messageCreated,
    threadDecisionConfirmed,
    taskCreated,
    taskCompleted,
    calendarEventScheduled,
    approvalRequested,
    invoiceFlagged,
    connectorSyncFailed,
    crmLeadUpdated,
    sagaEvent,
  },
};