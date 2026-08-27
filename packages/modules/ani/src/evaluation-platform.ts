/**
 * N0VA ANI — Continuous Evaluation Platform
 *
 * Evaluates entire system — retrieval, generation, agents, tools, safety,
 * operations, user outcomes, business impact — with reproducible lineage.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Registries — immutable versioned objects
// ============================================================================

export type RiskTier = "low" | "medium" | "high" | "critical";

export interface EvaluationContract {
  capability: string;
  intended_use: string;
  out_of_scope: string[];
  success_definition: { primary: string; secondary: string[] };
  risk_tier: RiskTier;
  required_evaluators: string[];
  release_gates: { minimum_task_success?: number; maximum_unsupported_claim_rate?: number; maximum_privacy_leakage_rate?: number; maximum_tool_error_rate?: number };
  intended_users?: string[];
  allowed_actions?: string[];
  prohibited_actions?: string[];
  ground_truth_source?: string;
  languages?: string[];
  expected_latency_ms?: number;
  expected_cost_usd?: number;
  max_acceptable_risk?: string;
  rollback_procedure?: string;
}

export interface DatasetCase {
  case_id: string;
  input: string;
  expected_behavior: string;
  ground_truth: unknown | null;
  acceptable_outputs: string[];
  prohibited_outputs: string[];
  severity: "low" | "medium" | "high" | "critical";
  labels: string[];
  owner: string;
  last_reviewed: string;
}

export interface GoldenDataset {
  dataset_id: string;
  tenant_id: string;
  domain: string;
  version: string;
  purpose: string;
  cases: DatasetCase[];
  languages: string[];
  labels: { ground_truth: string; privacy_review: string; bias_review: string };
  splits: { development: number; validation: number; test: number; challenge: number };
  provenance: { created_from: string[] };
  access: string;
  created_at: string;
}

export interface MetricDef {
  metric_id: string;
  name: string;
  definition: string;
  unit: string;
  direction: "higher_is_better" | "lower_is_better";
  evaluator: string;
  human_reference: boolean;
  confidence_interval: string;
  minimum_sample_size: number;
  owner: string;
  version: string;
  formula?: string;
  sampling_method?: string;
  aggregation?: string;
}

export interface JudgeEntry { judge_id: string; type: "model" | "human" | "rule"; version: string; }

export class EvaluationRegistry {
  contracts=new Map<string,EvaluationContract>();
  datasets=new Map<string,GoldenDataset[]>(); // id -> versions
  metrics=new Map<string,MetricDef>();
  judges=new Map<string,JudgeEntry>();
  models=new Map<string,{ version:string; hash:string }>();
  prompts=new Map<string,{ version:string; content:string }>();
  tools=new Map<string,{ version:string }>();
  policies=new Map<string,{ version:string }>();

  putContract(c:EvaluationContract):void{ this.contracts.set(c.capability,c); }
  getContract(cap:string):EvaluationContract|undefined{ return this.contracts.get(cap); }

  putDataset(ds:GoldenDataset):void{
    const list=this.datasets.get(ds.dataset_id) ?? [];
    list.push(ds);
    this.datasets.set(ds.dataset_id, list);
  }
  getDataset(id:string, version?:string):GoldenDataset|undefined{
    const list=this.datasets.get(id) ?? [];
    if (!list.length) return undefined;
    if (version) return list.find(d=>d.version===version);
    return list.sort((a,b)=> a.version.localeCompare(b.version)).at(-1);
  }
  listDatasets():GoldenDataset[]{ return [...this.datasets.values()].flat(); }

  putMetric(m:MetricDef):void{ this.metrics.set(m.metric_id,m); }
  getMetric(id:string):MetricDef|undefined{ return this.metrics.get(id); }
  listMetrics():MetricDef[]{ return [...this.metrics.values()]; }

  putJudge(j:JudgeEntry):void{ this.judges.set(j.judge_id,j); }
  putModel(id:string, version:string):void{ this.models.set(`${id}@${version}`, {version, hash: createHash("sha256").update(`${id}:${version}`).digest("hex").slice(0,8)}); }
  putPrompt(id:string, version:string, content:string):void{ this.prompts.set(`${id}@${version}`, {version, content}); }
  putTool(id:string, version:string):void{ this.tools.set(`${id}@${version}`, {version}); }
  putPolicy(id:string, version:string):void{ this.policies.set(`${id}@${version}`, {version}); }
}

// ============================================================================
// 2. Evaluation Run — reproducible lineage
// ============================================================================

export interface EvaluationRunRef {
  run_id: string;
  dataset_version: string;
  model_version: string;
  prompt_version: string;
  retrieval_config: string;
  tool_versions: Record<string,string>;
  safety_policies: string;
  evaluator_versions: Record<string,string>;
  runtime_env: string;
  random_seed: number;
  timestamp: string;
  lineage_hash: string;
}

export function createRunRef(input: Omit<EvaluationRunRef,"run_id"|"lineage_hash"|"timestamp"> & Partial<Pick<EvaluationRunRef,"timestamp">>): EvaluationRunRef{
  const ts=input.timestamp ?? new Date().toISOString();
  const payload=`${input.dataset_version}|${input.model_version}|${input.prompt_version}|${input.retrieval_config}|${JSON.stringify(input.tool_versions)}|${input.safety_policies}|${JSON.stringify(input.evaluator_versions)}|${input.runtime_env}|${input.random_seed}|${ts}`;
  const hash=createHash("sha256").update(payload).digest("hex");
  return { run_id:`run_${hash.slice(0,8)}`, dataset_version:input.dataset_version, model_version:input.model_version, prompt_version:input.prompt_version, retrieval_config:input.retrieval_config, tool_versions:input.tool_versions, safety_policies:input.safety_policies, evaluator_versions:input.evaluator_versions, runtime_env:input.runtime_env, random_seed:input.random_seed, timestamp:ts, lineage_hash:hash };
}

// ============================================================================
// 3. Retrieval Evaluation — separate from generation
// ============================================================================

export interface RetrievalResult { query_id:string; expected_sources:string[]; retrieved_sources:string[]; recall_at_5:number; precision_at_5:number; permission_violations:number; stale_sources:number; latency_ms:number; mrr?:number; ndcg?:number; }

export function scoreRetrieval(expected:string[], retrieved:string[], k=5):{ recall:number; precision:number }{
  const retK=retrieved.slice(0,k);
  const hit=retK.filter(r=> expected.includes(r)).length;
  const recall= expected.length? hit/expected.length : 1;
  const precision= retK.length? hit/retK.length : 1;
  return { recall, precision };
}

export type RetrievalFailureKind = "query_interpretation"|"entity_resolution"|"index_freshness"|"embedding"|"reranker"|"permission_filter"|"missing_source"|"wrong_authority"|"context_truncation"|"cross_doc_synthesis";

export function categorizeRetrievalFailure(expected:string[], retrieved:string[]): RetrievalFailureKind{
  if (retrieved.length===0) return "missing_source";
  if (!expected.some(e=> retrieved.includes(e))) return "wrong_authority";
  return "reranker";
}

// ============================================================================
// 4. Citation Evaluation — beyond existence
// ============================================================================

export interface CitationQuality { citation_presence:number; entailment:number; authority:number; freshness:number; location_accuracy:number; }
export function citationQualityScore(c: CitationQuality): number {
  return c.citation_presence * c.entailment * c.authority * c.freshness * c.location_accuracy;
}

// ============================================================================
// 5. Generation Quality — automated + human
// ============================================================================

export function normalizedEditDistance(changedTokens:number, refTokens:number):number{
  if (!refTokens) return changedTokens?1:0;
  return changedTokens / refTokens;
}

// ============================================================================
// 6. Agent and Tool Evaluation — trajectory
// ============================================================================

export interface AgentEvaluation {
  task_id:string;
  goal:string;
  expected_tools:string[];
  actual_tools:string[];
  tool_argument_accuracy:number;
  authorization_correct:boolean;
  steps:number;
  unnecessary_steps:number;
  side_effects:number;
  rollback_available:boolean;
  final_state_verified:boolean;
  task_success:boolean;
}

export function scoreAgent(ev: AgentEvaluation): { task_success:boolean; tool_accuracy:number; safe:boolean }{
  const toolAccuracy = ev.expected_tools.every(t=> ev.actual_tools.includes(t)) ? 1 : 0.5;
  const safe = ev.authorization_correct && ev.rollback_available;
  return { task_success: ev.task_success && safe, tool_accuracy: toolAccuracy, safe };
}

// ============================================================================
// 7. Safety Evaluation — continuously expanding suite
// ============================================================================

export type SafetyCategory =
  | "hallucination"|"unsupported_certainty"|"unsafe_advice"|"incorrect_refusal"|"over_refusal"
  | "bias"|"toxicity"|"harassment"|"privacy_leakage"|"secret_exposure"|"cross_tenant_leakage"
  | "prompt_injection"|"indirect_prompt_injection"|"tool_abuse"|"excessive_agency"|"privilege_escalation"
  | "data_exfiltration"|"unsafe_code"|"insecure_output"|"memory_poisoning"|"retrieval_manipulation"|"model_extraction";

export interface SafetyCase {
  case_id:string;
  category:SafetyCategory;
  attack:string;
  expected_behavior:string;
  actual_behavior:string;
  passed:boolean;
  severity:"low"|"medium"|"high"|"critical";
  tools_called:string[];
  data_exposed:boolean;
  reproducible:boolean;
}

export class SafetySuite {
  private cases: SafetyCase[]=[];
  add(c:SafetyCase):void{ this.cases.push(c); }
  list():SafetyCase[]{ return [...this.cases]; }
  passRate():number{ if(!this.cases.length) return 1; return this.cases.filter(c=>c.passed).length/this.cases.length; }
  criticalFail():SafetyCase|undefined{ return this.cases.find(c=>!c.passed && c.severity==="critical"); }
}

// ============================================================================
// 8. Red-Team Campaigns — versioned, tied to mitigations
// ============================================================================

export interface RedTeamCampaign {
  campaign_id:string;
  threat_model:string;
  assets:string[];
  trust_boundaries:string[];
  attack_families:string[];
  test_corpus:string[];
  attack_generators:string[];
  tool_permissions:string[];
  expected_controls:string[];
  findings: Array<{ severity:string; remediation:string; retest?:string; closure?:string }>;
  status:"open"|"remediated"|"closed";
  version:string;
}

export class RedTeamRegistry {
  private campaigns=new Map<string,RedTeamCampaign>();
  create(c:Omit<RedTeamCampaign,"campaign_id"|"status"|"findings"> & Partial<Pick<RedTeamCampaign,"findings"|"status">>):RedTeamCampaign{
    const camp:RedTeamCampaign={ campaign_id:`camp_${Date.now().toString(36).slice(2,4)}`, threat_model:c.threat_model, assets:c.assets, trust_boundaries:c.trust_boundaries, attack_families:c.attack_families, test_corpus:c.test_corpus, attack_generators:c.attack_generators, tool_permissions:c.tool_permissions, expected_controls:c.expected_controls, findings: c.findings ?? [], status: c.status ?? "open", version: c.version ?? "1.0.0" };
    this.campaigns.set(camp.campaign_id, camp);
    return camp;
  }
  get(id:string):RedTeamCampaign|undefined{ return this.campaigns.get(id); }
  run(id:string):{ passed:boolean; findings:number }{
    const c=this.campaigns.get(id);
    if(!c) return { passed:false, findings:0 };
    // adaptive attacks: observe failures and variant — stub
    return { passed: c.findings.length===0, findings: c.findings.length };
  }
  list():RedTeamCampaign[]{ return [...this.campaigns.values()]; }
}

// ============================================================================
// 9. Regression Testing — production failures → regression cases
// ============================================================================

export interface RegressionCase extends DatasetCase {
  origin: "production_incident"|"safety_incident"|"broken_citation"|"wrong_tool_args"|"permission_failure";
  regression_for:string; // version that failed
}

export class RegressionSuite {
  private cases:RegressionCase[]=[];
  addFromFailure(failure:{ input:string; expected:string; origin:RegressionCase["origin"]; version:string }):RegressionCase{
    const c:RegressionCase={
      case_id:`reg_${Date.now().toString(36).slice(2,4)}`,
      input: failure.input,
      expected_behavior: failure.expected,
      ground_truth: failure.expected,
      acceptable_outputs:[failure.expected],
      prohibited_outputs:[],
      severity:"high",
      labels:["regression"],
      owner:"assurance",
      last_reviewed: new Date().toISOString(),
      origin: failure.origin,
      regression_for: failure.version,
    };
    this.cases.push(c);
    return c;
  }
  list():RegressionCase[]{ return [...this.cases]; }
  gate(candidateVersion:string, results: Map<string,boolean>):{ passed:boolean; failed:string[] }{
    const failed:string[]=[];
    for(const c of this.cases){ const ok=results.get(c.case_id); if(ok===false) failed.push(c.case_id); }
    void candidateVersion;
    return { passed: failed.length===0, failed };
  }
}

// ============================================================================
// 10. Long-Context Evaluation — length-stratified
// ============================================================================

export interface LongContextCase {
  tokens:number;
  needle_position:"early"|"middle"|"late";
  distractor_ratio:number;
  expected_fact:string;
  retrieval_recall:number;
  answer_correct:boolean;
  citation_correct:boolean;
  latency_ms:number;
  cost_usd:number;
}

export function longContextScore(cases: LongContextCase[]):{ avg_recall:number; by_position: Record<string,number> }{
  const avg_recall=cases.length? cases.reduce((s,c)=>s+c.retrieval_recall,0)/cases.length : 0;
  const by_position:Record<string,number>={};
  for(const pos of ["early","middle","late"] as const){ const subset=cases.filter(c=>c.needle_position===pos); by_position[pos]= subset.length? subset.reduce((s,c)=>s+(c.answer_correct?1:0),0)/subset.length : 0; }
  return { avg_recall, by_position };
}

// ============================================================================
// 11. Multilingual & Business Outcome (aggregated)
// ============================================================================

export interface MultilingualResult { language:string; task_success:number; citation_correct:number; }
export function aggregateMultilingual(results:MultilingualResult[]):{ global:number; perLanguage: Record<string,number> }{
  const global=results.length? results.reduce((s,r)=>s+r.task_success,0)/results.length : 0;
  const perLanguage=Object.fromEntries(results.map(r=>[r.language, r.task_success]));
  return { global, perLanguage };
}

export interface BusinessOutcome {
  capability:string;
  baseline:{ median_resolution_time_minutes:number; first_contact_resolution:number };
  treatment:{ median_resolution_time_minutes:number; first_contact_resolution:number };
  quality_constraints:{ privacy_incidents:number; escalation_accuracy:number; customer_complaint_rate:string };
  sample_size:number;
  experiment:string;
}

export function businessDelta(b:BusinessOutcome):{ time_saved:number; fcr_delta:number; safe:boolean }{
  const time_saved=b.baseline.median_resolution_time_minutes - b.treatment.median_resolution_time_minutes;
  const fcr_delta=b.treatment.first_contact_resolution - b.baseline.first_contact_resolution;
  const safe=b.quality_constraints.privacy_incidents===0;
  return { time_saved, fcr_delta, safe };
}

// ============================================================================
// 12. Human Feedback Loop — structured, trace-linked
// ============================================================================

export interface FeedbackRecord {
  feedback_id:string;
  trace_id:string;
  user_id:string;
  rating:"correct"|"incorrect"|"missing_info"|"wrong_citation";
  labels:string[];
  edited_output?:string;
  free_text?:string;
  impact:"low"|"medium"|"high";
  ground_truth_added:boolean;
  review_status:"pending"|"expert_confirmed"|"rejected";
}

export class FeedbackStore {
  private items:FeedbackRecord[]=[];
  add(f:Omit<FeedbackRecord,"feedback_id"|"review_status"> & Partial<Pick<FeedbackRecord,"review_status">>):FeedbackRecord{
    const rec:FeedbackRecord={ feedback_id:`fb_${Date.now().toString(36).slice(2,4)}`, trace_id:f.trace_id, user_id:f.user_id, rating:f.rating, labels:f.labels, edited_output:f.edited_output, free_text:f.free_text, impact:f.impact, ground_truth_added:f.ground_truth_added ?? false, review_status: f.review_status ?? "pending" };
    this.items.push(rec);
    return rec;
  }
  list():FeedbackRecord[]{ return [...this.items]; }
  pendingExpert():FeedbackRecord[]{ return this.items.filter(f=> f.review_status==="pending" && f.impact==="high"); }
}

// ============================================================================
// 13. Trace Schema — privacy-aware, role-controlled
// ============================================================================

export interface TraceRecord {
  trace_id:string;
  tenant_id:string;
  user_id:string;
  session_id:string;
  capability:string;
  model_version:string;
  prompt_version:string;
  policy_version:string;
  retrieval:{ index_version:string; query:string; source_ids:string[]; reranker_version:string };
  tools: Array<{ name:string; version:string; arguments_hash:string; result_status:string }>;
  output:{ claim_ids:string[]; citation_ids:string[]; abstention:boolean };
  metrics:{ latency_ms:number; input_tokens:number; output_tokens:number; cost_usd:number };
  privacy:{ content_retention:string; redaction_applied:boolean; training_use:boolean };
  created_at:string;
}

export class TraceStore {
  private traces:TraceRecord[]=[];
  add(t:TraceRecord):void{ this.traces.push(t); }
  get(id:string):TraceRecord|undefined{ return this.traces.find(x=>x.trace_id===id); }
  list():TraceRecord[]{ return [...this.traces]; }
  convertToRegression(trace_id:string):DatasetCase| null{
    const t=this.get(trace_id);
    if(!t) return null;
    return { case_id:`case_${trace_id}`, input: t.retrieval.query, expected_behavior:"should not leak cross-tenant", ground_truth:null, acceptable_outputs:[], prohibited_outputs:[], severity:"critical", labels:["trace"], owner:"assurance", last_reviewed:new Date().toISOString() };
  }
}

// ============================================================================
// 14. Online Experiments — guarded
// ============================================================================

export interface ExperimentDef {
  experiment_id:string;
  hypothesis:string;
  control:{ prompt_version:string };
  treatment:{ prompt_version:string };
  allocation:{ method:"randomized"; percentage:number; eligible_tenants:string[] };
  guardrails:{ max_error_rate_increase:number; privacy_leakage:number; max_latency_increase:number; minimum_sample_size:number };
  stop_rules:string[];
  status:"draft"|"running"|"stopped"|"completed";
}

export class ExperimentManager {
  private exps=new Map<string,ExperimentDef>();
  create(e: Omit<ExperimentDef,"experiment_id"|"status"> & Partial<Pick<ExperimentDef,"experiment_id">>):ExperimentDef{
    const exp:ExperimentDef={ experiment_id: e.experiment_id ?? `exp_${Date.now().toString(36).slice(2,4)}`, hypothesis:e.hypothesis, control:e.control, treatment:e.treatment, allocation:e.allocation, guardrails:e.guardrails, stop_rules:e.stop_rules, status:"draft" };
    this.exps.set(exp.experiment_id, exp);
    return exp;
  }
  start(id:string):ExperimentDef|null{ const e=this.exps.get(id); if(e) e.status="running"; return e ?? null; }
  stop(id:string, reason:string):ExperimentDef|null{ const e=this.exps.get(id); if(e){ e.status="stopped"; (e as unknown as Record<string,unknown>).stop_reason=reason; } return e ?? null; }
  get(id:string):ExperimentDef|undefined{ return this.exps.get(id); }
  list():ExperimentDef[]{ return [...this.exps.values()]; }
  checkGuardrails(id:string, metrics:{ error_rate:number; privacy_leakage:number; latency_increase:number }):{ violated:string[] }{
    const e=this.exps.get(id); if(!e) return { violated:["not found"] };
    const v:string[]=[];
    if (metrics.error_rate > e.guardrails.max_error_rate_increase) v.push("error_rate");
    if (metrics.privacy_leakage > e.guardrails.privacy_leakage) v.push("privacy_leakage");
    if (metrics.latency_increase > e.guardrails.max_latency_increase) v.push("latency");
    return { violated:v };
  }
}

// ============================================================================
// 15. SLO and Release Gates — statistical + hard gates
// ============================================================================

export type SloArea = "quality"|"retrieval"|"agents"|"safety"|"reliability"|"performance"|"cost"|"capacity"|"user_value"|"business"|"governance";

export interface SloEntry { area:SloArea; metric:string; target:number; current:number; meets:boolean }

export class SloMonitor {
  private entries:SloEntry[]=[];
  set(area:SloArea, metric:string, target:number, current:number):void{
    const meets= metric.includes("latency") || metric.includes("cost") || metric.includes("error") ? current <= target : current >= target;
    const idx=this.entries.findIndex(e=>e.area===area && e.metric===metric);
    if(idx>=0) this.entries[idx]={area, metric, target, current, meets};
    else this.entries.push({area, metric, target, current, meets});
  }
  status():{ meets:number; total:number; failing:SloEntry[] }{ const failing=this.entries.filter(e=>!e.meets); return { meets: this.entries.length - failing.length, total: this.entries.length, failing }; }
  list():SloEntry[]{ return [...this.entries]; }
}

export interface ReleaseGate {
  candidate:{ model:string; prompt:string; retriever:string };
  hard_failures:string[];
  minimums: Record<string,number>;
  maximums: Record<string,number>;
  comparison:{ allowed_task_success_drop:number; allowed_safety_metric_drop:number };
  decision:"pass"|"blocked";
}

export function evaluateGate(gate: ReleaseGate, metrics: Record<string,number>, baseline: Record<string,number>):{ pass:boolean; reasons:string[] }{
  const reasons:string[]=[];
  for(const rule of gate.hard_failures){
    const m=rule.match(/(.+)\s*>\s*(.+)/);
    if(m){ const key=m[1]!.trim(); const val=parseFloat(m[2]!.trim()); if((metrics[key] ?? 0) > val) reasons.push(`hard failure ${rule}`); }
  }
  for(const [k,min] of Object.entries(gate.minimums)){ if((metrics[k] ?? 0) < min) reasons.push(`${k} ${(metrics[k]??0).toFixed(3)} < min ${min}`); }
  for(const [k,max] of Object.entries(gate.maximums)){ if((metrics[k] ?? Infinity) > max) reasons.push(`${k} ${(metrics[k]??Infinity).toFixed(3)} > max ${max}`); }
  const taskDrop=(baseline.task_success ?? 0) - (metrics.task_success ?? 0);
  if (taskDrop > gate.comparison.allowed_task_success_drop) reasons.push(`task_success drop ${taskDrop.toFixed(3)}`);
  return { pass: reasons.length===0, reasons };
}

// ============================================================================
// 16. Automatic Rollback — freeze + restore
// ============================================================================

export type RollbackTrigger = "cross_tenant_leakage"|"privacy_exposure"|"unauthorized_external_action"|"critical_injection"|"unsafe_recommendation"|"tool_abuse"|"corrupted_policy"|"permission_filter_broken"|"task_success_degradation"|"citation_regression"|"hallucination_increase"|"latency_breach"|"forecast_coverage_failure";

export interface RollbackPlan {
  monitor:string;
  freezeRollout():void;
  disableCandidate():void;
  restoreLastKnownGood():string;
  invalidateCaches():void;
  revokeWorkflows():void;
  notifyOwners():void;
  preserveTrace():string;
  openIncident():string;
}

export class RollbackController {
  private lastGood:string="bundle_v1";
  private current:string="bundle_v1";
  setCurrent(bundle:string):void{ this.current=bundle; }
  setLastGood(bundle:string):void{ this.lastGood=bundle; }
  shouldRollbackImmediate(trigger:RollbackTrigger):boolean{
    return ["cross_tenant_leakage","privacy_exposure","unauthorized_external_action","critical_injection","unsafe_recommendation","tool_abuse","corrupted_policy","permission_filter_broken"].includes(trigger);
  }
  shouldRollbackStatistical(metrics: Record<string,number>, thresholds: Record<string,number>):string[]{
    const out:string[]=[];
    for(const [k,th] of Object.entries(thresholds)){ if((metrics[k] ?? 0) > th) out.push(k); }
    return out;
  }
  rollback():{ restored:string; previous:string; incident:string }{
    const previous=this.current;
    this.current=this.lastGood;
    return { restored:this.lastGood, previous, incident:`inc_${Date.now().toString(36)}` };
  }
}

// ============================================================================
// 17. Evaluation Control Plane — facade
// ============================================================================

export class EvaluationPlatform {
  registry=new EvaluationRegistry();
  traces=new TraceStore();
  feedback=new FeedbackStore();
  safety=new SafetySuite();
  redteam=new RedTeamRegistry();
  regression=new RegressionSuite();
  experiments=new ExperimentManager();
  slo=new SloMonitor();
  rollback=new RollbackController();

  // Lifecycle helper: create lineage run
  createRun(params: Parameters<typeof createRunRef>[0]):EvaluationRunRef{
    return createRunRef(params);
  }

  // Convert failure to regression
  promoteFailure(trace_id:string, origin: RegressionCase["origin"], version:string):RegressionCase| null{
    const c=this.traces.convertToRegression(trace_id);
    if(!c) return null;
    return this.regression.addFromFailure({ input: c.input, expected: c.expected_behavior, origin, version });
  }
}

const globalEvalRegistry=new Map<string,EvaluationPlatform>();
export function evaluationForWorkspace(workspaceId:string):EvaluationPlatform{
  let p=globalEvalRegistry.get(workspaceId);
  if(!p){ p=new EvaluationPlatform(); globalEvalRegistry.set(workspaceId,p); }
  return p;
}
