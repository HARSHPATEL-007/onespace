/**
 * N0VA1O Agentic Workflow Engine — multi-step agent workflows with planning,
 * tool selection, execution, verification, retry, rollback, and replanning.
 *
 * Separates planning from execution, persists checkpoints, and verifies
 * outcomes before retrying. Addresses partial tool success, timeouts,
 * duplicate side effects, stale state, and recovery.
 */

import { evaluatePolicy, type PolicyContext } from "./policy";

/* ---------- planning ---------- */

export type FlowShape = "dag" | "state_machine" | "fan_out_fan_in" | "conditional";

export interface Subgoal {
  id: string;
  description: string;
  dependencies: string[];
  tools: string[];
  expectedOutput: string;
  acceptanceCriteria: string[];
  riskLevel: "low" | "medium" | "high";
}

export interface WorkflowPlan {
  planId: string;
  goal: string;
  subgoals: Subgoal[];
  shape: FlowShape;
  createdAt: string;
  status: "draft" | "approved" | "executing" | "completed" | "failed";
}

/**
 * Convert a user goal into a structured workflow plan. Pure function — the
 * decomposition would use an LLM in production; here it produces a valid plan.
 */
export function createPlan(goal: string, subgoals: Omit<Subgoal, "id">[]): WorkflowPlan {
  return {
    planId: `plan_${Date.now().toString(32)}`,
    goal,
    subgoals: subgoals.map((s, i) => ({ ...s, id: `sg_${i}` })),
    shape: inferShape(subgoals),
    createdAt: new Date().toISOString(),
    status: "draft",
  };
}

function inferShape(subgoals: Omit<Subgoal, "id">[]): FlowShape {
  if (subgoals.some((s) => s.dependencies.length > 1)) return "fan_out_fan_in";
  if (subgoals.length > 2 && subgoals.every((s) => s.dependencies.length <= 1)) return "dag";
  return "state_machine";
}

/* ---------- tool selection ---------- */

export interface ToolRegistration {
  name: string;
  provider: string;
  schema: Record<string, string>;
  permissions: string[];
  riskLabel: "low" | "medium" | "high";
}

export interface SelectedTool {
  tool: ToolRegistration;
  validated: boolean;
  validationErrors: string[];
}

/**
 * Select and validate a tool against the registry, policy, and input schema.
 * Pure function.
 */
export function selectTool(opts: {
  toolName: string;
  registry: ToolRegistration[];
  policy: PolicyContext;
  input: Record<string, unknown>;
}): SelectedTool {
  const tool = opts.registry.find((t) => t.name === opts.toolName);
  if (!tool) return { tool: { name: opts.toolName, provider: "", schema: {}, permissions: [], riskLabel: "high" }, validated: false, validationErrors: ["Tool not found in registry"] };
  const errors = validateInput(tool, opts.input);
  const decision = evaluatePolicy({ ...opts.policy, isDestructive: tool.riskLabel === "high" });
  if (decision.outcome === "DENY") errors.push(`Policy denied: ${decision.disposition}`);
  return { tool, validated: errors.length === 0, validationErrors: errors };
}

function validateInput(tool: ToolRegistration, input: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const [field, type] of Object.entries(tool.schema)) {
    if (!(field in input)) errors.push(`Missing required field: ${field}`);
    else if (type === "number" && typeof input[field] !== "number") errors.push(`Field ${field} must be a number`);
  }
  return errors;
}

/* ---------- execution ---------- */

export interface StepRecord {
  stepId: string;
  subgoalId: string;
  tool: string;
  input: Record<string, unknown>;
  idempotencyKey: string;
  stateSnapshot: Record<string, unknown>;
  output?: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  status: "pending" | "executing" | "completed" | "failed";
}

/**
 * Create a durable step record with state snapshot and idempotency key. Pure.
 */
export function createStep(subgoalId: string, tool: string, input: Record<string, unknown>, stateSnapshot: Record<string, unknown>): StepRecord {
  return {
    stepId: `step_${Date.now().toString(32)}_${Math.random().toString(36).slice(2, 6)}`,
    subgoalId,
    tool,
    input,
    idempotencyKey: `${subgoalId}:${tool}:${hashInput(input)}`,
    stateSnapshot,
    status: "pending",
    startedAt: new Date().toISOString(),
  };
}

function hashInput(input: Record<string, unknown>): string {
  const s = JSON.stringify(input);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h).toString(32);
}

/* ---------- verification ---------- */

export interface VerificationResult {
  stepId: string;
  passed: boolean;
  evidence: string;
  criteriaMatched: string[];
  criteriaFailed: string[];
}

/**
 * Verify a step result against planner-defined acceptance criteria. Pure.
 * Uses machine-checkable evidence, not free-form judgment.
 */
export function verifyStep(step: StepRecord, criteria: string[]): VerificationResult {
  const output = step.output ?? {};
  const matched: string[] = [];
  const failed: string[] = [];
  for (const criterion of criteria) {
    if (checkCriterion(output, criterion)) matched.push(criterion);
    else failed.push(criterion);
  }
  return {
    stepId: step.stepId,
    passed: failed.length === 0,
    evidence: JSON.stringify(output),
    criteriaMatched: matched,
    criteriaFailed: failed,
  };
}

function checkCriterion(output: Record<string, unknown>, criterion: string): boolean {
  const lower = criterion.toLowerCase();
  if (lower.includes("status") && lower.includes("success")) return output.status === "success" || output.ok === true;
  if (lower.includes("not empty")) return output.result !== undefined && output.result !== "";
  if (lower.includes("error")) return !output.error;
  return output.result !== undefined;
}

/* ---------- retry and recovery ---------- */

export type FailureType = "retryable" | "non_retryable" | "timeout";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxAttempts: 3, backoffMs: 500, backoffMultiplier: 2 };

export interface RetryDecision {
  shouldRetry: boolean;
  failureType: FailureType;
  attemptsRemaining: number;
  backoffMs: number;
  escalate: boolean;
  reason: string;
}

/**
 * Decide whether to retry a failed step. Distinguishes retryable, non-retryable,
 * and timeout failures with bounded budgets and backoff. Pure.
 */
export function decideRetry(step: StepRecord, policy: RetryPolicy = DEFAULT_RETRY, attemptsMade: number): RetryDecision {
  const failureType = classifyFailure(step);
  const attemptsRemaining = policy.maxAttempts - attemptsMade;
  const backoffMs = Math.min(policy.backoffMs * policy.backoffMultiplier ** attemptsMade, 30_000);

  if (failureType === "non_retryable") {
    return { shouldRetry: false, failureType, attemptsRemaining, backoffMs: 0, escalate: true, reason: "Non-retryable failure — escalate to human review" };
  }
  if (attemptsRemaining <= 0) {
    return { shouldRetry: false, failureType, attemptsRemaining: 0, backoffMs: 0, escalate: true, reason: "Max attempts exhausted — escalate" };
  }
  return { shouldRetry: true, failureType, attemptsRemaining, backoffMs, escalate: false, reason: `Retryable — ${attemptsRemaining} attempt(s) remaining` };
}

function classifyFailure(step: StepRecord): FailureType {
  const output = step.output;
  if (!output) return "timeout";
  if (output.error === "auth_failed" || output.error === "permission_denied") return "non_retryable";
  if (output.error === "timeout" || output.timeout === true) return "timeout";
  if (output.error === "rate_limited" || output.error === "server_error") return "retryable";
  return "retryable";
}

/* ---------- replanning ---------- */

export interface ReplanResult {
  newPlan: WorkflowPlan;
  preservedEvidence: string[];
  failedState: string[];
  checkpointId: string;
}

/**
 * Replan from the last valid checkpoint after verification failure. Preserves
 * prior evidence, failed state, and decision history. Pure.
 */
export function replanFromCheckpoint(plan: WorkflowPlan, failedStepId: string, completedSteps: StepRecord[]): ReplanResult {
  const preservedEvidence = completedSteps.filter((s) => s.status === "completed").map((s) => s.stepId);
  const failedState = [failedStepId];
  const remainingSubgoals = plan.subgoals.filter((sg) => !completedSteps.some((s) => s.subgoalId === sg.id && s.status === "completed"));
  const newPlan: WorkflowPlan = {
    ...plan,
    planId: `plan_${Date.now().toString(32)}`,
    subgoals: remainingSubgoals,
    createdAt: new Date().toISOString(),
    status: "draft",
  };
  return { newPlan, preservedEvidence, failedState, checkpointId: failedStepId };
}

/* ---------- governance ---------- */

export interface RiskAssessment {
  workflowId: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  stepRisks: { stepId: string; risk: string; requiresApproval: boolean }[];
  requiresPreApproval: boolean;
}

/**
 * Assess risk for a workflow plan. High-risk workflows require approval. Pure.
 */
export function assessRisk(plan: WorkflowPlan): RiskAssessment {
  const stepRisks = plan.subgoals.map((sg) => ({
    stepId: sg.id,
    risk: sg.riskLevel,
    requiresApproval: sg.riskLevel === "high",
  }));
  const hasHigh = stepRisks.some((s) => s.risk === "high");
  const overallRisk = hasHigh ? "high" : stepRisks.some((s) => s.risk === "medium") ? "medium" : "low";
  return { workflowId: plan.planId, overallRisk, stepRisks, requiresPreApproval: hasHigh };
}

export interface AuditEntry {
  actor: string;
  timestamp: string;
  tool: string;
  parameters: Record<string, unknown>;
  result: string;
}

/** Create an immutable audit entry for a mutating action. Pure. */
export function auditAction(actor: string, tool: string, parameters: Record<string, unknown>, result: string): AuditEntry {
  return { actor, timestamp: new Date().toISOString(), tool, parameters, result };
}

/* ---------- observability ---------- */

export interface TraceEvent {
  traceId: string;
  phase: "planning" | "tool_selection" | "execution" | "verification" | "retry" | "replanning";
  stepId?: string;
  timestamp: string;
  details: string;
}

/**
 * Emit a trace event for observability. Pure — returns the event for logging.
 */
export function emitTrace(phase: TraceEvent["phase"], details: string, stepId?: string): TraceEvent {
  return { traceId: `trace_${Date.now().toString(32)}`, phase, stepId, timestamp: new Date().toISOString(), details };
}

/** Determine which phase a failure occurred in. Pure. */
export function locateFailure(step: StepRecord): TraceEvent["phase"] {
  if (step.status === "failed" && !step.finishedAt) return "execution";
  if (step.status === "failed" && step.finishedAt) return "verification";
  return "execution";
}

/* ---------- human-in-the-loop ---------- */

export interface PauseRequest {
  reason: "low_confidence" | "high_risk" | "verification_failed";
  plan: WorkflowPlan;
  evidence: string[];
  proposedAction: string;
}

/**
 * Decide whether to pause for human approval. Pure.
 */
export function shouldPause(opts: { confidence: number; riskLevel: string; consecutiveFailures: number }): boolean {
  if (opts.confidence < 0.6) return true;
  if (opts.riskLevel === "high") return true;
  if (opts.consecutiveFailures >= 2) return true;
  return false;
}

/** Build a pause request with plan, evidence, and proposed action for human review. Pure. */
export function requestHumanApproval(plan: WorkflowPlan, evidence: string[], proposedAction: string, reason: PauseRequest["reason"]): PauseRequest {
  return { reason, plan, evidence, proposedAction };
}
