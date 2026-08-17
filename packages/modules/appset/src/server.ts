import { logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "appset";

export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  category: string;
  url: string;
  accent: string;
  badge?: string;
}

export const CATALOG: CatalogApp[] = [
  { id: "n0va1o", name: "N0VA1O", description: "Integrations hub — connect Slack, Drive, GitHub and more.", category: "Core", url: "/m/n0va1o", accent: "#7c5cff", badge: "v3" },
  { id: "ani", name: "ANI", description: "Workspace AI assistant with per-conversation chat.", category: "Core", url: "/m/ani", accent: "#0ea5e9", badge: "v3" },
  { id: "appscript", name: "AppScript", description: "Script runner — execute JS with a live console.", category: "Developer", url: "/m/appscript", accent: "#f59e0b", badge: "v3" },
  { id: "docs", name: "Docs", description: "Rich text documents with comments and sharing.", category: "Core", url: "/m/docs", accent: "#4285f4" },
  { id: "slides", name: "Slides", description: "Presentation deck builder with block layouts.", category: "Core", url: "/m/slides", accent: "#f4b400" },
  { id: "sheets", name: "Sheets", description: "Spreadsheets with formulas and CSV export.", category: "Core", url: "/m/sheets", accent: "#0f9d58" },
  { id: "cloud-search", name: "Cloud Search", description: "Universal search across every N0VA module.", category: "Core", url: "/m/cloud-search", accent: "#4285f4" },
  { id: "meet", name: "Meet", description: "Video meetings with rooms and live stage.", category: "Core", url: "/m/meet", accent: "#ea4335" },
  { id: "groups", name: "Groups", description: "Teams, roles and membership management.", category: "Core", url: "/m/groups", accent: "#7c5cff" },
  { id: "drawings", name: "Drawings", description: "Canvas sketches with shapes and layers.", category: "Core", url: "/m/drawings", accent: "#4285f4" },
  { id: "booklm", name: "BookLM", description: "Learning sets — flashcard decks from docs & videos.", category: "Learning", url: "/m/booklm", accent: "#0f9d58" },
  { id: "pics", name: "Pics", description: "Photo library with albums and uploads.", category: "Media", url: "/m/pics", accent: "#ea4335" },
  { id: "videos", name: "Videos", description: "Video library with watch pages.", category: "Media", url: "/m/videos", accent: "#ea4335" },
  { id: "voice", name: "Voice", description: "Call log and dialer console.", category: "Media", url: "/m/voice", accent: "#0ea5e9" },
  { id: "sites", name: "Sites", description: "Site builder — pages, blocks and publish.", category: "Core", url: "/m/sites", accent: "#7c5cff" },
  { id: "tasks", name: "Tasks", description: "Task lists with columns, labels and due dates.", category: "Core", url: "/m/tasks", accent: "#0f9d58" },
  { id: "calendar", name: "Calendar", description: "Workspace calendar and events.", category: "Core", url: "/m/calendar", accent: "#4285f4" },
  { id: "mail", name: "Mail", description: "Workspace mail client.", category: "Core", url: "/m/mail", accent: "#ea4335" },
  { id: "vault", name: "Vault", description: "AES-256-GCM encrypted secret storage.", category: "Security", url: "/m/vault", accent: "#059669", badge: "v3" },
  { id: "admin", name: "Governance", description: "Role/action policy matrix per module.", category: "Security", url: "/m/admin", accent: "#059669", badge: "v3" },
  { id: "admin-console", name: "Admin Console", description: "Members, roles, audit log, security settings.", category: "Security", url: "/m/admin-console", accent: "#059669", badge: "v3" },
  { id: "workspace-studio", name: "Workspace Studio", description: "Automations that run docs, notify, or log.", category: "Developer", url: "/m/workspace-studio", accent: "#f59e0b", badge: "v3" },
  { id: "insights", name: "Insights", description: "Usage analytics across the workspace.", category: "Analytics", url: "/m/insights", accent: "#0ea5e9", badge: "v3" },
  { id: "endpoint-management", name: "Endpoint Management", description: "Enrolled device inventory and compliance.", category: "Security", url: "/m/endpoint-management", accent: "#059669", badge: "v3" },
  { id: "appset", name: "AppSet", description: "This catalog — every N0VA module in one place.", category: "Core", url: "/m/appset", accent: "#7c5cff", badge: "v3" },
  { id: "finance", name: "Finance", description: "Invoice ledger — send, track and collect.", category: "Business", url: "/m/finance", accent: "#0f9d58", badge: "v4" },
  { id: "legal", name: "Legal", description: "Contracts and policies with review flow.", category: "Business", url: "/m/legal", accent: "#7c5cff", badge: "v4" },
  { id: "hr", name: "HR", description: "Employee directory, leave and approvals.", category: "Business", url: "/m/hr", accent: "#0ea5e9", badge: "v4" },
  { id: "revenue", name: "Revenue", description: "Subscriptions, MRR and payment records.", category: "Business", url: "/m/revenue", accent: "#0f9d58", badge: "v4" },
  { id: "sales", name: "Sales", description: "Pipeline CRM with stage kanban.", category: "Business", url: "/m/sales", accent: "#f4b400", badge: "v4" },
  { id: "ads-marketing", name: "Ads & Marketing", description: "Campaigns with delivery simulation.", category: "Business", url: "/m/ads-marketing", accent: "#ea4335", badge: "v4" },
  { id: "operations-teams", name: "Operations & Teams", description: "Runbooks, incidents and workflows.", category: "Business", url: "/m/operations-teams", accent: "#f59e0b", badge: "v4" },
  { id: "customer-experience", name: "Customer Experience", description: "Support desk with replies and priorities.", category: "Business", url: "/m/customer-experience", accent: "#4285f4", badge: "v4" },
  { id: "health", name: "Health", description: "Wellness check-ins and team mood.", category: "Business", url: "/m/health", accent: "#059669", badge: "v4" },
  { id: "founder-dashboard", name: "Founder Dashboard", description: "Company KPIs across every module.", category: "Leadership", url: "/m/founder-dashboard", accent: "#7c5cff", badge: "v5" },
  { id: "business-dashboard", name: "Business Dashboard", description: "Department views over ops data.", category: "Leadership", url: "/m/business-dashboard", accent: "#0ea5e9", badge: "v5" },
  { id: "approvals", name: "Approvals", description: "AI-assisted approval routing, ERP write-back and reconciliation.", category: "Business", url: "/m/approvals", accent: "#f59e0b", badge: "v5" },
  { id: "delivery", name: "Delivery Matrix", description: "Policy-driven reliability: semantics, retry, breakers, quotas and DLQ.", category: "Leadership", url: "/m/delivery", accent: "#7c5cff", badge: "v5" },
  { id: "personalization", name: "Personalization", description: "Notification rules, DND schedules, priority inbox, pins and AI suggestions.", category: "Communication", url: "/m/personalization", accent: "#10b981", badge: "v5" },
  { id: "neural", name: "Neural Lab", description: "Opt-in research platform — flow estimation, commands, coarse state sharing, huddles.", category: "Communication", url: "/m/neural", accent: "#8b5cf6", badge: "research" },
];

export class AppSetService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  async list(): Promise<CatalogApp[]> {
    if (!(await can(this.workspaceId, this.role, MODULE, "READ"))) {
      throw new Error("Missing READ permission for appset");
    }
    return CATALOG;
  }

  async logLaunch(appId: string): Promise<void> {
    const app = CATALOG.find((a) => a.id === appId);
    if (!app) return;
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action: "appset.launch",
      targetType: "App",
      targetId: appId,
    });
  }
}
