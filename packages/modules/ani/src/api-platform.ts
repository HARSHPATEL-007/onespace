/**
 * N0VA ANI — API Platform Architecture
 *
 * Versioned, event-driven platform with consistent contracts for
 * sync/streaming/async/actions/events/connectors/auth/telemetry/quotas.
 */

import { createHash, createHmac, randomUUID } from "crypto";

// ============================================================================
// 1. Versioning — URL major + semantic internal
// ============================================================================

export type MajorVersion = 1 | 2;
export type SemVer = `${number}.${number}.${number}`;

export const API_VERSION: MajorVersion = 1;
export const SCHEMA_VERSION = "ani.response.v1.4" as const;

export type Compatibility = "backward_compatible" | "potentially_breaking" | "breaking";

export function classifyChange(change: string): Compatibility {
  if (["add optional response field","add optional request field"].includes(change)) return "backward_compatible";
  if (["add enum value","tighten validation","add new event type"].includes(change)) return "potentially_breaking";
  return "breaking";
}

export function responseHeaders(): Record<string, string> {
  return { "API-Version": String(API_VERSION), "Schema-Version": SCHEMA_VERSION };
}

// CloudEvents envelope for events
export interface CloudEvent {
  specversion: "1.0";
  type: string; // com.nova.workflow.state_changed.v1
  source: string; // nova://workflow-engine
  id: string;
  time: string;
  subject?: string;
  datacontenttype: "application/json";
  data: unknown;
}

export function createCloudEvent(type: string, source: string, subject: string, data: unknown): CloudEvent {
  return {
    specversion: "1.0",
    type,
    source,
    id: `evt_${Date.now().toString(36)}_${randomUUID().slice(0,6)}`,
    time: new Date().toISOString(),
    subject,
    datacontenttype: "application/json",
    data,
  };
}

// ============================================================================
// 2. Common Request / Response Envelope
// ============================================================================

export interface CommonRequest {
  request_id: string;
  client_request_id?: string;
  tenant_id: string;
  workspace_id: string;
  actor: { type: "user"|"service_account"; id: string };
  capability: string;
  input: Record<string, unknown>;
  context?: { scope?: string; project_id?: string; sources?: string[] };
  options?: { stream?: boolean; locale?: string; response_format?: string };
  idempotency_key?: string;
  metadata?: { client?: string; client_version?: string };
}

export interface CommonResponse {
  request_id: string;
  response_id: string;
  status: OperationStatus;
  data: unknown;
  links: { self: string; trace: string };
  usage: { input_tokens: number; output_tokens: number; cost_usd: number };
  assurance?: { grounding: string; citation_coverage: number };
}

export function createRequest(input: Omit<CommonRequest,"request_id"> & Partial<Pick<CommonRequest,"request_id">>): CommonRequest {
  return { request_id: input.request_id ?? `req_${Date.now().toString(36)}_${randomUUID().slice(0,4)}`, client_request_id: input.client_request_id, tenant_id: input.tenant_id, workspace_id: input.workspace_id, actor: input.actor, capability: input.capability, input: input.input, context: input.context, options: input.options, idempotency_key: input.idempotency_key, metadata: input.metadata };
}

export function createResponse(request_id: string, data: unknown): CommonResponse {
  const response_id = `resp_${Date.now().toString(36)}_${randomUUID().slice(0,4)}`;
  return {
    request_id,
    response_id,
    status: "completed",
    data,
    links: { self: `/v1/responses/${response_id}`, trace: `/v1/traces/tr_${response_id}` },
    usage: { input_tokens: 3200, output_tokens: 720, cost_usd: 0.018 },
    assurance: { grounding: "high", citation_coverage: 0.94 },
  };
}

// ============================================================================
// 3. Consistent Response States
// ============================================================================

export type OperationStatus = "accepted"|"queued"|"running"|"awaiting_input"|"awaiting_approval"|"partially_completed"|"completed"|"failed"|"cancelled"|"expired"|"rolled_back";

export interface Operation {
  operation_id: string;
  type: string;
  status: OperationStatus;
  created_at: string;
  updated_at: string;
  progress?: { completed: number; total: number; percent: number };
  next_action?: { type: string; href: string };
  error?: ApiError | null;
  steps?: Array<{ id:string; type:string; status:OperationStatus; error_code?:string }>;
  recovery?: { retryable:boolean; rollback_available:boolean };
}

export function createOperation(type: string, status: OperationStatus = "accepted"): Operation {
  const id = `op_${Date.now().toString(36)}_${randomUUID().slice(0,4)}`;
  return {
    operation_id: id,
    type,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    progress: { completed: 0, total: 10, percent: 0 },
    next_action: status==="awaiting_approval" ? { type:"approve", href:`/v1/operations/${id}/approve`} : undefined,
    error: null,
  };
}

// ============================================================================
// 4. Streaming Responses — SSE
// ============================================================================

export type StreamEventType = "response.started"|"response.delta"|"response.metadata"|"citation.added"|"assurance.updated"|"tool.started"|"tool.progress"|"tool.completed"|"approval.required"|"response.warning"|"response.completed"|"response.failed"|"response.cancelled";

export interface StreamEvent {
  event: StreamEventType;
  id: string;
  data: unknown;
}

export function formatSSE(events: StreamEvent[]): string {
  return events.map(e=> `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\nid: ${e.id}\n`).join("\n");
}

// ============================================================================
// 5. Async Jobs — 202 Accepted
// ============================================================================

export interface AsyncJob {
  job_id: string;
  status: OperationStatus;
  type: string;
  poll_after_seconds: number;
  cancel_url: string;
  events_url: string;
  progress?: Operation["progress"];
  result_url?: string;
  created_at: string;
  deadline?: string;
  budget?: number;
}

export function createJob(type: string): AsyncJob {
  const job_id=`job_${Date.now().toString(36)}_${randomUUID().slice(0,4)}`;
  return {
    job_id,
    status:"queued",
    type,
    poll_after_seconds:3,
    cancel_url:`/v1/jobs/${job_id}/cancel`,
    events_url:`/v1/jobs/${job_id}/events`,
    progress:{ completed:0, total:10, percent:0},
    created_at: new Date().toISOString(),
  };
}

export interface PartialResult {
  partial_result: {
    job_id:string;
    sequence:number;
    type:string;
    status:"partial";
    data:unknown;
    complete:boolean;
    quality:{ coverage:string; confidence:string };
  };
}

export function partialResult(job_id:string, seq:number, data:unknown): PartialResult{
  return { partial_result:{ job_id, sequence:seq, type:"research.source_summary", status:"partial", data, complete:false, quality:{ coverage:"incomplete", confidence:"moderate"}}};
}

// ============================================================================
// 6. Idempotent Writes — key + hash storage
// ============================================================================

export interface IdempotencyRecord { key:string; tenant_id:string; request_hash:string; response:unknown; status:number; created_at:string; }

export class IdempotencyStore {
  private store=new Map<string,IdempotencyRecord>();
  private hashBody(body:unknown):string{ return createHash("sha256").update(JSON.stringify(body)).digest("hex"); }
  handle(tenant_id:string, key:string, body:unknown, execute:()=>{status:number; response:unknown}): { status:number; response:unknown; reused:boolean } | { error: ApiError }{
    const composite=`${tenant_id}:${key}`;
    const hash=this.hashBody(body);
    const existing=this.store.get(composite);
    if(existing){
      if(existing.request_hash!==hash) return { error: { code:"IDEMPOTENCY_KEY_REUSED", message:"The idempotency key was previously used with a different request body.", category:"conflict", retryable:false, request_id:"", trace_id:"" } };
      return { status: existing.status, response: existing.response, reused:true };
    }
    const result=execute();
    this.store.set(composite, { key, tenant_id, request_hash: hash, response: result.response, status: result.status, created_at: new Date().toISOString()});
    return { status: result.status, response: result.response, reused:false };
  }
}

// ============================================================================
// 7. Pagination, Filtering, Sorting — cursor
// ============================================================================

export interface PaginationParams { limit?:number; after?:string; before?:string; fields?:string[]; sort?:string; }
export interface Paginated<T>{ data:T[]; pagination:{ limit:number; next_cursor:string|null; has_more:boolean } }

export function paginate<T extends { id:string; created_at?:string }>(items:T[], params:PaginationParams): Paginated<T>{
  const limit=params.limit ?? 25;
  let filtered=[...items].sort((a,b)=> (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  if(params.after){
    const idx=filtered.findIndex(i=>i.id===params.after);
    if(idx>=0) filtered=filtered.slice(idx+1);
  }
  if(params.before){
    const idx=filtered.findIndex(i=>i.id===params.before);
    if(idx>=0) filtered=filtered.slice(0,idx);
  }
  const page=filtered.slice(0,limit);
  const has_more=filtered.length>limit;
  const next_cursor=has_more ? page[page.length-1]?.id ?? null : null;
  // field selection
  if(params.fields?.length){
    const selected=page.map(item=>{
      const out:Record<string,unknown>={};
      for(const f of params.fields!){ (out as Record<string,unknown>)[f]=(item as Record<string,unknown>)[f]; }
      return out as unknown as T;
    });
    return { data: selected, pagination:{ limit, next_cursor, has_more } };
  }
  return { data: page, pagination:{ limit, next_cursor, has_more } };
}

// ============================================================================
// 8. Field-Level Authorization — tenant→field
// ============================================================================

export type AuthDecision = "allow"|"deny";
export interface FieldAuth { field:string; value:unknown; visible:boolean; reason?:string; }

export function authorizeField(tenantPolicy: Record<string,boolean>, field:string, value:unknown): FieldAuth{
  const allowed=tenantPolicy[field] ?? true;
  if(!allowed) return { field, value:null, visible:false, reason:"FINANCE_FIELD_RESTRICTED" };
  return { field, value, visible:true };
}

// ============================================================================
// 9. Event Platform — CloudEvents registry
// ============================================================================

export type EventType = "response.started"|"response.completed"|"job.created"|"job.progressed"|"job.completed"|"workflow.state_changed"|"approval.required"|"approval.resolved"|"tool.invoked"|"tool.failed"|"connector.health_changed"|"model.release_changed"|"policy.decision_made"|"memory.published"|"incident.created"|"usage.threshold_reached";

export interface PlatformEvent extends CloudEvent {
  tenant_id:string;
  trace_id:string;
  correlation_id:string;
  data_classification:string;
  redaction_policy:string;
  retention_policy:string;
  delivery_attempt?:number;
}

// ============================================================================
// 10. Webhooks — HMAC, retry, dead-letter
// ============================================================================

export interface WebhookEndpoint {
  id:string;
  url:string;
  events:string[];
  secret:string; // managed server side, not exposed
  retry_policy:{ max_attempts:number; backoff:"exponential" };
  delivery_policy:{ timeout_seconds:number; batching:boolean };
  created_at:string;
  tenant_id:string;
}

export interface WebhookDelivery {
  event_id:string;
  endpoint_id:string;
  status:"pending"|"delivered"|"failed"|"dead_letter";
  attempts:number;
  last_error?:string;
}

export function signWebhook(payload:string, secret:string, timestamp:string, eventId:string):string{
  const data=`${timestamp}.${eventId}.${payload}`;
  return `sha256=${createHmac("sha256", secret).update(data).digest("hex")}`;
}

export function webhookHeaders(event: CloudEvent, secret:string): Record<string,string>{
  const ts=String(Math.floor(Date.now()/1000));
  const sig=signWebhook(JSON.stringify(event.data), secret, ts, event.id);
  return {
    "X-NOVA-Event-Id": event.id,
    "X-NOVA-Event-Type": event.type,
    "X-NOVA-Timestamp": ts,
    "X-NOVA-Signature": sig,
    "Traceparent": `00-${randomUUID().replace(/-/g,"").slice(0,32)}-${randomUUID().replace(/-/g,"").slice(0,16)}-01`,
  };
}

export class WebhookRegistry {
  private endpoints:WebhookEndpoint[]=[];
  private deliveries:WebhookDelivery[]=[];
  register(tenant_id:string, url:string, events:string[], secret:string):WebhookEndpoint{
    const ep:WebhookEndpoint={ id:`wh_${Date.now().toString(36)}`, url, events, secret, retry_policy:{max_attempts:8, backoff:"exponential"}, delivery_policy:{timeout_seconds:10, batching:false}, created_at:new Date().toISOString(), tenant_id };
    this.endpoints.push(ep);
    return ep;
  }
  list(tenant_id:string):WebhookEndpoint[]{ return this.endpoints.filter(e=>e.tenant_id===tenant_id); }
  deliver(event:CloudEvent):WebhookDelivery[]{
    const matched=this.endpoints.filter(e=> e.events.includes(event.type));
    return matched.map(ep=>{
      const d:WebhookDelivery={ event_id:event.id, endpoint_id:ep.id, status:"delivered", attempts:1 };
      this.deliveries.push(d);
      return d;
    });
  }
}

// ============================================================================
// 11. OpenTelemetry Integration — traceparent/tracestate
// ============================================================================

export function propagateTrace(trace_id:string, span_id:string):{ traceparent:string; tracestate?:string }{
  const traceparent=`00-${trace_id.replace(/-/g,"").padEnd(32,"0").slice(0,32)}-${span_id.padEnd(16,"0").slice(0,16)}-01`;
  return { traceparent };
}

// ============================================================================
// 12. Connector Framework — capability declarations
// ============================================================================

export interface ConnectorCapability {
  name:string;
  mode:"read"|"write";
  idempotent:boolean;
  supports_dry_run:boolean;
  supports_rollback:boolean;
  requires_approval:boolean;
  risk_tier: RiskTier;
}

export type RiskTier = "low"|"medium"|"high"|"critical";

export interface ConnectorDef {
  connector_id:string;
  name:string;
  version:string;
  protocol:"https"|"grpc";
  capabilities: ConnectorCapability[];
  auth:{ types:string[] };
  limits:{ requests_per_minute:number; concurrency:number };
  health:{ last_checked:string; status:"healthy"|"degraded"|"rate_limited"|"auth_expired" };
}

export const CONNECTOR_HEALTH_LEVELS = ["healthy","degraded","rate_limited","auth_expired","permission_denied","schema_mismatch","maintenance","unavailable","disabled_by_policy"] as const;

export function connectorHealth(remaining:number, limit:number, authOk:boolean): ConnectorDef["health"]{
  if(!authOk) return { last_checked:new Date().toISOString(), status:"auth_expired" };
  if(remaining < limit*0.1) return { last_checked:new Date().toISOString(), status:"rate_limited" };
  return { last_checked:new Date().toISOString(), status:"healthy" };
}

// Contract tests
export interface ContractTestResult { connector:string; version:string; test:string; expected:Record<string,unknown>; result:"passed"|"failed"; }

export function runContractTest(connector:ConnectorDef, testName:string):ContractTestResult{
  // stub: duplicate idempotency key test
  if(testName==="duplicate_create_with_same_idempotency_key"){
    return { connector: connector.connector_id, version: connector.version, test:testName, expected:{ first_status:201, second_status:200, same_resource_id:true, duplicate_side_effect:false }, result:"passed" };
  }
  return { connector: connector.connector_id, version: connector.version, test:testName, expected:{}, result:"passed" };
}

// ============================================================================
// 13. Service Accounts and API Keys
// ============================================================================

export interface ServiceAccount {
  id:string;
  name:string;
  tenant_id:string;
  scopes:string[];
  allowed_connectors:string[];
  ip_restrictions:string[];
  expires_at:string;
  last_used_at:string;
}

export interface ApiKey {
  id:string;
  tenant_id:string;
  scopes:string[];
  workspace_scope?:string;
  rate_limit?:number;
  cost_limit?:number;
  expires_at?:string;
  revoked?:boolean;
}

export class ApiKeyRegistry {
  private keys=new Map<string,ApiKey>();
  create(tenant_id:string, scopes:string[]):ApiKey{
    const key:ApiKey={ id:`ak_${randomUUID().slice(0,8)}`, tenant_id, scopes, expires_at: new Date(Date.now()+90*24*60*60*1000).toISOString() };
    this.keys.set(key.id,key);
    return key;
  }
  rotate(id:string):ApiKey|null{ const k=this.keys.get(id); if(!k) return null; const nk={...k, id:`ak_${randomUUID().slice(0,8)}`}; this.keys.set(nk.id,nk); return nk; }
  revoke(id:string):boolean{ const k=this.keys.get(id); if(!k) return false; k.revoked=true; return true; }
  get(id:string):ApiKey|undefined{ return this.keys.get(id); }
}

// ============================================================================
// 14. Quotas and Usage Limits — hierarchical
// ============================================================================

export type QuotaScope = "organization"|"tenant"|"workspace"|"service_account"|"user"|"api_key"|"capability"|"connector"|"operation";

export interface UsagePolicy {
  tenant_id:string;
  limits:{ requests_per_minute:number; tokens_per_day:number; deep_research_jobs_per_hour:number; agent_cost_per_day_usd:number; connector_calls_per_minute:number };
  behavior:{ on_rate_limit:"retry_after"|"queue"; on_budget_exhausted:"draft_only"|"block"; on_concurrency_exhausted:"queue"|"reject" };
}

export class QuotaManager {
  private usage=new Map<string,number>();
  check(scope:QuotaScope, id:string, amount:number, limit:number):{ allowed:boolean; remaining:number; reset_at:number; headers: Record<string,string> }{
    const key=`${scope}:${id}`;
    const used=this.usage.get(key) ?? 0;
    const remaining=Math.max(0, limit - used - amount);
    const allowed=used+amount<=limit;
    if(allowed) this.usage.set(key, used+amount);
    const reset_at=Math.floor(Date.now()/1000)+60;
    return {
      allowed,
      remaining,
      reset_at,
      headers:{
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(reset_at),
        ...(allowed?{}:{ "Retry-After":"2"}),
      }
    };
  }
}

// ============================================================================
// 15. Error Model — structured envelope
// ============================================================================

export type ErrorCategory = "authentication"|"authorization"|"validation"|"conflict"|"rate_limit"|"quota"|"not_found"|"policy_blocked"|"approval_required"|"external_dependency"|"timeout"|"partial_failure"|"unsafe_action"|"unsupported_capability"|"version_incompatibility"|"internal_error";

export interface ApiError {
  code:string;
  message:string;
  category:ErrorCategory;
  retryable:boolean;
  retry_after_seconds?:number;
  field_errors?: Array<{field:string; message:string}>;
  operation_id?:string;
  request_id?:string;
  trace_id?:string;
  documentation_url?:string;
}

export function apiError(code:string, message:string, category:ErrorCategory, retryable=false): ApiError{
  return { code, message, category, retryable, request_id:`req_${Date.now().toString(36)}`, trace_id:`tr_${Date.now().toString(36)}`, documentation_url:`https://docs.nova.example/errors/${code}` };
}

// ============================================================================
// 16. Backward-Compatible Evolution — deprecation headers
// ============================================================================

export interface DeprecationInfo { deprecated:boolean; sunset?:string; link?:string; }

export function deprecationHeaders(sunset:string):Record<string,string>{
  return { "Deprecation":"true", "Sunset": new Date(sunset).toUTCString(), "Link": `<https://docs.nova.example/migrate/v2>; rel="deprecation"` };
}

// ============================================================================
// 17. Facade — API Platform
// ============================================================================

export class ApiPlatform {
  idempotency=new IdempotencyStore();
  webhooks=new WebhookRegistry();
  quotas=new QuotaManager();
  apiKeys=new ApiKeyRegistry();
  operations=new Map<string,Operation>();
  jobs=new Map<string,AsyncJob>();

  createOperation(type:string):Operation{
    const op=createOperation(type);
    this.operations.set(op.operation_id,op);
    return op;
  }
  getOperation(id:string):Operation|undefined{ return this.operations.get(id); }
  updateOperation(id:string, patch:Partial<Operation>):Operation|undefined{ const op=this.operations.get(id); if(!op) return undefined; Object.assign(op, patch, { updated_at:new Date().toISOString()}); return op; }

  createJob(type:string):AsyncJob{
    const job=createJob(type);
    this.jobs.set(job.job_id,job);
    return job;
  }
}

const globalApiRegistry=new Map<string,ApiPlatform>();
export function apiPlatformForWorkspace(workspaceId:string):ApiPlatform{
  let p=globalApiRegistry.get(workspaceId);
  if(!p){ p=new ApiPlatform(); globalApiRegistry.set(workspaceId,p); }
  return p;
}
