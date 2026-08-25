import { prisma } from "@n0va/db";
import { type WorkspaceContext } from "./engine";

export interface RagDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  module: string;
  score: number;
}

export interface RagContext {
  query: string;
  expandedQuery: string;
  documents: RagDocument[];
  citations: Array<{ source: string; confidence: number; snippet: string }>;
  assembledPrompt: string;
}

export async function retrieveRagContext(
  query: string,
  workspace: WorkspaceContext,
  limit = 5,
): Promise<RagContext> {
  const expandedQuery = _expandQuery(query);
  const rawTerms = expandedQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  // dedupe + cap terms for query efficiency
  const searchTerms = [...new Set(rawTerms)].slice(0, 12);

  const documents: RagDocument[] = [];
  const fetchLimit = Math.max(limit * 2, 8);

  // Helper: build hybrid OR clause (title OR content)
  const buildOr = (titleField: string, contentField: string) =>
    searchTerms.flatMap((term) => [
      { [titleField]: { contains: term, mode: "insensitive" as const } },
      { [contentField]: { contains: term, mode: "insensitive" as const } },
    ]);

  try {
    const docs = await prisma.doc.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: buildOr("title", "content"),
      },
      orderBy: { updatedAt: "desc" },
      take: fetchLimit,
    });
    for (const d of docs) {
      const rawContent = (d.content ?? "") as string;
      documents.push({
        id: d.id,
        title: d.title,
        content: rawContent,
        source: `doc:${d.id}`,
        module: "docs",
        score: _initialScore("docs", d.updatedAt, query, d.title, rawContent),
      });
    }
  } catch {
    /* module may not be populated */
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: buildOr("title", "notes"),
      },
      orderBy: { updatedAt: "desc" },
      take: fetchLimit,
    });
    for (const t of tasks) {
      const rawNotes = (t.notes ?? "") as string;
      documents.push({
        id: t.id,
        title: t.title,
        content: rawNotes,
        source: `task:${t.id}`,
        module: "tasks",
        score: _initialScore("tasks", t.updatedAt, query, t.title, rawNotes),
      });
    }
  } catch {
    /* */
  }

  try {
    const notes = await prisma.note.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: buildOr("title", "body"),
      },
      orderBy: { updatedAt: "desc" },
      take: fetchLimit,
    });
    for (const n of notes) {
      const rawBody = (n.body ?? "") as string;
      documents.push({
        id: n.id,
        title: n.title,
        content: rawBody,
        source: `note:${n.id}`,
        module: "keep",
        score: _initialScore("keep", n.updatedAt, query, n.title, rawBody),
      });
    }
  } catch {
    /* */
  }

  try {
    // Calendar: hybrid recency + term boost; recent events get higher base
    const events = await prisma.calendarEvent.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        startAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { startAt: "desc" },
      take: fetchLimit,
    });
    for (const e of events) {
      const rawDesc = (e.description ?? "") as string;
      const titleMatch = searchTerms.some((t) =>
        e.title.toLowerCase().includes(t),
      );
      const descMatch = searchTerms.some((t) =>
        rawDesc.toLowerCase().includes(t),
      );
      // Only include if matches or very recent (within 48h)
      const isRecent = e.startAt.getTime() > Date.now() - 2 * 24 * 60 * 60 * 1000;
      if (!titleMatch && !descMatch && !isRecent) continue;
      documents.push({
        id: e.id,
        title: e.title,
        content: rawDesc,
        source: `calendar:${e.id}`,
        module: "calendar",
        score: _initialScore(
          "calendar",
          e.updatedAt ?? e.startAt,
          query,
          e.title,
          rawDesc,
        ),
      });
    }
  } catch {
    /* */
  }

  // Cross-module: Mail — subject/body hybrid search (always attempt, not just mail hint)
  try {
    const prismaAny = prisma as unknown as Record<
      string,
      { findMany: (a: unknown) => Promise<unknown[]> }
    >;
    if (prismaAny["mailMessage"]) {
      // Prefer subject OR body match to improve recall
      const mails = (await prismaAny["mailMessage"].findMany({
        where: {
          workspaceId: workspace.workspaceId,
          OR: searchTerms.flatMap((term) => [
            { subject: { contains: term, mode: "insensitive" as const } },
            { body: { contains: term, mode: "insensitive" as const } },
          ]),
        },
        orderBy: { updatedAt: "desc" },
        take: Math.ceil(fetchLimit / 2),
      })) as Array<{ id: string; subject: string; body?: string; updatedAt: Date }>;
      for (const m of mails) {
        documents.push({
          id: m.id,
          title: m.subject || "(no subject)",
          content: (m.body ?? "").slice(0, 600),
          source: `mail:${m.id}`,
          module: "mail",
          score: _initialScore(
            "mail",
            m.updatedAt,
            query,
            m.subject,
            m.body ?? "",
          ),
        });
      }
    }
  } catch {
    /* optional */
  }

  // Cross-module: Chat — recent messages containing query terms (ChatMessage.body)
  try {
    const chatMessages = await prisma.chatMessage.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.map((term) => ({
          body: { contains: term, mode: "insensitive" as const },
        })),
      },
      orderBy: { createdAt: "desc" },
      take: Math.ceil(fetchLimit / 2),
    });
    for (const cm of chatMessages) {
      documents.push({
        id: cm.id,
        title: `Chat: ${cm.authorName} in ${cm.channelId.slice(0, 8)}`,
        content: cm.body.slice(0, 500),
        source: `chat:${cm.id}`,
        module: "chat",
        score: _initialScore(
          "chat",
          cm.createdAt,
          query,
          cm.body.slice(0, 60),
          cm.body,
        ),
      });
    }
  } catch {
    /* chat may be empty */
  }

  // Cross-module: Contacts
  try {
    const contacts = await prisma.contact.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.flatMap((term) => [
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { company: { contains: term, mode: "insensitive" as const } },
          { email: { contains: term, mode: "insensitive" as const } },
        ]),
      },
      orderBy: { updatedAt: "desc" },
      take: Math.ceil(fetchLimit / 2),
    });
    for (const c of contacts) {
      const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
      documents.push({
        id: c.id,
        title: name + (c.company ? ` @ ${c.company}` : ""),
        content: `${c.email ?? ""} ${c.notes ?? ""}`.trim().slice(0, 400),
        source: `contact:${c.id}`,
        module: "contacts",
        score: _initialScore("contacts", c.updatedAt, query, name, c.email ?? ""),
      });
    }
  } catch {
    /* */
  }

  // Cross-module: CRM Deals
  try {
    const deals = await prisma.deal.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.flatMap((term) => [
          { title: { contains: term, mode: "insensitive" as const } },
          { company: { contains: term, mode: "insensitive" as const } },
        ]),
      },
      orderBy: { updatedAt: "desc" },
      take: Math.ceil(fetchLimit / 2),
    });
    for (const d of deals) {
      const valueStr = (d as unknown as { valueCents?: number }).valueCents
        ? `$${(((d as unknown as { valueCents: number }).valueCents) / 100).toLocaleString()}`
        : "";
      documents.push({
        id: d.id,
        title: `Deal: ${d.title} (${d.stage ?? ""})`,
        content: `${d.company ?? ""} — ${valueStr}`.trim().slice(0, 400),
        source: `deal:${d.id}`,
        module: "crm",
        score: _initialScore("crm", d.updatedAt, query, d.title, d.company ?? ""),
      });
    }
  } catch {
    /* */
  }

  // Cross-module: Storage / Files (FileIndex extractedText)
  try {
    const prismaAny2 = prisma as unknown as Record<
      string,
      { findMany: (a: unknown) => Promise<unknown[]> }
    >;
    if (prismaAny2["fileIndex"]) {
      const files = (await prismaAny2["fileIndex"].findMany({
        where: {
          workspaceId: workspace.workspaceId,
          OR: searchTerms.flatMap((term) => [
            { filename: { contains: term, mode: "insensitive" as const } },
            { extractedText: { contains: term, mode: "insensitive" as const } },
          ]),
        },
        orderBy: { updatedAt: "desc" },
        take: Math.ceil(fetchLimit / 2),
      })) as Array<{
        objectId: string;
        filename: string;
        extractedText?: string | null;
        updatedAt: Date;
      }>;
      for (const f of files) {
        documents.push({
          id: f.objectId,
          title: f.filename,
          content: (f.extractedText ?? "").slice(0, 600),
          source: `file:${f.objectId}`,
          module: "drive",
          score: _initialScore(
            "drive",
            f.updatedAt,
            query,
            f.filename,
            f.extractedText ?? "",
          ),
        });
      }
    } else {
      // Fallback: StorageItem name search
      const items = await prisma.storageItem.findMany({
        where: {
          workspaceId: workspace.workspaceId,
          name: { contains: searchTerms[0] ?? "", mode: "insensitive" as const },
        },
        orderBy: { updatedAt: "desc" },
        take: 3,
      });
      for (const it of items) {
        documents.push({
          id: it.id,
          title: it.name,
          content: `${it.mimeType} ${it.sizeBytes} bytes`,
          source: `storage:${it.id}`,
          module: "drive",
          score: _initialScore("drive", it.updatedAt, query, it.name, ""),
        });
      }
    }
  } catch {
    /* */
  }

  // Cross-module: Approvals
  try {
    const approvals = await prisma.approvalRequest.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.map((term) => ({
          rationale: { contains: term, mode: "insensitive" as const },
        })),
      },
      orderBy: { createdAt: "desc" },
      take: Math.ceil(fetchLimit / 2),
    });
    for (const a of approvals) {
      documents.push({
        id: a.id,
        title: `Approval: ${a.requestType} — ${a.status}`,
        content: (a.rationale ?? "").slice(0, 500),
        source: `approval:${a.id}`,
        module: "approvals",
        score: _initialScore(
          "approvals",
          a.createdAt,
          query,
          a.requestType,
          a.rationale ?? "",
        ),
      });
    }
  } catch {
    /* */
  }

  if (documents.length === 0) {
    const recentDocs = await prisma.doc.findMany({
      where: { workspaceId: workspace.workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 3,
    });
    for (const d of recentDocs) {
      documents.push({
        id: d.id,
        title: d.title,
        content: (d.content?.slice(0, 500) ?? "") as string,
        source: `doc:${d.id}`,
        module: "docs",
        score: 0.45,
      });
    }
  }

  // Hybrid re-ranking: relevance + recency + module boost
  const ranked = rankRagResults(documents, query);
  // Deduplicate by id
  const seen = new Set<string>();
  const deduped: RagDocument[] = [];
  for (const d of ranked) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    deduped.push(d);
  }
  const sorted = deduped.slice(0, limit);

  return {
    query,
    expandedQuery,
    documents: sorted,
    citations: sorted.map((d) => ({
      source: d.source,
      confidence: d.score,
      snippet: d.content.slice(0, 220),
    })),
    assembledPrompt: _assemblePrompt(query, sorted),
  };
}

export function buildRagPrompt(
  userInput: string,
  context: WorkspaceContext,
  ragContext: RagContext,
): string {
  const docContext = ragContext.documents
    .map((d) => `[${d.title}](${d.source}): ${d.content.slice(0, 300)}`)
    .join("\n\n");

  return `
[WORKSPACE]
Module: ${context.activeModule}
User: ${context.userId}
Tenant: ${context.tenantTier}

[RETRIEVED CONTEXT]
${docContext || "No relevant documents found."}

[USER INPUT]
${userInput}

[INSTRUCTIONS]
Use the retrieved context to ground your response. Cite sources using [source] notation.
If context is insufficient, say so rather than hallucinating.
`;
}

export function rankRagResults(
  documents: RagDocument[],
  query: string,
): RagDocument[] {
  return documents
    .map((doc) => ({
      ...doc,
      score: _computeRelevance(doc, query),
    }))
    .sort((a, b) => b.score - a.score);
}

function _initialScore(
  module: string,
  updatedAt: Date | string,
  query: string,
  title: string,
  content: string,
): number {
  const baseByModule: Record<string, number> = {
    docs: 0.86,
    tasks: 0.8,
    keep: 0.75,
    calendar: 0.72,
    mail: 0.78,
    chat: 0.74,
    contacts: 0.73,
    crm: 0.77,
    drive: 0.81,
    approvals: 0.70,
  };
  let score = baseByModule[module] ?? 0.7;
  // Recency boost: <24h +0.08, <7d +0.04
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays < 1) score += 0.08;
  else if (ageDays < 7) score += 0.04;
  else if (ageDays > 90) score -= 0.06;
  // Title exact phrase boost
  const qLower = query.toLowerCase();
  if (title.toLowerCase().includes(qLower.slice(0, 30))) score += 0.06;
  // Content existence boost (non-empty better than empty)
  if (content.length > 100) score += 0.02;
  return Math.min(0.97, Math.max(0.35, score));
}

function _expandQuery(query: string): string {
  const expansions: Record<string, string[]> = {
    meeting: ["calendar", "schedule", "event", "invite", "agenda"],
    doc: ["document", "file", "content", "draft", "proposal"],
    task: ["todo", "assignment", "work item", "action", "deliverable"],
    mail: ["email", "message", "inbox", "send", "thread"],
    chat: ["channel", "message", "thread", "reply"],
    contact: ["people", "attendee", "participant", "stakeholder"],
    deal: ["crm", "opportunity", "pipeline", "quote", "sales"],
    approval: ["workflow", "request", "signoff", "policy"],
    file: ["drive", "storage", "attachment", "folder"],
    strategy: ["plan", "roadmap", "initiative", "objective", "okr"],
    revenue: ["sales", "income", "forecast", "pipeline", "arr"],
    product: ["feature", "release", "roadmap", "backlog", "spec"],
    customer: ["account", "client", "contact", "lead", "opportunity"],
    analysis: ["insight", "report", "metric", "dashboard", "trend"],
    architecture: ["design", "system", "pattern", "infrastructure", "scale"],
  };

  const lower = query.toLowerCase();
  let expanded = query;

  for (const [term, synonyms] of Object.entries(expansions)) {
    if (lower.includes(term)) {
      expanded += " " + synonyms.join(" ");
    }
  }

  return expanded;
}

function _assemblePrompt(query: string, documents: RagDocument[]): string {
  const context = documents.map((d) => `[${d.title}]: ${d.content}`).join("\n");
  return `Context:\n${context}\n\nQuery: ${query}`;
}

function _computeRelevance(doc: RagDocument, query: string): number {
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (queryTerms.length === 0) return doc.score;
  const titleLower = doc.title.toLowerCase();
  const contentLower = doc.content.toLowerCase();
  const docText = `${titleLower} ${contentLower}`;

  let titleMatches = 0;
  let contentMatches = 0;
  let phraseBonus = 0;
  const queryLower = query.toLowerCase();
  if (
    titleLower.includes(queryLower.slice(0, Math.min(20, queryLower.length))) &&
    queryLower.length > 6
  )
    phraseBonus += 0.12;
  if (
    contentLower.includes(queryLower.slice(0, Math.min(24, queryLower.length))) &&
    queryLower.length > 8
  )
    phraseBonus += 0.08;

  for (const term of queryTerms) {
    if (titleLower.includes(term)) titleMatches++;
    else if (docText.includes(term)) contentMatches++;
  }

  const titleRecall = titleMatches / queryTerms.length;
  const contentRecall = contentMatches / queryTerms.length;
  const lexical = titleRecall * 0.65 + contentRecall * 0.35;

  // BM25-ish length normalization: prefer concise content for short queries
  const lengthNorm = Math.min(1, 300 / Math.max(80, doc.content.length)) * 0.02;

  // Semantic hash similarity as cheap embedding fallback (Jaccard on bigrams)
  const sem = _jaccardBigram(docText, queryLower) * 0.15;

  // Blend with original prior score (module + recency)
  const priorWeight = 0.28;
  const lexicalWeight = 0.52;

  return Math.min(
    0.98,
    lexical * lexicalWeight +
      doc.score * priorWeight +
      phraseBonus +
      sem +
      lengthNorm,
  );
}

function _jaccardBigram(a: string, b: string): number {
  const bigrams = (s: string) =>
    new Set(
      s
        .split(/\s+/)
        .flatMap((w) => {
          if (w.length < 2) return [] as string[];
          const out: string[] = [];
          for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
          return out;
        }),
    );
  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}
