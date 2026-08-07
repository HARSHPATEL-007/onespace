/**
 * N0VA1O Workflow Versioning and Rollback — core platform (spec §4.2 / §3.5).
 *
 * Compiled workflows are versioned with immutable identifiers. Prior versions
 * are preserved forever; diffs and rollback to the last-known-good version are
 * supported. Rollback preserves audit history and never overwrites historical
 * execution records.
 *
 * Implementation uses an append-only in-memory ledger keyed by workflow name.
 * In production this would persist to a `CompiledWorkflow` table; the interface
 * is intentionally storage-agnostic so the gateway can swap backends.
 */

export interface WorkflowStep {
  provider: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface CompiledWorkflow {
  /** Immutable version id (sha256 of content + parent). */
  versionId: string;
  workflowName: string;
  version: number;
  description: string;
  steps: WorkflowStep[];
  /** Parent version id, or null for the first version. */
  parentVersionId: string | null;
  /** Whether this version was promoted from a rollback. */
  rolledBackFrom?: string;
  compiledAt: string;
  policyVersion: string;
}

export interface WorkflowDiff {
  added: WorkflowStep[];
  removed: WorkflowStep[];
  unchanged: number;
}

export interface WorkflowStore {
  list(workflowName: string): CompiledWorkflow[];
  latest(workflowName: string): CompiledWorkflow | null;
  getVersion(versionId: string): CompiledWorkflow | null;
  commit(workflow: Omit<CompiledWorkflow, "versionId" | "compiledAt">): CompiledWorkflow;
  diff(fromVersionId: string, toVersionId: string): WorkflowDiff | null;
  rollback(workflowName: string, toVersionId: string): CompiledWorkflow | null;
}

/**
 * Append-only, immutable workflow ledger. Each commit produces a new version
 * with a content-addressed id, preserving every prior version.
 */
export class InMemoryWorkflowStore implements WorkflowStore {
  private readonly ledger = new Map<string, CompiledWorkflow[]>();
  private readonly byId = new Map<string, CompiledWorkflow>();

  list(workflowName: string): CompiledWorkflow[] {
    return [...(this.ledger.get(workflowName) ?? [])];
  }

  latest(workflowName: string): CompiledWorkflow | null {
    const versions = this.ledger.get(workflowName);
    if (!versions || versions.length === 0) return null;
    return versions[versions.length - 1] ?? null;
  }

  getVersion(versionId: string): CompiledWorkflow | null {
    return this.byId.get(versionId) ?? null;
  }

  commit(workflow: Omit<CompiledWorkflow, "versionId" | "compiledAt" | "version"> & { version?: number }): CompiledWorkflow {
    const existing = this.ledger.get(workflow.workflowName) ?? [];
    const nextVersion = existing.length + 1;
    const compiledAt = new Date().toISOString();
    const versionId = deriveVersionId(workflow.workflowName, nextVersion, workflow.steps, workflow.parentVersionId);
    const record: CompiledWorkflow = {
      ...workflow,
      version: nextVersion,
      versionId,
      compiledAt,
    };
    existing.push(record);
    this.ledger.set(workflow.workflowName, existing);
    this.byId.set(versionId, record);
    return record;
  }

  diff(fromVersionId: string, toVersionId: string): WorkflowDiff | null {
    const from = this.byId.get(fromVersionId);
    const to = this.byId.get(toVersionId);
    if (!from || !to) return null;
    const fromSteps = new Map(from.steps.map((s) => [stepKey(s), s]));
    const toSteps = new Map(to.steps.map((s) => [stepKey(s), s]));
    const added = to.steps.filter((s) => !fromSteps.has(stepKey(s)));
    const removed = from.steps.filter((s) => !toSteps.has(stepKey(s)));
    const unchanged = from.steps.filter((s) => toSteps.has(stepKey(s))).length;
    return { added, removed, unchanged };
  }

  /**
   * Roll back to a prior version by creating a NEW version whose steps match
   * the target. The target and all history remain intact — rollback never
   * overwrites. The new version is marked with rolledBackFrom for audit.
   */
  rollback(workflowName: string, toVersionId: string): CompiledWorkflow | null {
    const target = this.byId.get(toVersionId);
    if (!target || target.workflowName !== workflowName) return null;
    const existing = this.ledger.get(workflowName) ?? [];
    const nextVersion = existing.length + 1;
    const compiledAt = new Date().toISOString();
    const versionId = deriveVersionId(workflowName, nextVersion, target.steps, existing[existing.length - 1]?.versionId ?? null);
    const record: CompiledWorkflow = {
      workflowName,
      version: nextVersion,
      description: `${target.description} (rolled back to v${target.version})`,
      steps: target.steps.map((s) => ({ ...s })),
      parentVersionId: existing[existing.length - 1]?.versionId ?? null,
      rolledBackFrom: toVersionId,
      compiledAt,
      policyVersion: target.policyVersion,
      versionId,
    };
    existing.push(record);
    this.ledger.set(workflowName, existing);
    this.byId.set(versionId, record);
    return record;
  }
}

function stepKey(step: WorkflowStep): string {
  return `${step.provider}:${step.tool}`;
}

function deriveVersionId(name: string, version: number, steps: WorkflowStep[], parent: string | null): string {
  // Simple deterministic hash; in production use sha256.
  const content = JSON.stringify({ name, version, parent, steps });
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `wfv_${Math.abs(hash).toString(32)}_v${version}`;
}
