/**
 * N0VA ANI — Agent Runtime and Workflow Governance
 * Durable, policy-controlled execution kernel per N0VA-ANI.md §§1-27.
 * Model produces plans, runtime validates and executes with typed contracts, isolation, and replayability.
 */

import { createHash } from "crypto";

// ---------------------------------------------------------------------------
// 2. Typed Tool Contract
// ---------------------------------------------------------------------------
export interface ToolContract {
  tool_id: string; // e.g., crm.update_opportunity
  version: string; // semver
  description: string;
  input_schema: {
    type: "object";
    required: string[];
    properties: Record<string, unknown>;
    additionalProperties: boolean;
  };
  output_schema: {
    type: "object";
    required: string[];
    properties: Record<string, unknown>;
  };
  effects: string[]; // e.g., ["crm.opportunity.write"]
  risk_class: "low" | "medium" | "high" | "critical";
  supports_dry_run: boolean;
  supports_compensation: boolean;
  approval_policy?: string;
  required_scopes: string[];
  data_classification: "public" | "internal" | "confidential" | "restricted";
  rate_limit?: { max_per_minute: number };
  timeout_ms: number;
  audit_required: boolean;
}

export class ToolRegistry {
  private tools = new Map<string, ToolContract>();

  register(contract: ToolContract): void {
    if (!contract.supports_dry_run && contract.risk_class !== "low") {
      // Spec §2: untrusted restricted to isolated execution
      contract.risk_class = "critical";
    }
    const key = `${contract.tool_id}@${contract.version}`;
    this.tools.set(key, contract);
    this.tools.set(contract.tool_id, contract); // latest
  }

  get(toolId: string, version?: string): ToolContract | null {
    if (version) return this.tools.get(`${toolId}@${version}`) ?? null;
    return this.tools.get(toolId) ?? null;
  }

  list(): ToolContract[] {
    // dedup latest
    const seen = new Set<string>();
    const out: ToolContract[] = [];
    for (const [k, v] of this.tools) {
      if (k.includes("@")) continue;
      if (seen.has(v.tool_id)) continue;
      seen.add(v.tool_id);
      out.push(v);
    }
    return out;
  }

  validate(toolId: string, args: unknown): { valid: boolean; errors: string[] } {
    const contract = this.get(toolId);
    if (!contract) return { valid: false, errors: [`tool not registered: ${toolId}`] };
    const errors: string[] = [];
    if (typeof args !== "object" || args === null) {
      errors.push("args must be object");
      return { valid: false, errors };
    }
    const a = args as Record<string, unknown>;
    for (const req of contract.input_schema.required) {
      if (!(req in a)) errors.push(`missing required: ${req}`);
    }
    // pattern, enum, maxLength checks omitted for brevity — would use ajv in prod
    if (contract.input_schema.additionalProperties === false) {
      for (const k of Object.keys(a)) {
        if (!(k in contract.input_schema.properties)) errors.push(`additionalProperty not allowed: ${k}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }
}

// ---------------------------------------------------------------------------
// 3. Agent Plan Schema
// ---------------------------------------------------------------------------
export type PlanStepType = "read" | "draft" | "schedule" | "write" | "delete" | "send" | "compute";

export interface PlanAssumption {
  id: string;
  text: string;
  requires_confirmation: boolean;
}

export interface PlanStep {
  step_id: string;
  type: PlanStepType;
  tool: string;
  arguments?: Record<string, unknown>;
  arguments_ref?: string;
  depends_on: string[];
  approval?: "required" | "optional";
}

export interface AgentPlan {
  plan_id: string;
  goal: string;
  context_refs: string[];
  assumptions: PlanAssumption[];
  steps: PlanStep[];
  success_conditions: string[];
  failure_policy: { max_retries: number; on_partial_failure: "retry" | "pause_and_escalate" | "compensate" | "abort" };
  limits: { max_steps: number; max_duration_seconds: number; max_cost: number };
  created_at: string;
  plan_version: number;
  risk_level?: "low" | "medium" | "high" | "critical";
}

export function createPlanId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// 5. State Machine
// ---------------------------------------------------------------------------
export type WorkflowState =
  | "CREATED"
  | "PLANNED"
  | "VALIDATING"
  | "SIMULATING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "RUNNING"
  | "WAITING"
  | "RETRYING"
  | "PAUSED"
  | "ESCALATED"
  | "COMPENSATING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  CREATED: ["PLANNED"],
  PLANNED: ["VALIDATING"],
  VALIDATING: ["SIMULATING", "FAILED"],
  SIMULATING: ["AWAITING_APPROVAL", "FAILED"],
  AWAITING_APPROVAL: ["APPROVED", "CANCELLED", "EXPIRED"],
  APPROVED: ["RUNNING"],
  RUNNING: ["WAITING", "RETRYING", "PAUSED", "ESCALATED", "COMPENSATING", "COMPLETED", "FAILED"],
  WAITING: ["RUNNING", "PAUSED", "FAILED"],
  RETRYING: ["RUNNING", "FAILED"],
  PAUSED: ["RUNNING", "CANCELLED", "ESCALATED"],
  ESCALATED: ["PAUSED", "RUNNING", "FAILED", "CANCELLED"],
  COMPENSATING: ["FAILED", "COMPLETED", "PAUSED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export interface WorkflowExecution {
  workflow_id: string;
  plan: AgentPlan;
  state: WorkflowState;
  state_history: Array<{ from: WorkflowState; to: WorkflowState; at: string; actor: string }>;
  step_results: Map<string, { status: "pending" | "running" | "succeeded" | "failed" | "compensated"; output?: unknown; attempts: number }>;
  created_at: string;
  updated_at: string;
  approval_ids: string[];
  idempotency_keys: Map<string, string>;
  checkpoint?: WorkflowCheckpoint;
}

export interface WorkflowCheckpoint {
  workflow_state: WorkflowState;
  plan_version: number;
  completed_steps: string[];
  step_outputs: Record<string, unknown>;
  input_hashes: Record<string, string>;
  idempotency_keys: Record<string, string>;
  credential_refs: Record<string, string>;
  approval_refs: string[];
  context_manifest?: unknown;
  tool_versions: Record<string, string>;
  retry_history: Array<{ step_id: string; attempt: number; error: string; at: string }>;
  compensation_options: Record<string, { tool: string; conditions: string[] }>;
  policy_version: string;
  model_version: string;
  pending_timers: string[];
  intervention_history: string[];
}

// ---------------------------------------------------------------------------
// 6. Idempotency and Exactly-Once Intent
// ---------------------------------------------------------------------------
export function deriveIdempotencyKey(workflowId: string, stepId: string, targetResource: string, normalizedArgs: unknown): string {
  const payload = JSON.stringify({ workflow_id: workflowId, step_id: stepId, target_resource: targetResource, normalized_arguments: normalizedArgs });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// 7. Dry-Run and Simulation
// ---------------------------------------------------------------------------
export interface SimulationResult {
  simulation_id: string;
  plan_id: string;
  changes: Array<{
    resource: string;
    operation: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reversible: boolean;
    recipients?: string[];
    external_send?: boolean;
  }>;
  warnings: string[];
  required_approvals: string[];
  estimated_cost: number;
  estimated_duration_seconds: number;
}

// ---------------------------------------------------------------------------
// 8. Transaction Boundaries (Saga)
// ---------------------------------------------------------------------------
export type ActionClass = "pure_read" | "reversible_write" | "append_only" | "external_communication" | "destructive" | "financial";

export interface Compensation {
  tool: string;
  conditions: string[]; // e.g., task_created_by_this_workflow
}

// ---------------------------------------------------------------------------
// 9. Risk Engine R = f(I,D,F,E,P,V,X,U)
// ---------------------------------------------------------------------------
export interface RiskDimensions {
  irreversibility: number; // I 0..1
  dataSensitivity: number; // D
  financialImpact: number; // F
  externalAudience: number; // E
  privilegeImpact: number; // P
  resourceValue: number; // V
  executionUncertainty: number; // X
  userImpact: number; // U
}

export class RiskEngine {
  score(d: RiskDimensions): { score: number; level: "low" | "medium" | "high" | "critical"; breakdown: RiskDimensions } {
    // Weighted sum per spec §9, 14 dimensions collapsed to 8 core
    const weights: Record<keyof RiskDimensions, number> = {
      irreversibility: 0.18,
      dataSensitivity: 0.14,
      financialImpact: 0.15,
      externalAudience: 0.13,
      privilegeImpact: 0.12,
      resourceValue: 0.1,
      executionUncertainty: 0.08,
      userImpact: 0.1,
    };
    let s = 0;
    for (const k of Object.keys(weights) as (keyof RiskDimensions)[]) s += d[k] * weights[k];
    const level = s > 0.75 ? "critical" : s > 0.5 ? "high" : s > 0.25 ? "medium" : "low";
    return { score: s, level, breakdown: d };
  }

  fromToolContract(contract: ToolContract, context: { isExternal?: boolean; recordCount?: number; amount?: number }): RiskDimensions {
    return {
      irreversibility: contract.effects.some((e) => e.includes("delete")) || contract.risk_class === "critical" ? 0.9 : contract.supports_compensation ? 0.3 : 0.6,
      dataSensitivity: contract.data_classification === "restricted" ? 0.9 : contract.data_classification === "confidential" ? 0.6 : 0.2,
      financialImpact: context.amount ? Math.min(1, context.amount / 10000) : 0,
      externalAudience: context.isExternal ? 0.8 : 0.1,
      privilegeImpact: contract.required_scopes.includes("admin") ? 0.9 : 0.3,
      resourceValue: Math.min(1, (context.recordCount ?? 1) / 100),
      executionUncertainty: contract.risk_class === "high" ? 0.6 : 0.2,
      userImpact: 0.4,
    };
  }
}

// ---------------------------------------------------------------------------
// 10. Approval Policies
// ---------------------------------------------------------------------------
export interface ApprovalPolicy {
  policy_id: string;
  when: { effect: string; recipient_scope?: "internal" | "external"; classification?: string };
  requirements: string[]; // user_approval, manager_approval, compliance_approval
  conditions?: {
    more_than?: { recipients: number; require: string[] };
    contains?: { classification: string; require: string[] };
  };
  expiry: string; // e.g., 15m
  delegation: "enabled" | "disabled";
}

export class ApprovalPolicyEngine {
  private policies: ApprovalPolicy[] = [
    {
      policy_id: "external_customer_communication",
      when: { effect: "mail.send", recipient_scope: "external" },
      requirements: ["user_approval", "content_scan", "recipient_validation"],
      conditions: {
        more_than: { recipients: 50, require: ["manager_approval"] },
        contains: { classification: "restricted", require: ["compliance_approval"] },
      },
      expiry: "15m",
      delegation: "disabled",
    },
  ];

  evaluate(tool: string, args: Record<string, unknown>, classification?: string, recipientCount?: number): { required: string[]; policy_id: string | null } {
    for (const p of this.policies) {
      if (p.when.effect === tool || (tool.includes("send") && p.when.effect === "mail.send")) {
        if (p.when.recipient_scope === "external" && recipientCount !== undefined && recipientCount === 0) continue;
        const required = [...p.requirements];
        if (p.conditions?.more_than && recipientCount !== undefined && recipientCount > p.conditions.more_than.recipients) {
          required.push(...p.conditions.more_than.require);
        }
        if (p.conditions?.contains && classification === p.conditions.contains.classification) {
          required.push(...p.conditions.contains.require);
        }
        return { required, policy_id: p.policy_id };
      }
    }
    // HITL thresholds from spec §9 (financial, mass, deletion, legal, health)
    if (tool.includes("finance") || tool.includes("payment")) return { required: ["finance_approval"], policy_id: "finance_threshold" };
    return { required: [], policy_id: null };
  }
}

// ---------------------------------------------------------------------------
// 11. Credential Broker
// ---------------------------------------------------------------------------
export interface CredentialLease {
  workflow_id: string;
  step_id: string;
  subject: string;
  connector: string;
  scopes: string[];
  issued_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
}

export class CredentialBroker {
  private leases = new Map<string, CredentialLease>();

  issue(params: { workflowId: string; stepId: string; subject: string; connector: string; scopes: string[]; ttlMs?: number; maxUses?: number }): CredentialLease {
    const now = Date.now();
    const lease: CredentialLease = {
      workflow_id: params.workflowId,
      step_id: params.stepId,
      subject: params.subject,
      connector: params.connector,
      scopes: params.scopes,
      issued_at: new Date(now).toISOString(),
      expires_at: new Date(now + (params.ttlMs ?? 5 * 60 * 1000)).toISOString(),
      max_uses: params.maxUses ?? 3,
      uses: 0,
    };
    const key = `${params.workflowId}:${params.stepId}`;
    this.leases.set(key, lease);
    return lease;
  }

  consume(workflowId: string, stepId: string): CredentialLease | null {
    const key = `${workflowId}:${stepId}`;
    const lease = this.leases.get(key);
    if (!lease) return null;
    if (Date.now() > new Date(lease.expires_at).getTime()) return null;
    if (lease.uses >= lease.max_uses) return null;
    lease.uses += 1;
    return lease;
  }

  revokeForWorkflow(workflowId: string): void {
    for (const k of [...this.leases.keys()]) if (k.startsWith(`${workflowId}:`)) this.leases.delete(k);
  }
}

// ---------------------------------------------------------------------------
// 12. Agent Capability Firewall
// ---------------------------------------------------------------------------
export class CapabilityFirewall {
  constructor(
    private readonly policyEngine: ApprovalPolicyEngine,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  check(params: {
    tenant: string;
    userId: string;
    purpose: string;
    tool: string;
    args: Record<string, unknown>;
    targetResource?: string;
    budget?: { cost: number; maxCost: number };
    approvalIds?: string[];
    lease?: CredentialLease | null;
  }): { allowed: boolean; reason: string } {
    const contract = this.toolRegistry.get(params.tool);
    if (!contract) return { allowed: false, reason: "tool not registered — untrusted isolated only" };
    // Tenant/user purpose checks would query policy engine; simplified
    if (params.budget && params.budget.cost > params.budget.maxCost) return { allowed: false, reason: "budget exceeded" };
    if (contract.required_scopes.length > 0 && !params.lease) return { allowed: false, reason: "missing credential lease" };
    // Approval present and still valid would be checked via approval service; stub
    void params.approvalIds;
    void params.targetResource;
    return { allowed: true, reason: "capability firewall pass" };
  }
}

// ---------------------------------------------------------------------------
// 14. Verification and Postconditions
// ---------------------------------------------------------------------------
export interface Postcondition {
  type: "resource_exists" | "field_equals" | "no_side_effect";
  resource?: string;
  field?: string;
  value?: unknown;
  match?: Record<string, unknown>;
}

export class Verifier {
  async verify(step: PlanStep, before: unknown, after: unknown, postconditions: Postcondition[]): Promise<{ verified: boolean; failures: string[] }> {
    const failures: string[] = [];
    for (const pc of postconditions) {
      if (pc.type === "field_equals" && pc.field) {
        const val = (after as Record<string, unknown>)?.[pc.field];
        if (val !== pc.value) failures.push(`field ${pc.field} expected ${pc.value} got ${val}`);
      }
      if (pc.type === "resource_exists" && pc.match) {
        const exists = JSON.stringify(after).includes(JSON.stringify(Object.values(pc.match)[0]));
        if (!exists) failures.push(`resource ${pc.resource} not found with match ${JSON.stringify(pc.match)}`);
      }
    }
    void before;
    void step;
    return { verified: failures.length === 0, failures };
  }
}

// ---------------------------------------------------------------------------
// 15. Error Taxonomy
// ---------------------------------------------------------------------------
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHORIZATION_DENIED"
  | "POLICY_BLOCKED"
  | "STALE_CONTEXT"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TIMEOUT_UNKNOWN"
  | "TRANSIENT_FAILURE"
  | "PERMANENT_FAILURE"
  | "PARTIAL_COMMIT"
  | "SCHEMA_DRIFT"
  | "INJECTION_DETECTED";

export function classifyError(message: string): { code: ErrorCode; retryable: boolean } {
  const lower = message.toLowerCase();
  if (lower.includes("validation") || lower.includes("schema")) return { code: "VALIDATION_ERROR", retryable: false };
  if (lower.includes("unauthorized") || lower.includes("permission")) return { code: "AUTHORIZATION_DENIED", retryable: false };
  if (lower.includes("policy") || lower.includes("blocked")) return { code: "POLICY_BLOCKED", retryable: false };
  if (lower.includes("stale") || lower.includes("changed")) return { code: "STALE_CONTEXT", retryable: true };
  if (lower.includes("conflict")) return { code: "CONFLICT", retryable: true };
  if (lower.includes("rate limit") || lower.includes("429")) return { code: "RATE_LIMITED", retryable: true };
  if (lower.includes("timeout") || lower.includes("unknown outcome")) return { code: "TIMEOUT_UNKNOWN", retryable: false };
  if (lower.includes("injection") || lower.includes("quarantine")) return { code: "INJECTION_DETECTED", retryable: false };
  if (lower.includes("transient") || lower.includes("503")) return { code: "TRANSIENT_FAILURE", retryable: true };
  return { code: "PERMANENT_FAILURE", retryable: false };
}

// ---------------------------------------------------------------------------
// 1 & 17. Kernel + Durable Checkpointing
// ---------------------------------------------------------------------------
export class AgentExecutionKernel {
  private workflows = new Map<string, WorkflowExecution>();
  private toolRegistry: ToolRegistry;
  private riskEngine = new RiskEngine();
  private approvalEngine = new ApprovalPolicyEngine();
  private credentialBroker = new CredentialBroker();
  private firewall: CapabilityFirewall;
  private verifier = new Verifier();

  constructor(registry?: ToolRegistry) {
    this.toolRegistry = registry ?? new ToolRegistry();
    this.firewall = new CapabilityFirewall(this.approvalEngine, this.toolRegistry);
    // Seed with typed contracts per §2 examples
    this.toolRegistry.register({
      tool_id: "crm.update_opportunity",
      version: "2.4.0",
      description: "Update permitted fields on a CRM opportunity",
      input_schema: {
        type: "object",
        required: ["opportunity_id", "changes", "idempotency_key"],
        properties: {
          opportunity_id: { type: "string", pattern: "^opp_[a-zA-Z0-9]+$" },
          changes: {
            type: "object",
            additionalProperties: false,
            properties: {
              stage: { type: "string", enum: ["qualified", "proposal", "negotiation", "closed_won", "closed_lost"] },
              next_action: { type: "string", maxLength: 1000 },
            },
          },
          idempotency_key: { type: "string", minLength: 16, maxLength: 128 },
        },
        additionalProperties: false,
      },
      output_schema: {
        type: "object",
        required: ["operation_id", "status", "updated_fields"],
        properties: {
          operation_id: { type: "string" },
          status: { type: "string", enum: ["applied", "unchanged", "rejected", "pending"] },
          updated_fields: { type: "array", items: { type: "string" } },
        },
      },
      effects: ["crm.opportunity.write"],
      risk_class: "high",
      supports_dry_run: true,
      supports_compensation: true,
      approval_policy: "crm_deal_change",
      required_scopes: ["crm.write"],
      data_classification: "confidential",
      timeout_ms: 10000,
      audit_required: true,
    });
    this.toolRegistry.register({
      tool_id: "crm.get_opportunity",
      version: "1.0.0",
      description: "Read CRM opportunity",
      input_schema: { type: "object", required: ["opportunity_id"], properties: { opportunity_id: { type: "string" } }, additionalProperties: false },
      output_schema: { type: "object", required: ["opportunity_id", "stage"], properties: { opportunity_id: { type: "string" }, stage: { type: "string" } } },
      effects: ["crm.opportunity.read"],
      risk_class: "low",
      supports_dry_run: true,
      supports_compensation: false,
      required_scopes: ["crm.read"],
      data_classification: "internal",
      timeout_ms: 5000,
      audit_required: false,
    });
    this.toolRegistry.register({
      tool_id: "mail.create_draft",
      version: "1.0.0",
      description: "Create mail draft (no send)",
      input_schema: { type: "object", required: ["to", "subject", "body"], properties: { to: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, additionalProperties: false },
      output_schema: { type: "object", required: ["draft_id"], properties: { draft_id: { type: "string" } } },
      effects: ["mail.draft.write"],
      risk_class: "medium",
      supports_dry_run: true,
      supports_compensation: true,
      required_scopes: ["mail.write"],
      data_classification: "internal",
      timeout_ms: 8000,
      audit_required: true,
    });
    this.toolRegistry.register({
      tool_id: "calendar.create_event",
      version: "1.8.0",
      description: "Create calendar event",
      input_schema: { type: "object", required: ["title", "start", "attendees"], properties: { title: { type: "string" }, start: { type: "string" }, attendees: { type: "array" } }, additionalProperties: false },
      output_schema: { type: "object", required: ["event_id"], properties: { event_id: { type: "string" } } },
      effects: ["calendar.event.write"],
      risk_class: "medium",
      supports_dry_run: true,
      supports_compensation: true,
      approval_policy: "calendar_create",
      required_scopes: ["calendar.write"],
      data_classification: "internal",
      timeout_ms: 8000,
      audit_required: true,
    });
    this.toolRegistry.register({
      tool_id: "tasks.create",
      version: "1.0.0",
      description: "Create task",
      input_schema: { type: "object", required: ["title"], properties: { title: { type: "string" }, project_id: { type: "string" }, assignee: { type: "string" } }, additionalProperties: true },
      output_schema: { type: "object", required: ["task_id"], properties: { task_id: { type: "string" } } },
      effects: ["tasks.write"],
      risk_class: "low",
      supports_dry_run: true,
      supports_compensation: true,
      required_scopes: ["tasks.write"],
      data_classification: "internal",
      timeout_ms: 5000,
      audit_required: true,
    });
  }

  // Plan compiler (§1)
  compilePlan(goal: string, contextRefs: string[], limits?: Partial<AgentPlan["limits"]>): AgentPlan {
    // Minimal deterministic compiler per §3 example
    const planId = createPlanId();
    const assumptions: PlanAssumption[] = [{ id: "a1", text: "The customer contact is the primary recipient", requires_confirmation: true }];
    const steps: PlanStep[] = [
      { step_id: "s1", type: "read", tool: "crm.get_opportunity", arguments: { opportunity_id: "opp_123" }, depends_on: [] },
      { step_id: "s2", type: "draft", tool: "mail.create_draft", arguments_ref: "generated_followup", depends_on: ["s1"] },
      { step_id: "s3", type: "schedule", tool: "calendar.create_event", arguments_ref: "meeting_proposal", depends_on: ["s1"], approval: "required" },
    ];
    return {
      plan_id: planId,
      goal,
      context_refs: contextRefs,
      assumptions,
      steps,
      success_conditions: ["draft_created", "meeting_created_only_after_approval"],
      failure_policy: { max_retries: 2, on_partial_failure: "pause_and_escalate" },
      limits: { max_steps: limits?.max_steps ?? 10, max_duration_seconds: limits?.max_duration_seconds ?? 120, max_cost: limits?.max_cost ?? 0.5 },
      created_at: new Date().toISOString(),
      plan_version: 1,
    };
  }

  validatePlan(plan: AgentPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (plan.steps.length > plan.limits.max_steps) errors.push(`exceeds max_steps ${plan.limits.max_steps}`);
    if (!plan.success_conditions || plan.success_conditions.length === 0) errors.push("plan without postconditions not eligible for autonomous execution");
    for (const step of plan.steps) {
      const v = this.toolRegistry.validate(step.tool, step.arguments ?? {});
      if (!v.valid) errors.push(...v.errors.map((e) => `${step.step_id}:${e}`));
      for (const dep of step.depends_on) if (!plan.steps.find((s) => s.step_id === dep)) errors.push(`step ${step.step_id} depends on unknown ${dep}`);
    }
    return { valid: errors.length === 0, errors };
  }

  simulate(plan: AgentPlan): SimulationResult {
    const changes = plan.steps
      .filter((s) => s.type !== "read")
      .map((s) => ({
        resource: s.tool.includes("crm") ? "crm.opportunity:opp_123" : s.tool.includes("mail") ? "mail.draft:new" : s.tool,
        operation: s.type,
        before: s.tool.includes("crm") ? { stage: "proposal" } : undefined,
        after: s.tool.includes("crm") ? { stage: "negotiation" } : undefined,
        reversible: true,
        recipients: s.tool.includes("mail") ? ["customer@example.com"] : undefined,
        external_send: s.tool.includes("mail") ? false : undefined,
      }));
    return {
      simulation_id: `sim_${Date.now().toString(36)}`,
      plan_id: plan.plan_id,
      changes,
      warnings: ["Meeting creation may conflict with an existing event.", "Customer email was sourced from CRM."],
      required_approvals: plan.steps.filter((s) => s.approval === "required").map((s) => s.tool),
      estimated_cost: 0.18,
      estimated_duration_seconds: 14,
    };
  }

  // State machine transitions (§5)
  transition(workflowId: string, to: WorkflowState, actor: string): WorkflowExecution {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`workflow not found: ${workflowId}`);
    const allowed = ALLOWED_TRANSITIONS[wf.state] ?? [];
    if (!allowed.includes(to)) throw new Error(`invalid transition ${wf.state} → ${to}`);
    const from = wf.state;
    wf.state = to;
    wf.state_history.push({ from, to, at: new Date().toISOString(), actor });
    wf.updated_at = new Date().toISOString();
    return wf;
  }

  createWorkflow(plan: AgentPlan, actor = "system"): WorkflowExecution {
    const wf: WorkflowExecution = {
      workflow_id: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
      plan,
      state: "CREATED",
      state_history: [{ from: "CREATED", to: "CREATED", at: new Date().toISOString(), actor }],
      step_results: new Map(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      approval_ids: [],
      idempotency_keys: new Map(),
    };
    wf.state = "PLANNED";
    this.workflows.set(wf.workflow_id, wf);
    return wf;
  }

  getWorkflow(workflowId: string): WorkflowExecution | null {
    return this.workflows.get(workflowId) ?? null;
  }

  listWorkflows(): WorkflowExecution[] {
    return [...this.workflows.values()];
  }

  // Human takeover (§18)
  takeover(workflowId: string, action: { type: string; stepId?: string; newArgs?: Record<string, unknown> }): WorkflowExecution {
    const wf = this.getWorkflow(workflowId);
    if (!wf) throw new Error("not found");
    // Simplified: allow pause/inspect/edit/approve
    if (action.type === "pause") this.transition(workflowId, "PAUSED", "human");
    if (action.type === "resume") this.transition(workflowId, "RUNNING", "human");
    if (action.newArgs && action.stepId) {
      const step = wf.plan.steps.find((s) => s.step_id === action.stepId);
      if (step) step.arguments = action.newArgs;
    }
    return wf;
  }

  // Replay (§21) — returns audit trail without secrets
  replay(workflowId: string): Array<{ event_type: string; timestamp: string; actor: unknown; step_id?: string; tool?: string; result?: unknown }> {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return [];
    return wf.state_history.map((h) => ({
      event_type: `state.${h.to.toLowerCase()}`,
      timestamp: h.at,
      actor: { type: "system", delegated_by: h.actor },
      step_id: undefined,
      tool: undefined,
      result: { from: h.from, to: h.to },
    }));
  }

  // Expose sub-engines for governance
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }
  getRiskEngine(): RiskEngine {
    return this.riskEngine;
  }
  getApprovalEngine(): ApprovalPolicyEngine {
    return this.approvalEngine;
  }
  getCredentialBroker(): CredentialBroker {
    return this.credentialBroker;
  }
  getFirewall(): CapabilityFirewall {
    return this.firewall;
  }
  getVerifier(): Verifier {
    return this.verifier;
  }
}

export const globalAgentKernel = new AgentExecutionKernel();
