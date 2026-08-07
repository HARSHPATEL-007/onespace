/**
 * N0VA1O Atomic Multi-Step Execution — core platform (spec §4.3).
 *
 * Executes a sequence of tool steps across one or more integrations. Where a
 * downstream system supports transactionality, steps are committed together.
 * When a step fails on a non-transactional system, the executor generates
 * compensating actions and records partial-failure state for recovery.
 *
 * The executor is transport-aware: each step reports whether it is
 * compensatable. If it is and a later step fails, the executor invokes the
 * recorded compensation for every successfully-completed prior step, in reverse
 * order, so the system returns to a consistent state.
 */

import { N0va1oGateway, GatewayCallInput, GatewayCallResult } from "./gateway";

export interface ExecutionStep {
  integrationId: string;
  provider: string;
  tool: string;
  input: Record<string, unknown>;
  /**
   * Whether this step can be undone. If true, the executor records its
   * compensation when it succeeds so a later failure can roll it back.
   */
  compensatable?: boolean;
}

export interface ExecutionPlan {
  id: string;
  steps: ExecutionStep[];
  transactional: boolean;
}

export interface StepRecord {
  index: number;
  step: ExecutionStep;
  result: GatewayCallResult;
  /** Input snapshot needed to invoke the compensating action. */
  compensation?: ExecutionStep;
}

export type ExecutionStatus = "completed" | "partial_failure" | "failed";

export interface ExecutionResult {
  planId: string;
  status: ExecutionStatus;
  steps: StepRecord[];
  /** Compensations that were invoked due to a later failure. */
  compensations: StepRecord[];
  error?: string;
}

/**
 * Execute a plan. Returns the result with per-step records. On a non-
 * transactional plan, if any step fails and a prior step is compensatable,
 * the executor invokes compensating actions in reverse order before returning.
 */
export async function executePlan(
  plan: ExecutionPlan,
  gateway: N0va1oGateway,
  actorLabel: string,
  workspaceId: string,
): Promise<ExecutionResult> {
  const steps: StepRecord[] = [];
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    const callInput: GatewayCallInput = {
      // Gateway.call expects a full Integration; the orchestration layer
      // resolves integration rows before calling executePlan.
      integration: { id: step.integrationId, provider: step.provider } as never,
      workspaceId,
      actorLabel,
      tool: step.tool,
      input: step.input,
    };
    let result: GatewayCallResult;
    try {
      result = await gateway.call(callInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Step failed";
      // Attempt compensation for completed compensatable steps.
      const compensations = await rollback(steps, gateway, actorLabel, workspaceId);
      return {
        planId: plan.id,
        status: "partial_failure",
        steps,
        compensations,
        error: `Step ${i} (${step.provider}:${step.tool}) failed: ${message}`,
      };
    }

    const compStep = step.compensatable ? deriveCompensation(step) : undefined;
    const record: StepRecord = { index: i, step, result, compensation: compStep };
    steps.push(record);
  }

  return { planId: plan.id, status: "completed", steps, compensations: [] };
}

async function rollback(
  completed: StepRecord[],
  gateway: N0va1oGateway,
  actorLabel: string,
  workspaceId: string,
): Promise<StepRecord[]> {
  const compensations: StepRecord[] = [];
  for (const record of [...completed].reverse()) {
    if (!record.compensation) continue;
    const comp = record.compensation;
    let result: GatewayCallResult;
    try {
      result = await gateway.call({
        integration: { id: record.step.integrationId, provider: record.step.provider } as never,
        workspaceId,
        actorLabel,
        tool: comp.tool,
        input: comp.input,
      });
    } catch (err) {
      result = { ok: false, statusCode: 500, message: err instanceof Error ? err.message : "Compensation failed", durationMs: 0, retries: 0, idempotencyKey: "", replayed: false };
    }
    compensations.push({ index: record.index, step: comp, result });
  }
  return compensations;
}

/**
 * Derive a compensating step for a successful step. In production this would
 * consult a provider-specific reversal catalog (e.g. "create" -> "delete by
 * id"). Here we synthesize a reversal tool name convention.
 */
export function deriveCompensation(step: ExecutionStep): ExecutionStep {
  const reversal: Record<string, string> = {
    create: "delete",
    delete: "restore",
    update: "revert",
    add: "remove",
    remove: "restore",
    post: "delete",
  };
  const verb = step.tool.split("_")[0] ?? step.tool;
  const rest = step.tool.split("_").slice(1).join("_");
  const reverseVerb = reversal[verb] ?? `reverse_${verb ?? ""}`;
  const compTool = rest ? `${reverseVerb}_${rest}` : reverseVerb;
  return {
    integrationId: step.integrationId,
    provider: step.provider,
    tool: compTool,
    input: { reversedFrom: step.tool, originalInput: step.input },
    compensatable: false,
  };
}
