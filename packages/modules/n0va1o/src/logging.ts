/**
 * N0VA1O Structured Logging — JSON logs with correlation IDs for tracing
 * requests across modules. Lightweight, dependency-free, production-ready.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  module?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug: (message: string, metadata?: Record<string, unknown>) => void;
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
  child: (module: string, correlationId?: string) => Logger;
}

/**
 * Create a structured logger. Pure factory — returns an object with bound
 * config. Safe to use in any environment.
 */
export function createLogger(opts: { module?: string; correlationId?: string; level?: LogLevel } = {}): Logger {
  const minLevel = opts.level ?? "info";
  const levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

  function log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (levels[level] < levels[minLevel]) return;
    const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, correlationId: opts.correlationId, module: opts.module, metadata };
    const output = JSON.stringify(entry);
    if (level === "error") console.error(output);
    else if (level === "warn") console.warn(output);
    else console.log(output);
  }

  return {
    debug: (m, meta) => log("debug", m, meta),
    info: (m, meta) => log("info", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),
    child: (module, correlationId) => createLogger({ module, correlationId: correlationId ?? opts.correlationId, level: minLevel }),
  };
}

/** Generate a new correlation ID. Pure. */
export function generateCorrelationId(): string {
  return `corr_${Date.now().toString(32)}_${Math.random().toString(36).slice(2, 8)}`;
}
