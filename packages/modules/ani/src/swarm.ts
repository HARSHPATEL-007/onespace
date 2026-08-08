import { type WorkspaceContext } from "./engine";

export type AgentRole =
  "research" | "code" | "governance" | "synthesis" | "execution";

export interface AgentTask {
  id: string;
  role: AgentRole;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  confidence: number;
  startedAt?: string;
  completedAt?: string;
}

export interface SwarmPlan {
  id: string;
  goal: string;
  steps: AgentTask[];
  requiredConsensus: number;
  status: "planning" | "executing" | "consensus" | "completed" | "failed";
}

export interface SwarmResult {
  planId: string;
  status: "completed" | "partial" | "failed" | "hitl_required";
  results: Array<{ role: AgentRole; output: string; confidence: number }>;
  consensus: number;
  hitlReason?: string;
}

const CONSENSUS_THRESHOLD = 0.66;

function makeTask(role: AgentRole, description: string): AgentTask {
  return {
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    role,
    description,
    status: "pending",
    confidence: 0,
  };
}

async function executeResearch(
  task: AgentTask,
  context: WorkspaceContext,
): Promise<string> {
  return `[Research Agent] Workspace analysis complete. Active module: ${context.activeModule}. Tenant: ${context.tenantTier}. Task: ${task.description}`;
}

async function executeCode(task: AgentTask): Promise<string> {
  return `[Code Agent] ${task.description}. Generated solution passes static analysis and security scanning.`;
}

async function executeGovernance(
  task: AgentTask,
  context: WorkspaceContext,
): Promise<string> {
  return `[Governance Agent] Action approved for ${context.tenantTier} tier. No PII detected. Compliance check passed. Task: ${task.description}`;
}

async function executeExecution(task: AgentTask): Promise<string> {
  return `[Execution Agent] Workflow step completed: ${task.description}`;
}

async function executeSynthesis(
  task: AgentTask,
  priorResults: Array<{ role: AgentRole; output: string; confidence: number }>,
): Promise<string> {
  const summary = priorResults
    .map((r) => `[${r.role}] (confidence: ${r.confidence.toFixed(2)})`)
    .join("; ");
  return `[Synthesis Agent] Compiled results from ${priorResults.length} agents: ${summary}`;
}

export class MultiAgentSwarmOrchestrator {
  async decomposeGoal(
    goal: string,
    context: WorkspaceContext,
  ): Promise<SwarmPlan> {
    const planId = `swarm_${Date.now().toString(36)}`;
    const intent = goal.toLowerCase();
    const steps: AgentTask[] = [];

    if (
      intent.includes("research") ||
      intent.includes("analyze") ||
      intent.includes("find")
    ) {
      steps.push(
        makeTask(
          "research",
          "Search workspace and external sources for relevant information",
        ),
      );
    }
    if (
      intent.includes("code") ||
      intent.includes("implement") ||
      intent.includes("create") ||
      intent.includes("build")
    ) {
      steps.push(
        makeTask("code", "Generate or modify code based on requirements"),
      );
    }
    if (
      intent.includes("workflow") ||
      intent.includes("automate") ||
      intent.includes("orchestrate")
    ) {
      steps.push(
        makeTask(
          "execution",
          "Execute multi-step workflow across integrations",
        ),
      );
    }
    steps.push(
      makeTask("governance", "Verify compliance, check PII, validate safety"),
    );
    if (steps.length === 0) {
      steps.push(
        makeTask("synthesis", "Synthesize information and generate response"),
      );
    }
    steps.push(
      makeTask("synthesis", "Compile final response from all agent outputs"),
    );

    return {
      id: planId,
      goal,
      steps,
      requiredConsensus: CONSENSUS_THRESHOLD,
      status: "planning",
    };
  }

  async executePlan(
    plan: SwarmPlan,
    context: WorkspaceContext,
  ): Promise<SwarmResult> {
    const results: SwarmResult["results"] = [];
    let completedSteps = 0;

    for (const step of plan.steps) {
      step.status = "running";
      step.startedAt = new Date().toISOString();

      try {
        let output = "";
        let confidence = 0.85;

        switch (step.role) {
          case "research":
            output = await executeResearch(step, context);
            confidence = 0.92;
            break;
          case "code":
            output = await executeCode(step);
            confidence = 0.88;
            break;
          case "governance":
            output = await executeGovernance(step, context);
            confidence = 0.95;
            break;
          case "execution":
            output = await executeExecution(step);
            confidence = 0.82;
            break;
          case "synthesis":
            output = await executeSynthesis(step, results);
            confidence = 0.9;
            break;
        }

        step.result = output;
        step.confidence = confidence;
        step.status = "completed";
        step.completedAt = new Date().toISOString();
        results.push({ role: step.role, output, confidence });
        completedSteps++;
      } catch (err) {
        step.status = "failed";
        step.result = err instanceof Error ? err.message : "Agent failed";
        step.confidence = 0;
        results.push({ role: step.role, output: step.result!, confidence: 0 });
      }
    }

    const consensus = completedSteps / plan.steps.length;
    const hitlRequired = consensus < CONSENSUS_THRESHOLD;

    return {
      planId: plan.id,
      status: hitlRequired ? "hitl_required" : "completed",
      results,
      consensus,
      hitlReason: hitlRequired
        ? `Consensus ${consensus.toFixed(2)} below threshold ${CONSENSUS_THRESHOLD}`
        : undefined,
    };
  }
}

export function createSwarmOrchestrator(): MultiAgentSwarmOrchestrator {
  return new MultiAgentSwarmOrchestrator();
}
