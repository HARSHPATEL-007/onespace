/**
 * N0VA1O Centralized Configuration — env-based config with validation and
 * sensible defaults. Single source of truth for all module settings.
 */

export interface GatewayConfig {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";
  requestTimeoutMs: number;
  maxRetries: number;
  enablePolicy: boolean;
  enableHealthChecks: boolean;
  environment: "development" | "staging" | "production";
}

export const DEFAULT_CONFIG: GatewayConfig = {
  port: 3100,
  host: "0.0.0.0",
  logLevel: "info",
  requestTimeoutMs: 30_000,
  maxRetries: 3,
  enablePolicy: true,
  enableHealthChecks: true,
  environment: "development",
};

/**
 * Load config from environment variables with fallback to defaults. Pure.
 */
export function loadConfig(overrides: Partial<GatewayConfig> = {}, env: Record<string, string | undefined> = process.env): GatewayConfig {
  return {
    port: parseInt(env["N0VA1O_PORT"] ?? `${DEFAULT_CONFIG.port}`, 10) || DEFAULT_CONFIG.port,
    host: env["N0VA1O_HOST"] ?? DEFAULT_CONFIG.host,
    logLevel: (env["N0VA1O_LOG_LEVEL"] as GatewayConfig["logLevel"]) ?? DEFAULT_CONFIG.logLevel,
    requestTimeoutMs: parseInt(env["N0VA1O_REQUEST_TIMEOUT"] ?? `${DEFAULT_CONFIG.requestTimeoutMs}`, 10) || DEFAULT_CONFIG.requestTimeoutMs,
    maxRetries: parseInt(env["N0VA1O_MAX_RETRIES"] ?? `${DEFAULT_CONFIG.maxRetries}`, 10) || DEFAULT_CONFIG.maxRetries,
    enablePolicy: (env["N0VA1O_ENABLE_POLICY"] ?? "true") !== "false",
    enableHealthChecks: (env["N0VA1O_ENABLE_HEALTH"] ?? "true") !== "false",
    environment: (env["N0VA1O_ENV"] as GatewayConfig["environment"]) ?? DEFAULT_CONFIG.environment,
    ...overrides,
  };
}

/** Validate a loaded config. Pure. */
export function validateConfig(config: GatewayConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (config.port < 1 || config.port > 65535) errors.push("Invalid port");
  if (config.requestTimeoutMs < 100) errors.push("requestTimeoutMs too low");
  if (config.maxRetries < 0 || config.maxRetries > 10) errors.push("maxRetries out of range");
  return { valid: errors.length === 0, errors };
}
