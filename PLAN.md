# N0VA Workspace — Modular Suite Build Plan

> **Vision:** One Enterprise System, built by us alone, delivered as a Modular Suite.
> Each module ships as an independent product; the whole behaves as a single system.
> Sources of truth: the 39 `N0VA *.md` module specifications in this repo.

---

## 1. Locked Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo | **Turborepo + pnpm** | One repo, one lockfile, fast builds, package boundaries per module |
| Frontend | **Next.js (App Router) + TypeScript (strict)** | One deployable shell; modules as route groups so they can split later |
| Backend | **Next.js Route Handlers / Server Actions** + a thin `n0va1o` API gateway service | Serverless-friendly, solo-founder operational simplicity |
| Database | **Postgres + Prisma** (multi-file schema via `prismaSchemaFolder`) | Relational, home-machine friendly (`docker compose` or local install), tenant_id everywhere |
| Auth | **Auth.js (NextAuth) v5** — credentials + OAuth | Workspace-level sessions, proven, self-hostable |
| Tenancy | **Full multitenancy from day one** — `tenant_id` on every row, tenant-scoped queries as a hard rule | Every spec carries `tenant_id`; retrofitting is the #1 enterprise pain |
| AI | **ANI as an abstraction layer**, not a model | Specs demand 405B/10T models, quantum, BCI — build the interface, swap the backend |
| Integration | **N0VA1O gateway** as the single integration surface (the N×M → 1 collapse) | 33 of 39 specs reference it; it is the architectural keystone |

### Spec vs. reality — "Transcendent Edition" reconciliations

The specs are aspirational (16M-token contexts, quantum inference, synthetic consciousness, BCI).
The build interprets these as **contracts, not implementations**:

| Spec claim | Build interpretation |
|---|---|
| MongoDB Multiverse Cluster | Single Postgres; `module` + `tenant_id` namespacing preserves the "multiverse" isolation pattern; a module may later opt into a document store via N0VA1O without breaking others |
| 10T-parameter model constellation | ANI backend interface: pluggable LLM providers (local/cloud), unified chat/embedding/speech contracts |
| Quantum-safe / ZK auth | Layered now: field-level encryption (AES-256-GCM) + strict RBAC/ABAC; upgrade paths documented |
| BCI / neural interfaces | Never rendered in UI; represented as API contracts ANI can call |

---

## 2. Module Taxonomy (39 modules, 7 layers)

| Layer | Modules | What binds them |
|---|---|---|
| **L0 Core / Launcher** | Workspace shell, launcher, profile, settings | Every user starts here |
| **L1 Communication** | MAIL, CHAT, MEET, CONTACTS, VOICE, VIDEOS, GROUPS | Unified identity & presence |
| **L2 Content & Creation** | DOCS, SHEETS, SLIDES, DRAWINGS, PICS, KEEP, FORMS, SITES, BOOKLM | Shared file/asset bus (Cloud Storage) |
| **L3 Storage & Intelligence** | CLOUD STORAGE, CLOUD SEARCH, VAULT, INSIGHTS, ANI | Document store, index, vault, AI |
| **L4 Business Ops** | SALES, REVENUE, CUSTOMER EXPERIENCE, OPERATIONS & TEAMS, HR, FINANCE, LEGAL, TASKS, CALENDAR, ADS & MARKETING, HEALTH | CRM/ERP-like data models |
| **L5 Leadership** | FOUNDER DASHBOARD, BUSINESS DASHBOARD | Read-mostly aggregates over L4 |
| **L6 Platform / Admin** | N0VA1O, ADMIN CONSOLE, ADMIN, ENDPOINT MANAGEMENT, APPSCRIPT, APPSET, WORKSPACE STUDIO | Governance, extensibility, IT |

**Spec gaps to resolve during planning of those modules:** `BUSINESS DASHBOARD` and `FINANCE`
are listed in VISI.md but have **no spec files**. Write minimal specs before building them.

---

## 3. Monorepo Layout

```
onespace/
├─ apps/
│  ├─ web/                  # Next.js shell — launcher + all modules as route groups
│  │   └─ app/
│  │       ├─ (auth)/       # signin, signup, workspace picker
│  │       ├─ m/            # /m/mail, /m/docs, /m/sheets, ... (one route group per module)
│  │       └─ api/          # per-module route handlers delegated to packages
│  └─ gateway/              # N0VA1O — outbound integration gateway (service)
├─ packages/
│  ├─ db/                   # Prisma schema (multi-file), client, seed, migrations
│  ├─ auth/                 # Auth.js setup, session helpers, tenant resolution
│  ├─ authz/                # RBAC + ABAC engine, permission presets per module
│  ├─ ui/                   # Design system: primitives, theme, icons, blocks
│  ├─ core/                 # types, env validation, id/tenant utilities, errors
│  ├─ modules/
│  │   ├─ mail/             # domain model, service layer, API, UI components
│  │   ├─ docs/ …           # one package per module (each depends on core/db/authz/ui)
│  └─ anineural/            # ANI client + provider adapters (OpenAI-compatible, local)
├─ infra/
│  ├─ docker-compose.yml    # Postgres, (later: object storage, search)
│  └─ .env.example
├─ PLAN.md                  # this file
└─ specs/                   # the 39 N0VA *.md specs, moved here as the canonical docs
```

**Module = one package + one route group.** `apps/web` imports `@n0va/modules-mail`.
A heavy module (e.g. MEET with WebRTC) can become its own Next.js app later without
rewriting its package.

---

## 4. Shared Foundation (build once, used by all)

### 4.1 Data model (`packages/db`)
- Multi-file Prisma schema (`prismaSchemaFolder`) — `base.prisma` + `modules/<module>.prisma`
- **Hard rule:** every model carries `tenant_id`, every query goes through a tenant-scoped
  repository helper that injects it — no bypasses (lint rule + tests enforce).
- Core entities: `Workspace` (tenant), `User`, `WorkspaceMember` (seats + roles),
  `Role`/`Permission` (RBAC), `AuditLog`, `Notification`, `Attachment` (shared asset ref).
- `User` is global; **all** business data belongs to a `Workspace`.

### 4.2 Auth & tenancy (`packages/auth` + `packages/authz`)
- Auth.js: credentials (email+password, hashed) + optional OAuth; session carries `userId`.
- Middleware resolves `tenant_id` from the active workspace cookie/URL; guard rejects
  cross-tenant access (403).
- RBAC: preset roles per module (Viewer/Editor/Admin/Owner) + ABAC rules where specs
  demand field-level control (VAULT, LEGAL, HR).
- Every mutation writes an `AuditLog` row (tenant-scoped) — all specs require provenance.

### 4.3 Design system (`packages/ui`)
- Token-based (color/space/typography), light+dark, WCAG AA.
- Primitive kit (button, input, dialog, table, toast, dropdown, combobox) + layout kit
  (app shell, sidebar nav, module header, command palette Cmd+K launcher).
- Module pages are composed from these; no module reinvents chrome.

### 4.4 N0VA1O gateway (L6, but scaffolded in Phase 1)
- The single outbound integration surface: connectors, credential vault (links to N0VA VAULT),
  webhook ingestion, rate limiting, retries, idempotency keys, per-integration audit.
- **N×M → 1:** modules never talk to third parties directly — they call N0VA1O.
- First connectors: SMTP/IMAP (MAIL), storage providers (DRIVE), calendar providers, webhooks.

### 4.5 ANI (`packages/anineural`)
- One client interface: `chat`, `embed`, `reason`, `tools` with typed events.
- Provider adapters: OpenAI-compatible remote, local (Ollama), mock (tests).
- Surface: side panel (`@ani` mentions), per-module AI actions; **no AI call ships without
  permission filtering + tenant isolation** (specs make this a hard requirement).
- Later: RAG over CLOUD SEARCH, tool orchestration via N0VA1O, agent runtime in STUDIO.

---

## 5. Build Phases

Each phase ends with **exit criteria** — demoable, testable, mergeable to `main`.

### Phase 0 — Foundation (weeks 1–2)
- Turborepo + pnpm + Next.js shell; ESLint/Prettier/TS strict; Vitest + Playwright wired.
- `packages/db`: base schema (Workspace/User/membership/RBAC/AuditLog), migrations, seed
  (demo tenants + users), tenant-scoped repo helper + tests.
- `packages/auth`: sign-in/up, workspace creation, session, middleware tenant guard.
- `packages/ui`: tokens, primitives, app shell, launcher grid (`/m` home).
- Move the 39 specs into `specs/` (canonical docs), add BUSINESS DASHBOARD + FINANCE briefs.
- **Exit:** launch suite shell with 2 demo tenants, role-aware launcher, audit trail on auth events.

### Phase 1 — Core Workspace (weeks 3–8) ← *highest user value first*
Build in this order (shared asset model first):
1. **CLOUD STORAGE** — file metadata, chunks→local/object storage adapter, sharing, versions
2. **CONTACTS** — unified people model (identity for MAIL/CHAT/MEET/DRIVE sharing)
3. **MAIL** — threads, compose, labels, SMTP/IMAP via N0VA1O, search (Postgres FTS)
4. **CALENDAR** — events, invites, availability, iCal import/export
5. **TASKS** — lists, due dates, assignees, comments, notifications
6. **KEEP** — notes, labels, colors, pins
7. **FORMS** — builders→responses→Sheets-style tables (own grid, not dependency)
8. **DOCS** — rich editor (tiptap), comments, mentions, version history, realtime (CRDT)
9. **SHEETS** — grid, formulas, ranges, CSV/Excel import-export
10. **CHAT** — channels/DMs, threads, reactions, files, presence

**Exit:** a tenant can run mail+calendar+docs+sheets+drive+chat as a daily driver; every
action is tenant-scoped and audited; ANI side panel answers from stored docs (mock provider).

### Phase 2 — Creation & Comms (weeks 9–13)
- **SLIDES**, **DRAWINGS**, **PICS** (image manager), **VIDEOS** (upload/transcode/playback),
  **MEET** (WebRTC rooms on DRIVE/CHAT identity), **VOICE** (PSTN adapter contract),
  **GROUPS** (distribution lists + team spaces on CONTACTS), **BOOKLM** (study sets over DOCS/VIDEOS).
- **SITES** (page builder on DOCS blocks), **CLOUD SEARCH** (unified index across modules).

### Phase 3 — Platform & Admin (weeks 14–18)
- **N0VA1O** full gateway (connectors, webhooks, queue, credential vault integration)
- **ADMIN CONSOLE** (users, roles, security, audit viewer), **ADMIN** (module policies),
  **ENDPOINT MANAGEMENT** (device registry + attestation), **VAULT** (encrypted secrets, field-level),
  **INSIGHTS** (dashboards over AuditLog + usage), **APPSCRIPT** (JS runtime with module APIs),
  **APPSET** (no-code builder), **WORKSPACE STUDIO** (automations: triggers→N0VA1O→actions, agent runs)

### Phase 4 — Business Ops & Leadership (weeks 19–26)
- **SALES** (pipeline CRM), **REVENUE** (billing/subscriptions), **CX** (tickets/CSAT),
  **OPERATIONS & TEAMS** (projects/workflows), **HR** (people ops), **FINANCE** (ledger, invoices),
  **LEGAL** (contracts, e-sign flow), **ADS & MARKETING** (campaigns), **HEALTH** (wellness),
  **FOUNDER DASHBOARD** (aggregate KPIs), **BUSINESS DASHBOARD** (per-department views)

**Roadmap total:** ~26 weeks to full suite at solo pace; each module's depth is ratcheted by
the "1% per week" deepening rule below.

---

## 6. Conventions (definition of done per module)

1. **Tenant-scoped by construction** — no query bypasses the tenant helper (test-enforced).
2. **Module package + route group + spec mapping** — every spec section maps to code or an
   explicit "deferred contract" note.
3. **Audit + RBAC wired** — no mutating endpoint without permission check and audit row.
4. **Tests** — unit (Vitest) for services, Playwright smoke per module flow.
5. **Design tokens only** — no ad-hoc colors/spacing in module code.
6. **No direct third-party calls** — integrations route through N0VA1O.
7. **Lint/typecheck/CI green** before merge; changesets for release notes.

### Deepening rhythm
Each module ships at "**working product**" depth first (core flows end-to-end), then deepens
in follow-up passes (AI features, advanced specs, edge cases). A module is never *skipped*,
only deferred to a later deepening pass — the suite stays whole.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope (39 modules) | Layered phases; working-product-first; deepens scheduled, never blocking suite integration |
| Realtime editors (DOCS/MEET) | Adopt battle-tested libs (tiptap + Yjs/CRDT, WebRTC) inside module packages |
| Replacing "Transcendent" claims with real backends | Contract-first ANI/N0VA1O interfaces; specs remain the target, code is the current truth |
| Solo-founder maintenance | Single deployable (`apps/web`), Postgres-only, no exotic infra; heavy modules split only on real need |
| Spec gaps (BUSINESS DASHBOARD, FINANCE) | Write brief specs before Phase 4 build |

---

## 8. Immediate Next Steps

1. Commit the 39 specs to git, move them into `specs/` (canonical docs) — first commit.
2. Scaffold Phase 0 (Turborepo, shell, db/auth/ui packages) on `main`.
3. Add BUSINESS DASHBOARD + FINANCE spec briefs.
4. Begin Phase 1 with CLOUD STORAGE + CONTACTS as the shared foundation for MAIL/CALENDAR/DOCS.
