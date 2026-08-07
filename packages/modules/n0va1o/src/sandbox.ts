/**
 * N0VA1O Sandbox Profiles & Observability — sandbox layer (spec §5.1, §5.4).
 *
 * Resource-aware sandbox execution with light/standard/heavy profiles and
 * explicit CPU, RAM, timeout, disk, and network policies. Exposes execution
 * traces, stderr, memory spikes, runtime duration, and deterministic replay
 * identifiers attached to workflow logs and incident reports.
 */

export type SandboxProfile = "light" | "standard" | "heavy";

export interface ResourcePolicy {
  /** Max vCPUs allocated. */
  cpu: number;
  /** Max RAM in MB. */
  ramMb: number;
  /** Max execution time in seconds. */
  timeoutSec: number;
  /** Max disk in MB. */
  diskMb: number;
  /** Network access mode. */
  network: "none" | "filtered" | "full";
}

export interface SandboxProfileConfig {
  profile: SandboxProfile;
  policy: ResourcePolicy;
  /** When to auto-select this profile. */
  triggers: {
    maxPayloadBytes: number;
    maxComplexity: number;
  };
}

export const SANDBOX_PROFILES: Record<SandboxProfile, SandboxProfileConfig> = {
  light: {
    profile: "light",
    policy: { cpu: 1, ramMb: 512, timeoutSec: 60, diskMb: 100, network: "none" },
    triggers: { maxPayloadBytes: 1_000_000, maxComplexity: 3 },
  },
  standard: {
    profile: "standard",
    policy: { cpu: 2, ramMb: 4096, timeoutSec: 600, diskMb: 1000, network: "filtered" },
    triggers: { maxPayloadBytes: 50_000_000, maxComplexity: 7 },
  },
  heavy: {
    profile: "heavy",
    policy: { cpu: 8, ramMb: 16384, timeoutSec: 3600, diskMb: 10000, network: "full" },
    triggers: { maxPayloadBytes: Number.POSITIVE_INFINITY, maxComplexity: 10 },
  },
};

export interface ExecutionTrace {
  traceId: string;
  profile: SandboxProfile;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  peakMemoryMb: number;
  stderr: string;
  exitCode: number;
  replayId: string;
  memorySpikes: { atMs: number; memoryMb: number }[];
}

export interface ObservabilityEvent {
  traceId: string;
  type: "memory_spike" | "timeout_warning" | "stderr" | "completion";
  timestamp: string;
  details: string;
}

/**
 * Select the appropriate sandbox profile based on payload size and complexity.
 */
export function selectProfile(payloadBytes: number, complexity: number, tenantMax: SandboxProfile = "heavy"): SandboxProfile {
  const order: SandboxProfile[] = ["light", "standard", "heavy"];
  const maxIdx = order.indexOf(tenantMax);
  for (const profile of order) {
    const cfg = SANDBOX_PROFILES[profile];
    if (payloadBytes <= cfg.triggers.maxPayloadBytes && complexity <= cfg.triggers.maxComplexity) {
      const profileIdx = order.indexOf(profile);
      if (profileIdx <= maxIdx) return profile;
      return tenantMax;
    }
  }
  return tenantMax;
}

/**
 * Check whether a resource usage breaches the profile policy. Returns events
 * for any breach (memory spikes, timeouts).
 */
export function checkResourceUsage(trace: Partial<ExecutionTrace> & { profile: SandboxProfile; durationMs: number; peakMemoryMb: number }): ObservabilityEvent[] {
  const policy = SANDBOX_PROFILES[trace.profile].policy;
  const events: ObservabilityEvent[] = [];
  const now = new Date().toISOString();

  if (trace.peakMemoryMb > policy.ramMb) {
    events.push({ traceId: trace.traceId ?? "unknown", type: "memory_spike", timestamp: now, details: `Peak memory ${trace.peakMemoryMb}MB exceeded policy ${policy.ramMb}MB` });
  }
  if (trace.durationMs > policy.timeoutSec * 1000) {
    events.push({ traceId: trace.traceId ?? "unknown", type: "timeout_warning", timestamp: now, details: `Duration ${trace.durationMs}ms exceeded timeout ${policy.timeoutSec * 1000}ms` });
  }
  return events;
}

/** Generate a deterministic replay identifier for an execution trace. */
export function generateReplayId(inputs: Record<string, unknown>, profile: SandboxProfile): string {
  const content = JSON.stringify({ inputs, profile });
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `replay_${Math.abs(hash).toString(32)}`;
}

/** Build an execution trace from raw execution data. */
export function buildTrace(opts: {
  profile: SandboxProfile;
  startedAt: string;
  finishedAt: string;
  peakMemoryMb: number;
  stderr: string;
  exitCode: number;
  inputs: Record<string, unknown>;
}): ExecutionTrace {
  const durationMs = new Date(opts.finishedAt).getTime() - new Date(opts.startedAt).getTime();
  return {
    traceId: `trace_${Date.now().toString(32)}`,
    profile: opts.profile,
    startedAt: opts.startedAt,
    finishedAt: opts.finishedAt,
    durationMs,
    peakMemoryMb: opts.peakMemoryMb,
    stderr: opts.stderr,
    exitCode: opts.exitCode,
    replayId: generateReplayId(opts.inputs, opts.profile),
    memorySpikes: [],
  };
}
