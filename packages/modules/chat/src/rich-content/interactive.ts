/**
 * Interactive Messages — buttons, selects, date pickers, modals, confirm dialogs
 * Server-side card-based interactivity, provenance-aware, permission-checked.
 * Never executes scripts; all actions via Server Actions with audit log.
 */

import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { auditAppend } from "../compliance";
import { interactiveToCard, type RichCard, type CardAction, type CardSelect, type CardDatePicker } from "./cards";
import { publish } from "../emitter";

export type InteractiveKind = "approval" | "task" | "poll" | "generic";

export interface InteractiveSpec {
  kind: InteractiveKind;
  title: string;
  summaryLine: string;
  fields?: Array<{ label: string; value: string }>;
  actions: CardAction[];
  selects?: CardSelect[];
  datePickers?: CardDatePicker[];
  // Policy
  allowedRoles?: Role[]; // who may interact
  confirmFor?: string[]; // action ids requiring confirm
}

export interface CreateInteractiveInput {
  workspaceId: string;
  channelId: string;
  messageId?: string; // attach to existing message, or create new interactive message
  createdById: string;
  createdByName: string;
  role: Role;
  spec: InteractiveSpec;
}

// Persist interactive as a structured attachment on ChatMessage (so it threads, searches, retains)
// We store JSON in ChatMessage.body + bodyHtml card render, and keep structured spec in ChatTaskProposal/Approval style table or new ChatInteractive table (fallback to hypercontext).
export async function createInteractiveMessage(input: CreateInteractiveInput): Promise<{ messageId: string; card: RichCard }> {
  if (!(await can(input.workspaceId, input.role, "chat", "CREATE"))) throw new Error("Missing CREATE permission");

  const card = interactiveToCard({
    id: input.messageId ?? `interactive:${Date.now()}`,
    title: input.spec.title,
    summaryLine: input.spec.summaryLine,
    kind: input.spec.kind,
    fields: input.spec.fields,
    actions: input.spec.actions,
    selects: input.spec.selects,
    datePickers: input.spec.datePickers,
    provenance: { actorId: input.createdById, actorName: input.createdByName, triggeredAt: new Date().toISOString() },
  });

  // Create or attach: if messageId provided, stash as hypercontext action
  let messageId = input.messageId;
  if (!messageId) {
    const msg = await prisma.chatMessage.create({
      data: {
        channelId: input.channelId,
        workspaceId: input.workspaceId,
        createdById: input.createdById,
        authorName: input.createdByName,
        body: `▫️ ${input.spec.title}\n${input.spec.summaryLine}`,
        bodyHtml: `<div class="nv-rich-card" data-card-kind="${card.kind}" data-card-id="${card.id}">${escapeHtml(input.spec.title)}</div>`,
      },
    });
    messageId = msg.id;
  }

  // Persist structured spec for replay (use ChatLinkSuggestion as generic store if no dedicated table yet)
  try {
    await prisma.chatHyperContext.upsert({
      where: { messageId },
      create: {
        messageId,
        workspaceId: input.workspaceId,
        links: [],
        actions: [{ type: "interactive", kind: input.spec.kind, spec: input.spec, card }] as unknown as object,
        causalChain: [{ step: "interactive.created", kind: input.spec.kind, messageId }] as unknown as object,
      },
      update: {
        actions: [{ type: "interactive", kind: input.spec.kind, spec: input.spec, card }] as unknown as object,
      },
    });
  } catch {}

  await auditAppend({
    workspaceId: input.workspaceId,
    actorId: input.createdById,
    action: "interactive.created",
    objectType: "MESSAGE",
    objectId: messageId,
    channelId: input.channelId,
    details: { kind: input.spec.kind, title: input.spec.title },
  });

  publish(input.workspaceId, { type: "message" as const, message: { id: messageId, channelId: input.channelId, body: `▫️ ${input.spec.title}`, card } as unknown });

  return { messageId: messageId!, card: { ...card, id: messageId! } };
}

export interface HandleActionInput {
  workspaceId: string;
  channelId: string;
  messageId: string;
  actionId: string;
  userId: string;
  userName: string;
  role: Role;
  value?: string; // select value, date value, or button value
  confirm?: boolean; // true if user confirmed irreversible
}

export async function handleInteractiveAction(input: HandleActionInput): Promise<{ ok: boolean; card?: RichCard; message?: string }> {
  if (!(await can(input.workspaceId, input.role, "chat", "UPDATE"))) return { ok: false, message: "Missing UPDATE permission" };

  const ctx = await prisma.chatHyperContext.findUnique({ where: { messageId: input.messageId } });
  if (!ctx) return { ok: false, message: "Interactive not found" };
  const actions = ctx.actions as unknown as Array<{ type: string; spec?: InteractiveSpec; card?: RichCard }>;
  const entry = actions.find((a) => a.type === "interactive");
  if (!entry?.spec) return { ok: false, message: "No interactive spec" };

  const spec = entry.spec;
  const action = spec.actions.find((a) => a.id === input.actionId);
  const isSelect = spec.selects?.some((s) => s.id === input.actionId);
  const isDate = spec.datePickers?.some((d) => d.id === input.actionId);
  if (!action && !isSelect && !isDate) return { ok: false, message: "Unknown action" };

  // Confirm gate for destructive/irreversible
  if (action?.confirm && !input.confirm) {
    return { ok: false, message: `Confirm required: ${action.confirm.title}` };
  }
  if (action?.style === "destructive" && !input.confirm) {
    return { ok: false, message: "Destructive action requires confirmation" };
  }

  // Record provenance + update card state (e.g., selected value)
  const updatedSpec: InteractiveSpec = {
    ...spec,
    actions: spec.actions.map((a) => a.id === input.actionId ? { ...a, provenance: `Triggered by ${input.userName} at ${new Date().toISOString()}` } : a),
    selects: spec.selects?.map((s) => s.id === input.actionId ? { ...s, value: input.value } : s),
    datePickers: spec.datePickers?.map((d) => d.id === input.actionId ? { ...d, value: input.value } : d),
  };

  const newCard = interactiveToCard({
    id: input.messageId,
    title: spec.title,
    summaryLine: spec.summaryLine,
    kind: spec.kind,
    fields: spec.fields,
    actions: updatedSpec.actions,
    selects: updatedSpec.selects,
    datePickers: updatedSpec.datePickers,
    provenance: { actorId: input.userId, actorName: input.userName, triggeredAt: new Date().toISOString() },
  });

  await prisma.chatHyperContext.update({
    where: { messageId: input.messageId },
    data: { actions: [{ type: "interactive", kind: spec.kind, spec: updatedSpec, card: newCard }] as unknown as object },
  });

  await auditAppend({
    workspaceId: input.workspaceId,
    actorId: input.userId,
    actorName: input.userName,
    action: `interactive.${input.actionId}`,
    objectType: "MESSAGE",
    objectId: input.messageId,
    channelId: input.channelId,
    details: { value: input.value, kind: spec.kind },
  });

  publish(input.workspaceId, { type: "message.updated" as const, channel_id: input.channelId, message: { id: input.messageId, card: newCard } as unknown });

  return { ok: true, card: newCard };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Prebuilt specs for common actions (buttons: approve/reject/assign/snooze/escalate/open/resolve)
export function approvalSpec(opts: { title: string; summaryLine: string; amount?: string; fields?: Array<{ label: string; value: string }> }): InteractiveSpec {
  return {
    kind: "approval",
    title: opts.title,
    summaryLine: opts.summaryLine,
    fields: opts.fields ?? (opts.amount ? [{ label: "Amount", value: opts.amount }] : []),
    actions: [
      { id: "approve", label: "Approve", style: "primary", value: "approved", confirm: { title: "Confirm approval", text: `Approve ${opts.amount ?? "this request"}?` } },
      { id: "reject", label: "Reject", style: "secondary", value: "rejected" },
      { id: "snooze", label: "Snooze", style: "ghost", value: "snoozed" },
      { id: "escalate", label: "Escalate", style: "ghost", value: "escalated" },
    ],
    selects: [{ id: "assignee", placeholder: "Assign to", options: [] }],
    datePickers: [{ id: "dueDate", placeholder: "Due date" }],
  };
}

export function taskSpec(opts: { title: string; summaryLine: string; priority?: string }): InteractiveSpec {
  return {
    kind: "task",
    title: opts.title,
    summaryLine: opts.summaryLine,
    actions: [
      { id: "open", label: "Open", style: "primary" },
      { id: "resolve", label: "Resolve", style: "secondary" },
      { id: "assign", label: "Assign", style: "ghost" },
    ],
    selects: [{ id: "priority", placeholder: "Priority", options: [{ label: "Low", value: "low" }, { label: "Medium", value: "medium" }, { label: "High", value: "high" }], value: opts.priority }],
    datePickers: [{ id: "dueDate", placeholder: "Due date" }],
  };
}
