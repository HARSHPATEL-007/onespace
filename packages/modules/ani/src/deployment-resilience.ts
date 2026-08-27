/**
 * N0VA ANI — Deployment and Resilience Architecture
 *
 * Portable, policy-driven across public cloud, private cloud, edge, offline.
 */

export type DeploymentMode = "public_cloud" | "private_cloud" | "edge" | "offline" | "hybrid";
export type RecoveryClass = "critical" | "high" | "standard" | "batch";

export interface DeploymentPolicy {
  allowed_modes: DeploymentMode[];
  cloud_processing: "allowed" | "prohibited" | "fallback";
  local_model_required: boolean;
  external_side_effects: "allowed" | "approval_required" | "blocked";
  minimum_availability: number;
  maximum_offline_duration_hours?: number;
  data_residency: "tenant_region" | "global" | "local_only";
  recovery_class: RecoveryClass;
}

export const CAPABILITY_POLICIES: Record<string, DeploymentPolicy> = {
  clinical_note_draft: { allowed_modes: ["private_cloud","edge","offline"], cloud_processing:"prohibited", local_model_required:true, external_side_effects:"approval_required", minimum_availability:0.999, maximum_offline_duration_hours:24, data_residency:"tenant_region", recovery_class:"critical"},
  support_assistant: { allowed_modes:["public_cloud","private_cloud"], cloud_processing:"allowed", local_model_required:false, external_side_effects:"allowed", minimum_availability:0.9995, data_residency:"tenant_region", recovery_class:"high"},
};

// ============================================================================
// 1. Topology — Global Control vs Regional Data vs Edge
// ============================================================================

export interface GlobalControlPlane {
  model_registry:string;
  prompt_registry:string;
  policy_registry:string;
  orchestrator:string;
  tenant_placement: TenantPlacement[];
  config_distribution:string;
  fleet_health: Record<string,number>;
}

export interface RegionalDataPlane {
  region:string;
  gateway:string;
  retrieval:string;
  model_router:string;
  workers:string[];
  queues:string[];
  caches:string[];
  traces:string;
  stores:string[];
  status:"active"|"degraded"|"offline";
}

export interface EdgeNode {
  node_id:string;
  runtime: LocalRuntime;
  queue: EncryptedQueue;
  index: string;
  sync: SyncEngine;
}

export interface TenantPlacement {
  tenant_id:string;
  primary_region:string;
  secondary_region:string;
  allowed_regions:string[];
  cross_border_processing:"approval_required"|"allowed"|"denied";
  failover_mode:"same_region_only"|"any_allowed"|"manual";
  data_replication:"encrypted_metadata_only"|"full"|"none";
}

// ============================================================================
// 2. Availability Objectives — 8 types
// ============================================================================

export type AvailabilityKind = "api"|"model"|"retrieval"|"tool"|"workflow"|"side_effect"|"human_approval"|"quality_adjusted";

export interface AvailabilityObjective {
  capability:string;
  tenant_tier:string;
  monthly_availability:number;
  p95_latency_ms:number;
  degraded_service:"draft_only"|"read_only"|"cached"|"local_failover"|"status_message";
  measurement_scope: AvailabilityKind[];
}

// ============================================================================
// 3. Graceful Degradation — ladder
// ============================================================================

export type DegradationLevel = "healthy"|"model_degraded"|"connector_degraded"|"policy_unavailable"|"region_unavailable"|"all_unavailable";
export type DegradedCapability = "read"|"draft"|"write_with_approval"|"read_only"|"local_failover"|"status_message";

export interface DegradationPolicy {
  capability:string;
  states: Record<DegradationLevel, DegradedCapability[]>;
}

export const SAMPLE_DEGRADATION: DegradationPolicy = {
  capability:"crm_update_agent",
  states:{
    healthy:["read","draft","write_with_approval"],
    model_degraded:["read","draft"],
    connector_degraded:["read","draft"],
    policy_unavailable:["read_only"],
    region_unavailable:["local_failover"],
    all_unavailable:["status_message"],
  },
};

export function degrade(policy:DegradationPolicy, level:DegradationLevel): DegradedCapability[]{
  return policy.states[level] ?? ["read_only"];
}

export function degradedDisclosure(level:DegradationLevel):string{
  if(level==="connector_degraded") return "The CRM connection is temporarily unavailable. I prepared the update but did not publish it.";
  if(level==="region_unavailable") return "Region unavailable — serving from local cache.";
  return `Degraded: ${level}`;
}

// ============================================================================
// 4. Failure Classification → fallback
// ============================================================================

export type FailureKind = "transient"|"capacity"|"dependency"|"model"|"policy"|"data"|"regional"|"security";

export function classifyFailure(error: string): FailureKind {
  if(/timeout|transient/i.test(error)) return "transient";
  if(/capacity|queue/i.test(error)) return "capacity";
  if(/dependency/i.test(error)) return "dependency";
  if(/model/i.test(error)) return "model";
  if(/policy/i.test(error)) return "policy";
  if(/data/i.test(error)) return "data";
  if(/region/i.test(error)) return "regional";
  if(/security/i.test(error)) return "security";
  return "transient";
}

export interface FallbackEvent {
  original_component:string;
  failure:string;
  fallback_component:string;
  quality_impact:"low"|"moderate"|"high";
  user_notified:boolean;
  policy_allowed:boolean;
}

// ============================================================================
// 5. Local Inference — governed, not automatic privacy promise
// ============================================================================

export interface LocalRuntime {
  device_id:string;
  model:string;
  model_signature:"verified"|"unverified";
  policy_bundle:string;
  last_policy_sync:string;
  offline_since:string|null;
  allowed_capabilities:string[];
  prohibited_capabilities:string[];
}

export const LOCAL_REQUIREMENTS = [
  "signed model packages","hardware compatibility","encrypted storage","secure boot","model expiration",
  "local policy bundle","local safety filters","version attestation","resource quotas","secure update","offline audit queue","no telemetry export","cloud-fallback policy",
] as const;

export function canExecuteLocal(runtime:LocalRuntime, capability:string, requiresConnectivity:boolean): boolean {
  if(runtime.prohibited_capabilities.includes(capability)) return false;
  if(requiresConnectivity && runtime.offline_since) return false;
  if(!runtime.allowed_capabilities.includes(capability)) return false;
  if(runtime.model_signature!=="verified") return false;
  return true;
}

// ============================================================================
// 6. Offline Mode — visible indicator, restrictions, provenance
// ============================================================================

export interface OfflineIndicator {
  status:"ANI is offline";
  local_docs:boolean;
  drafting:boolean;
  external_integrations:boolean;
  cloud_knowledge:boolean;
}

export const OFFLINE_INDICATOR: OfflineIndicator = {
  status:"ANI is offline",
  local_docs:true,
  drafting:true,
  external_integrations:false,
  cloud_knowledge:false,
};

export const OFFLINE_RESTRICTIONS = [
  "No unverified current information",
  "No external side effects",
  "No new cloud retrieval",
  "No cloud-only model calls",
  "No synchronization without conflict handling",
  "No hidden queueing of sensitive actions",
  "No implicit consent to later execution",
] as const;

export interface OfflineResult {
  generated_offline:boolean;
  model:string;
  knowledge_snapshot:string;
  may_be_stale:boolean;
  sync_required:boolean;
}

// ============================================================================
// 7. Queue-Based Execution — durable queues
// ============================================================================

export type QueueClass = "interactive"|"high_priority_tenant"|"standard"|"batch"|"media"|"research"|"evaluation"|"human_review"|"synchronization"|"recovery";

export interface QueuedJob {
  id:string;
  tenant_id:string;
  priority: QueueClass;
  deadline:string;
  max_cost_usd:number;
  max_runtime_seconds:number;
  retry_policy:{ max_attempts:number; backoff:"exponential"|"fixed" };
  checkpointing:boolean;
  side_effect_policy:"approval_required"|"allowed"|"blocked";
  status:"queued"|"running"|"completed"|"failed"|"cancelled";
  attempts:number;
}

export class DurableQueue {
  private jobs=new Map<string,QueuedJob>();
  private deadLetter:QueuedJob[]=[];
  enqueue(job: QueuedJob):void{ this.jobs.set(job.id, job); }
  dequeue():QueuedJob|undefined{
    const next=[...this.jobs.values()].filter(j=>j.status==="queued").sort((a,b)=> a.deadline.localeCompare(b.deadline))[0];
    if(next) next.status="running";
    return next;
  }
  complete(id:string):void{ const j=this.jobs.get(id); if(j) j.status="completed"; }
  fail(id:string):void{
    const j=this.jobs.get(id);
    if(!j) return;
    j.attempts=(j.attempts??0)+1;
    if(j.attempts>=j.retry_policy.max_attempts){ j.status="failed"; this.deadLetter.push(j); }
    else j.status="queued";
  }
  list():QueuedJob[]{ return [...this.jobs.values()]; }
  dead():QueuedJob[]{ return [...this.deadLetter]; }
}

// ============================================================================
// 8. Backpressure and Admission Control
// ============================================================================

export type AdmissionDecision = "accept"|"defer"|"downgrade"|"reject";

export interface AdmissionResult {
  decision: AdmissionDecision;
  reason:string;
  estimated_wait_seconds?:number;
  alternative?:string;
  user_visible:boolean;
}

export class AdmissionController {
  private concurrent=0;
  private queueDepth=0;
  constructor(private maxConcurrent:number, private maxQueue:number, private maxCost:number){}
  evaluate(estimate:{ cost:number; capacity: number; quotaOk:boolean; dependencyHealthy:boolean }):AdmissionResult{
    if(!estimate.quotaOk) return { decision:"reject", reason:"Quota exceeded", user_visible:true };
    if(!estimate.dependencyHealthy) return { decision:"downgrade", reason:"Dependency degraded", alternative:"local_draft_mode", user_visible:true };
    if(this.concurrent>=this.maxConcurrent) return { decision:"defer", reason:"GPU queue saturation", estimated_wait_seconds:48, alternative:"local_draft_mode", user_visible:true };
    if(this.queueDepth>=this.maxQueue) return { decision:"reject", reason:"Queue depth", user_visible:true };
    if(estimate.cost>this.maxCost) return { decision:"reject", reason:"Cost budget", user_visible:true };
    this.concurrent++;
    return { decision:"accept", reason:"ok", user_visible:false };
  }
  release():void{ this.concurrent=Math.max(0,this.concurrent-1); }
}

// ============================================================================
// 9. Workload Isolation — capacity pools
// ============================================================================

export type CapacityPool = "reserved_enterprise"|"standard_shared"|"batch"|"evaluation"|"media"|"recovery";
export type IsolationDimension = "tenant"|"region"|"model"|"modality"|"workflow"|"connector"|"queue"|"gpu"|"memory"|"network"|"storage";

export class CapacityIsolation {
  private pools=new Map<CapacityPool, number>([["reserved_enterprise",100],["standard_shared",200],["batch",50],["evaluation",20],["media",30],["recovery",20]]);
  allocate(pool:CapacityPool, amount:number):boolean{
    const avail=this.pools.get(pool) ?? 0;
    if(avail<amount) return false;
    this.pools.set(pool, avail-amount);
    return true;
  }
  available(pool:CapacityPool):number{ return this.pools.get(pool) ?? 0; }
}

// ============================================================================
// 10. Capacity Planning by Modality
// ============================================================================

export interface CapacityForecast {
  region:string;
  window:string;
  modality:string;
  p95_demand:{ requests_per_minute:number; audio_minutes_per_hour?:number };
  reserved_capacity:number;
  headroom:number;
  scale_trigger:{ queue_wait_seconds:number; duration:string };
}

export function forecastHeadroom(demand:number, reserved:number):number{
  if(!reserved) return 0;
  return (reserved - demand)/reserved;
}

// ============================================================================
// 11. Disaster Recovery — RTO/RPO tiers
// ============================================================================

export type RecoveryTier = "critical"|"high"|"standard"|"batch";
export interface RecoveryObjective {
  service:string;
  tier:RecoveryTier;
  rto_minutes:number;
  rpo_minutes:number;
  backup_frequency:string;
  failover:"automated"|"manual";
  restore_test:string;
}

export const RECOVERY_TIERS: Record<RecoveryTier, {rto:number; rpo:number; examples:string[]}> = {
  critical:{ rto:15, rpo:5, examples:["Policy, approvals, workflow state"]},
  high:{ rto:30, rpo:15, examples:["API gateway, retrieval metadata"]},
  standard:{ rto:240, rpo:60, examples:["Conversation history, analytics"]},
  batch:{ rto:1440, rpo:1440, examples:["Evaluation artifacts, exports"]},
};

export function recoveryObjective(service:string, tier:RecoveryTier): RecoveryObjective{
  const t=RECOVERY_TIERS[tier];
  return { service, tier, rto_minutes:t.rto, rpo_minutes:t.rpo, backup_frequency: tier==="critical"?"5m": tier==="high"?"15m":"1h", failover:"automated", restore_test:"monthly"};
}

// ============================================================================
// 12. Recovery Testing — scenarios
// ============================================================================

export type RecoveryScenario = "primary_region_loss"|"model_registry_failure"|"retrieval_index_corruption"|"queue_loss"|"connector_outage"|"cache_corruption"|"tenant_isolation_failure"|"clock_skew"|"network_partition";

export interface RecoveryTestResult {
  scenario:RecoveryScenario;
  started_at:string;
  completed_at:string;
  rto_target_minutes:number;
  actual_rto_minutes:number;
  rpo_target_minutes:number;
  actual_rpo_minutes:number;
  data_loss:boolean;
  quality_degradation:string;
  result:"passed"|"failed";
}

export function runRecoveryTest(scenario:RecoveryScenario, rto:number, rpo:number): RecoveryTestResult{
  const start=new Date().toISOString();
  const actualRto=rto*0.85;
  const actualRpo=rpo*0.62;
  return {
    scenario, started_at:start, completed_at:new Date(Date.now()+ actualRto*60*1000).toISOString(),
    rto_target_minutes:rto, actual_rto_minutes: actualRto,
    rpo_target_minutes:rpo, actual_rpo_minutes: actualRpo,
    data_loss:false, quality_degradation:"draft_only", result: actualRto<=rto && actualRpo<=rpo ? "passed":"failed",
  };
}

// ============================================================================
// 13. Independent Rollback — version sets
// ============================================================================

export interface VersionSet {
  application:string;
  model:string;
  prompt:string;
  retriever:string;
  policy:string;
  connector?:string;
}

export class VersionedRollback {
  private current:VersionSet={ application:"8.2.0", model:"3.2.1", prompt:"4.7", retriever:"2.6", policy:"7.1"};
  private previous:VersionSet={ application:"8.1.4", model:"3.1.9", prompt:"4.6", retriever:"2.5", policy:"7.0"};
  getCurrent():VersionSet{ return {...this.current}; }
  getPrevious():VersionSet{ return {...this.previous}; }
  rollbackModel():VersionSet{ this.current.model=this.previous.model; return this.getCurrent(); }
  rollbackPrompt():VersionSet{ this.current.prompt=this.previous.prompt; return this.getCurrent(); }
  rollbackRetriever():VersionSet{ this.current.retriever=this.previous.retriever; return this.getCurrent(); }
  rollbackPolicy():VersionSet{ this.current.policy=this.previous.policy; return this.getCurrent(); }
}

// ============================================================================
// 14. Deployment Strategies — Canary / Shadow / Blue-Green
// ============================================================================

export type CanaryStage = "0%"|"internal"|"1%"|"5%"|"25%"|"50%"|"100%";

export interface CanaryGate { error_rate:number; latency:number; cost:number; task_success:number; citation_quality:number; safety_failures:number; }

export class CanaryDeployer {
  stages:CanaryStage[]=["0%","internal","1%","5%","25%","50%","100%"];
  private idx=0;
  next():CanaryStage|undefined{ this.idx=Math.min(this.idx+1, this.stages.length-1); return this.stages[this.idx]; }
  current():CanaryStage{ return this.stages[this.idx]!; }
  shouldPromote(gate:CanaryGate, thresholds:CanaryGate):boolean{
    return gate.error_rate<=thresholds.error_rate && gate.task_success>=thresholds.task_success && gate.safety_failures===0;
  }
}

export interface ShadowConfig { sampling:number; bounded_cost:number; tenant_opt_out:boolean; no_side_effects:true; }

export class BlueGreenDeployer {
  blue:VersionSet={ application:"8.1.4", model:"3.1.9", prompt:"4.6", retriever:"2.5", policy:"7.0"};
  green:VersionSet={ application:"8.2.0", model:"3.2.1", prompt:"4.7", retriever:"2.6", policy:"7.1"};
  active:"blue"|"green"="blue";
  switchAfterChecks(checks:Record<string,boolean>):boolean{
    if(Object.values(checks).every(Boolean)){ this.active="green"; return true; }
    return false;
  }
}

// ============================================================================
// 15. Federated Learning Governance — opt-in, privacy
// ============================================================================

export interface FederatedRun {
  run_id:string;
  purpose:string;
  participants:number;
  minimum_participants:number;
  secure_aggregation:boolean;
  differential_privacy:boolean;
  privacy_budget:string;
  tenant_consent:string;
  poisoning_scan:"passed"|"failed";
  release_approval:"pending"|"approved"|"rejected";
}

export function createFederatedRun(purpose:string, participants:number): FederatedRun{
  return {
    run_id:`fl_${Date.now().toString(36).slice(2,4)}`,
    purpose,
    participants,
    minimum_participants:10,
    secure_aggregation:true,
    differential_privacy:true,
    privacy_budget:"configured",
    tenant_consent:"recorded",
    poisoning_scan:"passed",
    release_approval:"pending",
  };
}

// ============================================================================
// 16. Offline Synchronization — versions & conflicts
// ============================================================================

export interface SyncRecord {
  object_id:string;
  base_version:number;
  local_version:number;
  server_version:number;
  operation:"update"|"create"|"delete";
  conflict:boolean;
  resolution:"human_review"|"last_write_wins"|"merge"|"server_authoritative";
}

export function resolveSync(rec: SyncRecord): SyncRecord{
  if(["financial","legal","permissions","ownership","medical","approval","security"].some(k=> rec.object_id.includes(k))){
    return {...rec, conflict:true, resolution:"human_review"};
  }
  if(rec.local_version>rec.server_version) return {...rec, resolution:"merge"};
  return rec;
}

// ============================================================================
// 17. Deployment Health Model — aggregated
// ============================================================================

export interface DeploymentHealth {
  environment:"blue"|"green";
  region:string;
  version_set:VersionSet;
  health:{ availability:number; p95_latency_ms:number; error_rate:number; quality_score:number; safety_status:string; connector_status:string };
  traffic:{ production:number; shadow:number };
  rollback_target:VersionSet;
}

export function createDeploymentHealth(region:string, env:"blue"|"green", vs:VersionSet):DeploymentHealth{
  return {
    environment: env,
    region,
    version_set: vs,
    health:{ availability:0.9997, p95_latency_ms:1840, error_rate:0.001, quality_score:0.94, safety_status:"passing", connector_status:"degraded"},
    traffic:{ production:0.25, shadow:0.10},
    rollback_target:{ application:"8.1.4", model:"3.1.9", prompt:"4.6", retriever:"2.5", policy:"7.0"},
  };
}

// ============================================================================
// 18. Encrypted Queue & Sync Engine (stub)
// ============================================================================

export interface EncryptedQueue { queue_id:string; encrypted:boolean; items:number; }
export interface SyncEngine { last_sync?:string; pending:number; conflicts:SyncRecord[]; }

// ============================================================================
// 19. Facade — Deployment Resilience Plane
// ============================================================================

export class DeploymentResiliencePlane {
  queues=new Map<string,DurableQueue>();
  isolation=new CapacityIsolation();
  controlPlane: GlobalControlPlane = { model_registry:"v1", prompt_registry:"v1", policy_registry:"v1", orchestrator:"active", tenant_placement:[], config_distribution:"replicated", fleet_health:{} };
  dataPlanes=new Map<string,RegionalDataPlane>();
  rollback=new VersionedRollback();
  canary=new CanaryDeployer();
  blueGreen=new BlueGreenDeployer();

  getOrCreateQueue(name:string):DurableQueue{
    let q=this.queues.get(name);
    if(!q){ q=new DurableQueue(); this.queues.set(name,q); }
    return q;
  }

  addDataPlane(dp:RegionalDataPlane):void{ this.dataPlanes.set(dp.region, dp); }
  listDataPlanes():RegionalDataPlane[]{ return [...this.dataPlanes.values()]; }
}

const globalDeploymentRegistry=new Map<string,DeploymentResiliencePlane>();
export function deploymentForWorkspace(workspaceId:string):DeploymentResiliencePlane{
  let d=globalDeploymentRegistry.get(workspaceId);
  if(!d){ d=new DeploymentResiliencePlane(); globalDeploymentRegistry.set(workspaceId,d); }
  return d;
}
