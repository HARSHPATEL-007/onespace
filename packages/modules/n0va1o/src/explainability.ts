/**
 * N0VA1O Explainability Summaries — workflow intelligence (spec §4.4).
 *
 * For every workflow step, provides a concise explanation of why a tool was
 * selected, what constraints were applied, and which policies influenced the
 * decision. Summaries are available in audit logs and operator views.
 */

import { WorkflowStep } from "./versioning";
import { PolicyDecision } from "./policy";
import { StepSimulation } from "./simulation";

export interface StepExplanation {
  stepIndex: number;
  tool: string;
  provider: string;
  /** Why this tool was selected for the step. */
  selectionReason: string;
  /** Constraints that were applied (e.g. allowlist, rate limit). */
  constraints: string[];
  /** Policies that influenced the decision. */
  policies: string[];
  /** Risk level assigned to this step. */
  riskLevel: string;
  /** Confidence in the selection (if intent-driven). */
  confidence?: number;
}

export interface WorkflowExplanation {
  workflowName: string;
  versionId: string;
  summary: string;
  steps: StepExplanation[];
  generatedAt: string;
}

/**
 * Build an explanation for a single workflow step from its policy decision and
 * simulation result. Produces a human-readable, auditable record.
 */
export function explainStep(args: {
  step: WorkflowStep;
  index: number;
  policyDecision: PolicyDecision;
  simulation?: StepSimulation;
  confidence?: number;
}): StepExplanation {
  const { step, index, policyDecision, simulation, confidence } = args;

  const selectionReason = simulation
    ? `Selected "${step.tool}" for ${step.provider}: predicted ${simulation.predictedSuccess ? "success" : "failure"} (${simulation.predictedLatencyMs}ms)`
    : `Selected "${step.tool}" for ${step.provider}`;

  const constraints: string[] = [];
  if (policyDecision.matchedRules.includes("blocked-action")) constraints.push("Action blocklist enforced");
  if (policyDecision.matchedRules.includes("destructive-requires-approval")) constraints.push("Destructive tool requires approval");
  if (policyDecision.matchedRules.includes("mass-operation")) constraints.push("Mass operation threshold applied");
  if (simulation && !simulation.predictedSuccess) constraints.push("Predicted to fail in simulation");

  return {
    stepIndex: index,
    tool: step.tool,
    provider: step.provider,
    selectionReason,
    constraints,
    policies: policyDecision.matchedRules,
    riskLevel: policyDecision.riskLevel,
    confidence,
  };
}

/**
 * Build a full workflow-level explanation summarizing every step, the policies
 * applied, and overall risk. Suitable for audit logs and operator dashboards.
 */
export function explainWorkflow(args: {
  workflowName: string;
  versionId: string;
  stepExplanations: StepExplanation[];
}): WorkflowExplanation {
  const { workflowName, versionId, stepExplanations } = args;
  const allRisks = stepExplanations.map((s) => s.riskLevel);
  const criticalCount = allRisks.filter((r) => r === "critical").length;
  const highCount = allRisks.filter((r) => r === "high").length;

  const summaryParts = [`Workflow "${workflowName}" v${versionId.slice(0, 8)}: ${stepExplanations.length} steps`];
  if (criticalCount > 0) summaryParts.push(`${criticalCount} critical-risk`);
  if (highCount > 0) summaryParts.push(`${highCount} high-risk`);

  return {
    workflowName,
    versionId,
    summary: summaryParts.join(", "),
    steps: stepExplanations,
    generatedAt: new Date().toISOString(),
  };
}

/** Render a step explanation to a concise, human-readable string. */
export function renderStepExplanation(explanation: StepExplanation): string {
  const parts = [`[${explanation.stepIndex}] ${explanation.provider}:${explanation.tool}`];
  parts.push(`  Why: ${explanation.selectionReason}`);
  if (explanation.constraints.length > 0) parts.push(`  Constraints: ${explanation.constraints.join("; ")}`);
  parts.push(`  Risk: ${explanation.riskLevel}`);
  if (explanation.confidence !== undefined) parts.push(`  Confidence: ${(explanation.confidence * 100).toFixed(0)}%`);
  return parts.join("\n");
}
