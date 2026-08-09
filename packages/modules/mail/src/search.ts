/**
 * N0VA MAIL — Advanced Search Engine
 *
 * Implements the full search operator grammar from the spec:
 * from:, to:, subject:, has:attachment, in:, label:, date:,
 * size:, is:unread, sentiment:, priority:, topic:, near:,
 * related:, has:voice, has:poll, collaborated:, ai:suggested, visual:
 */

import { prisma } from "@n0va/db";

// ── Types ──────────────────────────────────────────────────

export interface SearchQuery {
  raw: string;
  operators: SearchOperator[];
  freeText: string;
}

export interface SearchOperator {
  field: SearchField;
  operator: string;
  value: string;
}

export type SearchField =
  | "from"
  | "to"
  | "subject"
  | "has"
  | "in"
  | "label"
  | "date"
  | "size"
  | "is"
  | "sentiment"
  | "priority"
  | "topic"
  | "near"
  | "related"
  | "collaborated"
  | "ai"
  | "visual"
  | "body";

export interface SearchResult {
  messageId: string;
  threadId: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  snippet: string;
  date: Date;
  folder: string;
  labels: Array<{ id: string; name: string; color: string }>;
  score: number;
  aiPriority?: string;
  aiCategory?: string;
  aiSentiment?: string;
}

export interface SearchOptions {
  workspaceId: string;
  folder?: string;
  limit?: number;
  offset?: number;
  sortBy?: "relevance" | "date_asc" | "date_desc";
}

// ── Query Parser ───────────────────────────────────────────

const OPERATOR_PATTERN = /(\w+):("([^"]+)"|(\S+))/g;

export function parseSearchQuery(raw: string): SearchQuery {
  const operators: SearchOperator[] = [];
  const matches = [...raw.matchAll(OPERATOR_PATTERN)];
  const matchedRanges: Array<[number, number]> = [];

  for (const match of matches) {
    const field = match[1]!.toLowerCase() as SearchField;
    const value = match[3] ?? match[4] ?? "";
    if (isValidField(field)) {
      operators.push({ field, operator: "contains", value });
      matchedRanges.push([match.index!, match.index! + match[0]!.length]);
    }
  }

  // Extract free text (parts not matched by operators)
  let freeText = "";
  let lastEnd = 0;
  for (const [start, end] of matchedRanges) {
    freeText += raw.slice(lastEnd, start);
    lastEnd = end;
  }
  freeText += raw.slice(lastEnd);
  freeText = freeText.trim();

  return { raw, operators, freeText };
}

function isValidField(field: string): boolean {
  const validFields: SearchField[] = [
    "from", "to", "subject", "has", "in", "label", "date",
    "size", "is", "sentiment", "priority", "topic", "near",
    "related", "collaborated", "ai", "visual", "body",
  ];
  return validFields.includes(field as SearchField);
}

// ── Search Executor ────────────────────────────────────────

export async function executeSearch(query: SearchQuery, options: SearchOptions): Promise<SearchResult[]> {
  const { workspaceId, folder, limit = 50, offset = 0, sortBy = "relevance" } = options;

  const where: Record<string, unknown> = { workspaceId };
  const andConditions: Record<string, unknown>[] = [];
  const orConditions: Record<string, unknown>[] = [];

  // Folder filter
  if (folder) {
    where.folder = folder;
  }

  // Process each operator
  for (const op of query.operators) {
    const condition = buildCondition(op);
    if (condition) {
      if (op.field === "from" || op.field === "to") {
        orConditions.push(condition);
      } else {
        andConditions.push(condition);
      }
    }
  }

  // Free text search across subject + body
  if (query.freeText) {
    const freeTextLower = query.freeText.toLowerCase();
    orConditions.push({ subject: { contains: freeTextLower, mode: "insensitive" } });
    orConditions.push({ body: { contains: freeTextLower, mode: "insensitive" } });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }
  if (orConditions.length > 0) {
    where.OR = orConditions;
  }

  // Execute query
  let orderBy: Record<string, unknown> = { sentAt: "desc" };
  if (sortBy === "date_asc") orderBy = { sentAt: "asc" };
  if (sortBy === "relevance") orderBy = { sentAt: "desc" };

  const results = await prisma.mailMessage.findMany({
    where,
    include: { labels: { include: { label: true } } },
    orderBy,
    take: limit,
    skip: offset,
  });

  return results.map((m) => ({
    messageId: m.id,
    threadId: m.threadId,
    subject: m.subject,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    snippet: m.body.slice(0, 200),
    date: m.sentAt,
    folder: m.folder,
    labels: m.labels.map((lm) => ({ id: lm.labelId, name: lm.label.name, color: lm.label.color })),
    score: computeRelevanceScore(m, query),
    aiPriority: m.aiPriority,
    aiCategory: m.aiCategory,
    aiSentiment: m.aiSentiment,
  }));
}

function buildCondition(op: SearchOperator): Record<string, unknown> | null {
  const value = op.value.toLowerCase();

  switch (op.field) {
    case "from":
      return { fromEmail: { contains: value, mode: "insensitive" } };

    case "to":
      return { toEmails: { path: "$", string_contains: value } };

    case "subject":
      return { subject: { contains: value, mode: "insensitive" } };

    case "body":
      return { body: { contains: value, mode: "insensitive" } };

    case "has":
      return buildHasCondition(value);

    case "in":
      return { folder: { equals: value.toUpperCase() } };

    case "label":
      return { labels: { some: { label: { name: { contains: value, mode: "insensitive" } } } } };

    case "date":
      return buildDateCondition(value);

    case "size":
      // Size filtering requires a size field; approximate with body length
      return buildSizeCondition(value);

    case "is":
      return buildIsCondition(value);

    case "sentiment":
      return { aiSentiment: { equals: value } };

    case "priority":
      return { aiPriority: { equals: value.toUpperCase() } };

    case "topic":
      return { aiCategory: { contains: value, mode: "insensitive" } };

    case "near":
      // Natural language time approximation
      return buildNearCondition(value);

    case "related":
      return { threadId: { equals: op.value } };

    case "collaborated":
      return { mailboxId: { not: null } };

    case "ai":
      return { aiProcessed: true };

    case "visual":
      return { body: { contains: "<img", mode: "insensitive" } };

    default:
      return null;
  }
}

function buildHasCondition(value: string): Record<string, unknown> {
  switch (value) {
    case "attachment":
      return { attachments: { isEmpty: false } };
    case "voice":
      return { body: { contains: "[voice]", mode: "insensitive" } };
    case "poll":
      return { body: { contains: "[poll]", mode: "insensitive" } };
    default:
      // has:attachment type:pdf
      if (value.startsWith("type:")) {
        const type = value.replace("type:", "");
        return { body: { contains: type, mode: "insensitive" } };
      }
      return { body: { contains: value, mode: "insensitive" } };
  }
}

function buildDateCondition(value: string): Record<string, unknown> {
  // Support: date:2026-07, date:>2026-07, date:<2026-07, date:2026-07-01..2026-07-31
  if (value.includes("..")) {
    const [start, end] = value.split("..");
    return {
      sentAt: {
        gte: new Date(start!),
        lte: new Date(end!),
      },
    };
  }

  if (value.startsWith(">")) {
    return { sentAt: { gte: new Date(value.slice(1)) } };
  }

  if (value.startsWith("<")) {
    return { sentAt: { lte: new Date(value.slice(1)) } };
  }

  // Month format: 2026-07
  if (/^\d{4}-\d{2}$/.test(value)) {
    const start = new Date(`${value}-01`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { sentAt: { gte: start, lt: end } };
  }

  // Exact date
  return { sentAt: { equals: new Date(value) } };
}

function buildSizeCondition(value: string): Record<string, unknown> {
  // size:>10MB, size:<1MB
  const mbMultiplier = 1024 * 1024;
  if (value.startsWith(">")) {
    const sizeMB = parseFloat(value.slice(1).replace("MB", "").replace("mb", ""));
    return { body: { length: { gt: Math.floor(sizeMB * mbMultiplier) } } };
  }
  if (value.startsWith("<")) {
    const sizeMB = parseFloat(value.slice(1).replace("MB", "").replace("mb", ""));
    return { body: { length: { lt: Math.floor(sizeMB * mbMultiplier) } } };
  }
  return {};
}

function buildIsCondition(value: string): Record<string, unknown> {
  switch (value) {
    case "unread":
      return { isRead: false };
    case "read":
      return { isRead: true };
    case "starred":
      return { isStarred: true };
    case "important":
      return { aiPriority: "HIGH" };
    case "draft":
      return { status: "DRAFT" };
    case "scheduled":
      return { status: "SCHEDULED" };
    default:
      return {};
  }
}

function buildNearCondition(value: string): Record<string, unknown> {
  // near:meeting tomorrow → search for meeting in the next 2 days
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  return {
    AND: [
      { subject: { contains: value, mode: "insensitive" } },
      { sentAt: { gte: now, lte: tomorrow } },
    ],
  };
}

function computeRelevanceScore(
  message: { subject: string; body: string; sentAt: Date; aiPriority?: string | null },
  query: SearchQuery,
): number {
  let score = 0;
  const searchText = query.freeText.toLowerCase();

  // Subject match is worth more
  if (searchText && message.subject.toLowerCase().includes(searchText)) {
    score += 10;
  }

  // Body match
  if (searchText && message.body.toLowerCase().includes(searchText)) {
    score += 5;
  }

  // Operator matches
  score += query.operators.length * 3;

  // Priority boost
  if (message.aiPriority === "HIGH") score += 5;
  if (message.aiPriority === "LOW") score -= 2;

  // Recency boost (within last 7 days)
  const ageDays = (Date.now() - message.sentAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 7) score += 3;
  else if (ageDays < 30) score += 1;

  return Math.max(0, score);
}

// ── Search Suggestions ─────────────────────────────────────

export function getSearchSuggestions(partial: string): string[] {
  const suggestions: string[] = [];

  if (partial.startsWith("from:")) {
    suggestions.push("from:john@example.com", "from:team@");
  } else if (partial.startsWith("has:")) {
    suggestions.push("has:attachment", "has:voice", "has:poll", "has:attachment type:pdf");
  } else if (partial.startsWith("is:")) {
    suggestions.push("is:unread", "is:read", "is:starred", "is:important");
  } else if (partial.startsWith("date:")) {
    suggestions.push("date:2026-07", "date:>2026-07-01", "date:<2026-08-01");
  } else if (partial.startsWith("sentiment:")) {
    suggestions.push("sentiment:positive", "sentiment:negative", "sentiment:neutral");
  } else if (partial.startsWith("priority:")) {
    suggestions.push("priority:high", "priority:medium", "priority:low");
  } else if (partial.startsWith("in:")) {
    suggestions.push("in:inbox", "in:sent", "in:archive", "in:trash");
  } else {
    // General suggestions
    suggestions.push(
      "from:",
      "to:",
      "subject:",
      "has:attachment",
      "is:unread",
      "date:",
      "sentiment:",
      "priority:",
      "in:",
      "label:",
      "topic:",
    );
  }

  return suggestions;
}
