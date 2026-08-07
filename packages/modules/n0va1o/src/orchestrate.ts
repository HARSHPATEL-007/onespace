/**
 * N0VA1O Orchestration Layer — composes all subsystems into a unified,
 * practical runtime. This is the single entry point that wires policy,
 * health, evaluation, logging, metrics, and execution into a coherent system.
 */

import { evaluatePolicy, POLICY_VERSION, type PolicyContext } from "./policy";
import { createLogger, generateCorrelationId, type Logger } from "./logging";
import { MetricsRegistry } from "./metrics";
import { checkSubsystem, aggregateHealth, type SubsystemHealth } from "./system-health";
import { loadConfig, type GatewayConfig } from "./config";

export interface N0va1oRuntime {
  config: GatewayConfig;
  logger: Logger;
  metrics: MetricsRegistry;
  correlationId: string;
}

export interface ToolInvocationRequest {
  provider: string;
  tool: string;
  input: Record<string, unknown>;
  actorLabel: string;
  userId?: string;
}

export interface ToolInvocationResult {
  ok: boolean;
  policyOutcome: string;
  policyVersion: string;
  correlationId: string;
  durationMs: number;
  message: string;
}

/**
 * Initialize the N0VA1O runtime. Pure factory — returns a configured runtime.
 */
export function createRuntime(overrides: Partial<GatewayConfig> = {}): N0va1oRuntime {
  const config = loadConfig(overrides);
  const correlationId = generateCorrelationId();
  const logger = createLogger({ module:"n0va1o", correlationId, level: config.logLevel });
  const metrics = new MetricsRegistry();
  return { config, logger, metrics, correlationId };
}

/**
 * Execute a tool invocation through the full policy + observability pipeline.
 * This is the core practical entry point. Pure orchestration.
 */
export function invokeTool(runtime: N0va1oRuntime, req: ToolInvocationRequest): ToolInvocationResult {
  const start = Date.now();
  const policyCtx: PolicyContext = { provider: req.provider, tool: req.tool, actorLabel: req.actorLabel, isDestructive: false, tokenState: "ACTIVE", inAllowlist: true, healthScore: 1 };

  runtime.logger.info("tool_invocation_started", { provider: req.provider, tool: req.tool });
  runtime.metrics.incrementCounter("tool_invocations_total", { provider: req.provider, tool: req.tool });

  const decision = evaluatePolicy(policyCtx);
  const durationMs = Date.now() - start;

  runtime.metrics.recordHistogram("tool_invocation_duration_ms", durationMs);
  runtime.logger.info("tool_invocation_completed", { outcome: decision.outcome, durationMs });

  return { ok: decision.outcome === "ALLOW", policyOutcome: decision.outcome, policyVersion: POLICY_VERSION, correlationId: runtime.correlationId, durationMs, message: decision.disposition };
}

/**
 * Get system health snapshot. Pure read over the runtime.
 */
export function getSystemHealth(runtime: N0va1oRuntime, subsystemChecks: Record<string, () => { ok: boolean; message: string }>): ReturnType<typeof aggregateHealth> {
  const subsystems: SubsystemHealth[] = Object.entries(subsystemChecks).map(([name, check]) => checkSubsystem(name, check));
  return aggregateHealth(subsystems, runtime.config.environment, 0);
}
