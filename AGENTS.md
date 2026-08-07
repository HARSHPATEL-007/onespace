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

`packages/modules/n0va1o/src/` contains 55 modules. All are pure (no Prisma/IO) unless noted:

**Core orchestration:**
- `orchestrate.ts` — compose runtime: `createRuntime`, `invokeTool`, `getSystemHealth` (wires policy + logging + metrics)
- `gateway.ts` — outbound/inbound engine (retry, rate-limit, idempotency, audit logging, JIT token lifecycle) [uses Prisma]
- `server.ts` — `N0va1oService` with RBAC-gated methods [uses Prisma]
- `mcp.ts` — JSON-RPC 2.0 MCP core (initialize, tools/list, tools/discover, tools/call, resources)
- `catalog.ts` — 1000+ provider tool catalog, `scopeTools`, `discoverTools`

**Policy & governance:**
- `policy.ts` — Unified Policy Engine: ALLOW/DENY/REQUIRE_APPROVAL with risk scoring
- `escalation.ts` — HITL escalation: risk classification, routing, timeout fail-safe, audit
- `feature-flags.ts` — tenant-scoped staged rollout (off/canary/partial/full), emergency disable
- `gates.ts` — stakeholder review gates (security/ops/finance/product)
- `phases.ts` — release phase gates (discovery/feasibility/design/build/validation/rollout)

**Workflow & execution:**
- `versioning.ts` — workflow versioning & rollback with immutable history
- `executor.ts` — atomic multi-step execution with compensating actions
- `agentic.ts` — multi-step agent workflows: planning, tool selection, verification, retry, replanning
- `recipe.ts` — human-editable recipe templates with type-safe validation
- `simulation.ts` — dry-run execution against mock connectors
- `intent.ts` — intent confidence thresholds with tenant-configurable modes

**Security & privacy:**
- `secrets.ts` — secretless execution: detection, scrubbing, rotation tracking
- `privacy.ts` — classification labels driving redaction/truncation/masking/quarantine
- `incident.ts` — incident response: session suspension, evidence bundles, alert routing
- `grounding.ts` — evidence retrieval, claim verification, citation enforcement, high-stakes gating
- `code-exec.ts` — secure code-interpreter with sandbox quotas and audit traces

**Data & retrieval:**
- `rag.ts` — retrieval-augmented operation: hybrid search, evidence packaging, grounded generation
- `multimodal.ts` — unified semantic space for text/image/audio/video/document
- `cross-modal.ts` — cross-modal search and action across mixed media
- `session.ts` — session memory: ephemeral vs durable, retention, redaction, replay
- `file-view.ts` — streaming file views: chunked previews, search, type-aware rendering
- `bulk.ts` — bulk import/export: chunking, resumable transfer, retry backoff
- `voice.ts` — voice-first: STT/TTS, streaming, interruption, multi-turn context

**Integration & ops:**
- `health.ts` — connector health scoring from latency/error/auth/drift/rate-limit/retries
- `schema-drift.ts` — drift detection, field mapping, auto-adapt
- `dependency.ts` — integration dependency mapping with topological sort
- `context.ts` — context minimization: tool selection within budget with rationale
- `transport.ts` — transport fallback: stdio/websocket/http_sse with session continuity
- `dashboard.ts` — operator dashboards: health, approvals, failures, latency, quota
- `metrics.ts` — metrics registry: counters, histograms, gauges
- `system-health.ts` — unified health check aggregating all subsystems
- `config.ts` — centralized config loader with env-based overrides
- `logging.ts` — structured JSON logging with correlation IDs

**Product & monetization:**
- `tiers.ts` — tier-aware feature gating (free/growth/pro/enterprise/transcendent)
- `addons.ts` — add-on bundling recommendations from usage patterns
- `forecasting.ts` — usage forecasting with trend detection and exhaustion flags
- `migration.ts` — migration assistance: connector mapping, cutover planning, validation

**Process & evaluation:**
- `acceptance.ts` — measurable acceptance criteria with explicit success metrics
- `traceability.ts` — requirement-to-test traceability matrix
- `scoping.ts` — enhancement scoping (minor/major/integration/ux)
- `intake.ts` — feature-request intake with validation
- `baseline.ts` — performance baselining with before/after comparison
- `backlog.ts` — risk-ranked backlog with weighted scoring
- `impact.ts` — user-impact analysis by segment, frequency, pain severity
- `transparency.ts` — enhancement request status tracking with validated transitions
- `explainability.ts` — per-step selection reasons, constraints, policy influences
- `eval.ts` — continuous evaluation: dimensions, lifecycle modes, datasets, alerts
- `finetuning.ts` — adaptive fine-tuning hooks: SFT/RFT/DPO readiness
- `integration.ts` — end-to-end integration test harness

**UI:**
- `components.tsx` — client UI (Integrations view, Interrogation Room card, settings)
- `adapters.ts` — real HTTPS connector adapters keyed `${provider}:${tool}`

Auth note: the MCP endpoint authenticates via `Authorization: Bearer <workspace.mcpKey>`.

## Common gotchas

- Stale `next dev` processes hold the Prisma query-engine DLL and block `prisma generate`/`migrate dev`. Kill them before regenerating.
