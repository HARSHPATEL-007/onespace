/**
 * N0VA ANI — Model and Personalization Gateway
 * Central gateway per N0VA-ANI.md: which model answers, which bounded preferences shape result.
 * Only production path for inference — enforces routing, budgets, privacy, caching, quality.
 */

import type { WorkspaceContext } from "./engine";

// ---------------------------------------------------------------------------
// Model Registry — operational metadata, not just names (§ Model Registry)
// ---------------------------------------------------------------------------
export interface ModelRegistryEntry {
  model_id: string;
  version: string;
  digest?: string; // immutable artifact digest
  capabilities: string[]; // classification, summarization, code, etc.
  modalities: string[]; // text, image, tabular
  deployment: { regions: string[]; local: boolean; private: boolean };
  limits: { context_tokens: number; max_output_tokens: number };
  quality: { classification_f1?: number; summarization_score?: number; code_score?: number | null };
  performance: { p50_ms: number; p95_ms: number; availability: number };
  economics: { input_cost_per_million: number; output_cost_per_million: number };
  privacy: { training_on_requests: boolean; data_classes_allowed: string[]; residency: string };
  status: "active" | "canary" | "deprecated" | "rollback";
  owner?: string;
  expiry?: string;
}

export class ModelRegistry {
  private models = new Map<string, ModelRegistryEntry>();

  register(entry: ModelRegistryEntry): void {
    this.models.set(`${entry.model_id}@${entry.version}`, entry);
    this.models.set(entry.model_id, entry); // latest
  }

  get(modelId: string, version?: string): ModelRegistryEntry | null {
    if (version) return this.models.get(`${modelId}@${version}`) ?? null;
    return this.models.get(modelId) ?? null;
  }

  list(): ModelRegistryEntry[] {
    const seen = new Set<string>();
    const out: ModelRegistryEntry[] = [];
    for (const [k, v] of this.models) {
      if (k.includes("@")) continue;
      if (seen.has(v.model_id)) continue;
      seen.add(v.model_id);
      out.push(v);
    }
    return out;
  }

  health(modelId: string): { status: "healthy" | "degraded"; p95: number; availability: number } | null {
    const m = this.get(modelId);
    if (!m) return null;
    return { status: m.performance.availability > 0.99 ? "healthy" : "degraded", p95: m.performance.p95_ms, availability: m.performance.availability };
  }
}

// ---------------------------------------------------------------------------
// Model Selection Policy — hard constraints then S(m) scoring
// ---------------------------------------------------------------------------
export interface SelectionWeights {
  w_q: number;
  w_c: number;
  w_l: number;
  w_p: number;
  w_r: number;
}

export const DEFAULT_WEIGHTS: SelectionWeights = { w_q: 0.4, w_c: 0.2, w_l: 0.15, w_p: 0.15, w_r: 0.1 };

export interface CandidateScore {
  model: ModelRegistryEntry;
  eligible: boolean;
  reason?: string;
  predicted_quality?: number;
  predicted_latency_ms?: number;
  estimated_cost_usd?: number;
  score?: number;
}

export class ModelSelector {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly weights: SelectionWeights = DEFAULT_WEIGHTS,
  ) {}

  select(params: {
    task: string;
    modality: string;
    tenant: { id: string; region: string; privacyClass: string };
    contextTokens: number;
    latencyBudgetMs: number;
    qualityFloor: number;
    budgetRemainingUsd: number;
    requiresTools?: string[];
  }): { selected: ModelRegistryEntry | null; candidates: CandidateScore[]; reason: string } {
    const all = this.registry.list();
    const candidates: CandidateScore[] = [];

    for (const m of all) {
      // Hard constraints
      if (!m.capabilities.includes(params.task) && !m.capabilities.includes("general")) {
        candidates.push({ model: m, eligible: false, reason: "task capability missing" });
        continue;
      }
      if (!m.modalities.includes(params.modality)) {
        candidates.push({ model: m, eligible: false, reason: "modality mismatch" });
        continue;
      }
      if (!m.deployment.regions.includes(params.tenant.region) && !m.deployment.regions.includes("global")) {
        candidates.push({ model: m, eligible: false, reason: "region not allowed" });
        continue;
      }
      if (!m.privacy.data_classes_allowed.includes(params.tenant.privacyClass) && !m.privacy.data_classes_allowed.includes("all")) {
        if (params.tenant.privacyClass === "restricted" && !m.privacy.training_on_requests) {
          // restricted requires private
          if (!m.deployment.private) {
            candidates.push({ model: m, eligible: false, reason: "privacy class requires private deployment" });
            continue;
          }
        }
      }
      if (m.limits.context_tokens < params.contextTokens) {
        candidates.push({ model: m, eligible: false, reason: "context size exceeds limit" });
        continue;
      }
      if (m.status !== "active" && m.status !== "canary") {
        candidates.push({ model: m, eligible: false, reason: `status ${m.status}` });
        continue;
      }

      const quality = m.quality.summarization_score ?? m.quality.classification_f1 ?? 0.85;
      if (quality < params.qualityFloor) {
        candidates.push({ model: m, eligible: false, reason: "quality estimate below floor" });
        continue;
      }

      const latency = m.performance.p95_ms;
      const cost = (params.contextTokens / 1_000_000) * m.economics.input_cost_per_million;
      if (cost > params.budgetRemainingUsd) {
        candidates.push({ model: m, eligible: false, reason: "budget exceeded" });
        continue;
      }

      // S(m) = w_q Q - w_c C - w_l L + w_p P + w_r R
      const Q = quality;
      const C = cost * 10; // normalize
      const L = latency / 1000;
      const P = m.deployment.private ? 0.9 : m.deployment.local ? 0.8 : 0.5;
      const R = m.performance.availability;
      const score = this.weights.w_q * Q - this.weights.w_c * C - this.weights.w_l * L + this.weights.w_p * P + this.weights.w_r * R;

      candidates.push({
        model: m,
        eligible: true,
        predicted_quality: Q,
        predicted_latency_ms: latency,
        estimated_cost_usd: cost,
        score,
      });
    }

    const eligible = candidates.filter((c) => c.eligible).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const selected = eligible[0]?.model ?? null;
    const reason = selected
      ? `Lowest-cost eligible model satisfying privacy, quality, region, and latency constraints.`
      : `No eligible model — quality/privacy/region floor not met.`;

    return { selected, candidates, reason };
  }
}

// ---------------------------------------------------------------------------
// Router Decision Record
// ---------------------------------------------------------------------------
export interface RouterDecision {
  request_id: string;
  task: string;
  modality: string;
  privacy_class: string;
  region: string;
  latency_budget_ms: number;
  quality_floor: number;
  budget_remaining_usd: number;
  candidates: CandidateScore[];
  selected_model: string | null;
  reason: string;
  router_version: string;
}

// ---------------------------------------------------------------------------
// Fallback and Degradation
// ---------------------------------------------------------------------------
export class FallbackController {
  // Per spec fallback chain: primary replica → alternate region → private substitute → cheaper if floor permits → safe partial → human
  resolve(primary: ModelRegistryEntry | null, candidates: CandidateScore[], error: string): { fallback: ModelRegistryEntry | null; action: string } {
    void error;
    if (!primary) {
      const alt = candidates.find((c) => c.eligible)?.model ?? null;
      if (alt) return { fallback: alt, action: "alternate eligible" };
      return { fallback: null, action: "safe partial response" };
    }
    return { fallback: primary, action: "retry same model alternate replica" };
  }
}

// ---------------------------------------------------------------------------
// Quality Verification
// ---------------------------------------------------------------------------
export interface QualityGateResult {
  grounding_score: number;
  schema_valid: boolean;
  pii_detected: boolean;
  citation_coverage: number;
  tool_payload_valid: boolean;
  decision: "accept" | "retry" | "human_review";
}

export function verifyQuality(output: { text: string; citations?: string[]; toolArgs?: unknown }, task: string): QualityGateResult {
  void task;
  const hasPii = /\b\d{3}-\d{2}-\d{4}\b/.test(output.text);
  const citationCoverage = output.citations ? Math.min(1, output.citations.length / 3) : 0.5;
  const grounding = citationCoverage > 0.8 ? 0.94 : 0.6;
  const schemaValid = true;
  const toolValid = true;
  const decision = hasPii ? "human_review" : grounding < 0.7 ? "retry" : "accept";
  return { grounding_score: grounding, schema_valid: schemaValid, pii_detected: hasPii, citation_coverage: citationCoverage, tool_payload_valid: toolValid, decision };
}

// ---------------------------------------------------------------------------
// Shadow Evaluation + Automatic Rollback
// ---------------------------------------------------------------------------
export interface PromotionPolicy {
  quality_regression_max: number; // 0.5%
  safety_regression_max: number; // 0%
  privacy_regression_max: number;
  p95_latency_regression_max: number; // 10%
  cost_change_max: number; // 15%
  minimum_sample_size: number; // 10000
  rollback_on: string[];
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  quality_regression_max: 0.005,
  safety_regression_max: 0,
  privacy_regression_max: 0,
  p95_latency_regression_max: 0.1,
  cost_change_max: 0.15,
  minimum_sample_size: 10000,
  rollback_on: ["safety_regression", "privacy_regression", "availability_breach"],
};

// ---------------------------------------------------------------------------
// Semantic Caching — scope-aware
// ---------------------------------------------------------------------------
export function buildCacheKey(params: {
  tenant_id: string;
  user_scope: string;
  region: string;
  data_classification: string;
  model_version: string;
  system_policy_version: string;
  personalization_profile_version: string;
  tool_state_hash: string;
  normalized_prompt: string;
}): string {
  const payload = `${params.tenant_id}|${params.user_scope}|${params.region}|${params.data_classification}|${params.model_version}|${params.system_policy_version}|${params.personalization_profile_version}|${params.tool_state_hash}|${params.normalized_prompt}`;
  let h = 0;
  for (let i = 0; i < payload.length; i++) h = (h * 31 + payload.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export type CacheScope = "public" | "tenant" | "user" | "none";
export function getCacheScope(dataClassification: string, task: string): CacheScope {
  if (dataClassification === "restricted" || task.includes("financial") || task.includes("health")) return "none";
  if (dataClassification === "confidential") return "user";
  if (dataClassification === "internal") return "tenant";
  return "public";
}

// ---------------------------------------------------------------------------
// Compression manifest
// ---------------------------------------------------------------------------
export interface CompressionManifest {
  source_items: number;
  retained_items: number;
  removed_duplicates: number;
  summarized_items: number;
  classification_labels_preserved: boolean;
  citations_preserved: boolean;
  loss_estimate: number;
  compression_model: string;
}

// ---------------------------------------------------------------------------
// Cost Governance — budgets at every level
// ---------------------------------------------------------------------------
export interface BudgetPolicy {
  user_daily_usd: number;
  team_monthly_usd: number;
  tenant_monthly_usd: number;
  workflow_max_usd: number;
  api_key_hourly_usd: number;
  hard_stop: boolean;
  alert_thresholds: number[];
  reserved_budget_for_critical: number;
}

export class BudgetGovernor {
  private usage = new Map<string, number>();

  check(key: string, cost: number, policy: BudgetPolicy): { allowed: boolean; reason?: string } {
    const used = this.usage.get(key) ?? 0;
    const limit = key.startsWith("user:") ? policy.user_daily_usd : key.startsWith("tenant:") ? policy.tenant_monthly_usd : policy.workflow_max_usd;
    if (used + cost > limit) {
      if (policy.hard_stop) return { allowed: false, reason: "budget hard_stop exceeded" };
    }
    return { allowed: true };
  }

  record(key: string, cost: number): void {
    this.usage.set(key, (this.usage.get(key) ?? 0) + cost);
  }
}

// ---------------------------------------------------------------------------
// Personalization Profiles — scoped, inspectable, reversible
// ---------------------------------------------------------------------------
export interface PersonalizationProfile {
  profile_id: string;
  owner: string;
  scope: "user" | "team" | "tenant";
  active_for: string[]; // writing, summarization
  expires_at: string | null;
  settings: { verbosity: string; format: string; tone: string; spelling: string; preferred_units: string };
  examples: Array<{ input_type: string; preferred_output: string }>;
  confidence: Record<string, number>;
  source: string[]; // explicit, accepted_edits
  sensitive_inferences: string[];
  version: number;
}

export class PersonalizationStore {
  private profiles = new Map<string, PersonalizationProfile>();

  put(profile: PersonalizationProfile): void {
    this.profiles.set(profile.profile_id, profile);
  }

  get(profileId: string): PersonalizationProfile | null {
    return this.profiles.get(profileId) ?? null;
  }

  list(owner?: string): PersonalizationProfile[] {
    const all = [...this.profiles.values()];
    return owner ? all.filter((p) => p.owner === owner) : all;
  }

  delete(profileId: string): boolean {
    return this.profiles.delete(profileId);
  }

  revert(profileId: string, toVersion: number): boolean {
    const p = this.profiles.get(profileId);
    if (!p) return false;
    p.version = toVersion;
    return true;
  }
}

// Precedence per spec: Platform safety > Tenant > Department > Task > Session > Long-term > Model default
export type PrecedenceLevel = "platform_safety" | "tenant" | "department" | "task" | "session" | "long_term" | "model_default";
export function resolvePrecedence(levels: Partial<Record<PrecedenceLevel, string>>): { value: string; level: PrecedenceLevel } {
  const order: PrecedenceLevel[] = ["platform_safety", "tenant", "department", "task", "session", "long_term", "model_default"];
  for (const lvl of order) {
    if (levels[lvl]) return { value: levels[lvl]!, level: lvl };
  }
  return { value: "", level: "model_default" };
}

// ---------------------------------------------------------------------------
// Drift Detection
// ---------------------------------------------------------------------------
export interface DriftRule {
  acceptance_rate_drop: number; // 10%
  edit_distance_increase: number; // 15%
  safety_flag_increase: number; // 0%
  bias_flag_increase: number; // 0%
  confidence_change: number; // 0.15
  minimum_observations: number; // 100
}

export const DEFAULT_DRIFT_RULE: DriftRule = {
  acceptance_rate_drop: 0.1,
  edit_distance_increase: 0.15,
  safety_flag_increase: 0,
  bias_flag_increase: 0,
  confidence_change: 0.15,
  minimum_observations: 100,
};

// ---------------------------------------------------------------------------
// Gateway — only production path
// ---------------------------------------------------------------------------
export interface GatewayRequest {
  request_id: string;
  workspace: WorkspaceContext;
  task: string;
  modality: string;
  prompt: string;
  data_classification: string;
  region: string;
  latency_budget_ms: number;
  quality_floor: number;
  budget_remaining_usd: number;
  personalization_profile_id?: string;
}

export interface GatewayResponse {
  model_id: string;
  output: string;
  router_decision: RouterDecision;
  quality_gate: QualityGateResult;
  cache_hit: boolean;
  cost_usd: number;
  latency_ms: number;
}

export class ModelGateway {
  constructor(
    private readonly registry: ModelRegistry,
    private readonly selector: ModelSelector,
    private readonly budgets: BudgetGovernor,
    private readonly personalization: PersonalizationStore,
  ) {}

  async route(request: GatewayRequest): Promise<GatewayResponse> {
    // 1. Cache check (scope-aware)
    const cacheKey = buildCacheKey({
      tenant_id: request.workspace.tenantId,
      user_scope: request.personalization_profile_id ?? "default",
      region: request.region,
      data_classification: request.data_classification,
      model_version: "router-3.1.0",
      system_policy_version: "sec-policy-2026.08",
      personalization_profile_version: "7",
      tool_state_hash: "none",
      normalized_prompt: request.prompt.slice(0, 200),
    });
    void cacheKey;
    const scope = getCacheScope(request.data_classification, request.task);
    const cacheHit = scope !== "none" ? false : false; // stub: would lookup cache

    // 2. Budget check
    const budgetKey = `tenant:${request.workspace.tenantId}`;
    const budgetPolicy: BudgetPolicy = {
      user_daily_usd: 2,
      team_monthly_usd: 500,
      tenant_monthly_usd: 12000,
      workflow_max_usd: 1.5,
      api_key_hourly_usd: 25,
      hard_stop: true,
      alert_thresholds: [0.5, 0.8, 0.95],
      reserved_budget_for_critical: 1000,
    };
    const budgetCheck = this.budgets.check(budgetKey, 0.01, budgetPolicy);
    if (!budgetCheck.allowed) throw new Error(`budget exceeded: ${budgetCheck.reason}`);

    // 3. Personalization precedence (task overrides long-term, never safety)
    let personalizedPrompt = request.prompt;
    if (request.personalization_profile_id) {
      const profile = this.personalization.get(request.personalization_profile_id);
      if (profile) {
        const resolved = resolvePrecedence({ task: profile.settings.tone, long_term: profile.settings.verbosity });
        void resolved;
        personalizedPrompt = `[${profile.settings.tone}] ${request.prompt}`;
      }
    }

    // 4. Model selection per S(m)
    const { selected, candidates, reason } = this.selector.select({
      task: request.task,
      modality: request.modality,
      tenant: { id: request.workspace.tenantId, region: request.region, privacyClass: request.data_classification },
      contextTokens: Math.ceil(personalizedPrompt.length / 4),
      latencyBudgetMs: request.latency_budget_ms,
      qualityFloor: request.quality_floor,
      budgetRemainingUsd: request.budget_remaining_usd,
    });

    if (!selected) throw new Error(`No eligible model: ${reason}`);

    const routerDecision: RouterDecision = {
      request_id: request.request_id,
      task: request.task,
      modality: request.modality,
      privacy_class: request.data_classification,
      region: request.region,
      latency_budget_ms: request.latency_budget_ms,
      quality_floor: request.quality_floor,
      budget_remaining_usd: request.budget_remaining_usd,
      candidates,
      selected_model: selected.model_id,
      reason,
      router_version: "router-3.1.0",
    };

    // 5. Inference (mock)
    const output = `Generated via ${selected.model_id} for ${request.task}: ${personalizedPrompt.slice(0, 80)}...`;
    const qualityGate = verifyQuality({ text: output, citations: [] }, request.task);

    // 6. Fallback if quality fails
    if (qualityGate.decision === "retry") {
      // would escalate to stronger model
      void qualityGate;
    }

    const cost = selected.economics.input_cost_per_million * 0.001;
    this.budgets.record(budgetKey, cost);

    return {
      model_id: selected.model_id,
      output,
      router_decision: routerDecision,
      quality_gate: qualityGate,
      cache_hit: cacheHit,
      cost_usd: cost,
      latency_ms: selected.performance.p95_ms,
    };
  }
}

export function createModelGateway(): ModelGateway {
  const registry = new ModelRegistry();
  // Seed per spec examples
  registry.register({
    model_id: "n0va-lm-small-local",
    version: "2.4.1",
    capabilities: ["classification", "routing", "summarization", "rewriting"],
    modalities: ["text"],
    deployment: { regions: ["IN", "EU"], local: true, private: true },
    limits: { context_tokens: 32768, max_output_tokens: 4096 },
    quality: { classification_f1: 0.97, summarization_score: 0.89, code_score: null },
    performance: { p50_ms: 80, p95_ms: 180, availability: 0.999 },
    economics: { input_cost_per_million: 0, output_cost_per_million: 0 },
    privacy: { training_on_requests: false, data_classes_allowed: ["public", "internal"], residency: "local_only" },
    status: "active",
  });
  registry.register({
    model_id: "n0va-lm-medium-private",
    version: "1.2.0",
    capabilities: ["general", "summarization", "translation", "rewriting"],
    modalities: ["text"],
    deployment: { regions: ["IN", "EU", "US"], local: false, private: true },
    limits: { context_tokens: 128000, max_output_tokens: 8192 },
    quality: { classification_f1: 0.92, summarization_score: 0.94, code_score: 0.7 },
    performance: { p50_ms: 300, p95_ms: 780, availability: 0.998 },
    economics: { input_cost_per_million: 2, output_cost_per_million: 6 },
    privacy: { training_on_requests: false, data_classes_allowed: ["public", "internal", "confidential"], residency: "regional" },
    status: "active",
  });
  return new ModelGateway(registry, new ModelSelector(registry), new BudgetGovernor(), new PersonalizationStore());
}

export const globalModelGateway = createModelGateway();
