/**
 * N0VA1O Workflow Simulation Mode — workflow intelligence (spec §4.2).
 *
 * Supports dry-run execution against mock connectors or sandbox clones. Produces
 * tool selection, expected side effects, validation results, and failure
 * predictions before production execution.
 */

import { WorkflowStep, CompiledWorkflow } from "./versioning";
import { ResolvedPlan } from "./dependency";

export interface SideEffect {
  type: "create" | "update" | "delete" | "read" | "notify";
  description: string;
  destructive: boolean;
}

export interface StepSimulation {
  step: WorkflowStep;
  index: number;
  /** Whether the tool is expected to succeed. */
  predictedSuccess: boolean;
  /** Predicted latency in ms. */
  predictedLatencyMs: number;
  /** Reason for failure prediction, if any. */
  failureReason?: string;
  sideEffects: SideEffect[];
  validationErrors: string[];
}

export interface SimulationResult {
  workflowName: string;
  versionId: string;
  steps: StepSimulation[];
  overallSuccess: boolean;
  totalPredictedLatencyMs: number;
  destructiveActions: number;
  validationErrors: string[];
  failurePredictions: { step: number; reason: string }[];
  /** Whether it is safe to proceed to production execution. */
  safeToExecute: boolean;
}

export interface SimulationOptions {
  /** Mock availability by tool name (default: all available). */
  availableTools?: Set<string>;
  /** Tool -> predicted latency override. */
  latencyOverrides?: Record<string, number>;
  /** Inject failures for specific tools (for testing resilience). */
  failTools?: Set<string>;
}

/**
 * Simulate a workflow plan without executing it. Evaluates each step against
 * the dependency-resolved plan and predicts outcomes.
 */
export function simulatePlan(
  workflow: CompiledWorkflow,
  plan: ResolvedPlan,
  options: SimulationOptions = {},
): SimulationResult {
  const steps: StepSimulation[] = [];
  let totalLatency = 0;
  let destructiveCount = 0;
  const failurePredictions: { step: number; reason: string }[] = [];
  const validationErrors: string[] = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i]!;
    const sideEffects = inferSideEffects(step);
    const destructive = sideEffects.some((s) => s.destructive);
    if (destructive) destructiveCount++;

    const validationErrorsForStep = validateStep(step, i, plan);
    const forcedFail = options.failTools?.has(step.tool) || options.failTools?.has(step.provider);
    const predictedSuccess = validationErrorsForStep.length === 0 && !forcedFail;
    const failureReason = forcedFail
      ? `Tool "${step.tool}" predicted to fail (injected)`
      : validationErrorsForStep[0];

    if (failureReason) {
      failurePredictions.push({ step: i, reason: failureReason });
    }

    const latency = options.latencyOverrides?.[step.tool] ?? estimateLatency(step);
    totalLatency += latency;

    steps.push({
      step,
      index: i,
      predictedSuccess,
      predictedLatencyMs: latency,
      failureReason,
      sideEffects,
      validationErrors: validationErrorsForStep,
    });
  }

  // Blocked steps from dependency resolution become validation errors.
  for (const blocked of plan.blocked) {
    validationErrors.push(`Step "${blocked.tool}" blocked: missing prerequisite "${blocked.missingPrerequisite}"`);
  }

  const overallSuccess = steps.every((s) => s.predictedSuccess) && plan.blocked.length === 0;

  return {
    workflowName: workflow.workflowName,
    versionId: workflow.versionId,
    steps,
    overallSuccess,
    totalPredictedLatencyMs: totalLatency,
    destructiveActions: destructiveCount,
    validationErrors,
    failurePredictions,
    safeToExecute: overallSuccess && validationErrors.length === 0,
  };
}

function inferSideEffects(step: WorkflowStep): SideEffect[] {
  const verb = step.tool.split("_")[0] ?? step.tool;
  const effects: SideEffect[] = [];
  const destructiveVerbs = new Set(["delete", "remove", "update", "create", "merge", "close", "cancel", "send", "post", "put", "patch"]);
  const isDestructive = destructiveVerbs.has(verb);
  effects.push({
    type: isDestructive ? (verb === "delete" || verb === "remove" ? "delete" : "update") : "read",
    description: `${step.provider}: ${step.tool.replace(/_/g, " ")}`,
    destructive: isDestructive,
  });
  return effects;
}

function validateStep(step: WorkflowStep, index: number, plan: ResolvedPlan): string[] {
  const errors: string[] = [];
  const blocked = plan.blocked.find((b) => b.tool === step.tool);
  if (blocked) {
    errors.push(`Blocked by missing prerequisite: ${blocked.missingPrerequisite}`);
  }
  return errors;
}

function estimateLatency(step: WorkflowStep): number {
  const verb = step.tool.split("_")[0] ?? step.tool;
  if (verb === "list" || verb === "search" || verb === "query") return 300;
  if (verb === "create" || verb === "update" || verb === "delete") return 600;
  return 400;
}
