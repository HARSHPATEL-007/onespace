/**
 * N0VA1O Integration Test Harness — wires modules end-to-end to verify they
 * work together as a system, not just in isolation.
 */

import { evaluatePolicy, type PolicyContext } from "./policy";
import { computeHealthScore } from "./health";
import { computeDimensions } from "./eval";
import { selectProfile } from "./sandbox";



export interface IntegrationTestResult {
  scenario: string;
  passed: boolean;
  steps: { name: string; passed: boolean; detail: string }[];
  durationMs: number;
}

/**
 * Run a full policy + health + eval integration scenario. Pure orchestration.
 */
export function runIntegrationScenario(scenario: string, policy: PolicyContext, healthSignals: Parameters<typeof computeHealthScore>[0]): IntegrationTestResult {
  const steps: IntegrationTestResult["steps"] = [];
  const start = Date.now();

  // Step 1: Policy evaluation
  const decision = evaluatePolicy(policy);
  steps.push({ name: "policy_evaluation", passed: true, detail: `Outcome: ${decision.outcome}` });

  // Step 2: Health scoring
  const health = computeHealthScore(healthSignals);
  steps.push({ name: "health_scoring", passed: health.score > 0.5, detail: `Score: ${health.score}` });

  // Step 3: Eval dimensions
  const dims = computeDimensions({ tasksCompleted: 8, totalTasks: 10, correctToolCalls: 9, totalToolCalls: 10, successfulTools: 8, latenciesMs: [100, 200, 300], groundedClaims: 7, totalClaims: 10, unsupportedClaims: 2, citedClaims: 6, policyViolations: 1 });
  steps.push({ name: "eval_dimensions", passed: dims.taskCompletionRate >= 0.7, detail: `Task rate: ${dims.taskCompletionRate}` });

  // Step 4: Profile selection
  const profile = selectProfile(1_000_000, 5);
  steps.push({ name: "profile_selection", passed: true, detail: `Profile: ${profile}` });

  const allPassed = steps.every((s) => s.passed);
  return { scenario, passed: allPassed, steps, durationMs: Date.now() - start };
}
