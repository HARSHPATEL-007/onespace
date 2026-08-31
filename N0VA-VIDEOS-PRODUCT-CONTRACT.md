# N0VA VIDEOS — Governed Collaborative Video Operating System
## Product Contract (Unified)

**Positioning:** Not an “AI video editor,” but a governed, collaborative video operating system.

**Principle:** Every asset is searchable, every AI action is reversible, every decision is explainable, every identity is consent-aware, every export is policy-validated, and every connected business workflow remains synchronized.

---

### 1. Foundation — Reliable Media Platform

**Ingest & Proxy (`ingest-proxy-engine.ts`)**
- Single ingest path for upload/watch_folder/cloud_import/live/mobile/api; content_hash idempotency → duplicate prevention.
- Checksum (sha256/xxhash) → immutable provenance, searchable via `searchAssets(tenant, query)` (4096-dim semantic proxy).
- Validation: container/codec/malware/policy explainable block; proxy tiers thumb/preview/edit/mezzanine reversible.
- Audit: actor/correlation_id per job, every write auditable.

**Core Timeline & Render Graph (`graph-engine.ts`)**
- Non-destructive DAG: immutable assets, versioned graph_version, explainable frame at time, cached artifacts, branch/merge with conflict preview.

**Search (`semantic-engine.ts` + `search-retrieval-engine.ts`)**
- Transcript + asset hybrid search: natural query → plan → smart/exact/visual/motion/color/emotion/speaker/similar/duplicate fusion, permission-aware.

**Review & Approval (`review-engine.ts` + `client-review-engine.ts`)**
- Review items/links, clustering, blockers, approval graph, deadline risk, voice/video feedback ingest.

**Captions/Exports/Player (`player-engine.ts`, `ingest-proxy`, `a11y`)**
- Captions VTT with confidence, exports (mp4/mov/hls/dash) policy-validated (`blocked_policy` if rights missing), player with signed token (domain_lock, watermark, expiry), DRM widevine/fairplay.

**Tenant Isolation & Policy (`governance-engine.ts`, `zero-trust-engine.ts`, `provenance-engine.ts`)**
- PDP deny-by-default, capability tokens, risk/consent, approval orchestration, ledger signed.

**Metrics & Cost (`observability-finops-engine.ts`, `billing-engine.ts`)**
- GPU/storage/CDN/AI cost ledger, versioned rate cards, estimate before execution.

---

### 2. Collaboration & Intelligence

- **AI Copilot (`copilot-engine.ts`)** — plan→simulate→approve→commit, reversible, explainable, cost-aware.
- **Quality (`quality-engine.ts`)** — continuity/brand/technical/visual consistency, gate with blocking rules.
- **Brand (`brand-engine.ts`)** — compile brandbook → governed templates, waivers.
- **Knowledge Graph (`knowledge-graph-engine.ts`)** — multimodal nodes/edges, hybrid search, consent/publishability checks.
- **Real-time Collab (`collaboration-engine.ts`)** — CRDT presence, locks, branch preview/merge, approvals.
- **Client Portal (`client-review-engine.ts`)** — watermarked links, forensic watermark, provenance.
- **Accessibility (`accessibility-automation-engine.ts`)** — caption position/quality, audio description, color/false, semantic timeline.
- **Workspace Sync (`workspace-sync-engine.ts`)** — links videos↔tasks↔calendar↔chat, CRDT clock, manual_merge conflict, every decision auditable.

---

### 3. Enterprise & Governance

- **Agent Governance (`governance-engine.ts` + `policy-plugin-engine.ts`)** — capability manifest (permissions/prohibited/network deny_by_default/approval), sandbox tenant_isolation, budget cap, rollback.
- **Consent & Identity (`identity-engine.ts`)** — consent grants, voice/lip-sync evaluation, provenance, passport, revocation.
- **Live Control (`live-control-engine.ts` + `live-edit-engine.ts`)** — multi-region SRT/RTMP, health prediction, failover, caption replay, highlight, live→edit continuum.
- **Interchange (`interchange-engine.ts`)** — canonical timeline → compilers (EDL/AAF/XML) → package, relink map, roundtrip validation.
- **DRM Forensic (`drm-forensic-engine.ts`)** — widevine/fairplay/playready, visible/forensic/dual watermark per tenant/user/session, trace leak → forensic payload, C2PA bound, every playback forensic.
- **Render Orchestration (`render-orchestration-engine.ts`)** — multi-region shards, policy `data_residency enforced` + `require_approval_for cross_region`, explainable provenance, shard output_hash reversible, region utilization metrics.
- **Regulated Controls (`regulated-controls-engine.ts`)** — legal holds (healthcare/legal/finance), WORM retention, `canDeleteAsset` blocked under hold, disposition approval, residency, every decision explainable.
- **Marketplace (`marketplace-engine.ts`)** — trusted composable: `n0va://marketplace/{type}/{slug}/{version}`, C2PA+SPDX BOM, sandbox for agents/motion, license validate/purchase, secure install → lockfile, revocation preserve outputs, update channels stable/LTS/beta/canary.

---

### 4. Intelligence & Future

- **Generative (`generative-engine.ts`)** — controlled jobs (text→video, image→video) with consent refs, provenance, policy profile.
- **Predictive Optimization (`predictive-optimization-engine.ts`)** — prediction `baseline→predicted delta` explainable top_factors, proposal reversible, policy-bounded pipeline, rollback.
- **Campaign Intelligence (`campaign-intelligence-engine.ts`)** — cross-platform assets (youtube/tiktok/linkedIn), performance `views/watch_time/ctr/cpm/roas` explainable, synced to workspace tasks/calendar, rights per variant.
- **Volumetric (`volumetric-engine.ts`)** — neRF/gaussian_splat/point_cloud/hologram, spatial_hash, immersive session `headset/webxr`, consent-aware DRM.
- **Private Fine-Tuning (`private-finetuning-engine.ts`)** — per-tenant isolated (`tenant_isolated:true` never cross-tenant), consent_chain required, dataset lineage explainable, C2PA/SPDX per private model.
- **Autonomous Pipelines (`event-driven-engine.ts` + `reliability-engineering-engine.ts` + `governance`)** — usage event → meter → rate card → estimate → ledger → invoice, budget reservations, never exceed hard cap, compensating rollback, policy-bounded.

---

### 5. Cross-Cutting Contract

| Contract | Implementation | Enforcement |
|---|---|---|
| **Searchable** | Ingest proxy content_hash + semantic embeddings + FileIndex + Search | `ingestSearch`, `semanticSearch`, `kgHybridSearch` |
| **Reversible** | Graph versions, copilot branch, predictive rollback, render shard re-queue | `rollbackToVersion`, `rollbackProposal`, `advanceShard` retry |
| **Explainable** | Prediction top_factors, quality gate blocking_rules, governance PDP dimensions, render provenance | `Prediction.explainable`, `evaluateGate`, `evaluatePolicy` |
| **Consent-aware** | Identity consent grants, voice packs, finetuning dataset consent_chain, regulated holds | `evaluateConsent`, `checkVoiceConsistency`, `createFinetuneJob` blocked if no consent |
| **Policy-validated** | Every export/playback/install/render gated by PDP (`policy_blocked` status) | `playerExportCreate` blocked_policy, `renderCreate` region block, `validateLicense` |
| **Synchronized** | Workspace sync links with CRDT, campaign sync, provenance attachments | `linkEntities`, `campaignCreate` synced task/calendar, `attachProvenance` |

**Tiers:** Creator → Team → Business → Studio → Regulated (capability-based packaging, 5 dims). **Billing:** estimate before execution, reserved budget, immutable ledger. **Marketplace:** quality gate (identity/license/provenance/integrity/compat/security/rights/docs/commercial/sandbox/revocation) before GA.

This contract unifies neural analysis, autonomous agents, cross-module links, compliance, review, delivery, workspace integration into a single governed OS.
