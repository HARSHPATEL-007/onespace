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

export function retrieveRagContext(query: string, workspace: WorkspaceContext, limit = 5): RagContext {
  const expandedQuery = _expandQuery(query);
  const documents = _mockRetrieval(expandedQuery, workspace, limit);

  return {
    query,
    expandedQuery,
    documents,
    citations: documents.map((d) => ({
      source: d.source,
      confidence: d.score,
      snippet: d.content.slice(0, 200),
    })),
    assembledPrompt: _assemblePrompt(query, documents),
  };
}

export function buildRagPrompt(userInput: string, context: WorkspaceContext, ragContext: RagContext): string {
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

export function rankRagResults(documents: RagDocument[], query: string): RagDocument[] {
  return documents
    .map((doc) => ({
      ...doc,
      score: _computeRelevance(doc, query),
    }))
    .sort((a, b) => b.score - a.score);
}

function _expandQuery(query: string): string {
  const expansions: Record<string, string[]> = {
    "meeting": ["calendar", "schedule", "event", "invite"],
    "doc": ["document", "file", "content", "draft"],
    "task": ["todo", "assignment", "work item", "action"],
    "mail": ["email", "message", "inbox", "send"],
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

function _mockRetrieval(query: string, workspace: WorkspaceContext, limit: number): RagDocument[] {
  const mockDocs: RagDocument[] = [
    {
      id: "doc_1",
      title: "Recent workspace activity",
      content: "The workspace has activity across mail, calendar, docs, and tasks modules. Users have been collaborating on quarterly planning documents.",
      source: "cloud_search",
      module: "insights",
      score: 0.92,
    },
    {
      id: "doc_2",
      title: "ANI conversation history",
      content: "Previous conversations include scheduling meetings, drafting documents, and summarizing task lists. ANI has been assisting with daily workflow management.",
      source: "ani_memory",
      module: "ani",
      score: 0.88,
    },
    {
      id: "doc_3",
      title: "Calendar events this week",
      content: "This week includes team standup on Monday, client review on Wednesday, and sprint planning on Friday. Two meetings were rescheduled.",
      source: "calendar",
      module: "calendar",
      score: 0.85,
    },
    {
      id: "doc_4",
      title: "Open tasks and assignments",
      content: "There are 12 open tasks across 3 projects. 4 tasks are due this week. The 'Q4 planning' project has the highest priority items.",
      source: "tasks",
      module: "tasks",
      score: 0.82,
    },
  ];

  const queryLower = query.toLowerCase();
  return mockDocs
    .filter((doc) => doc.content.toLowerCase().includes(queryLower) || doc.title.toLowerCase().includes(queryLower) || doc.module === workspace.activeModule)
    .slice(0, limit);
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
