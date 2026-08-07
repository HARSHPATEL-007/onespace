/**
 * N0VA1O Human-Editable Recipe Templates — workflow intelligence (spec §4.1).
 *
 * Compiled recipes are editable through structured templates so operators can
 * adjust parameters, branching logic, and destination targets without
 * recompiling the entire workflow. Template edits preserve type safety and
 * validation.
 */

import { CompiledWorkflow, WorkflowStep, InMemoryWorkflowStore } from "./versioning";

export interface RecipeTemplate {
  workflowName: string;
  description: string;
  /** Editable parameters keyed by name, applied to matching steps. */
  parameters: RecipeParameter[];
  /** Branching logic: condition -> step index to jump to. */
  branches: RecipeBranch[];
  /** Destination targets overridable per step. */
  destinations: Record<string, string>;
}

export interface RecipeParameter {
  name: string;
  /** Which step field this parameter targets (e.g. "input.query"). */
  target: string;
  type: "string" | "number" | "boolean" | "array";
  required: boolean;
  defaultValue: unknown;
  description: string;
}

export interface RecipeBranch {
  /** Step index that contains the branch. */
  stepIndex: number;
  condition: string;
  /** Step index to jump to when condition is true. */
  jumpTo: number;
}

export interface TemplateValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Derive an editable template from a compiled workflow. The template captures
 * the workflow's structure so operators can tweak parameters and destinations
 * without touching the compiled version history.
 */
export function deriveTemplate(workflow: CompiledWorkflow): RecipeTemplate {
  const parameters: RecipeParameter[] = [];
  const destinations: Record<string, string> = {};

  workflow.steps.forEach((step, i) => {
    for (const [key, value] of Object.entries(step.input)) {
      const paramName = `${step.tool}.${key}`;
      if (!parameters.some((p) => p.name === paramName)) {
        parameters.push({
          name: paramName,
          target: `steps.${i}.input.${key}`,
          type: inferType(value),
          required: false,
          defaultValue: value,
          description: `Parameter ${key} for ${step.tool}`,
        });
      }
    }
    destinations[`${step.provider}:${step.tool}`] = step.provider;
  });

  return {
    workflowName: workflow.workflowName,
    description: workflow.description,
    parameters,
    branches: [],
    destinations,
  };
}

/**
 * Validate a template against the compiled workflow's schema. Ensures type
 * safety and that all referenced targets exist.
 */
export function validateTemplate(template: RecipeTemplate, workflow: CompiledWorkflow): TemplateValidation {
  const errors: string[] = [];
  for (const param of template.parameters) {
    if (!isValidType(param.defaultValue, param.type)) {
      errors.push(`Parameter "${param.name}" default value does not match type ${param.type}`);
    }
    if (!targetExists(param.target, workflow)) {
      errors.push(`Parameter "${param.name}" target "${param.target}" does not exist in workflow`);
    }
  }
  for (const branch of template.branches) {
    if (branch.stepIndex < 0 || branch.stepIndex >= workflow.steps.length) {
      errors.push(`Branch stepIndex ${branch.stepIndex} out of range`);
    }
    if (branch.jumpTo < 0 || branch.jumpTo >= workflow.steps.length) {
      errors.push(`Branch jumpTo ${branch.jumpTo} out of range`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Apply a validated template to produce a new set of steps. Returns the steps
 * without committing — the caller decides whether to commit as a new version.
 */
export function applyTemplate(
  template: RecipeTemplate,
  workflow: CompiledWorkflow,
): WorkflowStep[] {
  const steps = workflow.steps.map((s) => ({ ...s, input: { ...s.input } }));

  for (const param of template.parameters) {
    const match = param.target.match(/^steps\.(\d+)\.input\.(.+)$/);
    if (!match) continue;
    const idx = parseInt(match[1]!, 10);
    const field = match[2]!;
    if (idx >= 0 && idx < steps.length) {
      const step = steps[idx];
      if (!step) continue;
      (step.input as Record<string, unknown>)[field] = param.defaultValue;
    }
  }

  return steps;
}

/**
 * Commit a template as a new immutable version in the store. Preserves full
 * history — the original compiled workflow remains intact.
 */
export function commitTemplate(
  store: InMemoryWorkflowStore,
  template: RecipeTemplate,
  workflow: CompiledWorkflow,
  policyVersion: string,
): CompiledWorkflow {
  const steps = applyTemplate(template, workflow);
  return store.commit({
    workflowName: template.workflowName,
    description: template.description,
    steps,
    parentVersionId: workflow.versionId,
    policyVersion,
  });
}

function inferType(value: unknown): RecipeParameter["type"] {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  return "string";
}

function isValidType(value: unknown, type: RecipeParameter["type"]): boolean {
  switch (type) {
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    default: return typeof value === "string";
  }
}

function targetExists(target: string, workflow: CompiledWorkflow): boolean {
  const match = target.match(/^steps\.(\d+)\.input\.(.+)$/);
  if (!match) return false;
  const idx = parseInt(match[1]!, 10);
  const field = match[2]!;
  if (idx < 0 || idx >= workflow.steps.length) return false;
  const step = workflow.steps[idx];
  if (!step) return false;
  return Object.prototype.hasOwnProperty.call(step.input, field);
}
