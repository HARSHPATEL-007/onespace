import { N0VA1OGateway, RecipeDefinition, RecipeStep, RecipeSchedule } from '@n0va1o/core';

// ─── Workflow Capture ────────────────────────────────────────────────────────

export interface WorkflowCall {
  stepNumber: number;
  tool: string;
  parameters: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'success' | 'failure' | 'skipped';
  durationMs: number;
  timestamp: string;
}

export interface CapturedWorkflow {
  sessionId: string;
  agentId: string;
  calls: WorkflowCall[];
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  successRate: number;
}

export class WorkflowCapture {
  private workflows = new Map<string, CapturedWorkflow>();
  private activeWorkflows = new Map<string, WorkflowCall[]>();

  startCapture(sessionId: string, agentId: string): void {
    this.activeWorkflows.set(sessionId, []);
  }

  recordCall(sessionId: string, call: Omit<WorkflowCall, 'stepNumber' | 'timestamp'>): void {
    const calls = this.activeWorkflows.get(sessionId);
    if (!calls) return;

    calls.push({
      ...call,
      stepNumber: calls.length + 1,
      timestamp: new Date().toISOString(),
    });
  }

  endCapture(sessionId: string, agentId: string): CapturedWorkflow | undefined {
    const calls = this.activeWorkflows.get(sessionId);
    if (!calls || calls.length === 0) return undefined;

    const successCount = calls.filter(c => c.status === 'success').length;
    const totalDuration = calls.reduce((sum, c) => sum + c.durationMs, 0);

    const workflow: CapturedWorkflow = {
      sessionId,
      agentId,
      calls,
      startTime: calls[0]?.timestamp || new Date().toISOString(),
      endTime: calls[calls.length - 1]?.timestamp || new Date().toISOString(),
      totalDurationMs: totalDuration,
      successRate: successCount / calls.length,
    };

    this.workflows.set(sessionId, workflow);
    this.activeWorkflows.delete(sessionId);

    return workflow;
  }

  getWorkflow(sessionId: string): CapturedWorkflow | undefined {
    return this.workflows.get(sessionId);
  }
}

// ─── Recipe Compiler ─────────────────────────────────────────────────────────

export interface CompilationResult {
  recipeId: string;
  name: string;
  schema: string;
  steps: RecipeStep[];
  estimatedLatencyMs: number;
  requiresApproval: boolean;
  riskScore: number;
  generatedCode: string;
}

export class RecipeCompiler {
  private recipes = new Map<string, RecipeDefinition>();
  private capture = new WorkflowCapture();

  getCapture(): WorkflowCapture {
    return this.capture;
  }

  compileFromSession(
    sessionId: string,
    recipeName: string,
    description: string,
    schedule?: RecipeSchedule
  ): CompilationResult {
    const workflow = this.capture.getWorkflow(sessionId);
    if (!workflow) throw new Error('No captured workflow found for session');

    const recipeId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const steps = this.extractSteps(workflow);
    const estimatedLatency = this.estimateLatency(steps);
    const riskScore = this.calculateRiskScore(steps);

    const recipe: RecipeDefinition = {
      recipeId,
      name: recipeName,
      description,
      compiledSchema: 'pydantic_v2',
      executionEndpoint: `https://n0va1o.io/recipes/${recipeId}/execute`,
      estimatedLatencyMs: estimatedLatency,
      requiresApproval: riskScore >= 0.5,
      riskScore,
      version: '1.0.0',
      compiledAt: new Date().toISOString(),
      nextScheduledRun: schedule ? this.calculateNextRun(schedule) : undefined,
      schedule,
      steps,
    };

    this.recipes.set(recipeId, recipe);

    return {
      recipeId,
      name: recipeName,
      schema: recipe.compiledSchema,
      steps,
      estimatedLatencyMs: estimatedLatency,
      requiresApproval: recipe.requiresApproval,
      riskScore,
      generatedCode: this.generateCode(recipe),
    };
  }

  compileFromCalls(
    calls: WorkflowCall[],
    recipeName: string,
    description: string
  ): CompilationResult {
    const sessionId = `manual_${Date.now()}`;
    const agentId = 'manual_compilation';

    const workflow: CapturedWorkflow = {
      sessionId,
      agentId,
      calls,
      startTime: calls[0]?.timestamp || new Date().toISOString(),
      endTime: calls[calls.length - 1]?.timestamp || new Date().toISOString(),
      totalDurationMs: calls.reduce((sum, c) => sum + c.durationMs, 0),
      successRate: calls.filter(c => c.status === 'success').length / calls.length,
    };

    this.recipes.set(sessionId, workflow as unknown as RecipeDefinition);

    const recipeId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const steps = this.extractSteps(workflow);
    const estimatedLatency = this.estimateLatency(steps);
    const riskScore = this.calculateRiskScore(steps);

    const recipe: RecipeDefinition = {
      recipeId,
      name: recipeName,
      description,
      compiledSchema: 'pydantic_v2',
      executionEndpoint: `https://n0va1o.io/recipes/${recipeId}/execute`,
      estimatedLatencyMs: estimatedLatency,
      requiresApproval: riskScore >= 0.5,
      riskScore,
      version: '1.0.0',
      compiledAt: new Date().toISOString(),
      steps,
    };

    this.recipes.set(recipeId, recipe);

    return {
      recipeId,
      name: recipeName,
      schema: recipe.compiledSchema,
      steps,
      estimatedLatencyMs: estimatedLatency,
      requiresApproval: recipe.requiresApproval,
      riskScore,
      generatedCode: this.generateCode(recipe),
    };
  }

  getRecipe(recipeId: string): RecipeDefinition | undefined {
    return this.recipes.get(recipeId);
  }

  listRecipes(): RecipeDefinition[] {
    return Array.from(this.recipes.values());
  }

  async executeRecipe(recipeId: string, parameters?: Record<string, unknown>): Promise<{
    recipeId: string;
    status: 'success' | 'failure';
    results: Record<string, unknown>[];
    totalLatencyMs: number;
  }> {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) throw new Error('Recipe not found');

    const results: Record<string, unknown>[] = [];
    const startTime = Date.now();

    for (const step of recipe.steps) {
      try {
        // In production: execute via N0VA1O gateway
        const stepParams = { ...step.parameters, ...parameters };
        results.push({
          step: step.stepNumber,
          tool: step.tool,
          status: 'success',
          parameters: stepParams,
        });
      } catch {
        if (step.onError === 'abort') break;
        if (step.onError === 'skip') continue;
        results.push({ step: step.stepNumber, tool: step.tool, status: 'failure' });
      }
    }

    return {
      recipeId,
      status: 'success',
      results,
      totalLatencyMs: Date.now() - startTime,
    };
  }

  private extractSteps(workflow: CapturedWorkflow): RecipeStep[] {
    return workflow.calls
      .filter(call => call.status === 'success')
      .map(call => ({
        stepNumber: call.stepNumber,
        tool: call.tool,
        parameters: call.parameters,
        onError: 'skip' as const,
        retryCount: 3,
      }));
  }

  private estimateLatency(steps: RecipeStep[]): number {
    return steps.reduce((sum, step) => {
      const tool = N0VA1OGateway.getTool(step.tool);
      return sum + (tool?.estimatedLatencyMs || 500);
    }, 0);
  }

  private calculateRiskScore(steps: RecipeStep[]): number {
    let maxRisk = 0;
    for (const step of steps) {
      const { score } = N0VA1OGateway.assessRisk(step.tool, step.parameters);
      maxRisk = Math.max(maxRisk, score);
    }
    return maxRisk;
  }

  private calculateNextRun(schedule: RecipeSchedule): string {
    if (schedule.type === 'cron') {
      // Simplified: next day same time
      const next = new Date(Date.now() + 24 * 3600 * 1000);
      return next.toISOString();
    }
    return new Date(Date.now() + 3600 * 1000).toISOString();
  }

  private generateCode(recipe: RecipeDefinition): string {
    const stepsCode = recipe.steps.map(step => {
      const params = JSON.stringify(step.parameters, null, 6);
      return `    # Step ${step.stepNumber}: ${step.tool}
    result_${step.stepNumber} = await ${step.tool.split('.')[0]}.${step.tool.split('.')[1]}(${params})`;
    }).join('\n\n');

    return `# Auto-generated by N0VA1O Recipe Compiler
# Recipe: ${recipe.name}
# Version: ${recipe.version}
# Compiled: ${recipe.compiledAt}
# Risk Score: ${recipe.riskScore}

from pydantic import BaseModel, Field
from n0va1o.recipes import workflow, WorkflowContext

class ${recipe.name}Params(BaseModel):
    """Parameters for ${recipe.name}"""
    pass

@workflow(version="${recipe.version}", compiled_at="${recipe.compiledAt}")
async def execute(ctx: WorkflowContext):
    """${recipe.description}"""
${stepsCode}

    return {"status": "success", "steps_completed": ${recipe.steps.length}}
`;
  }
}

// ─── Recipe Scheduler ────────────────────────────────────────────────────────

export interface ScheduledExecution {
  recipeId: string;
  scheduledAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  parameters?: Record<string, unknown>;
}

export class RecipeScheduler {
  private scheduled: ScheduledExecution[] = [];
  private compiler: RecipeCompiler;

  constructor(compiler: RecipeCompiler) {
    this.compiler = compiler;
  }

  schedule(
    recipeId: string,
    schedule: RecipeSchedule,
    parameters?: Record<string, unknown>
  ): ScheduledExecution {
    const execution: ScheduledExecution = {
      recipeId,
      scheduledAt: this.calculateNextRun(schedule),
      status: 'pending',
      parameters,
    };

    this.scheduled.push(execution);
    return execution;
  }

  getPending(): ScheduledExecution[] {
    return this.scheduled.filter(e => e.status === 'pending');
  }

  async runPending(): Promise<void> {
    const pending = this.getPending();
    for (const execution of pending) {
      execution.status = 'running';
      try {
        await this.compiler.executeRecipe(execution.recipeId, execution.parameters);
        execution.status = 'completed';
      } catch {
        execution.status = 'failed';
      }
    }
  }

  private calculateNextRun(schedule: RecipeSchedule): string {
    if (schedule.type === 'cron') {
      const next = new Date(Date.now() + 24 * 3600 * 1000);
      return next.toISOString();
    }
    return new Date(Date.now() + 3600 * 1000).toISOString();
  }
}

// ─── Convenience exports ─────────────────────────────────────────────────────

export function createCompiler(): RecipeCompiler {
  return new RecipeCompiler();
}

export function createScheduler(compiler: RecipeCompiler): RecipeScheduler {
  return new RecipeScheduler(compiler);
}

export * from '@n0va1o/core';
