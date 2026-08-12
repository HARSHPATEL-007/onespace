import { createHash } from "node:crypto";
import { prisma, type Prisma } from "@n0va/db";
import { publish } from "./emitter";

export type HyperModule = "mail" | "calendar" | "tasks" | "docs" | "crm" | "erp" | "finance" | "voice" | "health";

export interface ExtractedEntity {
  module: HyperModule;
  objectId: string;
  relation: string;
  score: number;
  confidence: number;
  source: string;
  privacyScope: "OPEN" | "CONFIDENTIAL";
}

export interface ExtractResult {
  mentions: Array<{ userId: string; name: string; score: number }>;
  money: Array<{ amount: number; currency: string }>;
  dateAt: Date | null;
  dateRaw: string | null;
  docRefs: string[];
  moduleHits: Partial<Record<HyperModule, number>>;
  intent: { task: boolean; event: boolean; approval: boolean };
  title: string;
  quote: string;
  body: string;
}

const TASK_PATTERNS = [
  /\b(i'?ll|i will|will)\b.{0,40}\b(handle|do|send|fix|check|update|prepare|review|follow up|follow-up|look into|take care of)\b/i,
  /\b(remember to|don'?t forget to|make sure to|can you|could you|please)\b.{0,60}\b(handle|do|send|fix|check|update|prepare|review|follow up|look into|schedule|book|draft)\b/i,
  /\btodo\b|to-do|action item|to do list/i,
  /\b(due|deadline)\b/i,
];

const EVENT_PATTERNS = [
  /\b(meeting|call|sync|standup|demo|review|check-?in|catch-?up|huddle|workshop|interview)\b/i,
  /\b(let'?s|we should|we need to)\b.{0,40}\b(meet|talk|sync|discuss|go over)\b/i,
  /\b(when|what time)\b/i,
];

const APPROVAL_PATTERNS = [
  /\b(budget|expense|spend|cost|purchase|buy|procure|release|deploy|launch|sign-?off|approve|approval|permission|access|vendor)\b/i,
  /\b\$\s?\d[\d,]*(\.\d+)?\b/,
];

const MODULE_WORDS: Array<[HyperModule, RegExp]> = [
  ["mail", /\b(email|e-?mail|thread|inbox|outlook|gmail|message[ds]?)\b/i],
  ["calendar", /\b(meeting|calendar|schedule|slot|availability|sync|standup|workshop)\b/i],
  ["tasks", /\b(task|todo|to-?do|action item|assignee|follow-?up|deadline|due)\b/i],
  ["docs", /\b(doc|document|notes|spec|proposal|deck|slides|sheet|wiki|page)\b/i],
  ["crm", /\b(customer|client|lead|contact|account|opportunity|deal|prospect)\b/i],
  ["erp", /\b(order|inventory|stock|shipment|warehouse|supplier|sku|fulfillment)\b/i],
  ["finance", /\b(invoice|expense|budget|payment|receipt|revenue|forecast|payout|reimbursement)\b/i],
  ["voice", /\b(call|transcript|voicemail|recording|line|phone call)\b/i],
  ["health", /\b(stress|wellness|sick|sleep|health|check-?in|burnout|time off|break)\b/i],
];

const DOC_REF_RE = /(?:doc|document|note|spec|deck|proposal|file)[:"]?\s*["“]?([A-Za-z0-9][A-Za-z0-9 _\-/.]{2,60})["”]?/gi;

function titleFrom(body: string, intent: ExtractResult["intent"]): string {
  const clean = body.replace(/\s+/g, " ").trim().slice(0, 160);
  if (intent.task) {
    const m = clean.match(/(?:i'?ll|i will|please|could you|can you|remember to|make sure to|todo:?)\s+(.{3,120})/i);
    if (m) return m[1]!.replace(/[.!?]+$/, "").trim();
  }
  if (intent.event) {
    const m = clean.match(/(?:meet|meeting|call|sync|standup|workshop|demo|review|catch-?up|huddle)\b[^.,!?]*(.{0,60})?/i);
    if (m && m[0]) return m[0].slice(0, 120);
  }
  return clean.slice(0, 120);
}

export function extractTime(text: string): { dateAt: Date | null; raw: string | null } {
  const now = new Date();
  const lower = text.toLowerCase();

  let at: Date | null = null;
  let raw: string | null = null;
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const hour = timeMatch ? parseInt(timeMatch[1]!, 10) : null;
  const minute = timeMatch && timeMatch[2] ? parseInt(timeMatch[2]!, 10) : 0;
  const meridiem = timeMatch?.[3]?.toLowerCase();

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const [_, y, mo, d] = iso;
    const base = new Date(Date.UTC(+y!, +mo! - 1, +d!));
    if (hour !== null) {
      let h = hour;
      if (meridiem === "pm" && h < 12) h += 12;
      if (meridiem === "am" && h === 12) h = 0;
      base.setUTCHours(h, minute, 0, 0);
    }
    at = base;
    raw = iso[0]!;
  }

  if (!at) {
    const rel: Array<[RegExp, () => Date, string]> = [
      [/\btomorrow\b/, () => { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }, "tomorrow"],
      [/\bnext week\b/, () => { const d = new Date(now); d.setDate(d.getDate() + 7); return d; }, "next week"],
      [/\bnext monday\b/, () => { const d = new Date(now); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; }, "next monday"],
      [/\bnext friday\b/, () => { const d = new Date(now); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d; }, "next friday"],
      [/\bthis friday\b/, () => { const d = new Date(now); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); return d; }, "this friday"],
      [/\bthis monday\b/, () => { const d = new Date(now); d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7)); return d; }, "this monday"],
      [/\btoday\b/, () => new Date(now), "today"],
      [/\btomorrow at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i, () => { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }, "tomorrow at time"],
    ];
    for (const [re, fn, label] of rel) {
      const m = text.match(re);
      if (m) {
        at = fn();
        raw = label;
        if (hour !== null) {
          let h = hour;
          if (meridiem === "pm" && h < 12) h += 12;
          if (meridiem === "am" && h === 12) h = 0;
          at.setHours(h, minute, 0, 0);
        }
        break;
      }
    }
  }

  if (!at && hour !== null && meridiem) {
    let h = hour;
    if (meridiem === "pm" && h < 12) h += 12;
    if (meridiem === "am" && h === 12) h = 0;
    at = new Date(now);
    at.setHours(h, minute, 0, 0);
    raw = `${hour}:${minute}${meridiem}`;
  }

  return { dateAt: at, raw };
}

export async function extractEntities(ctx: {
  workspaceId: string;
  body: string;
  authorName: string;
  channelName: string;
  memberNames: Array<{ id: string; name: string }>;
}): Promise<ExtractResult> {
  const body = ctx.body;
  const lower = body.toLowerCase();
  const mentions: ExtractResult["mentions"] = [];
  const selfMention = /\b(i'?ll|i will|my)\b/i.test(body);
  for (const member of ctx.memberNames) {
    const nameRe = new RegExp(`@${escapeRegExp(member.name.split(" ")[0]!)}`, "i");
    if (nameRe.test(body)) {
      mentions.push({ userId: member.id, name: member.name, score: 0.95 });
    }
  }
  if (selfMention) {
    const author = ctx.memberNames.find((m) => m.name === ctx.authorName);
    if (author) mentions.push({ userId: author.id, name: author.name, score: 0.9 });
  }

  const money: ExtractResult["money"] = [];
  const moneyMatches = body.matchAll(/(?:\$|USD|EUR|GBP)\s?(\d[\d,]*(?:\.\d+)?)/gi);
  for (const m of moneyMatches) {
    money.push({ amount: parseFloat(m[1]!.replace(/,/g, "")), currency: m[0]!.match(/USD|EUR|GBP/i)?.[0] ?? "USD" });
  }

  const { dateAt, raw } = extractTime(body);

  const docRefs: string[] = [];
  for (const m of body.matchAll(DOC_REF_RE)) {
    if (m[1] && !/^(the|a|an|my|our|this|that)$/i.test(m[1]!)) docRefs.push(m[1]!.trim());
  }

  const moduleHits: Partial<Record<HyperModule, number>> = {};
  for (const [module, re] of MODULE_WORDS) {
    const hits = (lower.match(re) ?? []).length;
    if (hits > 0) moduleHits[module] = hits;
  }

  const intent = {
    task: TASK_PATTERNS.some((re) => re.test(lower)),
    event: EVENT_PATTERNS.some((re) => re.test(lower)),
    approval: APPROVAL_PATTERNS.some((re) => re.test(lower)) || money.length > 0,
  };

  return {
    mentions,
    money,
    dateAt,
    dateRaw: raw,
    docRefs,
    moduleHits,
    intent,
    title: titleFrom(body, intent),
    quote: body.slice(0, 300),
    body,
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scoreLink(extract: ExtractResult, opts: {
  module: HyperModule;
  lexicalHits: number;
  temporalProximityDays: number | null;
  participantOverlap: number;
  roomAffinity: boolean;
  messageAgeMs: number;
  selfOwned: boolean;
}): { score: number; confidence: number } {
  let score = 0;
  if (opts.lexicalHits > 0) score += Math.min(0.4, 0.15 * opts.lexicalHits);
  if (extract.intent.event && opts.module === "calendar") score += 0.25;
  if (extract.intent.task && opts.module === "tasks") score += 0.25;
  if (extract.intent.approval && (opts.module === "finance" || opts.module === "erp")) score += 0.25;
  if (extract.money.length > 0 && opts.module === "finance") score += 0.15;
  if (extract.dateAt && opts.temporalProximityDays !== null && opts.temporalProximityDays <= 14) score += 0.15;
  if (opts.participantOverlap > 0) score += Math.min(0.2, 0.1 * opts.participantOverlap);
  if (opts.roomAffinity) score += 0.15;
  const ageDays = opts.messageAgeMs / 86_400_000;
  score -= Math.min(0.1, ageDays * 0.02);
  if (opts.selfOwned) score += 0.05;
  const s = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return { score: s, confidence: 0.55 + s * 0.4 };
}

export function roomAffinity(channelName: string, module: HyperModule): boolean {
  const n = channelName.toLowerCase();
  const map: Record<HyperModule, string[]> = {
    mail: ["mail", "email", "inbox"],
    calendar: ["calendar", "schedule", "sync", "meetings", "standup"],
    tasks: ["task", "todo", "project", "ops", "delivery"],
    docs: ["doc", "docs", "wiki", "spec"],
    crm: ["crm", "sales", "customers", "clients", "deal"],
    erp: ["erp", "inventory", "supply", "orders", "warehouse"],
    finance: ["finance", "budget", "invoice", "money", "billing", "payments"],
    voice: ["voice", "calls", "support"],
    health: ["health", "wellness", "hr"],
  };
  return map[module].some((w) => n.includes(w));
}

export async function resolveModuleObjects(ctx: {
  workspaceId: string;
  extract: ExtractResult;
  channelName: string;
  authorUserId: string;
  messageAgeMs: number;
}): Promise<ExtractedEntity[]> {
  const { extract } = ctx;
  const links: ExtractedEntity[] = [];
  const memberIds = new Set(extract.mentions.map((m) => m.userId));

  const tryModule = async (
    module: HyperModule,
    find: (() => Promise<Array<{ id: string; kind?: string; title?: string; createdAt?: Date; participants?: string[] }>>) | null,
    relation: string,
    baseHits: number,
  ) => {
    const hits = extract.moduleHits[module] ?? 0;
    if (!find) {
      if (hits > 0) {
        links.push({ module, objectId: `kw:${module}`, relation: "keyword_reference", score: 0.35, confidence: 0.6, source: "AUTO", privacyScope: "OPEN" });
      }
      return;
    }
    const rows = await find();
    for (const row of rows) {
      const overlap = row.participants ? row.participants.filter((p) => memberIds.has(p)).length : 0;
      const { score, confidence } = scoreLink(extract, {
        module,
        lexicalHits: hits + baseHits,
        temporalProximityDays: row.createdAt ? Math.abs(Date.now() - row.createdAt.getTime()) / 86_400_000 : null,
        participantOverlap: overlap,
        roomAffinity: roomAffinity(ctx.channelName, module),
        messageAgeMs: ctx.messageAgeMs,
        selfOwned: row.kind === "self",
      });
      if (score >= 0.3) {
        links.push({ module, objectId: row.id, relation, score, confidence, source: "AUTO", privacyScope: "OPEN" });
      }
    }
  };

  await Promise.all([
    tryModule("mail", null, "mail_reference", 0),
    tryModule("tasks", () =>
      (async () => {
        if (!extract.intent.task) return [];
        const tasks = await prisma.task.findMany({
          where: { workspaceId: ctx.workspaceId, completedAt: null },
          select: { id: true, title: true, createdAt: true },
          take: 10,
          orderBy: { createdAt: "desc" },
        });
        return tasks.filter((t) => extract.body.toLowerCase().includes(t.title.slice(0, 24).toLowerCase())).map((t) => ({ id: t.id, createdAt: t.createdAt }));
      })(),
      "referenced_task",
      0.2,
    ),
    tryModule("calendar", () =>
      (async () => {
        const events = await prisma.calendarEvent.findMany({
          where: { workspaceId: ctx.workspaceId, startAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
          select: { id: true, title: true, startAt: true, attendees: true },
          take: 10,
          orderBy: { startAt: "desc" },
        });
        const relevant = events.filter((e) => {
          const titleHit = extract.body.toLowerCase().includes(e.title.slice(0, 24).toLowerCase());
          const attendeeHit = e.attendees.some((a) => memberIds.has(a));
          const close = extract.dateAt ? Math.abs(e.startAt.getTime() - extract.dateAt.getTime()) < 86_400_000 * 3 : false;
          return titleHit || attendeeHit || close;
        });
        return relevant.map((e) => ({ id: e.id, createdAt: e.startAt, participants: e.attendees }));
      })(),
      "related_meeting",
      0.25,
    ),
    tryModule("docs", () =>
      (async () => {
        if (extract.docRefs.length === 0) return [];
        const docs = await prisma.doc.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { id: true, title: true, createdAt: true },
          take: 50,
          orderBy: { updatedAt: "desc" },
        });
        return docs.filter((d) => extract.docRefs.some((ref) => d.title.toLowerCase().includes(ref.toLowerCase()))).map((d) => ({ id: d.id, createdAt: d.createdAt }));
      })(),
      "referenced_document",
      0.25,
    ),
    tryModule("crm", () =>
      (async () => {
        const contacts = await prisma.contact.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { id: true, firstName: true, lastName: true, company: true, createdAt: true },
          take: 100,
        });
        return contacts.filter((c) => {
          const full = `${c.firstName} ${c.lastName ?? ""} ${c.company ?? ""}`.toLowerCase();
          const words = extract.body.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
          return words.some((w) => full.includes(w));
        }).map((c) => ({ id: c.id, createdAt: c.createdAt }));
      })(),
      "customer_stakeholder",
      0.15,
    ),
    tryModule("finance", () =>
      (async () => {
        if (extract.money.length === 0) return [];
        const invoices = await prisma.invoice.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { id: true, amountCents: true, number: true, createdAt: true },
          take: 20,
          orderBy: { createdAt: "desc" },
        });
        const matched = invoices.filter((inv) =>
          extract.money.some((m) => Math.abs(m.amount * 100 - inv.amountCents) < Math.max(100, inv.amountCents * 0.05)),
        );
        if (matched.length === 0 && extract.money.length > 0) {
          return [{ id: `amt:${extract.money[0]!.amount}:${extract.money[0]!.currency}`, createdAt: new Date() }];
        }
        return matched.map((inv) => ({ id: inv.id, createdAt: inv.createdAt }));
      })(),
      "budget_source",
      0.25,
    ),
    tryModule("erp", null, "order_inventory_reference", 0),
    tryModule("voice", () =>
      (async () => {
        const calls = await prisma.callLog.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { id: true, startedAt: true, durationSec: true },
          take: 5,
          orderBy: { startedAt: "desc" },
        });
        return calls.map((c) => ({ id: c.id, createdAt: c.startedAt, kind: "self" }));
      })(),
      "related_transcript",
      0.1,
    ),
    tryModule("health", () =>
      (async () => {
        const checkins = await prisma.healthCheckin.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: { id: true, createdAt: true },
          take: 3,
          orderBy: { createdAt: "desc" },
        });
        return checkins.map((c) => ({ id: c.id, createdAt: c.createdAt }));
      })(),
      "wellness_indicator",
      0.1,
    ),
  ]);

  return links.sort((a, b) => b.score - a.score).slice(0, 12);
}

export async function getHyperConfig(workspaceId: string) {
  return prisma.chatHyperConfig.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} });
}

// ── Transactional outbox ────────────────────────────────────────────────

export async function enqueueOutbox(entry: {
  workspaceId: string;
  messageId?: string;
  actionType: string;
  module: string;
  payload: Record<string, unknown>;
  causeEventId?: string;
}): Promise<{ id: string; causalOrder: number; idempotencyKey: string }> {
  const idempotencyKey = `${entry.actionType}:${entry.messageId ?? "ws"}:${sha1(JSON.stringify(entry.payload)).slice(0, 16)}`;
  const last = await prisma.chatOutboxEvent.aggregate({
    where: { workspaceId: entry.workspaceId },
    _max: { causalOrder: true },
  });
  const causalOrder = (last._max.causalOrder ?? 0) + 1;
  const row = await prisma.chatOutboxEvent.upsert({
    where: { idempotencyKey },
    create: {
      idempotencyKey,
      workspaceId: entry.workspaceId,
      messageId: entry.messageId,
      actionType: entry.actionType,
      module: entry.module,
      payload: entry.payload as Prisma.InputJsonValue,
      causeEventId: entry.causeEventId,
      causalOrder,
    },
    update: {},
  });
  return { id: row.id, causalOrder, idempotencyKey };
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

export interface OutboxConsumer {
  key: string;
  run: (workspaceId: string, payload: Record<string, unknown>) => Promise<void>;
}

export async function processOutbox(workspaceId: string, consumers: OutboxConsumer[], limit = 25) {
  const pending = await prisma.chatOutboxEvent.findMany({
    where: { workspaceId, status: { in: ["PENDING", "FAILED"] }, attempts: { lt: 3 } },
    orderBy: { causalOrder: "asc" },
    take: limit,
  });
  const results: Array<{ id: string; actionType: string; status: string; error?: string }> = [];
  for (const evt of pending) {
    const consumer = consumers.find((c) => c.key === evt.actionType);
    try {
      if (!consumer) throw new Error(`No consumer for ${evt.actionType}`);
      await consumer.run(workspaceId, evt.payload as Record<string, unknown>);
      await prisma.chatOutboxEvent.update({
        where: { id: evt.id },
        data: { status: "PROCESSED", processedAt: new Date(), attempts: { increment: 1 } },
      });
      results.push({ id: evt.id, actionType: evt.actionType, status: "PROCESSED" });
    } catch (err) {
      const error = (err as Error).message;
      await prisma.chatOutboxEvent.update({
        where: { id: evt.id },
        data: { attempts: { increment: 1 }, error, status: evt.attempts + 1 >= 3 ? "FAILED" : "PENDING" },
      });
      if (evt.attempts + 1 >= 3) {
        await prisma.chatCompensationLog.create({
          data: { workspaceId, outboxEventId: evt.id, step: evt.actionType, reason: error },
        });
      }
      results.push({ id: evt.id, actionType: evt.actionType, status: evt.attempts + 1 >= 3 ? "FAILED" : "RETRYING", error });
    }
  }
  return results;
}

// ── Orchestration: build + persist hyper-context for a message ──────────

export interface HyperBuildInput {
  workspaceId: string;
  messageId: string;
  threadId?: string | null;
  body: string;
  authorName: string;
  authorUserId: string;
  channelName: string;
  createdAt: Date;
  memberNames: Array<{ id: string; name: string }>;
}

export async function buildHyperContext(input: HyperBuildInput): Promise<void> {
  const config = await getHyperConfig(input.workspaceId);
  const extract = await extractEntities({
    workspaceId: input.workspaceId,
    body: input.body,
    authorName: input.authorName,
    channelName: input.channelName,
    memberNames: input.memberNames,
  });
  const messageAgeMs = Date.now() - input.createdAt.getTime();
  const entities = await resolveModuleObjects({
    workspaceId: input.workspaceId,
    extract,
    channelName: input.channelName,
    authorUserId: input.authorUserId,
    messageAgeMs,
  });

  const prismaPromises: Array<Promise<unknown>> = [];

  for (const link of entities.slice(0, config.maxLinks)) {
    prismaPromises.push(
      prisma.chatLinkSuggestion.upsert({
        where: { id: `${input.messageId}:${link.module}:${link.objectId}`.slice(0, 191) },
        create: {
          id: `${input.messageId}:${link.module}:${link.objectId}`.slice(0, 191),
          workspaceId: input.workspaceId,
          messageId: input.messageId,
          module: link.module,
          objectId: link.objectId,
          relation: link.relation,
          score: link.score,
          confidence: link.confidence,
          source: link.source,
          createdById: input.authorUserId,
        },
        update: { score: link.score, confidence: link.confidence, relation: link.relation },
      }),
    );
  }

  const actions: Array<Record<string, unknown>> = [];
  const causalChain: Array<Record<string, unknown>> = [{ step: "message.ingested", entity: "ChatMessage", messageId: input.messageId }];

  const ownerUserId = extract.mentions[0]?.userId ?? input.authorUserId;

  if (extract.intent.task) {
    const bestTaskLink = entities.find((e) => e.module === "tasks" && e.relation === "referenced_task");
    const proposal = await prisma.chatTaskProposal.upsert({
      where: { id: `task:${input.messageId}`.slice(0, 191) },
      create: {
        id: `task:${input.messageId}`.slice(0, 191),
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        title: extract.title,
        ownerUserId,
        dueDate: extract.dateAt ?? undefined,
        sourceQuote: extract.quote,
        linkedEntities: entities.filter((e) => e.score >= 0.3).slice(0, 5) as unknown as Prisma.InputJsonValue,
        confidence: 0.7,
        createdById: input.authorUserId,
      },
      update: { title: extract.title, ownerUserId, dueDate: extract.dateAt ?? null, sourceQuote: extract.quote },
    });
    const confidence = Math.max(0.7, Math.min(0.98, 0.6 + extract.mentions.length * 0.1 + (bestTaskLink ? 0.15 : 0)));
    if (config.autoCreateTasks && confidence >= config.taskConfidence) {
      await prisma.chatTaskProposal.update({ where: { id: proposal.id }, data: { confidence } });
      await enqueueOutbox({
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        actionType: "CREATE_TASK",
        module: "tasks",
        payload: { proposalId: proposal.id, title: extract.title, dueDate: extract.dateAt?.toISOString() ?? null, ownerUserId },
        causeEventId: input.messageId,
      });
      causalChain.push({ step: "outbox.enqueued", entity: "ChatOutboxEvent", actionType: "CREATE_TASK", proposalId: proposal.id });
    }
    actions.push({ type: "task_proposal", status: proposal.status, proposalId: proposal.id, confidence, dueDate: extract.dateAt ?? null });
  }

  if (extract.intent.event) {
    const bestEventLink = entities.find((e) => e.module === "calendar" && e.relation === "related_meeting");
    const proposal = await prisma.chatEventProposal.upsert({
      where: { id: `event:${input.messageId}`.slice(0, 191) },
      create: {
        id: `event:${input.messageId}`.slice(0, 191),
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        title: extract.title,
        startsAt: extract.dateAt ?? undefined,
        endsAt: extract.dateAt ? new Date(extract.dateAt.getTime() + 3_600_000) : undefined,
        attendeeUserIds: extract.mentions.map((m) => m.userId) as unknown as Prisma.InputJsonValue,
        agendaDraft: extract.quote,
        status: bestEventLink ? "DUPLICATE" : "SUGGESTED",
        createdById: input.authorUserId,
      },
      update: {
        title: extract.title,
        startsAt: extract.dateAt ?? null,
        endsAt: extract.dateAt ? new Date(extract.dateAt.getTime() + 3_600_000) : null,
        attendeeUserIds: extract.mentions.map((m) => m.userId) as unknown as Prisma.InputJsonValue,
      },
    });
    const confidence = Math.max(0.6, Math.min(0.98, 0.55 + (extract.dateAt ? 0.2 : 0) + (extract.mentions.length > 0 ? 0.1 : 0) + (bestEventLink ? 0.15 : 0)));
    if (config.autoCreateEvents && confidence >= config.eventConfidence && !bestEventLink) {
      await enqueueOutbox({
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        actionType: "CREATE_EVENT",
        module: "calendar",
        payload: { proposalId: proposal.id, title: extract.title, startsAt: extract.dateAt?.toISOString() ?? null, attendees: extract.mentions.map((m) => m.userId) },
        causeEventId: input.messageId,
      });
      causalChain.push({ step: "outbox.enqueued", entity: "ChatOutboxEvent", actionType: "CREATE_EVENT", proposalId: proposal.id });
    }
    actions.push({ type: "event_proposal", status: proposal.status, proposalId: proposal.id, confidence, startsAt: extract.dateAt ?? null });
  }

  if (extract.intent.approval) {
    const proposal = await prisma.chatApprovalRequest.upsert({
      where: { id: `approval:${input.messageId}`.slice(0, 191) },
      create: {
        id: `approval:${input.messageId}`.slice(0, 191),
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        requestType: "GENERAL",
        approverUserId: ownerUserId,
        requiredEvidence: entities.filter((e) => e.module === "finance" || e.module === "erp").map((e) => ({ module: e.module, objectId: e.objectId })) as unknown as Prisma.InputJsonValue,
        linkedObjectIds: entities.filter((e) => e.score >= 0.3).slice(0, 5).map((e) => e.objectId) as unknown as Prisma.InputJsonValue,
        rationale: extract.quote,
        amount: extract.money[0]?.amount ?? null,
        createdById: input.authorUserId,
      },
      update: { rationale: extract.quote, amount: extract.money[0]?.amount ?? null },
    });
    const confidence = Math.max(0.55, Math.min(0.98, 0.5 + (extract.money.length > 0 ? 0.25 : 0) + (entities.some((e) => e.module === "finance") ? 0.15 : 0)));
    if (config.autoRaiseApprovals && confidence >= config.approvalConfidence) {
      await enqueueOutbox({
        workspaceId: input.workspaceId,
        messageId: input.messageId,
        actionType: "RAISE_APPROVAL",
        module: "approvals",
        payload: { proposalId: proposal.id, requestType: "GENERAL", amount: extract.money[0]?.amount ?? null },
        causeEventId: input.messageId,
      });
      causalChain.push({ step: "outbox.enqueued", entity: "ChatOutboxEvent", actionType: "RAISE_APPROVAL", proposalId: proposal.id });
    }
    actions.push({ type: "approval_proposal", status: proposal.status, proposalId: proposal.id, confidence, amount: extract.money[0]?.amount ?? null });
  }

  if (entities.length > 0) {
    causalChain.push({ step: "links.resolved", count: entities.length, entities: entities.map((e) => `${e.module}:${e.objectId}`).slice(0, 6) });
  }
  if (extract.dateAt) causalChain.push({ step: "time.extracted", raw: extract.dateRaw, at: extract.dateAt.toISOString() });

  await Promise.all(prismaPromises);
  await prisma.chatHyperContext.upsert({
    where: { messageId: input.messageId },
    create: {
      messageId: input.messageId,
      workspaceId: input.workspaceId,
      threadId: input.threadId ?? null,
      causalChain: causalChain as unknown as Prisma.InputJsonValue,
      links: entities.slice(0, config.maxLinks).map((e) => ({ module: e.module, objectId: e.objectId, relation: e.relation, score: e.score, confidence: e.confidence, source: e.source, privacyScope: e.privacyScope })) as unknown as Prisma.InputJsonValue,
      actions: actions as unknown as Prisma.InputJsonValue,
    },
    update: {
      causalChain: causalChain as unknown as Prisma.InputJsonValue,
      links: entities.slice(0, config.maxLinks).map((e) => ({ module: e.module, objectId: e.objectId, relation: e.relation, score: e.score, confidence: e.confidence, source: e.source, privacyScope: e.privacyScope })) as unknown as Prisma.InputJsonValue,
      actions: actions as unknown as Prisma.InputJsonValue,
      threadId: input.threadId ?? null,
    },
  });
}

// ── Task / event / approval commits ─────────────────────────────────────

export async function commitTaskProposal(workspaceId: string, proposalId: string): Promise<{ taskId: string | null; status: string }> {
  const proposal = await prisma.chatTaskProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Task proposal not found");
  if (proposal.status === "COMMITTED" && proposal.externalTaskId) {
    return { taskId: proposal.externalTaskId, status: "COMMITTED" };
  }
  const list = await prisma.taskList.findFirst({
    where: { workspaceId, name: "From Chat" },
  });
  const targetList = list ?? (await prisma.taskList.create({ data: { workspaceId, name: "From Chat", color: "default" } }));
  const task = await prisma.task.create({
    data: {
      listId: targetList.id,
      workspaceId,
      createdById: proposal.createdById,
      title: proposal.title,
      notes: `From chat: ${proposal.sourceQuote}`,
      dueDate: proposal.dueDate,
      assigneeId: proposal.ownerUserId,
      priority: (proposal.priority as "LOW" | "MEDIUM" | "HIGH") ?? "MEDIUM",
    },
  });
  await prisma.chatTaskProposal.update({
    where: { id: proposalId },
    data: { status: "COMMITTED", externalTaskId: task.id },
  });
  publish(workspaceId, {
    type: "hyperctx" as const,
    action: "task_committed" as const,
    message_id: proposal.messageId,
    task_id: task.id,
  });
  return { taskId: task.id, status: "COMMITTED" };
}

export async function commitEventProposal(workspaceId: string, proposalId: string): Promise<{ meetingId: string; status: string }> {
  const proposal = await prisma.chatEventProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Event proposal not found");
  if (proposal.linkedMeetingId) return { meetingId: proposal.linkedMeetingId, status: "DUPLICATE" };
  if (!proposal.startsAt) throw new Error("No time parsed from this message");
  const existing = await prisma.calendarEvent.findFirst({
    where: {
      workspaceId,
      title: { contains: proposal.title.slice(0, 24) },
      startAt: { gte: new Date(proposal.startsAt.getTime() - 3_600_000), lte: new Date(proposal.startsAt.getTime() + 3_600_000) },
    },
  });
  if (existing) {
    await prisma.chatEventProposal.update({
      where: { id: proposalId },
      data: { status: "DUPLICATE", linkedMeetingId: existing.id },
    });
    return { meetingId: existing.id, status: "DUPLICATE" };
  }
  const attendees = (proposal.attendeeUserIds as unknown as string[]).filter(Boolean);
  const event = await prisma.calendarEvent.create({
    data: {
      workspaceId,
      createdById: proposal.createdById,
      title: proposal.title,
      description: proposal.agendaDraft || `From chat: ${proposal.messageId}`,
      startAt: proposal.startsAt,
      endAt: proposal.endsAt ?? new Date(proposal.startsAt.getTime() + 3_600_000),
      attendees,
    },
  });
  await prisma.chatEventProposal.update({
    where: { id: proposalId },
    data: { status: "COMMITTED", linkedMeetingId: event.id },
  });
  publish(workspaceId, {
    type: "hyperctx" as const,
    action: "event_committed" as const,
    message_id: proposal.messageId,
    event_id: event.id,
  });
  return { meetingId: event.id, status: "COMMITTED" };
}
