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
  const searchTerms = expandedQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const documents: RagDocument[] = [];

  try {
    const docs = await prisma.doc.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.map((term) => ({
          title: { contains: term, mode: "insensitive" as const },
        })),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    for (const d of docs) {
      documents.push({
        id: d.id,
        title: d.title,
        content: d.content ?? "",
        source: `doc:${d.id}`,
        module: "docs",
        score: 0.85,
      });
    }
  } catch {
    /* module may not be populated */
  }

  try {
    const tasks = await prisma.task.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.map((term) => ({
          title: { contains: term, mode: "insensitive" as const },
        })),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    for (const t of tasks) {
      documents.push({
        id: t.id,
        title: t.title,
        content: t.notes ?? "",
        source: `task:${t.id}`,
        module: "tasks",
        score: 0.8,
      });
    }
  } catch {
    /* */
  }

  try {
    const notes = await prisma.note.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        OR: searchTerms.map((term) => ({
          title: { contains: term, mode: "insensitive" as const },
        })),
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    for (const n of notes) {
      documents.push({
        id: n.id,
        title: n.title,
        content: n.body ?? "",
        source: `note:${n.id}`,
        module: "keep",
        score: 0.75,
      });
    }
  } catch {
    /* */
  }

  try {
    const events = await prisma.calendarEvent.findMany({
      where: {
        workspaceId: workspace.workspaceId,
        startAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { startAt: "desc" },
      take: limit,
    });
    for (const e of events) {
      documents.push({
        id: e.id,
        title: e.title,
        content: e.description ?? "",
        source: `calendar:${e.id}`,
        module: "calendar",
        score: 0.7,
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
        content: d.content?.slice(0, 500) ?? "",
        source: `doc:${d.id}`,
        module: "docs",
        score: 0.5,
      });
    }
  }

  const sorted = documents.sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    query,
    expandedQuery,
    documents: sorted,
    citations: sorted.map((d) => ({
      source: d.source,
      confidence: d.score,
      snippet: d.content.slice(0, 200),
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

function _expandQuery(query: string): string {
  const expansions: Record<string, string[]> = {
    meeting: ["calendar", "schedule", "event", "invite"],
    doc: ["document", "file", "content", "draft"],
    task: ["todo", "assignment", "work item", "action"],
    mail: ["email", "message", "inbox", "send"],
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
  const queryTerms = query.toLowerCase().split(/\s+/);
  const docText = (doc.title + " " + doc.content).toLowerCase();

  let matches = 0;
  for (const term of queryTerms) {
    if (docText.includes(term)) matches++;
  }

  return Math.min(1, (matches / queryTerms.length) * 0.7 + doc.score * 0.3);
}
