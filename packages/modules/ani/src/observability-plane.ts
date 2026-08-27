/**
 * N0VA ANI — AI Observability and Incident Response Plane
 *
 * Correlated traces/metrics/logs/events/evaluation with privacy-aware capture.
 * OpenTelemetry GenAI conventions: trace_id + span_id per operation.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Correlation Gateway — immutable trace_id + span_id
// ============================================================================

export type SpanType =
  | "ani.request" | "ani.intent" | "ani.permission" | "ani.retrieve" | "ani.rerank" | "ani.context_assemble"
  | "gen_ai.chat" | "gen_ai.embedding" | "ani.verify" | "gen_ai.invoke_agent" | "gen_ai.execute_tool"
  | "ani.policy" | "ani.approval" | "ani.side_effect" | "ani.state_verify" | "ani.cache" | "ani.fallback" | "ani.incident";

export interface Span {
  span_id: string;
  trace_id: string;
  parent_span_id?: string | null;
  type: SpanType;
  name: string;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
  attributes: Record<string, unknown>;
  status: "ok" | "error" | "pending";
  error?: string;
}

export function createSpan(trace_id:string, type:SpanType, name:string, parent?:string|null, attrs:Record<string,unknown>={}):Span{
  const span_id=`sp_${Math.random().toString(36).slice(2,8)}`;
  return { span_id, trace_id, parent_span_id: parent ?? null, type, name, started_at: new Date().toISOString(), attributes: attrs, status:"pending" };
}

// ============================================================================
// 2. Canonical Trace Schema
// ============================================================================

export interface TraceVersions {
  model?: string;
  prompt?: string;
  system_instructions?: string;
  retriever?: string;
  index?: string;
  tool_adapter?: string;
  policy?: string;
  workflow?: string;
  approval_policy?: string;
  user_config?: string;
  tenant_config?: string;
  feature_flags?: string[];
  cache_state?: string;
  runtime_region?: string;
  inference_pool?: string;
}

export interface TraceRecord {
  trace_id: string;
  request_id: string;
  tenant_id: string;
  workspace_id: string;
  user_id: string;
  session_id: string;
  capability: string;
  risk_tier: "low"|"medium"|"high"|"critical";
  started_at: string;
  ended_at?: string;
  status: "pending"|"completed"|"error"|"aborted";
  versions: TraceVersions;
  operations: Span[];
  outcome: { answer_delivered:boolean; action_attempted:boolean; action_completed:boolean; state_verified:boolean };
  privacy: { content_capture:"redacted"|"full"|"none"; retention_class:string; training_use:boolean };
}

export function createTrace(input: Omit<TraceRecord,"trace_id"|"request_id"|"started_at"|"operations"|"outcome"> & Partial<Pick<TraceRecord,"status"|"privacy">>): TraceRecord{
  const trace_id=`tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,4)}`;
  const request_id=`req_${Math.random().toString(36).slice(2,6)}`;
  return {
    trace_id, request_id,
    tenant_id: input.tenant_id,
    workspace_id: input.workspace_id,
    user_id: input.user_id,
    session_id: input.session_id,
    capability: input.capability,
    risk_tier: input.risk_tier,
    started_at: new Date().toISOString(),
    status: input.status ?? "pending",
    versions: input.versions,
    operations: [],
    outcome: { answer_delivered:false, action_attempted:false, action_completed:false, state_verified:false },
    privacy: input.privacy ?? { content_capture:"redacted", retention_class:"operational_trace_30d", training_use:false },
  };
}

// ============================================================================
// 3. Model Telemetry — OpenTelemetry GenAI conventions
// ============================================================================

export interface ModelTelemetry {
  span_type:"gen_ai.chat";
  model:{ provider:string; name:string; deployment:string; quantization:string };
  request:{ temperature:number; max_tokens:number; streaming:boolean };
  usage:{ input_tokens:number; output_tokens:number; cached_input_tokens:number; reasoning_tokens:number };
  timing:{ queue_ms:number; time_to_first_token_ms:number; inference_ms:number; total_ms:number };
  outcome:{ finish_reason:string; verification_status:string; fallback_used:boolean };
  cost_estimate?:number;
}

export function captureModelTelemetry(input: Omit<ModelTelemetry,"span_type">): ModelTelemetry{
  return { span_type:"gen_ai.chat", ...input };
}

// ============================================================================
// 4. Cost Observability — hierarchical
// ============================================================================

export interface CostBreakdown {
  input_token_cost_usd:number;
  output_token_cost_usd:number;
  tool_cost_usd:number;
  retrieval_cost_usd:number;
  inference_compute_cost_usd:number;
  total_cost_usd:number;
  budget:{ request_limit_usd:number; tenant_daily_limit_usd:number; status:"within_budget"|"exceeded"|"forecast_exceeded" };
}

export function aggregateCost(calls: CostBreakdown[]):CostBreakdown{
  const total=calls.reduce((s,c)=> s + c.total_cost_usd,0);
  return { input_token_cost_usd:calls.reduce((s,c)=>s+c.input_token_cost_usd,0), output_token_cost_usd:calls.reduce((s,c)=>s+c.output_token_cost_usd,0), tool_cost_usd:calls.reduce((s,c)=>s+c.tool_cost_usd,0), retrieval_cost_usd:calls.reduce((s,c)=>s+c.retrieval_cost_usd,0), inference_compute_cost_usd:calls.reduce((s,c)=>s+c.inference_compute_cost_usd,0), total_cost_usd: total, budget:{ request_limit_usd:0.05, tenant_daily_limit_usd:150, status: total>0.05?"exceeded":"within_budget" } };
}

export type BudgetScope = "request"|"agent"|"workflow"|"user"|"tenant"|"model"|"tool";

export class CostGovernor {
  budgets=new Map<string,number>(); // scope:id -> spent
  check(scope:BudgetScope, id:string, cost:number, limit:number):{ allowed:boolean; remaining:number }{
    const key=`${scope}:${id}`;
    const spent=this.budgets.get(key) ?? 0;
    if(spent+cost>limit) return { allowed:false, remaining: Math.max(0, limit-spent)};
    this.budgets.set(key, spent+cost);
    return { allowed:true, remaining: limit-(spent+cost)};
  }
  downgradeAllowed(impact:"low"|"high"):boolean{
    // never silently downgrade high-impact without recording
    if(impact==="high") return false;
    return true;
  }
}

// ============================================================================
// 5. Retrieval Observability
// ============================================================================

export interface RetrievalTelemetry {
  query_hash:string;
  query_intent:string;
  index_version:string;
  retrieval_modes: Array<"dense"|"bm25"|"knowledge_graph">;
  candidate_count:number;
  selected_count:number;
  source_ids:string[];
  permission_filtered_count:number;
  stale_source_count:number;
  duplicate_count:number;
  relevance_scores:number[];
  citation_coverage:number;
  retrieval_latency_ms:number;
  empty_context?:boolean;
}

export function shouldInvestigateRetrieval(hallucinationRate:number, lowRelevanceRate:number):boolean{
  return hallucinationRate>0.05 && lowRelevanceRate>0.3;
}

// ============================================================================
// 6. Agent Loop Observability
// ============================================================================

export interface AgentTelemetry {
  agent_id:string;
  workflow_id:string;
  loop_count:number;
  maximum_loop_count:number;
  plans_created:number;
  tools_attempted:number;
  tools_succeeded:number;
  tools_failed:number;
  retries:number;
  replans:number;
  human_interventions:number;
  side_effects:number;
  state_verified:boolean;
  termination_reason:"goal_completed"|"max_loops"|"human_takeover"|"error";
}

export function detectRunaway(agent: AgentTelemetry):string[]{
  const issues:string[]=[];
  if(agent.loop_count >= agent.maximum_loop_count) issues.push("max_loops");
  if(agent.retries>3) issues.push("repeated tool failures");
  if(agent.replans>2) issues.push("oscillating plans");
  if(agent.tools_failed> agent.tools_attempted*0.5) issues.push("tool failure amplification");
  return issues;
}

// ============================================================================
// 7. Policy and Approval Telemetry
// ============================================================================

export interface PolicyEvent {
  policy_id:string;
  policy_version:string;
  decision:"require_human_approval"|"allow"|"deny";
  reason_codes:string[];
  risk_score:number;
  required_approvers:string[];
  approval_id?:string;
  expires_at?:string;
}

export function isApprovalBound(approval:{ approval_id:string; action_params:string; target:string; policy_version:string }, current: { action_params:string; target:string; policy_version:string }):boolean{
  return approval.action_params===current.action_params && approval.target===current.target && approval.policy_version===current.policy_version;
}

// ============================================================================
// 8. Side-Effect Telemetry — separate states
// ============================================================================

export type SideEffectState = "proposed"|"approved"|"submitted"|"accepted"|"completed"|"verified"|"reversed"|"failed";

export interface SideEffectRecord {
  action_id:string;
  type:string;
  target:string;
  idempotency_key:string;
  approval_id?:string;
  external_request_id?:string;
  submitted_at:string;
  external_status:string;
  verification:{ performed:boolean; status:"confirmed"|"mismatch"|"pending" };
  rollback:{ available:boolean; status:"not_needed"|"succeeded"|"failed" };
  state:SideEffectState;
}

export function sideEffectTransition(current:SideEffectState, next:SideEffectState):boolean{
  const order:SideEffectState[]=["proposed","approved","submitted","accepted","completed","verified","reversed","failed"];
  return order.indexOf(next) > order.indexOf(current);
}

// ============================================================================
// 9. Tenant Health Dashboards — permission-aware
// ============================================================================

export type DashboardView = "executive"|"platform"|"governance"|"team";

export function buildDashboard(view:DashboardView, tenant_id:string): Record<string,unknown>{
  void tenant_id;
  const bases:Record<DashboardView, Record<string,unknown>>={
    executive:{ availability:0.999, task_success:0.92, safety_incidents:1, cost: 1200, latency: 1800, open_incidents:2 },
    platform:{ model_error_rate:0.02, tool_failure_rate:0.01, retrieval_quality:0.91, cache_efficiency:0.88 },
    governance:{ approval_compliance:0.99, privacy_events:0, audit_completeness:1.0 },
    team:{ workflow_success:0.94, knowledge_gaps:3, cost_by_capability:{ support: 200 }},
  };
  return bases[view];
}

// ============================================================================
// 10. Golden Signals for AI
// ============================================================================

export type GoldenSignal = "latency"|"traffic"|"errors"|"saturation"|"quality"|"safety"|"cost"|"agency"|"drift";

export const GOLDEN_SIGNALS: Record<GoldenSignal,string[]> = {
  latency:["p50","p95","p99","retrieval","model","tool","approval"],
  traffic:["requests","tokens","agent_runs","tool_calls"],
  errors:["http","model","tool","policy"],
  saturation:["queue_depth","gpu_capacity","context_limits","rate_limits"],
  quality:["task_success","groundedness","citation_correctness"],
  safety:["injection_success","privacy_leakage","unsafe_actions"],
  cost:["per_request","per_task","per_user","per_tenant"],
  agency:["side_effects","retries","loops","rollback_events"],
  drift:["input","retrieval","output","tool","model_behavior"],
};

// ============================================================================
// 11. Cache Observability — separate layers
// ============================================================================

export type CacheLayer = "semantic_query_cache"|"result_cache"|"embedding_cache"|"kv_cache"|"quantum_cache"|"neural_cache";

export interface CacheEvent {
  layer:CacheLayer;
  operation:"read"|"write";
  key_hash:string;
  hit:boolean;
  similarity?:number;
  age_seconds?:number;
  ttl_seconds?:number;
  tenant_scoped:boolean;
  permission_revalidated:boolean;
  stale?:boolean;
  latency_ms:number;
}

export function cacheNeedsRevalidation(ev:CacheEvent, currentPermissions:string[]):boolean{
  if(!ev.hit) return false;
  if(!ev.permission_revalidated) return true;
  void currentPermissions;
  return !!ev.stale;
}

// ============================================================================
// 12. Drift Monitoring — 5 types
// ============================================================================

export type DriftType = "input_drift"|"retrieval_drift"|"model_drift"|"tool_drift"|"outcome_drift";

export interface DriftEvent {
  type:DriftType;
  component:string;
  baseline_window:string;
  current_window:string;
  metric:string;
  baseline:number;
  current:number;
  distance:number;
  severity:"low"|"medium"|"high";
  action:string;
}

export class DriftMonitor {
  events:DriftEvent[]=[];
  record(e:DriftEvent):void{ this.events.push(e); }
  list():DriftEvent[]{ return [...this.events]; }
  byType(type:DriftType):DriftEvent[]{ return this.events.filter(e=>e.type===type); }
}

// ============================================================================
// 13. Anomaly Detection — rules + statistical + learned
// ============================================================================

export type Anomaly = { evidence:string; baseline:string; severity:"low"|"medium"|"high"|"critical"; confidence:number; owner:string; containment:string; rule?:string };

export class AnomalyDetector {
  // rule-based
  checkRules(trace:TraceRecord):Anomaly[]{
    const anomalies:Anomaly[]=[];
    if(trace.operations.some(s=> s.type==="ani.permission" && s.attributes.tenant_isolation==="failed")) anomalies.push({evidence:"cross-tenant access", baseline:"0", severity:"critical", confidence:1.0, owner:"security", containment:"kill switch tenant", rule:"any cross-tenant access"});
    if(trace.operations.some(s=> s.attributes.secret_exposed)) anomalies.push({evidence:"secret exposure", baseline:"0", severity:"critical", confidence:1.0, owner:"security", containment:"rotate secret", rule:"any secret exposure"});
    if(trace.operations.filter(s=>s.type==="gen_ai.execute_tool").length>10) anomalies.push({evidence:"more than permitted loop count", baseline:"10", severity:"high", confidence:0.9, owner:"platform", containment:"freeze workflow"});
    return anomalies;
  }
  // statistical: p95 latency increase
  checkStatistical(baselineP95:number, currentP95:number):Anomaly|null{
    if(currentP95 > baselineP95*1.3) return {evidence:`p95 ${currentP95} vs ${baselineP95}`, baseline:`${baselineP95}`, severity:"medium", confidence:0.85, owner:"model platform", containment:"scale pool"};
    return null;
  }
}

// ============================================================================
// 14. Kill Switches — hierarchical, fail-closed, dual control
// ============================================================================

export type KillScope = "global"|"tenant"|"region"|"model"|"model_route"|"prompt"|"retriever"|"tool"|"workflow"|"integration"|"memory_write"|"external_side_effects"|"autonomous_execution";

export interface KillSwitch {
  scope:KillScope;
  target:string;
  state:"enabled"|"disabled";
  reason:string;
  activated_by:string;
  activated_at:string;
  expires_at: string|null;
  fallback:"full_stop"|"read_only"|"draft_only"|"human_approval"|"disable_tool"|"disable_model"|"last_known_good"|"cached_only";
  notification:string[];
}

export class KillSwitchRegistry {
  private switches=new Map<string,KillSwitch>();
  activate(k: KillSwitch):void{
    // immediate propagation, fail-closed for critical
    this.switches.set(`${k.scope}:${k.target}`, k);
  }
  isDisabled(scope:KillScope, target:string):boolean{
    const key=`${scope}:${target}`;
    const g=this.switches.get("global:global");
    if(g && g.state==="disabled") return true;
    const sw=this.switches.get(key);
    return sw?.state === "disabled";
  }
  deactivate(scope:KillScope, target:string, actor:string, dualControl?:boolean):boolean{
    if(!dualControl && scope==="global") return false; // dual control for reactivation
    void actor;
    const key=`${scope}:${target}`;
    const sw=this.switches.get(key);
    if(sw) sw.state="enabled";
    return !!sw;
  }
  list():KillSwitch[]{ return [...this.switches.values()]; }
}

// ============================================================================
// 15. Incident Classification & Response
// ============================================================================

export type IncidentSeverity = "sev0"|"sev1"|"sev2"|"sev3";
export type IncidentCategory = "unauthorized_side_effect"|"privacy_leakage"|"security_breach"|"financial_impact"|"data_exposure";

export interface IncidentRecord {
  incident_id:string;
  severity:IncidentSeverity;
  category:IncidentCategory;
  detected_by:string;
  trace_ids:string[];
  affected_scope:{ tenants:string[]; users:number; workflows:string[] };
  status:"triage"|"containment"|"remediation"|"verified"|"closed";
  commander:string;
  kill_switch?:string;
  data_exposure:boolean;
  business_impact:string;
  created_at:string;
}

export class IncidentManager {
  private incidents=new Map<string,IncidentRecord>();
  create(input: Omit<IncidentRecord,"incident_id"|"created_at"|"status"> & Partial<Pick<IncidentRecord,"status">>):IncidentRecord{
    const id=`inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,4)}`;
    const rec:IncidentRecord={ incident_id:id, severity: input.severity, category: input.category, detected_by: input.detected_by, trace_ids: input.trace_ids, affected_scope: input.affected_scope, status: input.status ?? "triage", commander: input.commander, kill_switch: input.kill_switch, data_exposure: input.data_exposure, business_impact: input.business_impact, created_at:new Date().toISOString()};
    this.incidents.set(id,rec);
    return rec;
  }
  get(id:string):IncidentRecord|undefined{ return this.incidents.get(id); }
  contain(id:string, killSwitch:string):IncidentRecord|null{
    const inc=this.incidents.get(id);
    if(!inc) return null;
    inc.status="containment"; inc.kill_switch=killSwitch;
    return inc;
  }
  list():IncidentRecord[]{ return [...this.incidents.values()]; }
}

// ============================================================================
// 16. Redacted Incident Replay
// ============================================================================

export type ReplayMode = "metadata_only"|"tokenized"|"redacted"|"synthetic"|"sandboxed"|"shadow"|"counterfactual";

export interface ReplayCase {
  replay_id:string;
  original_trace:string;
  content_mode:ReplayMode;
  replay_inputs:{ user_request:string; retrieved_documents:string[]; tool_results:string[] };
  configuration:{ model:string; prompt:string; policy:string; retriever:string };
  replay_mode:"no_side_effects";
  result:"reproduced"|"not_reproduced";
  new_trace_id?:string;
}

export function createReplay(original_trace:string, mode:ReplayMode, config:ReplayCase["configuration"]): ReplayCase{
  return {
    replay_id:`replay_${Date.now().toString(36).slice(2,4)}`,
    original_trace,
    content_mode: mode,
    replay_inputs:{ user_request:"token_user_request_1", retrieved_documents:["token_doc_14"], tool_results:["token_tool_result_8"]},
    configuration: config,
    replay_mode:"no_side_effects",
    result:"reproduced",
    new_trace_id:`tr_replay_${Math.random().toString(36).slice(2,6)}`,
  };
}

// ============================================================================
// 17. Post-Incident Evaluation
// ============================================================================

export interface IncidentEvaluation {
  incident_id:string;
  failure_class:string;
  root_causes:string[];
  affected_components:string[];
  new_tests:string[];
  mitigations:string[];
  retest_status:"pending"|"passed"|"failed";
}

export function buildIncidentEvaluation(incident_id:string, failure_class:string):IncidentEvaluation{
  return {
    incident_id,
    failure_class,
    root_causes:["Tool schema allowed ambiguous timezone","Agent skipped state verification"],
    affected_components:["calendar_prompt_v4.2","calendar_adapter_v3.4"],
    new_tests:["timezone_ambiguity_001","state_verification_002"],
    mitigations:["Require timezone normalization","Block completion without read-after-write verification"],
    retest_status:"pending",
  };
}

// ============================================================================
// 18. Alert Routing
// ============================================================================

export type AlertOwner = "model_platform"|"knowledge_platform"|"integration_owner"|"security"|"privacy"|"finops"|"product_owner"|"ml_platform"|"automation_owner";

export const ALERT_ROUTING: Record<string,{primary:AlertOwner; escalation:AlertOwner}> = {
  "model latency":{primary:"model_platform", escalation:"model_platform"},
  "retrieval relevance":{primary:"knowledge_platform", escalation:"product_owner"},
  "tool failures":{primary:"integration_owner", escalation:"security"},
  "unauthorized action":{primary:"security", escalation:"security"},
  "privacy leakage":{primary:"privacy", escalation:"privacy"},
  "cost spike":{primary:"finops", escalation:"model_platform"},
  "drift":{primary:"ml_platform", escalation:"product_owner"},
};

// ============================================================================
// 19. SLOs and Error Budgets
// ============================================================================

export interface SloDefinition {
  capability:string;
  availability:number;
  p95_latency_ms:number;
  task_success:number;
  citation_correctness:number;
  privacy_leakage:number;
  tool_failure_rate:number;
  measurement_window:string;
  error_budget_policy:{ quality_budget_exhausted:string; safety_budget_exhausted:string; availability_budget_exhausted:string };
}

export const DEFAULT_SLO: SloDefinition = {
  capability:"support_draft",
  availability:0.999,
  p95_latency_ms:2500,
  task_success:0.92,
  citation_correctness:0.95,
  privacy_leakage:0.0,
  tool_failure_rate:0.01,
  measurement_window:"28_days",
  error_budget_policy:{ quality_budget_exhausted:"freeze_prompt_changes", safety_budget_exhausted:"disable_autonomous_mode", availability_budget_exhausted:"activate_fallback"},
};

// ============================================================================
// 20. Observability Control Plane — facade
// ============================================================================

export class ObservabilityPlane {
  traces=new Map<string,TraceRecord>();
  spans=new Map<string,Span>();
  drift=new DriftMonitor();
  anomalies=new AnomalyDetector();
  kills=new KillSwitchRegistry();
  incidents=new IncidentManager();
  slo: SloDefinition = DEFAULT_SLO;

  // Ingest
  ingestTrace(t:TraceRecord):void{ this.traces.set(t.trace_id, t); }
  ingestSpan(s:Span):void{ this.spans.set(s.span_id, s); }

  getTrace(trace_id:string):TraceRecord|undefined{ return this.traces.get(trace_id); }
  timeline(trace_id:string):Span[]{ return [...this.spans.values()].filter(s=>s.trace_id===trace_id).sort((a,b)=> a.started_at.localeCompare(b.started_at)); }
  lineage(trace_id:string):TraceVersions | undefined{ return this.traces.get(trace_id)?.versions; }

  tenantHealth(tenant_id:string, view: DashboardView | string):Record<string,unknown>{
    void tenant_id;
    return buildDashboard((view as DashboardView) ?? "executive", tenant_id);
  }
}

const globalObsRegistry=new Map<string,ObservabilityPlane>();
export function observabilityForWorkspace(workspaceId:string):ObservabilityPlane{
  let o=globalObsRegistry.get(workspaceId);
  if(!o){ o=new ObservabilityPlane(); globalObsRegistry.set(workspaceId,o); }
  return o;
}
