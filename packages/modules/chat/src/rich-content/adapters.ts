/**
 * Embed Adapter Registry — docs, sheets, CRM, GitHub, Jira, internal N0VA objects
 * Each adapter knows: match(url) → fetch preview (permission-aware) → card fields
 * Renderer-agnostic: adapters return PreviewCacheRecord.structured
 */

import { prisma } from "@n0va/db";
import { canUnfurl, logPreviewAccess, stripSecretsFromStructured } from "./security";
import { getCachedPreview, setCachedPreview, makePreviewRecord, type PreviewCacheRecord } from "./cache";

export type AdapterKind = "n0va_doc" | "n0va_sheet" | "n0va_task" | "n0va_meeting" | "n0va_crm" | "n0va_file" | "n0va_approval" | "github" | "jira";

export interface Adapter {
  kind: AdapterKind;
  match: (url: string) => { matched: boolean; objectId?: string; extra?: Record<string, string> };
  fetch: (ctx: { workspaceId: string; userId: string; role: import("@n0va/authz").Role; url: string; objectId?: string; channelId?: string; messageId?: string; actorName?: string }) => Promise<PreviewCacheRecord | null>;
}

// Helpers
function shortId(id: string): string { return id.slice(0, 8); }

const adapters: Adapter[] = [
  // N0VA Doc
  {
    kind: "n0va_doc",
    match: (url) => {
      const m = /\/m\/docs\/(?<id>[a-z0-9-]{8,})/i.exec(url) ?? /docs\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[0]!.match(ctx.url).objectId;
      if (!id) return null;
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "n0va_doc", objectId: id, objectType: "doc" });
      if (!policy.allowed) { await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_doc", objectId: id, objectType: "doc", channelId: ctx.channelId, messageId: ctx.messageId, allowed: false, reason: policy.reason }); return null; }
      const doc = await prisma.doc.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, title: true, content: true, updatedAt: true, createdById: true } });
      if (!doc) return null;
      let author = "Unknown";
      if (doc.createdById) {
        const u = await prisma.user.findUnique({ where: { id: doc.createdById }, select: { name: true, email: true } });
        author = u?.name ?? u?.email ?? author;
      }
      const excerpt = doc.content.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 280);
      const structured = stripSecretsFromStructured({ objectId: doc.id, objectType: "doc", title: doc.title, author, lastEdit: doc.updatedAt.toISOString(), excerpt })!;
      const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_doc", { title: doc.title, description: excerpt || `Doc • ${author} • ${doc.updatedAt.toLocaleDateString()}`, siteName: "N0VA Docs", structured });
      await setCachedPreview(rec);
      await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_doc", objectId: doc.id, objectType: "doc", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
      return rec;
    },
  },
  // N0VA Sheet
  {
    kind: "n0va_sheet",
    match: (url) => {
      const m = /\/m\/sheets\/(?<id>[a-z0-9-]{8,})/i.exec(url) ?? /sheets?\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[1]!.match(ctx.url).objectId;
      if (!id) return null;
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "n0va_sheet", objectId: id, objectType: "sheet" });
      if (!policy.allowed) { await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_sheet", objectId: id, objectType: "sheet", channelId: ctx.channelId, messageId: ctx.messageId, allowed: false, reason: policy.reason }); return null; }
      const wb = await prisma.sheetWorkbook.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, name: true, updatedAt: true } });
      if (!wb) return null;
      const structured = { objectId: wb.id, objectType: "sheet", title: wb.name, freshness: wb.updatedAt.toISOString(), rangePreview: "A1:Z20 (preview)" };
      const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_sheet", { title: wb.name, description: `Sheet • updated ${wb.updatedAt.toLocaleDateString()} • range preview available`, siteName: "N0VA Sheets", structured });
      await setCachedPreview(rec);
      await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_sheet", objectId: wb.id, objectType: "sheet", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
      return rec;
    },
  },
  // N0VA Task
  {
    kind: "n0va_task",
    match: (url) => {
      const m = /\/m\/tasks\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[2]!.match(ctx.url).objectId;
      if (!id) return null;
      const task = await prisma.task.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, title: true, priority: true, completedAt: true, dueDate: true, listId: true } });
      if (!task) return null;
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "n0va_task", objectId: id, objectType: "task" });
      if (!policy.allowed) return null;
      const list = await prisma.taskList.findUnique({ where: { id: task.listId }, select: { name: true } });
      const structured = { objectId: task.id, objectType: "task", title: task.title, status: task.completedAt ? "done" : "open", priority: task.priority, dueDate: task.dueDate?.toISOString() ?? null, listName: list?.name ?? null };
      const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_task", { title: task.title, description: `Task • ${list?.name ?? "List"} • ${task.priority}${task.dueDate ? ` • due ${task.dueDate.toLocaleDateString()}` : ""}`, siteName: "N0VA Tasks", structured });
      await setCachedPreview(rec);
      await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_task", objectId: id, objectType: "task", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
      return rec;
    },
  },
  // N0VA Meeting / Calendar
  {
    kind: "n0va_meeting",
    match: (url) => {
      const m = /\/m\/calendar\/(?<id>[a-z0-9-]{8,})/i.exec(url) ?? /calendar\/events?\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[3]!.match(ctx.url).objectId;
      if (!id) return null;
      const ev = await prisma.calendarEvent.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, title: true, startAt: true, endAt: true, attendees: true } });
      if (!ev) return null;
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "n0va_meeting", objectId: id, objectType: "meeting" });
      if (!policy.allowed) return null;
      const structured = { objectId: ev.id, objectType: "meeting", title: ev.title, startAt: ev.startAt.toISOString(), endAt: ev.endAt.toISOString(), attendees: ev.attendees.slice(0, 5) };
      const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_meeting", { title: ev.title, description: `Meeting • ${ev.startAt.toLocaleString()} — ${ev.endAt.toLocaleTimeString()} • ${ev.attendees.length} attendees`, siteName: "N0VA Calendar", structured });
      await setCachedPreview(rec);
      await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_meeting", objectId: ev.id, objectType: "meeting", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
      return rec;
    },
  },
  // N0VA CRM (contact/deal)
  {
    kind: "n0va_crm",
    match: (url) => {
      const m = /\/m\/(sales|crm|contacts)\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[4]!.match(ctx.url).objectId;
      if (!id) return null;
      const contact = await prisma.contact.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, firstName: true, lastName: true, company: true, email: true } });
      if (contact) {
        const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "n0va_crm", objectId: id, objectType: "crm" });
        if (!policy.allowed) return null;
        const name = `${contact.firstName} ${contact.lastName ?? ""}`.trim();
        const structured = { objectId: contact.id, objectType: "crm_contact", name, company: contact.company, email: contact.email };
        const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_crm", { title: name, description: `${contact.company ?? "Contact"} • ${contact.email ?? ""}`, siteName: "N0VA CRM", structured });
        await setCachedPreview(rec);
        await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_crm", objectId: id, objectType: "crm", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
        return rec;
      }
      const deal = await prisma.deal.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, title: true, stage: true, valueCents: true } });
      if (deal) {
        const structured = { objectId: deal.id, objectType: "crm_deal", name: deal.title, stage: deal.stage, value: deal.valueCents ? `$${(deal.valueCents/100).toLocaleString()}` : null };
        const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_crm", { title: deal.title, description: `Deal • ${deal.stage} • ${structured.value ?? ""}`, siteName: "N0VA CRM", structured });
        await setCachedPreview(rec);
        await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_crm", objectId: id, objectType: "crm", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
        return rec;
      }
      return null;
    },
  },
  // File (storage)
  {
    kind: "n0va_file",
    match: (url) => {
      const m = /\/m\/cloud-storage\/(?<id>[a-z0-9-]{8,})/i.exec(url) ?? /storage\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[5]!.match(ctx.url).objectId;
      if (!id) return null;
      const item = await prisma.storageItem.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, name: true, mimeType: true, sizeBytes: true, updatedAt: true } });
      if (!item) return null;
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "n0va_file", objectId: id, objectType: "file" });
      if (!policy.allowed) return null;
      const structured = { objectId: item.id, objectType: "file", filename: item.name, mimeType: item.mimeType, sizeBytes: item.sizeBytes, updatedAt: item.updatedAt.toISOString() };
      const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_file", { title: item.name, description: `File • ${item.mimeType} • ${(item.sizeBytes/1024).toFixed(1)} KB`, siteName: "N0VA Storage", structured });
      await setCachedPreview(rec);
      await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "n0va_file", objectId: id, objectType: "file", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
      return rec;
    },
  },
  // Approval
  {
    kind: "n0va_approval",
    match: (url) => {
      const m = /\/m\/approvals\/(?<id>[a-z0-9-]{8,})/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.id };
    },
    fetch: async (ctx) => {
      const id = adapters[6]!.match(ctx.url).objectId;
      if (!id) return null;
      const row = await prisma.approvalRequest.findFirst({ where: { id, workspaceId: ctx.workspaceId }, select: { id: true, requestType: true, status: true, amountCents: true } });
      if (!row) return null;
      const structured = { objectId: row.id, objectType: "approval", requestType: row.requestType, status: row.status, amount: row.amountCents ? `$${(row.amountCents/100).toLocaleString()}` : null };
      const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "n0va_approval", { title: `Approval ${shortId(row.id)} • ${row.requestType}`, description: `Status: ${row.status}${structured.amount ? ` • ${structured.amount}` : ""}`, siteName: "N0VA Approvals", structured });
      await setCachedPreview(rec);
      return rec;
    },
  },
  // GitHub — via N0VA1O gateway (policy + rate-limit + transform), not direct fetch
  {
    kind: "github",
    match: (url) => {
      const m = /github\.com\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)\/(?:pull|issues|blob|tree)\/(?<rest>[^\s]+)/i.exec(url) ?? /github\.com\/(?<owner>[^\/]+)\/(?<repo>[^\/\s]+)/i.exec(url);
      return { matched: !!m, objectId: m?.[0]?.slice(0, 120), extra: { owner: m?.groups?.owner ?? "", repo: m?.groups?.repo ?? "" } };
    },
    fetch: async (ctx) => {
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "github" });
      if (!policy.allowed) { await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "github", channelId: ctx.channelId, messageId: ctx.messageId, allowed: false, reason: policy.reason }); return null; }
      // Try N0VA1O gateway for authenticated fetch (per-connector token, rate-limit, transform)
      try {
        const connector = await prisma.integration.findFirst({ where: { workspaceId: ctx.workspaceId, provider: "github" } });
        if (connector) {
          const { chatGatewayCall } = await import("../n0va1o/bridge");
          const res = await chatGatewayCall({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            connectorId: connector.id,
            provider: "github",
            action: "fetch_issue",
            input: { url: ctx.url, mode: "preview" },
            messageId: ctx.messageId,
            channelId: ctx.channelId,
          });
          if (res.ok && res.data) {
            const data = res.data as Record<string, unknown>;
            const structured = {
              objectId: String(data.externalId ?? ctx.url),
              objectType: "github_issue",
              title: String(data.title ?? "GitHub issue"),
              status: String(data.status ?? "OPEN"),
              url: ctx.url,
            };
            const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "github", {
              title: String(data.title ?? `GitHub ${structured.status}`),
              description: String(data.description ?? `${data.status ?? "issue"} • via N0VA1O gateway`),
              siteName: "GitHub",
              structured,
            });
            await setCachedPreview(rec);
            await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "github", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
            return rec;
          }
        }
      } catch {}
      // Fallback: signal match for icon, let OG unfurl handle (still via gateway for generic web)
      return null;
    },
  },
  // Jira — via N0VA1O gateway
  {
    kind: "jira",
    match: (url) => {
      const m = /atlassian\.net\/browse\/(?<key>[A-Z]+-\d+)/i.exec(url) ?? /\/browse\/(?<key>[A-Z]+-\d+)/i.exec(url);
      return { matched: !!m, objectId: m?.groups?.key, extra: { key: m?.groups?.key ?? "" } };
    },
    fetch: async (ctx) => {
      const policy = await canUnfurl({ workspaceId: ctx.workspaceId, userId: ctx.userId, role: ctx.role, url: ctx.url, kind: "jira" });
      if (!policy.allowed) { await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "jira", channelId: ctx.channelId, messageId: ctx.messageId, allowed: false, reason: policy.reason }); return null; }
      try {
        const connector = await prisma.integration.findFirst({ where: { workspaceId: ctx.workspaceId, provider: "jira" } });
        if (connector) {
          const { chatGatewayCall } = await import("../n0va1o/bridge");
          const res = await chatGatewayCall({
            workspaceId: ctx.workspaceId,
            userId: ctx.userId,
            connectorId: connector.id,
            provider: "jira",
            action: "fetch_ticket",
            input: { url: ctx.url, key: ctx.url.match(/[A-Z]+-\d+/)?.[0] ?? ctx.url },
            messageId: ctx.messageId,
            channelId: ctx.channelId,
          });
          if (res.ok && res.data) {
            const data = res.data as Record<string, unknown>;
            const structured = {
              objectId: String(data.externalId ?? ctx.url),
              objectType: "jira_ticket",
              key: String(data.key ?? ctx.url),
              status: String(data.status ?? "OPEN"),
              priority: String(data.priority ?? "P2"),
              assignee: String(data.assignee ?? "unassigned"),
            };
            const rec = makePreviewRecord(ctx.workspaceId, ctx.url, "jira", {
              title: String(data.title ?? `Jira ${structured.key}`),
              description: `${structured.status} • ${structured.priority} • ${structured.assignee} • via N0VA1O`,
              siteName: "Jira",
              structured,
            });
            await setCachedPreview(rec);
            await logPreviewAccess({ workspaceId: ctx.workspaceId, actorId: ctx.userId, actorName: ctx.actorName, url: ctx.url, kind: "jira", channelId: ctx.channelId, messageId: ctx.messageId, allowed: true });
            return rec;
          }
        }
      } catch {}
      return null;
    },
  },
];

export function findAdapter(url: string): Adapter | null {
  for (const a of adapters) {
    try { if (a.match(url).matched) return a; } catch {}
  }
  return null;
}

export async function resolveWithAdapters(
  urls: string[],
  ctx: { workspaceId: string; userId: string; role: import("@n0va/authz").Role; channelId?: string; messageId?: string; actorName?: string },
): Promise<PreviewCacheRecord[]> {
  const out: PreviewCacheRecord[] = [];
  for (const url of urls) {
    // Check cache first
    const cached = await getCachedPreview(ctx.workspaceId, url);
    if (cached) { out.push(cached); continue; }
    const adapter = findAdapter(url);
    if (adapter) {
      try {
        const rec = await adapter.fetch({ ...ctx, url });
        if (rec) { out.push(rec); continue; }
        // For github/jira where adapter.fetch returns null, fall through to OG unfurl below — caller handles external
      } catch {}
    }
    // No adapter or adapter declined — external unfurl will be attempted by caller (unfurlMany)
  }
  return out;
}

export function iconForKind(kind: string): string {
  switch (kind) {
    case "n0va_doc": return "📄";
    case "n0va_sheet": return "📊";
    case "n0va_task": return "✅";
    case "n0va_meeting": return "📅";
    case "n0va_crm": return "👤";
    case "n0va_file": return "📎";
    case "n0va_approval": return "✔️";
    case "github": return "🐙";
    case "jira": return "🎫";
    default: return "🔗";
  }
}
