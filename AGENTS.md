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
| Seed DB | `pnpm --filter @n0va/db exec prisma db seed` |
| Regenerate Prisma client | `pnpm --filter @n0va/db exec prisma generate` |

## Module layout (N0VA1O)

`packages/modules/n0va1o/src/` contains:

- `catalog.ts` — 1000+ provider tool catalog, `scopeTools`, `isDestructiveTool`
- `gateway.ts` — outbound/inbound engine (retry, rate-limit, idempotency, webhook ingest, audit logging)
- `adapters.ts` — real HTTPS connector adapters keyed `${provider}:${tool}`
- `mcp.ts` — JSON-RPC 2.0 MCP core (initialize, tools/list, tools/call, resources, `n0va1o.approve_access`)
- `server.ts` — `N0va1oService` with RBAC-gated connection/settings/compliance/access-request methods
- `components.tsx` — client UI (Integrations view, Interrogation Room card, settings)

Auth note: the MCP endpoint authenticates via `Authorization: Bearer <workspace.mcpKey>`.

## Common gotchas

- Stale `next dev` processes hold the Prisma query-engine DLL and block `prisma generate`/`migrate dev`. Kill them before regenerating.
