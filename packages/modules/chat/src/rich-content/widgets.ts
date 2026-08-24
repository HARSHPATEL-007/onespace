/**
 * Widgets & Micro-apps — poll, task, approval, calendar, CRM, ticket, digest
 * Compact in chat, expand to full panel, source-pushed updates, fallback rendering.
 */

import { interactiveToCard, type RichCard } from "./cards";
import { prisma } from "@n0va/db";

export type WidgetKind = "poll" | "task" | "approval" | "calendar" | "crm" | "ticket" | "digest";

export interface WidgetState {
  id: string;
  kind: WidgetKind;
  workspaceId: string;
  channelId: string;
  messageId?: string;
  data: Record<string, unknown>;
  version: number;
  updatedAt: string;
  fallback?: string; // plain text for unsupported clients
}

export async function upsertWidget(state: WidgetState): Promise<void> {
  // Persist as ChatHyperContext action so renderer can pick up live updates via SSE
  const messageId = state.messageId ?? state.id;
  try {
    await prisma.chatHyperContext.upsert({
      where: { messageId },
      create: {
        messageId,
        workspaceId: state.workspaceId,
        links: [],
        actions: [{ type: "widget", kind: state.kind, data: state.data, version: state.version, updatedAt: state.updatedAt, fallback: state.fallback }] as unknown as object,
        causalChain: [{ step: "widget.upsert", kind: state.kind, id: state.id }] as unknown as object,
      },
      update: {
        actions: [{ type: "widget", kind: state.kind, data: state.data, version: state.version, updatedAt: state.updatedAt, fallback: state.fallback }] as unknown as object,
      },
    });
  } catch {}
}

export async function getWidget(workspaceId: string, messageId: string): Promise<WidgetState | null> {
  const ctx = await prisma.chatHyperContext.findUnique({ where: { messageId } });
  if (!ctx || ctx.workspaceId !== workspaceId) return null;
  const actions = ctx.actions as unknown as Array<{ type: string; kind?: string; data?: Record<string, unknown>; version?: number; updatedAt?: string; fallback?: string }>;
  const w = actions.find((a) => a.type === "widget");
  if (!w || !w.kind) return null;
  return {
    id: messageId,
    kind: w.kind as WidgetKind,
    workspaceId,
    channelId: "",
    messageId,
    data: (w.data as Record<string, unknown>) ?? {},
    version: w.version ?? 1,
    updatedAt: w.updatedAt ?? new Date().toISOString(),
    fallback: w.fallback,
  };
}

export function widgetToCard(widget: WidgetState): RichCard {
  const base = {
    id: widget.id,
    title: String((widget.data as Record<string, unknown>).title ?? widget.kind),
    summaryLine: String((widget.data as Record<string, unknown>).summary ?? widget.fallback ?? widget.kind),
    kind: widget.kind,
    fields: [],
    actions: [{ id: "expand", label: "Expand", style: "primary" as const }],
  };
  // Kind-specific compact card
  switch (widget.kind) {
    case "poll": {
      const q = String((widget.data as Record<string, unknown>).question ?? "Poll");
      const opts = ((widget.data as Record<string, unknown>).options as unknown as Array<{ text: string; count?: number }>) ?? [];
      return interactiveToCard({ ...base, title: q, summaryLine: `${opts.length} options`, fields: opts.slice(0, 3).map((o, i) => ({ label: `Option ${i+1}`, value: o.text })), actions: [{ id: "vote", label: "Vote", style: "primary" }], kind: "poll" });
    }
    case "task": {
      const status = String((widget.data as Record<string, unknown>).status ?? "open");
      return interactiveToCard({ ...base, kind: "task", title: String((widget.data as Record<string, unknown>).title ?? "Task"), summaryLine: `Status: ${status}`, fields: [{ label: "Status", value: status }], actions: status === "done" ? [] : [{ id: "resolve", label: "Resolve", style: "primary" }] });
    }
    case "approval": {
      const status = String((widget.data as Record<string, unknown>).status ?? "pending");
      return interactiveToCard({ ...base, kind: "approval", summaryLine: `Approval: ${status}`, fields: [{ label: "Status", value: status }], actions: status === "pending" ? [{ id: "approve", label: "Approve", style: "primary" }, { id: "reject", label: "Reject", style: "secondary" }] : [] });
    }
    case "calendar": {
      const when = String((widget.data as Record<string, unknown>).startAt ?? "");
      return interactiveToCard({ ...base, kind: "generic", title: String((widget.data as Record<string, unknown>).title ?? "Event"), summaryLine: when ? new Date(when).toLocaleString() : "Event", fields: when ? [{ label: "When", value: new Date(when).toLocaleString() }] : [], actions: [{ id: "open", label: "Open", style: "primary" }] });
    }
    default:
      return interactiveToCard({ ...base, kind: "generic", fields: [], actions: base.actions });
  }
}
