"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipeScheduler = exports.RecipeCompiler = exports.WorkflowCapture = void 0;
exports.createCompiler = createCompiler;
exports.createScheduler = createScheduler;
const core_1 = require("@n0va1o/core");
class WorkflowCapture {
    workflows = new Map();
    activeWorkflows = new Map();
    startCapture(sessionId, agentId) {
        this.activeWorkflows.set(sessionId, []);
    }
    recordCall(sessionId, call) {
        const calls = this.activeWorkflows.get(sessionId);
        if (!calls)
            return;
        calls.push({
            ...call,
            stepNumber: calls.length + 1,
            timestamp: new Date().toISOString(),
        });
    }
    endCapture(sessionId, agentId) {
        const calls = this.activeWorkflows.get(sessionId);
        if (!calls || calls.length === 0)
            return undefined;
        const successCount = calls.filter(c => c.status === 'success').length;
        const totalDuration = calls.reduce((sum, c) => sum + c.durationMs, 0);
        const workflow = {
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
    getWorkflow(sessionId) {
        return this.workflows.get(sessionId);
    }
}
exports.WorkflowCapture = WorkflowCapture;
class RecipeCompiler {
    recipes = new Map();
    capture = new WorkflowCapture();
    getCapture() {
        return this.capture;
    }
    compileFromSession(sessionId, recipeName, description, schedule) {
        const workflow = this.capture.getWorkflow(sessionId);
        if (!workflow)
            throw new Error('No captured workflow found for session');
        const recipeId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const steps = this.extractSteps(workflow);
        const estimatedLatency = this.estimateLatency(steps);
        const riskScore = this.calculateRiskScore(steps);
        const recipe = {
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
    compileFromCalls(calls, recipeName, description) {
        const sessionId = `manual_${Date.now()}`;
        const agentId = 'manual_compilation';
        const workflow = {
            sessionId,
            agentId,
            calls,
            startTime: calls[0]?.timestamp || new Date().toISOString(),
            endTime: calls[calls.length - 1]?.timestamp || new Date().toISOString(),
            totalDurationMs: calls.reduce((sum, c) => sum + c.durationMs, 0),
            successRate: calls.filter(c => c.status === 'success').length / calls.length,
        };
        this.recipes.set(sessionId, workflow);
        const recipeId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const steps = this.extractSteps(workflow);
        const estimatedLatency = this.estimateLatency(steps);
        const riskScore = this.calculateRiskScore(steps);
        const recipe = {
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
    getRecipe(recipeId) {
        return this.recipes.get(recipeId);
    }
    listRecipes() {
        return Array.from(this.recipes.values());
    }
    async executeRecipe(recipeId, parameters) {
        const recipe = this.recipes.get(recipeId);
        if (!recipe)
            throw new Error('Recipe not found');
        const results = [];
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
            }
            catch {
                if (step.onError === 'abort')
                    break;
                if (step.onError === 'skip')
                    continue;
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
    extractSteps(workflow) {
        return workflow.calls
            .filter(call => call.status === 'success')
            .map(call => ({
            stepNumber: call.stepNumber,
            tool: call.tool,
            parameters: call.parameters,
            onError: 'skip',
            retryCount: 3,
        }));
    }
    estimateLatency(steps) {
        return steps.reduce((sum, step) => {
            const tool = core_1.N0VA1OGateway.getTool(step.tool);
            return sum + (tool?.estimatedLatencyMs || 500);
        }, 0);
    }
    calculateRiskScore(steps) {
        let maxRisk = 0;
        for (const step of steps) {
            const { score } = core_1.N0VA1OGateway.assessRisk(step.tool, step.parameters);
            maxRisk = Math.max(maxRisk, score);
        }
        return maxRisk;
    }
    calculateNextRun(schedule) {
        if (schedule.type === 'cron') {
            // Simplified: next day same time
            const next = new Date(Date.now() + 24 * 3600 * 1000);
            return next.toISOString();
        }
        return new Date(Date.now() + 3600 * 1000).toISOString();
    }
    generateCode(recipe) {
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
exports.RecipeCompiler = RecipeCompiler;
class RecipeScheduler {
    scheduled = [];
    compiler;
    constructor(compiler) {
        this.compiler = compiler;
    }
    schedule(recipeId, schedule, parameters) {
        const execution = {
            recipeId,
            scheduledAt: this.calculateNextRun(schedule),
            status: 'pending',
            parameters,
        };
        this.scheduled.push(execution);
        return execution;
    }
    getPending() {
        return this.scheduled.filter(e => e.status === 'pending');
    }
    async runPending() {
        const pending = this.getPending();
        for (const execution of pending) {
            execution.status = 'running';
            try {
                await this.compiler.executeRecipe(execution.recipeId, execution.parameters);
                execution.status = 'completed';
            }
            catch {
                execution.status = 'failed';
            }
        }
    }
    calculateNextRun(schedule) {
        if (schedule.type === 'cron') {
            const next = new Date(Date.now() + 24 * 3600 * 1000);
            return next.toISOString();
        }
        return new Date(Date.now() + 3600 * 1000).toISOString();
    }
}
exports.RecipeScheduler = RecipeScheduler;
// ─── Convenience exports ─────────────────────────────────────────────────────
function createCompiler() {
    return new RecipeCompiler();
}
function createScheduler(compiler) {
    return new RecipeScheduler(compiler);
}
__exportStar(require("@n0va1o/core"), exports);
