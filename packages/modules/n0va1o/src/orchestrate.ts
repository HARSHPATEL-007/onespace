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
import { N0va1oGateway, type GatewayCallInput } from "./gateway";
import { isDestructiveTool, type ProviderInfo } from "./catalog";
import type { Integration } from "@n0va/db";

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
  /** Full integration record — required for real gateway execution. */
  integration?: Integration;
  /** Workspace ID for the integration (required for gateway). */
  workspaceId?: string;
}

export interface ToolInvocationResult {
  ok: boolean;
  policyOutcome: string;
  policyVersion: string;
  correlationId: string;
  durationMs: number;
  message: string;
  /** When the gateway was actually invoked, the real call result */
  gatewayResult?: { ok: boolean; statusCode: number; message: string; idempotencyKey: string };
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
 * If `integration` and `workspaceId` are provided, this performs a real gateway
 * call (authenticating against the provider, executing the adapter, recording
 * the audit log). Otherwise it runs policy evaluation + metrics only.
 */
export async function invokeTool(runtime: N0va1oRuntime, req: ToolInvocationRequest): Promise<ToolInvocationResult> {
  const start = Date.now();

  runtime.logger.info("tool_invocation_started", { provider: req.provider, tool: req.tool });
  runtime.metrics.incrementCounter("tool_invocations_total", { provider: req.provider, tool: req.tool });

  const decision = evaluatePolicy({
    provider: req.provider,
    tool: req.tool,
    actorLabel: req.actorLabel,
    isDestructive: isDestructiveTool(req.provider, req.tool),
    tokenState: "ACTIVE",
    inAllowlist: true,
    healthScore: 1,
  });

  let gatewayResult: ToolInvocationResult["gatewayResult"] | undefined;
  let message = decision.disposition;

  if (decision.outcome === "ALLOW" && req.integration && req.workspaceId) {
    const gateway = new N0va1oGateway();
    try {
      const res = await gateway.call({
        integration: req.integration,
        workspaceId: req.workspaceId,
        userId: req.userId,
        actorLabel: req.actorLabel,
        tool: req.tool,
        input: req.input,
        skipPolicyCheck: true,
      } as GatewayCallInput);
      gatewayResult = {
        ok: res.ok,
        statusCode: res.statusCode,
        message: res.message,
        idempotencyKey: res.idempotencyKey,
      };
      message = res.message;
    } catch (err) {
      gatewayResult = {
        ok: false,
        statusCode: err instanceof Error && "statusCode" in err ? (err as { statusCode: number }).statusCode : 500,
        message: err instanceof Error ? err.message : "Gateway call failed",
        idempotencyKey: "",
      };
      message = gatewayResult.message;
    }
  }

  const durationMs = Date.now() - start;

  runtime.metrics.recordHistogram("tool_invocation_duration_ms", durationMs);
  runtime.logger.info("tool_invocation_completed", { outcome: decision.outcome, durationMs, gatewayOk: gatewayResult?.ok });

  return {
    ok: decision.outcome === "ALLOW" && (gatewayResult?.ok ?? true),
    policyOutcome: decision.outcome,
    policyVersion: POLICY_VERSION,
    correlationId: runtime.correlationId,
    durationMs,
    message,
    gatewayResult,
  };
}

/**
 * Get system health snapshot. Pure read over the runtime.
 */
export function getSystemHealth(runtime: N0va1oRuntime, subsystemChecks: Record<string, () => { ok: boolean; message: string }>): ReturnType<typeof aggregateHealth> {
  const subsystems: SubsystemHealth[] = Object.entries(subsystemChecks).map(([name, check]) => checkSubsystem(name, check));
  return aggregateHealth(subsystems, runtime.config.environment, 0);
}
