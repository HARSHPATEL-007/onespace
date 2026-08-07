# AGENTS.md

> Guidance for AI agents working in this repo.

## Workspace

A Turborepo + pnpm monorepo. Run everything from the repository root (`onespace/`).

## Commands

| Task | Command |
|------|---------|
| Typecheck (all 47 packages) | `pnpm typecheck` |
| Unit tests (N0VA1O gateway) | `pnpm --filter @n0va/db exec tsx --test "..\modules\n0va1o\src\gateway.test.ts"` |
| Lint | `pnpm lint` |
| Dev server (web on :3100) | `pnpm --filter web dev -p 3100` |
| Seed DB | `pnpm --filter @n0va/db exec tsx prisma/seed.ts` |
| Regenerate Prisma client | `pnpm --filter @n0va/db exec prisma generate` |

## Module layout (N0VA1O)

`packages/modules/n0va1o/src/` contains:

- `catalog.ts` — 1000+ provider tool catalog, `scopeTools`, `isDestructiveTool`, `discoverTools` (intent-driven relevance discovery, spec §3.4)
- `gateway.ts` — outbound/inbound engine (retry, rate-limit, idempotency, webhook ingest, audit logging, JIT token lifecycle, policy enforcement)
- `policy.ts` — Unified Policy Engine: pre-invocation evaluator (ALLOW/DENY/REQUIRE_APPROVAL), risk scoring, audit-logged decisions (spec §4.1)
- `versioning.ts` — Workflow versioning & rollback: append-only store, content-addressed versions, diff, immutable history (spec §4.2)
- `executor.ts` — Atomic multi-step execution with compensating actions and partial-failure recovery (spec §4.3)
- `session.ts` — Session memory controls: ephemeral vs durable separation, retention, redaction, replay (spec §4.4)
- `secrets.ts` — Secretless execution: secret detection, scrubbing from logs/exports, rotation tracking (spec §2.1)
- `privacy.ts` — Privacy classification tags (public/internal/confidential/restricted): redaction, truncation, masking, quarantine (spec §2.3)
- `incident.ts` — Incident response mode: session suspension, evidence preservation, alert routing, immutable bundles (spec §2.4)
- `adapters.ts` — real HTTPS connector adapters keyed `${provider}:${tool}`
- `mcp.ts` — JSON-RPC 2.0 MCP core (initialize, tools/list, `tools/discover`, tools/call, resources, `n0va1o.approve_access`)
- `server.ts` — `N0va1oService` with RBAC-gated connection/settings/compliance/access-request/discovery methods
- `components.tsx` — client UI (Integrations view, Interrogation Room card, settings)

Auth note: the MCP endpoint authenticates via `Authorization: Bearer <workspace.mcpKey>`.

## Common gotchas

- Stale `next dev` processes hold the Prisma query-engine DLL and block `prisma generate`/`migrate dev`. Kill them before regenerating.
