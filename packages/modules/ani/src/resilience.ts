export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}

export interface ResilienceResult<T> {
  result: T | null;
  attempts: number;
  totalDurationMs: number;
  errors: Array<{ attempt: number; error: string; timestamp: string }>;
  degraded: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    "ECONNRESET",
    "ETIMEDOUT",
    "rate_limit",
    "timeout",
    "network",
    "503",
    "429",
  ],
};

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 1,
};

export class CircuitBreaker {
  private state: "closed" | "open" | "half-open" = "closed";
  private failures = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG) {}

  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenCalls = 0;
      } else if (fallback) {
        return fallback();
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    if (
      this.state === "half-open" &&
      this.halfOpenCalls >= this.config.halfOpenMaxCalls
    ) {
      if (fallback) return fallback();
      throw new Error("Circuit breaker half-open call limit reached");
    }

    if (this.state === "half-open") this.halfOpenCalls++;

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      if (fallback) return fallback();
      throw err;
    }
  }

  private _onSuccess(): void {
    this.failures = 0;
    if (this.state === "half-open") {
      this.state = "closed";
      this.halfOpenCalls = 0;
    }
  }

  private _onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.config.failureThreshold) {
      this.state = "open";
    }
  }

  getState(): { state: string; failures: number } {
    return { state: this.state, failures: this.failures };
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<ResilienceResult<T>> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  const errors: ResilienceResult<T>["errors"] = [];
  const startTime = Date.now();

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        result,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
        errors,
        degraded: false,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isRetryable = cfg.retryableErrors.some((e) =>
        errorMessage.toLowerCase().includes(e),
      );
      errors.push({
        attempt,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      if (attempt === cfg.maxAttempts || !isRetryable) {
        return {
          result: null,
          attempts: attempt,
          totalDurationMs: Date.now() - startTime,
          errors,
          degraded: true,
        };
      }

      const delay = Math.min(
        cfg.maxDelayMs,
        cfg.baseDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
      );
      await new Promise((r) => setTimeout(r, delay + Math.random() * 200));
    }
  }

  return {
    result: null,
    attempts: cfg.maxAttempts,
    totalDurationMs: Date.now() - startTime,
    errors,
    degraded: true,
  };
}

export class GracefulDegradation {
  private featureFlags: Map<string, boolean> = new Map();
  private healthChecks: Map<string, () => Promise<boolean>> = new Map();

  registerFeature(
    name: string,
    enabled: boolean,
    healthCheck?: () => Promise<boolean>,
  ): void {
    this.featureFlags.set(name, enabled);
    if (healthCheck) this.healthChecks.set(name, healthCheck);
  }

  async isAvailable(featureName: string): Promise<boolean> {
    if (!this.featureFlags.get(featureName)) return false;
    const check = this.healthChecks.get(featureName);
    if (!check) return true;
    try {
      return await check();
    } catch {
      return false;
    }
  }

  async getAvailableFeatures(): Promise<string[]> {
    const available: string[] = [];
    for (const [name] of this.featureFlags) {
      if (await this.isAvailable(name)) available.push(name);
    }
    return available;
  }

  getDegradedResponse(featureName: string): {
    available: boolean;
    fallback: string;
    message: string;
  } {
    const fallbacks: Record<string, { fallback: string; message: string }> = {
      deep_think: {
        fallback: "standard",
        message: "Deep Think temporarily unavailable — using standard mode",
      },
      voice_input: {
        fallback: "text",
        message: "Voice input unavailable — please type your message",
      },
      voice_output: {
        fallback: "text",
        message: "Voice output unavailable — response shown as text",
      },
      graph_3d: {
        fallback: "list",
        message: "3D visualization unavailable — showing list view",
      },
      meeting_intel: {
        fallback: "basic",
        message: "Meeting intelligence unavailable — basic mode active",
      },
      real_time_stream: {
        fallback: "batch",
        message: "Streaming unavailable — loading complete response",
      },
    };
    const fb = fallbacks[featureName] ?? {
      fallback: "basic",
      message: "Feature unavailable — using basic mode",
    };
    return { available: false, ...fb };
  }
}

export class ProductionMonitor {
  private metrics: Array<{
    timestamp: string;
    name: string;
    value: number;
    tags: Record<string, string>;
  }> = [];

  record(name: string, value: number, tags: Record<string, string> = {}): void {
    this.metrics.push({
      timestamp: new Date().toISOString(),
      name,
      value,
      tags,
    });
    if (this.metrics.length > 10000) this.metrics = this.metrics.slice(-5000);
  }

  getStats(
    name: string,
    windowMs: number = 300000,
  ): { avg: number; min: number; max: number; count: number; p95: number } {
    const cutoff = Date.now() - windowMs;
    const values = this.metrics
      .filter(
        (m) => m.name === name && new Date(m.timestamp).getTime() > cutoff,
      )
      .map((m) => m.value)
      .sort((a, b) => a - b);

    if (values.length === 0)
      return { avg: 0, min: 0, max: 0, count: 0, p95: 0 };

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: values[0]!,
      max: values[values.length - 1]!,
      count: values.length,
      p95:
        values[Math.floor(values.length * 0.95)] ?? values[values.length - 1]!,
    };
  }

  getHealth(): {
    status: "healthy" | "degraded" | "critical";
    issues: string[];
  } {
    const latencyStats = this.getStats("response_latency_ms");
    const errorRate = this.getStats("error_rate");
    const issues: string[] = [];

    if (latencyStats.p95 > 10000)
      issues.push(`High p95 latency: ${latencyStats.p95}ms`);
    if (errorRate.avg > 0.1)
      issues.push(`High error rate: ${(errorRate.avg * 100).toFixed(1)}%`);

    return {
      status:
        issues.length === 0
          ? "healthy"
          : issues.length > 1
            ? "critical"
            : "degraded",
      issues,
    };
  }
}
