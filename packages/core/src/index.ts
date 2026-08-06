export type TenantId = string;
export type UserId = string;
export type ModuleId = string;

export type N0vaLayer =
  | "L0 Core"
  | "L1 Communication"
  | "L2 Content & Creation"
  | "L3 Storage & Intelligence"
  | "L4 Business Ops"
  | "L5 Leadership"
  | "L6 Platform / Admin";

export type N0vaPhase = 0 | 1 | 2 | 3 | 4;

export interface N0vaModule {
  id: ModuleId;
  name: string;
  codename: string;
  layer: N0vaLayer;
  phase: N0vaPhase;
  description: string;
  status?: "live" | "building" | "planned";
}

export const N0VA_MODULES: N0vaModule[] = [
  { id: "n0va1o", name: "N0VA1O", codename: "Project Gateway", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "Single integration gateway for all external connections" },
  { id: "ani", name: "N0VA ANI", codename: "Project Genius", layer: "L3 Storage & Intelligence", phase: 3, status: "live", description: "Autonomous generative AI assistant" },
  { id: "mail", name: "N0VA MAIL", codename: "Project Quill", layer: "L1 Communication", phase: 1, status: "live", description: "Email with threads, labels and search" },
  { id: "cloud-storage", name: "N0VA CLOUD STORAGE", codename: "Project Vault Cloud", layer: "L3 Storage & Intelligence", phase: 1, status: "live", description: "Files, sharing and versioning" },
  { id: "cloud-search", name: "N0VA CLOUD SEARCH", codename: "Project Oracle", layer: "L3 Storage & Intelligence", phase: 2, status: "live", description: "Unified search across the suite" },
  { id: "appscript", name: "N0VA APPSCRIPT", codename: "Project Script", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "Scripting runtime over module APIs" },
  { id: "ads-marketing", name: "N0VA ADS & MARKETING", codename: "Project Beacon", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Campaigns, audiences and ads" },
  { id: "docs", name: "N0VA DOCS", codename: "Project Quill Docs", layer: "L2 Content & Creation", phase: 1, status: "live", description: "Rich documents with comments and history" },
  { id: "sheets", name: "N0VA SHEETS", codename: "Project Grid", layer: "L2 Content & Creation", phase: 1, status: "live", description: "Spreadsheets with formulas" },
  { id: "slides", name: "N0VA SLIDES", codename: "Project Deck", layer: "L2 Content & Creation", phase: 2, status: "live", description: "Presentations and decks" },
  { id: "meet", name: "N0VA MEET", codename: "Project Iris", layer: "L1 Communication", phase: 2, status: "live", description: "Video meetings" },
  { id: "chat", name: "N0VA CHAT", codename: "Project Nexus", layer: "L1 Communication", phase: 1, status: "live", description: "Channels, DMs and threads" },
  { id: "calendar", name: "N0VA CALENDAR", codename: "Project Chronos", layer: "L4 Business Ops", phase: 1, status: "live", description: "Events, invites and availability" },
  { id: "tasks", name: "N0VA TASKS", codename: "Project Tally", layer: "L4 Business Ops", phase: 1, status: "live", description: "Tasks, lists and assignments" },
  { id: "sites", name: "N0VA SITES", codename: "Project Forge", layer: "L2 Content & Creation", phase: 2, status: "live", description: "Site builder over DOCS blocks" },
  { id: "sales", name: "N0VA SALES", codename: "Project Ares", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Pipeline CRM" },
  { id: "revenue", name: "N0VA REVENUE", codename: "Project Yield", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Billing and subscriptions" },
  { id: "customer-experience", name: "N0VA CUSTOMER EXPERIENCE", codename: "Project Aegis", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Support tickets and CSAT" },
  { id: "operations-teams", name: "N0VA OPERATIONS & TEAMS", codename: "Project Helm", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Projects and workflows" },
  { id: "hr", name: "N0VA HR", codename: "Project People", layer: "L4 Business Ops", phase: 4, status: "planned", description: "People operations" },
  { id: "admin", name: "N0VA ADMIN", codename: "Project Sovereign", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "Module policies and governance" },
  { id: "founder-dashboard", name: "N0VA FOUNDER DASHBOARD", codename: "Project Helios", layer: "L5 Leadership", phase: 4, status: "planned", description: "Company-level KPIs" },
  { id: "business-dashboard", name: "N0VA BUSINESS DASHBOARD", codename: "Project Atlas", layer: "L5 Leadership", phase: 4, status: "planned", description: "Department views over ops data" },
  { id: "drawings", name: "N0VA DRAWINGS", codename: "Project Canvas", layer: "L2 Content & Creation", phase: 2, status: "live", description: "Diagrams and drawings" },
  { id: "booklm", name: "N0VA BOOKLM EDUCATION", codename: "Project Scholar", layer: "L2 Content & Creation", phase: 2, status: "live", description: "Learning sets over DOCS and VIDEOS" },
  { id: "groups", name: "N0VA GROUPS", codename: "Project Collective", layer: "L1 Communication", phase: 2, status: "live", description: "Distribution lists and team spaces" },
  { id: "workspace-studio", name: "N0VA WORKSPACE STUDIO", codename: "Project Automaton", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "Automations and agent orchestration" },
  { id: "pics", name: "N0VA PICS", codename: "Project Gallery", layer: "L2 Content & Creation", phase: 2, status: "live", description: "Photo and image manager" },
  { id: "insights", name: "N0VA INSIGHTS", codename: "Project Lens", layer: "L3 Storage & Intelligence", phase: 3, status: "live", description: "Dashboards over audit and usage" },
  { id: "endpoint-management", name: "N0VA ENDPOINT MANAGEMENT", codename: "Project Sentinel", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "Device registry and compliance" },
  { id: "appset", name: "N0VA APPSET", codename: "Project Forge Apps", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "No-code app builder" },
  { id: "admin-console", name: "N0VA ADMIN CONSOLE", codename: "Project Overseer", layer: "L6 Platform / Admin", phase: 3, status: "live", description: "Users, roles, security and audit" },
  { id: "vault", name: "N0VA VAULT", codename: "Project Fortress", layer: "L3 Storage & Intelligence", phase: 3, status: "live", description: "Encrypted secrets and credentials" },
  { id: "health", name: "N0VA HEALTH", codename: "Project Vita", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Health and wellness" },
  { id: "legal", name: "N0VA LEGAL", codename: "Project Justice", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Contracts and e-sign" },
  { id: "finance", name: "N0VA FINANCE", codename: "Project Ledger", layer: "L4 Business Ops", phase: 4, status: "planned", description: "Ledger and invoices" },
  { id: "forms", name: "N0VA FORMS", codename: "Project Surveyor", layer: "L2 Content & Creation", phase: 1, status: "live", description: "Forms and responses" },
  { id: "keep", name: "N0VA KEEP", codename: "Project Memento", layer: "L2 Content & Creation", phase: 1, status: "live", description: "Notes and lists" },
  { id: "voice", name: "N0VA VOICE", codename: "Project Echo", layer: "L1 Communication", phase: 2, status: "live", description: "Voice calls" },
  { id: "videos", name: "N0VA VIDEOS", codename: "Project Reel", layer: "L2 Content & Creation", phase: 2, status: "live", description: "Video library" },
  { id: "contacts", name: "N0VA CONTACTS", codename: "Project Identity", layer: "L1 Communication", phase: 1, status: "live", description: "Unified people model" },
];

export const N0VA_MODULE_MAP: Record<ModuleId, N0vaModule> = Object.fromEntries(
  N0VA_MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, N0vaModule>;

export const N0VA_LAYERS: N0vaLayer[] = [
  "L0 Core",
  "L1 Communication",
  "L2 Content & Creation",
  "L3 Storage & Intelligence",
  "L4 Business Ops",
  "L5 Leadership",
  "L6 Platform / Admin",
];

export const WORKSPACE_COOKIE = "n0va.workspace";
