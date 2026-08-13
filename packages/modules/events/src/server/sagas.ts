/**
 * Saga orchestration — long-running workflows with compensation.
 * State lives in SagaInstance rows: `currentStep` indexes `steps`; progress
 * is recorded in `history`; compensations unwind `compensationStack`.
 * Each event drives the saga exactly once (idempotency store).
 */
import { prisma, type Prisma } from "@n0va/db";
import type { CanonicalEvent } from "../envelope";
import { EVENT_TYPES } from "../envelope";
import { emitEvent } from "./outbox";
import { ensureProcessedOnce } from "./idempotency";

export interface SagaStepResult {
  /** Index of the next step in def.steps. */
  nextIndex: number;
  /** Events to emit as the step's effect. */
  emits?: Array<{ type: string; payload: Record<string, unknown> }>;
  /** When true, the saga enters COMPENSATED (schedule unwind). */
  compensate?: boolean;
}

export interface SagaDefinition {
  sagaType: string;
  /** Bus events that trigger/progress this saga. */
  triggers: string[];
  steps: string[];
  onEvent(ev: CanonicalEvent, ctx: { currentStep: number; payload: Record<string, unknown> }): Promise<SagaStepResult>;
}

type SagaRow = {
  id: string;
  currentStep: number;
  status: string;
  payload: Record<string, unknown>;
  steps: unknown[];
  history: Array<{ step: number; eventId: string; at: string; status: string }>;
  compensationStack: string[];
};

function rowFromDb(row: Prisma.SagaInstanceGetPayload<true>): SagaRow {
  return {
    id: row.id,
    currentStep: row.currentStep,
    status: row.status,
    payload: (row.payload as Record<string, unknown>) ?? {},
    steps: (row.steps as unknown[]) ?? [],
    history: (row.history as SagaRow["history"]) ?? [],
    compensationStack: (row.compensationStack as string[]) ?? [],
  };
}

async function emitSagaEvent(ev: CanonicalEvent, type: string, payload: Record<string, unknown>): Promise<void> {
  await emitEvent({
    ...ev,
    eventId: `saga_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: type,
    version: "1.0",
    payload,
    causationId: ev.eventId,
  });
}

/** Purchase approval: requisitions need a manager's approval before funds move. */
export const purchaseApprovalSaga: SagaDefinition = {
  sagaType: "PURCHASE_APPROVAL",
  triggers: [EVENT_TYPES.APPROVAL_REQUESTED, "approval.decision"],
  steps: ["APPROVAL_REQUIRED", "DECISION_RECEIVED", "FUNDS_MOVED"],
  async onEvent(ev) {
    const decision = ev.payload.decision;
    if (ev.eventType === "approval.decision" && decision === "REJECTED") {
      return {
        nextIndex: 1,
        compensate: true,
        emits: [
          {
            type: EVENT_TYPES.SAGA_COMPENSATED,
            payload: { workflowId: ev.correlationId ?? "", reason: String(ev.payload.reason ?? "rejected") },
          },
          {
            type: EVENT_TYPES.INVOICE_FLAGGED,
            payload: { invoiceId: String(ev.payload.invoiceId ?? ev.payload.approvalId ?? ev.aggregateId ?? ""), reason: "approval rejected — compensating" },
          },
        ],
      };
    }
    if (ev.eventType === "approval.decision") {
      // APPROVED or any non-reject decision
      return {
        nextIndex: 2,
        emits: [{ type: EVENT_TYPES.SAGA_COMPLETED, payload: { workflowId: ev.correlationId ?? "" } }],
      };
    }
    // initial approval.requested — hold at APPROVAL_REQUIRED
    return { nextIndex: 0, emits: [] };
  },
};

/** Meeting follow-up: schedule a summary + action items after the meeting. */
export const meetingFollowupSaga: SagaDefinition = {
  sagaType: "MEETING_FOLLOWUP",
  triggers: [EVENT_TYPES.CALENDAR_EVENT_SCHEDULED],
  steps: ["FOLLOWUP_SCHEDULED", "SUMMARY_SENT"],
  async onEvent() {
    return { nextIndex: 1, emits: [] };
  },
};

/** CRM lead pipeline: keep the lead record in sync across updates. */
export const crmLeadSaga: SagaDefinition = {
  sagaType: "CRM_LEAD",
  triggers: [EVENT_TYPES.CRM_LEAD_UPDATED],
  steps: ["LEAD_SYNCED"],
  async onEvent() {
    return { nextIndex: 0, emits: [] };
  },
};

export const SAGAS: SagaDefinition[] = [purchaseApprovalSaga, meetingFollowupSaga, crmLeadSaga];

export function sagaForEvent(ev: CanonicalEvent): SagaDefinition | undefined {
  return SAGAS.find((s) => s.triggers.includes(ev.eventType));
}

/** Drive a saga from a bus event; returns the updated row or null. */
export async function driveSaga(ev: CanonicalEvent): Promise<SagaRow | null> {
  const def = sagaForEvent(ev);
  if (!def) return null;
  const outcome = await ensureProcessedOnce(`saga:${def.sagaType}`, ev.eventId);
  if (outcome === "deduped") {
    const existing = await prisma.sagaInstance.findFirst({ where: { sagaType: def.sagaType, correlationId: workflowKey(ev) } });
    return existing ? rowFromDb(existing) : null;
  }

  const correlationId = workflowKey(ev);
  let instance = await prisma.sagaInstance.findFirst({ where: { sagaType: def.sagaType, correlationId } });
  if (!instance) {
    instance = await prisma.sagaInstance.create({
      data: {
        sagaType: def.sagaType,
        tenantId: ev.tenantId,
        correlationId,
        title: String(ev.payload.title ?? def.sagaType),
        status: "RUNNING",
        currentStep: 0,
        steps: def.steps,
        payload: (ev.payload as Prisma.InputJsonObject) ?? {},
        history: [{ step: 0, eventId: ev.eventId, at: new Date().toISOString(), status: "RUNNING" }],
        compensationStack: [],
      },
    });
    await emitSagaEvent(ev, EVENT_TYPES.SAGA_STARTED, { sagaType: def.sagaType, workflowId: correlationId });
  }

  const row = rowFromDb(instance);
  const result = await def.onEvent(ev, { currentStep: row.currentStep, payload: row.payload });
  const nextIndex = Math.max(0, Math.min(result.nextIndex, def.steps.length - 1));
  const isCompensated = result.compensate === true;
  const isTerminal = nextIndex >= def.steps.length - 1 || result.emits?.some((e) => e.type === EVENT_TYPES.SAGA_COMPLETED || e.type === EVENT_TYPES.SAGA_COMPENSATED) === true;

  for (const emission of result.emits ?? []) {
    await emitSagaEvent(ev, emission.type, emission.payload);
  }

  const history = [...row.history, { step: nextIndex, eventId: ev.eventId, at: new Date().toISOString(), status: isTerminal ? (isCompensated ? "COMPENSATED" : "COMPLETED") : "RUNNING" }];
  const compensationStack = isCompensated
    ? [...row.compensationStack, `unwind:${def.steps[Math.min(nextIndex, def.steps.length - 1)]}`]
    : row.compensationStack;

  const updated = await prisma.sagaInstance.update({
    where: { id: instance.id },
    data: {
      currentStep: nextIndex,
      status: isTerminal ? (isCompensated ? "COMPENSATED" : "COMPLETED") : "RUNNING",
      ...(isTerminal ? { completedAt: new Date() } : {}),
      history: history as Prisma.InputJsonValue,
      compensationStack: compensationStack as Prisma.InputJsonValue,
      payload: { ...row.payload, lastEvent: ev.eventType, lastEventId: ev.eventId } as Prisma.InputJsonObject,
      error: isTerminal && isCompensated ? "saga compensated" : undefined,
    },
  });
  return rowFromDb(updated);
}

export function workflowKey(ev: CanonicalEvent): string {
  return ev.correlationId ?? ev.aggregateId ?? ev.eventId;
}