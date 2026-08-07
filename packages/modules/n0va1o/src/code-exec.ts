/**
 * N0VA1O Code Execution and Analysis — secure code-interpreter layer for
 * calculations, data transforms, parsing, and lightweight analytics inside
 * a sandbox with strict resource controls and auditability.
 */

import { evaluatePolicy, type PolicyContext } from "./policy";

/* ---------- code planner ---------- */

export type Language = "python" | "javascript";

export interface CodeTask {
  id: string;
  description: string;
  language: Language;
  code: string;
  inputFiles: string[];
  requiresExecution: boolean;
}

/**
 * Decide whether a task requires code execution. Pure function over a task
 * description. In production this uses an LLM; here it uses heuristic rules.
 */
export function planCodeExecution(description: string, availableData?: string[]): CodeTask {
  const lower = description.toLowerCase();
  const codeVerbs = /\b(calculate|compute|parse|transform|analyze|summarize|aggregate|filter|sort|convert|generate|chart|plot|csv|json|regex|formula|math|statistics?)\b/;
  const requiresExecution = codeVerbs.test(lower);
  const language: Language = /\b(javascript|node|js)\b/.test(lower) ? "javascript" : "python";
  return {
    id: `task_${Date.now().toString(32)}`,
    description,
    language,
    code: "",
    inputFiles: availableData ?? [],
    requiresExecution,
  };
}

/* ---------- policy gate ---------- */

export type RiskLevel = "low" | "medium" | "high";

export interface PolicyGateResult {
  approved: boolean;
  reason: string;
  elevatedScope: boolean;
  requiresApproval: boolean;
}

/**
 * Gate code execution by tenant policy and workflow risk. Pure.
 */
export function gateExecution(opts: { code: string; language: Language; policy: PolicyContext; tenantMaxRisk: RiskLevel }): PolicyGateResult {
  const risk = assessCodeRisk(opts.code);
  const decision = evaluatePolicy({ ...opts.policy, isDestructive: risk === "high" });
  if (decision.outcome === "DENY") {
    return { approved: false, reason: decision.disposition, elevatedScope: false, requiresApproval: false };
  }
  if (risk === "high" || decision.outcome === "REQUIRE_APPROVAL") {
    return { approved: risk !== "high", reason: "High-risk code requires approval", elevatedScope: true, requiresApproval: true };
  }
  return { approved: true, reason: "Approved by policy", elevatedScope: false, requiresApproval: false };
}

function assessCodeRisk(code: string): RiskLevel {
  const dangerous = /\b(eval|exec|os\.|subprocess|open\(|__import__|import subprocess|rm -rf|DELETE|DROP|shutdown)\b/;
  const medium = /\b(requests|urllib|http|fetch|write|file|socket)\b/;
  if (dangerous.test(code)) return "high";
  if (medium.test(code)) return "medium";
  return "low";
}

/* ---------- sandbox runner ---------- */

export interface ResourceQuota {
  cpu: number;
  ramMb: number;
  timeoutMs: number;
  diskMb: number;
  network: "none" | "filtered" | "full";
}

export const DEFAULT_QUOTA: ResourceQuota = { cpu: 1, ramMb: 512, timeoutMs: 30_000, diskMb: 100, network: "none" };

export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  artifactRefs: string[];
}

export interface SandboxRunRequest {
  code: string;
  language: Language;
  inputFiles: Record<string, string>;
  quota: ResourceQuota;
}

/**
 * Simulate sandboxed code execution with resource quotas. Pure function —
 * in production this runs in an isolated container; here it simulates the
 * outcome deterministically from the code content.
 */
export function runInSandbox(req: SandboxRunRequest): ExecutionResult {
  const start = Date.now();
  const result = simulateExecution(req);
  return { ...result, durationMs: Date.now() - start };
}

function simulateExecution(req: SandboxRunRequest): Omit<ExecutionResult, "durationMs"> {
  const code = req.code;
  if (assessCodeRisk(code) === "high" && req.quota.network === "none") {
    return { exitCode: 1, stdout: "", stderr: "SecurityError: high-risk operation blocked by sandbox", timedOut: false, artifactRefs: [] };
  }
  if (req.quota.timeoutMs < 1000) {
    return { exitCode: 124, stdout: "", stderr: "TimeoutError: execution exceeded time limit", timedOut: true, artifactRefs: [] };
  }
  if (/\b(error|throw|raise|Exception)\b/.test(code)) {
    return { exitCode: 1, stdout: "", stderr: "RuntimeError: execution failed", timedOut: false, artifactRefs: [] };
  }
  const outputs = generateOutputs(code);
  return { exitCode: 0, stdout: outputs.stdout, stderr: "", timedOut: false, artifactRefs: outputs.artifactRefs };
}

function generateOutputs(code: string): { stdout: string; artifactRefs: string[] } {
  if (/\b(print|console\.log|output|result)\b/.test(code)) {
    const match = code.match(/(?:print|console\.log)\s*\(?\s*["'`]?([^"'`\n]+)/);
    return { stdout: match ? match[1]!.trim() : "Execution completed", artifactRefs: [] };
  }
  if (/\b(csv|json|parse|transform)\b/.test(code)) {
    return { stdout: '{"rows_processed": 42}', artifactRefs: [`artifact_${Date.now().toString(32)}.json`] };
  }
  return { stdout: "Execution completed successfully", artifactRefs: [] };
}

/* ---------- artifact manager ---------- */

export interface Artifact {
  id: string;
  name: string;
  sourceTaskId: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  lineage: string[];
}

/**
 * Register an artifact from an execution. Pure — returns the artifact record.
 */
export function registerArtifact(opts: { name: string; sourceTaskId: string; contentType: string; sizeBytes: number; parentLineage?: string[] }): Artifact {
  return {
    id: `art_${Date.now().toString(32)}`,
    name: opts.name,
    sourceTaskId: opts.sourceTaskId,
    contentType: opts.contentType,
    sizeBytes: opts.sizeBytes,
    createdAt: new Date().toISOString(),
    lineage: opts.parentLineage ?? [],
  };
}

/* ---------- audit logger ---------- */

export interface AuditTrace {
  traceId: string;
  requester: string;
  taskId: string;
  code: string;
  language: Language;
  dataAccessed: string[];
  policyDecision: string;
  result: ExecutionResult;
  createdAt: string;
}

/**
 * Create an immutable audit trace for an execution. Pure.
 */
export function createAuditTrace(opts: { requester: string; taskId: string; code: string; language: Language; dataAccessed: string[]; policyDecision: string; result: ExecutionResult }): AuditTrace {
  return {
    traceId: `audit_${Date.now().toString(32)}`,
    requester: opts.requester,
    taskId: opts.taskId,
    code: opts.code,
    language: opts.language,
    dataAccessed: opts.dataAccessed,
    policyDecision: opts.policyDecision,
    result: opts.result,
    createdAt: new Date().toISOString(),
  };
}

/* ---------- retry and recovery ---------- */

export type FailureType = "deterministic" | "transient" | "timeout";

export interface RecoveryDecision {
  failureType: FailureType;
  reproducible: boolean;
  retryable: boolean;
  rerunFromSnapshot: boolean;
  reason: string;
}

/**
 * Classify an execution failure and decide recovery strategy. Pure.
 */
export function decideRecovery(result: ExecutionResult): RecoveryDecision {
  if (result.timedOut) {
    return { failureType: "timeout", reproducible: true, retryable: true, rerunFromSnapshot: true, reason: "Timeout — rerun from snapshot with higher quota" };
  }
  if (result.exitCode !== 0) {
    return { failureType: "deterministic", reproducible: true, retryable: false, rerunFromSnapshot: true, reason: "Deterministic failure — reproduce from stored inputs" };
  }
  return { failureType: "transient", reproducible: false, retryable: true, rerunFromSnapshot: false, reason: "Transient failure — safe to retry" };
}

/* ---------- evaluation ---------- */

export interface ExecutionMetrics {
  successRate: number;
  avgRuntimeMs: number;
  failureTypes: Record<string, number>;
  sandboxResourceConsumption: number;
}

/**
 * Measure code execution quality. Pure.
 */
export function measureExecution(results: ExecutionResult[]): ExecutionMetrics {
  const total = results.length;
  const successes = results.filter((r) => r.exitCode === 0).length;
  const avgRuntime = total > 0 ? results.reduce((s, r) => s + r.durationMs, 0) / total : 0;
  const failureTypes: Record<string, number> = {};
  for (const r of results) {
    if (r.exitCode !== 0) {
      const key = r.timedOut ? "timeout" : "runtime_error";
      failureTypes[key] = (failureTypes[key] ?? 0) + 1;
    }
  }
  const resourceConsumption = results.reduce((s, r) => s + r.durationMs, 0);
  return { successRate: total > 0 ? successes / total : 0, avgRuntimeMs: Math.round(avgRuntime), failureTypes, sandboxResourceConsumption: resourceConsumption };
}
