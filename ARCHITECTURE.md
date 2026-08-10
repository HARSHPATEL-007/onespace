# N0VA Workspace — System Architecture

> A single Enterprise System built as a Modular Suite.

---

## 1. Design Principles

| Principle | Meaning |
|-----------|---------|
| **Tenant-first** | Every query, every mutation, every cache key is scoped to a `workspaceId`. No cross-tenant data leaks. |
| **Module isolation** | Modules are independent packages with explicit dependencies. A module can be built, tested, and deployed without touching others. |
| **Shared kernel** | Common infrastructure (auth, RBAC, audit, notifications, search, files) lives in shared packages — not duplicated per module. |
| **Schema-first** | The Prisma schema is the source of truth. Module-specific tables are namespaced by module. Migrations are atomic per module. |
| **Progressive enhancement** | Modules start as placeholders and gain features incrementally. The shell always works — modules load on demand. |
| **No partner lock-in** | All integrations go through N0VA1O. No direct third-party SDK coupling in individual modules. |

---

## 2. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        N0VA Workspace Shell                         │
│  ┌──────────┐  ┌──────────────────────────────────────────────────┐ │
│  │ Sidebar  │  │              Module Router (/m/[module])         │ │
│  │          │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │ │
│  │ Mail     │  │  │ Mail   │ │ Docs   │ │ Chat   │ │  ...   │   │ │
│  │ Chat     │  │  │ Module │ │ Module │ │ Module │ │        │   │ │
│  │ Calendar │  │  └────┬───┘ └────┬───┘ └────┬───┘ └────────┘   │ │
│  │ Tasks    │  │       │          │          │                   │ │
│  │ ...      │  │       └──────────┴──────────┘                   │ │
│  │          │  │              Module Bus (events)                 │ │
│  └──────────┘  └──────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Shared Services Layer                        │ │
│  │  Auth │ RBAC │ Audit │ Notifications │ Search │ Files │ AI   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Data Layer (Prisma + PostgreSQL)             │ │
│  │  Workspace │ User │ Module Tables │ AuditLog │ Attachment     │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Monorepo Structure

```
onespace/
├── apps/
│   └── web/                    # Next.js 15 shell (sole deployable)
│       └── src/
│           ├── app/            # Routes, pages, server actions
│           ├── components/     # Shell components (AppShell, Sidebar)
│           └── lib/            # Route helpers, workspace context
├── packages/
│   ├── core/                   # Module registry, types, constants
│   ├── auth/                   # NextAuth config, credentials provider
│   ├── authz/                  # RBAC engine (can(), roles, permissions)
│   ├── db/                     # Prisma client, tenant context, audit
│   ├── ui/                     # Component library, design tokens
│   ├── modules/                # 40 feature modules
│   │   ├── mail/
│   │   ├── docs/
│   │   ├── chat/
│   │   └── ... (37 more)
│   └── services/               # Cross-module shared services (NEW)
│       ├── notifications/      # In-app notification engine
│       ├── search/             # Unified search index
│       ├── files/              # File storage abstraction
│       ├── realtime/           # SSE/WebSocket hub
│       └── analytics/          # Usage & insights data pipeline
├── n0va1o/                     # Integration gateway (separate monorepo)
├── infra/                      # Docker, deployment configs
└── prisma/
    └── schema.prisma           # Single database schema
```

---

## 4. Module Architecture

### 4.1 Module Contract

Every module in `packages/modules/[name]/` follows this contract:

```
packages/modules/[name]/
├── package.json                # Exports: ".", "./server", "./components"
├── src/
│   ├── index.ts                # Barrel export
│   ├── server.ts               # Server-side service class (RBAC-enforced)
│   ├── components.tsx          # Client-side React components
│   ├── schema.ts               # Zod validation schemas (optional)
│   └── events.ts               # Module event definitions (optional)
```

### 4.2 Server Service Pattern

```typescript
// packages/modules/[name]/src/server.ts
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "docs"; // Module identifier

export class DocsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission`);
    }
  }

  // All methods are tenant-scoped via workspaceId
  async list() { ... }
  async get(id: string) { ... }
  async create(data: unknown) { ... }
  async update(id: string, data: unknown) { ... }
  async remove(id: string) { ... }
}
```

### 4.3 Client Component Pattern

```typescript
// packages/modules/[name]/src/components.tsx
"use client";
import { Button, Card, Table } from "@n0va/ui";

export interface DocsActions {
  create: (formData: FormData) => Promise<void>;
  // Server action signatures
}

export function DocsList({ docs, actions }: { docs: Doc[]; actions: DocsActions }) {
  // Pure presentational component + form actions
}
```

### 4.4 Module Lifecycle

```
 ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
 │ Planned  │────▶│ Building │────▶│   Live   │────▶│ Archived │
 └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
  Placeholder    Service + UI      Full feature    Deprecated
  in registry    stubs             set             (rare)
```

- **Phase 0-1**: Placeholder (registry entry + ModulePlaceholder component)
- **Phase 2**: Service stubs (CRUD + RBAC, no advanced features)
- **Phase 3**: Full implementation (all features, real-time, AI integration)
- **Phase 4-5**: Advanced (analytics, automation, cross-module workflows)

---

## 5. Layer Architecture (L0-L6)

| Layer | Name | Modules | Characteristics |
|-------|------|---------|-----------------|
| **L0** | Core | Platform infra | Auth, DB, routing, shell — not user-facing modules |
| **L1** | Communication | Mail, Chat, Contacts, Groups, Voice | Real-time, high-frequency, notification-driven |
| **L2** | Content & Creation | Docs, Sheets, Slides, Drawings, Pics, Videos, Sites, BookLM, Keep, Forms | Rich editing, version history, collaboration |
| **L3** | Storage & Intelligence | Cloud Storage, Cloud Search, Insights, Vault, N0VA1O, ANI | Data-heavy, AI-powered, cross-module indexing |
| **L4** | Business Ops | Calendar, Tasks, Sales, Revenue, CX, Ops, HR, Health, Legal, Finance, Ads | Workflow-driven, approval chains, reporting |
| **L5** | Leadership | Founder Dashboard, Business Dashboard | Read-only aggregations, KPIs, cross-module analytics |
| **L6** | Platform / Admin | Admin, Admin Console, AppScript, AppSet, Endpoint Mgmt, Workspace Studio | Governance, automation, device management |

### Layer Dependencies

```
L5 (Leadership)  ◄── aggregates from ──  L4 (Business Ops)
L4 (Business)    ◄── references ───────  L2 (Content), L1 (Communication)
L3 (Intelligence)◄── indexes ──────────  L1 + L2 + L4
L2 (Content)     ◄── stores in ────────  L3 (Storage)
L1 (Comm)        ◄── notifies via ─────  L0 (Notifications)
L6 (Admin)       ◄── governs ──────────  ALL layers
```

---

## 6. Data Architecture

### 6.1 Tenant Isolation Model

Every table with business data includes `workspaceId`. All queries are filtered by tenant.

```sql
-- Every module table follows this pattern:
CREATE TABLE "Doc" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,          -- Tenant isolation
  "createdById" TEXT NOT NULL,          -- Audit trail
  -- ... module-specific columns ...
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
);

-- Index for tenant-scoped queries:
CREATE INDEX "Doc_workspace_idx" ON "Doc"("workspaceId");
```

### 6.2 Shared Entities

These entities are shared across modules and live in the core schema:

| Entity | Shared By |
|--------|-----------|
| `Workspace` | All modules (tenant boundary) |
| `User` | All modules (actor reference) |
| `WorkspaceMember` | Auth + all modules (membership) |
| `Attachment` | Mail, Docs, Chat, Sheets, etc. |
| `AuditLog` | All modules (compliance) |
| `Notification` | All modules (in-app alerts) |

### 6.3 Module-Specific Tables

Each module owns its tables, prefixed by domain:

| Module | Tables |
|--------|--------|
| Mail | `MailMessage`, `MailThread`, `MailLabel`, `MailDraft`, `Mailbox` |
| Docs | `Doc`, `DocRevision`, `DocComment` |
| Chat | `ChatChannel`, `ChatMessage`, `ChatMember` |
| Calendar | `CalendarEvent` |
| Sales | `Deal`, `DealNote` |
| Storage | (uses `Attachment` + file system) |

### 6.4 Cross-Module References

Modules reference shared entities by ID only — no direct foreign keys across module tables:

```typescript
// ✅ Correct: Reference by ID
const event = await prisma.calendarEvent.create({
  data: {
    workspaceId,
    title: "Review doc",
    docId: doc.id,  // Reference, not a DB FK
  },
});

// ❌ Wrong: Direct FK to another module's table
```

---

## 7. Routing & Navigation

### 7.1 Route Structure

| Route | Purpose |
|-------|---------|
| `/` | Landing / redirect |
| `/signin`, `/signup` | Auth flows |
| `/launcher` | Module launcher (grid view of all modules) |
| `/m/[module]` | Module home page |
| `/m/[module]/[id]` | Module item detail |
| `/m/[module]/[id]/[action]` | Module item action (e.g., `/m/docs/123/history`) |
| `/f/[formId]` | Public form submission (no auth) |
| `/p/[siteId]` | Published site (no auth) |
| `/api/*` | API routes |

### 7.2 Dynamic Module Loading

```typescript
// apps/web/src/app/m/[module]/page.tsx
import { N0VA_MODULE_MAP } from "@n0va/core";
import { ModulePlaceholder } from "@n0va/ui";

export default async function ModulePage({ params }) {
  const module = N0VA_MODULE_MAP[params.module];

  // Dynamically import the module's page component
  try {
    const { default: ModulePage } = await import(
      `@n0va/modules/${module.id}/page`
    );
    return <ModulePage />;
  } catch {
    // Fallback to placeholder for unimplemented modules
    return <ModulePlaceholder module={module} phaseLabel="Coming soon" />;
  }
}
```

### 7.3 Deep Linking

Every module item has a canonical URL:
- `/m/docs/abc123` — Open document
- `/m/mail/thread/xyz` — Open email thread
- `/m/calendar/event/456` — Open calendar event
- `/m/sales/deal/789` — Open deal

---

## 8. Cross-Module Communication

### 8.1 Module Bus (Event System)

Modules communicate through a lightweight event bus — no direct imports between modules:

```typescript
// packages/services/notifications/src/bus.ts
type ModuleEvent =
  | { type: "doc.created"; workspaceId: string; docId: string; userId: string }
  | { type: "mail.sent"; workspaceId: string; mailId: string; userId: string }
  | { type: "deal.won"; workspaceId: string; dealId: string; amount: number }
  | { type: "task.completed"; workspaceId: string; taskId: string };

class ModuleBus {
  private handlers = new Map<string, Set<Function>>();

  emit(event: ModuleEvent) {
    // Persist to notification queue
    // Trigger registered handlers
    this.handlers.get(event.type)?.forEach(fn => fn(event));
  }

  on(type: string, handler: Function) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }
}

export const bus = new ModuleBus();
```

### 8.2 Cross-Module Workflows

| Trigger | Action | Modules Involved |
|---------|--------|-----------------|
| Doc created | Notify workspace | Docs → Notifications |
| Mail received | Create task from email | Mail → Tasks |
| Deal won | Create invoice | Sales → Finance |
| Meeting scheduled | Block calendar | Meet → Calendar |
| Form response | Create contact | Forms → Contacts |
| Task completed | Update project | Tasks → Operations |
| File uploaded | Index for search | Storage → Search |

### 8.3 Shared Services Layer

New shared services to be built in `packages/services/`:

| Service | Purpose | Consumed By |
|---------|---------|-------------|
| **Notifications** | In-app notification queue + realtime push | All modules |
| **Search** | Unified full-text search across modules | Cloud Search, all modules |
| **Files** | File upload, storage, versioning | Mail, Docs, Storage, Pics, Videos |
| **Realtime** | SSE hub for live updates | Chat, Mail, Meet, Notifications |
| **Analytics** | Usage tracking, event pipeline | Insights, Dashboards |

---

## 9. API Design

### 9.1 Server Actions (Primary)

All mutations use Next.js Server Actions — no REST boilerplate:

```typescript
// apps/web/src/app/m/docs/actions.ts
"use server";
import { getWorkspaceContext } from "@n0va/db";
import { DocsService } from "@n0va/modules/docs/server";

export async function createDoc() {
  const { workspaceId, userId, role } = await getWorkspaceContext();
  const service = new DocsService(workspaceId, userId, role);
  return service.create();
}
```

### 9.2 API Routes (External)

REST API routes for external consumers (N0VA1O, AppScript, third-party):

```
/api/ani          — AI assistant endpoints
/api/chat         — Chat realtime (SSE)
/api/mail         — Mail webhooks (incoming email)
/api/forms        — Public form submissions
/api/search       — Search API
/api/storage      — File upload/download
/api/n0va1o       — Integration gateway
```

### 9.3 Real-Time Channels

| Channel | Transport | Modules |
|---------|-----------|---------|
| Chat messages | SSE | Chat |
| Mail notifications | SSE | Mail |
| Presence | SSE | Meet, Chat |
| Typing indicators | SSE | Chat, Docs |
| Calendar reminders | SSE | Calendar |

---

## 10. Security Architecture

### 10.1 Authentication Flow

```
User → /signin → NextAuth Credentials → JWT Session → Cookie
                                                        │
                                              middleware.ts checks
                                              session cookie on
                                              every /m/* request
```

### 10.2 Authorization Model (RBAC)

```
┌─────────────────────────────────────────────────┐
│                  Workspace                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│  │  OWNER  │  │  ADMIN  │  │  MEMBER │  │VIEWER│
│  └────┬────┘  └────┬────┘  └────┬────┘  └──┬──┘
│       │            │            │           │
│  all perms    ADMIN perms   CREATE/READ  READ only
│  + billing    + user mgmt   + UPDATE     (default)
│  + deletion   + policies    + DELETE
└─────────────────────────────────────────────────┘
```

### 10.3 Permission Enforcement Points

| Layer | Enforcement |
|-------|-------------|
| **Middleware** | Session check — redirect to /signin if unauthenticated |
| **Server Action** | `getWorkspaceContext()` — validates membership |
| **Service Class** | `can()` check — validates module-specific permission |
| **Database** | `workspaceId` filter — tenant isolation at query level |

### 10.4 Audit Trail

Every mutation is logged:

```typescript
await logAudit({
  workspaceId,
  actorId: userId,
  module: "docs",
  action: "doc.created",
  targetType: "Doc",
  targetId: doc.id,
});
```

---

## 11. Frontend Architecture

### 11.1 Shell Structure

```
┌──────────────────────────────────────────────────────────┐
│ AppShell                                                  │
│  ┌────────┐  ┌──────────────────────────────────────────┐│
│  │Sidebar │  │ Header (⌘K, workspace switcher, avatar)  ││
│  │        │  ├──────────────────────────────────────────┤│
│  │ Mail   │  │                                          ││
│  │ Chat   │  │           Module Content                  ││
│  │ Cal    │  │           (children)                      ││
│  │ Tasks  │  │                                          ││
│  │ ...    │  │                                          ││
│  │        │  │                                          ││
│  └────────┘  └──────────────────────────────────────────┘│
│                          │                                │
│              CommandPalette (⌘K overlay)                  │
└──────────────────────────────────────────────────────────┘
```

### 11.2 State Management

| Scope | Solution |
|-------|----------|
| **Server state** | Next.js `cache()` + Server Actions (no client state needed) |
| **UI state** | React `useState` within module components |
| **Form state** | Native HTML forms + Server Actions (no form library) |
| **Global UI** | React Context for shell state (palette, workspace) |
| **Real-time** | SSE subscriptions within module components |

### 11.3 Component Library (`@n0va/ui`)

All UI components use the `nv-` CSS prefix. No external UI framework.

**Available components:**
- **Primitives**: `Button`, `Input`, `Textarea`, `Select`, `Field`
- **Surface**: `Card`, `Badge`, `Avatar`, `Spinner`
- **Data**: `Table`, `TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`, `TableCell`
- **Navigation**: `Tabs`, `SidebarItem`, `groupByLayer`
- **Overlay**: `Dialog`, `Dropdown`, `MenuItem`, `CommandPalette`
- **Module**: `ModuleIcon`, `LauncherGrid`, `ModulePlaceholder`

### 11.4 Design Tokens

```css
/* packages/ui/src/tokens.css */
:root {
  /* Colors */
  --nv-color-primary: #4f46e5;
  --nv-color-primary-alpha: rgba(79, 70, 229, 0.1);
  --nv-color-surface: #ffffff;
  --nv-color-surface-2: #f8fafc;
  --nv-color-border: #e2e8f0;
  --nv-color-text: #0f172a;
  --nv-color-text-muted: #64748b;
  --nv-color-text-faint: #94a3b8;
  --nv-color-danger: #ef4444;

  /* Spacing */
  --nv-space-1: 4px;
  --nv-space-2: 8px;
  --nv-space-3: 12px;
  --nv-space-4: 16px;
  --nv-space-5: 24px;
  --nv-space-6: 32px;

  /* Typography */
  --nv-font-xs: 11px;
  --nv-font-sm: 13px;
  --nv-font-md: 15px;
  --nv-font-lg: 18px;
  --nv-font-xl: 24px;

  /* Radius */
  --nv-radius-sm: 6px;
  --nv-radius-md: 10px;
  --nv-radius-lg: 16px;
  --nv-radius-full: 9999px;

  /* Shadows */
  --nv-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --nv-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
}
```

---

## 12. Build Order & Phasing

### Phase 1: Foundation (Weeks 1-4)
- [x] Monorepo setup (pnpm + Turborepo)
- [x] Prisma schema (core tables)
- [x] Auth (NextAuth + RBAC)
- [x] UI component library
- [x] AppShell + routing
- [ ] Shared services (Notifications, Files, Realtime)

### Phase 2: Communication Layer (Weeks 5-8)
- [ ] Mail (SMTP/IMAP, threads, labels)
- [ ] Chat (channels, DMs, SSE)
- [ ] Contacts (unified people model)
- [ ] Groups (distribution lists)

### Phase 3: Content Layer (Weeks 9-14)
- [ ] Docs (Tiptap editor, comments, history)
- [ ] Sheets (grid, formulas)
- [ ] Slides (presentations)
- [ ] Keep (notes)
- [ ] Forms (builder + responses)

### Phase 4: Storage & Intelligence (Weeks 15-18)
- [ ] Cloud Storage (file management)
- [ ] Cloud Search (unified index)
- [ ] Vault (encrypted secrets)
- [ ] ANI (AI assistant)
- [ ] N0VA1O (integration gateway)

### Phase 5: Business Operations (Weeks 19-26)
- [ ] Calendar (events, recurrence)
- [ ] Tasks (lists, assignments)
- [ ] Sales (CRM pipeline)
- [ ] Revenue (billing, subscriptions)
- [ ] Finance (ledger, invoices)
- [ ] HR (employees, leave)
- [ ] Legal (contracts, e-sign)
- [ ] Customer Experience (tickets, CSAT)
- [ ] Operations (projects, runbooks)
- [ ] Health (wellness check-ins)
- [ ] Ads & Marketing (campaigns)

### Phase 6: Leadership & Platform (Weeks 27-32)
- [ ] Founder Dashboard (company KPIs)
- [ ] Business Dashboard (department views)
- [ ] Admin Console (users, roles, audit)
- [ ] AppScript (automation runtime)
- [ ] AppSet (no-code app builder)
- [ ] Endpoint Management (devices)
- [ ] Workspace Studio (agent orchestration)

---

## 13. Developer Experience

### 13.1 Module Scaffolding

```bash
# Generate a new module from template
pnpm n0va:module create my-module --layer "L2 Content & Creation" --phase 1
```

This creates:
- `packages/modules/my-module/package.json`
- `packages/modules/my-module/src/{index,server,components}.ts`
- Registers the module in `packages/core/src/index.ts`

### 13.2 Development Commands

```bash
pnpm dev              # Start all packages in dev mode
pnpm dev --filter=@n0va/modules/mail  # Develop one module
pnpm build            # Build all packages
pnpm typecheck        # Type-check everything
pnpm db:up            # Start Postgres
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed demo data
pnpm db:studio        # Open Prisma Studio
```

### 13.3 Testing Strategy

| Type | Tool | Scope |
|------|------|-------|
| Unit | Vitest | Service classes, utilities |
| Component | Testing Library | UI components |
| Integration | Playwright | Module workflows |
| E2E | Playwright | Cross-module flows |

---

## 14. Deployment Architecture

### 14.1 Production Topology

```
                    ┌─────────────┐
                    │   Vercel    │
                    │  (Next.js)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴────┐ ┌────┴────┐
        │ PostgreSQL │ │ Redis  │ │  Blob   │
        │  (Neon/    │ │(Upstash│ │ Storage │
        │  Supabase) │ │  /Rail)│ │  (S3)   │
        └───────────┘ └────────┘ └─────────┘
```

### 14.2 Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth JWT signing secret |
| `AUTH_TRUST_HOST` | Trust host header (Vercel) |
| `SMTP_HOST`, `SMTP_PORT` | Outbound email |
| `IMAP_HOST`, `IMAP_PORT` | Inbound email |
| `REDIS_URL` | Realtime pub/sub |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |

---

## 15. Key Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **Single Next.js app** | Simpler deployment, shared shell, no micro-frontend complexity |
| **Prisma + PostgreSQL** | Type-safe queries, migrations, single DB for all modules |
| **Server Actions over REST** | Less boilerplate, type-safe end-to-end, no API layer to maintain |
| **Custom UI library** | No design system conflicts, full control, zero UI framework deps |
| **Module bus over direct imports** | Modules stay decoupled, testable in isolation |
| **N0VA1O for all integrations** | Single integration point, no third-party SDK sprawl |
| **CSS variables + nv- prefix** | No CSS-in-JS overhead, easy theming, no naming collisions |
| **Dynamic module loading** | Only load code for the module being viewed — faster initial load |

---

## 16. Open Questions

1. **Real-time transport**: SSE vs WebSocket? SSE is simpler (works over HTTP/2) but unidirectional. WebSocket is bidirectional but needs a separate server.
2. **File storage**: Local disk (dev) vs S3/Blob (prod)? Need an abstraction layer.
3. **Search engine**: PostgreSQL full-text search vs dedicated engine (Meilisearch/Typesense)? PG FTS is simpler but less powerful.
4. **Email delivery**: Self-hosted vs transactional email service (Resend/Postmark)?
5. **AI provider**: Which LLM provider for ANI? OpenAI, Anthropic, or self-hosted?
6. **Multi-region**: Single region to start, but plan for data residency (EU, APAC)?

---

*This document is the architecture source of truth. Update it as decisions are made and the system evolves.*
