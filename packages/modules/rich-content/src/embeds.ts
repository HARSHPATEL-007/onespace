export interface EmbedData {
  sourceType: string;
  sourceId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  url: string;
  metadata: Record<string, unknown>;
  actions: EmbedAction[];
  lastUpdatedAt: string;
}

export interface EmbedAction {
  id: string;
  label: string;
  type: "open" | "assign" | "approve" | "reject" | "comment" | "resolve" | "snooze" | "escalate";
  style: "primary" | "secondary" | "danger";
  url?: string;
}

type EmbedAdapter = (sourceId: string, workspaceId: string) => Promise<EmbedData | null>;

const adapters: Map<string, EmbedAdapter> = new Map();

export function registerEmbedAdapter(sourceType: string, adapter: EmbedAdapter): void {
  adapters.set(sourceType, adapter);
}

export async function resolveEmbed(sourceType: string, sourceId: string, workspaceId: string): Promise<EmbedData | null> {
  const adapter = adapters.get(sourceType);
  if (!adapter) return null;
  try { return await adapter(sourceId, workspaceId); } catch { return null; }
}

export function getRegisteredTypes(): string[] {
  return [...adapters.keys()];
}

registerEmbedAdapter("doc", async (sourceId, workspaceId) => ({
  sourceType: "doc", sourceId, title: "Document", description: "Shared document",
  thumbnailUrl: null, url: `/m/docs/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Open", type: "open", style: "primary" }, { id: "comment", label: "Comment", type: "comment", style: "secondary" }],
  lastUpdatedAt: new Date().toISOString(),
}));

registerEmbedAdapter("sheet", async (sourceId, workspaceId) => ({
  sourceType: "sheet", sourceId, title: "Spreadsheet", description: "Shared sheet",
  thumbnailUrl: null, url: `/m/sheets/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Open", type: "open", style: "primary" }],
  lastUpdatedAt: new Date().toISOString(),
}));

registerEmbedAdapter("crm", async (sourceId, workspaceId) => ({
  sourceType: "crm", sourceId, title: "CRM Record", description: "Customer record",
  thumbnailUrl: null, url: `/m/sales/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Open", type: "open", style: "primary" }, { id: "assign", label: "Assign", type: "assign", style: "secondary" }],
  lastUpdatedAt: new Date().toISOString(),
}));

registerEmbedAdapter("github", async (sourceId, workspaceId) => ({
  sourceType: "github", sourceId, title: `Issue/PR #${sourceId}`, description: "GitHub item",
  thumbnailUrl: null, url: `https://github.com/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Open", type: "open", style: "primary" }, { id: "comment", label: "Comment", type: "comment", style: "secondary" }],
  lastUpdatedAt: new Date().toISOString(),
}));

registerEmbedAdapter("jira", async (sourceId, workspaceId) => ({
  sourceType: "jira", sourceId, title: `Ticket ${sourceId}`, description: "Jira ticket",
  thumbnailUrl: null, url: `https://${workspaceId}.atlassian.net/browse/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Open", type: "open", style: "primary" }, { id: "resolve", label: "Resolve", type: "resolve", style: "secondary" }],
  lastUpdatedAt: new Date().toISOString(),
}));

registerEmbedAdapter("task", async (sourceId, workspaceId) => ({
  sourceType: "task", sourceId, title: "Task", description: "Workspace task",
  thumbnailUrl: null, url: `/m/tasks/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Open", type: "open", style: "primary" }, { id: "assign", label: "Assign", type: "assign", style: "secondary" }],
  lastUpdatedAt: new Date().toISOString(),
}));

registerEmbedAdapter("meeting", async (sourceId, workspaceId) => ({
  sourceType: "meeting", sourceId, title: "Meeting", description: "Scheduled meeting",
  thumbnailUrl: null, url: `/m/meet/${sourceId}`, metadata: {},
  actions: [{ id: "open", label: "Join", type: "open", style: "primary" }],
  lastUpdatedAt: new Date().toISOString(),
}));
