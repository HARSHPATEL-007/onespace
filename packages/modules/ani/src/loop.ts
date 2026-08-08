export type LoopPhase = "planning" | "executing" | "observing" | "revising" | "complete";

export interface LoopStep {
  id: string;
  phase: LoopPhase;
  action: string;
  expectedOutcome: string;
  actualOutcome?: string;
  success: boolean;
  timestamp: string;
  revision?: string;
}

export interface LoopState {
  id: string;
  goal: string;
  phase: LoopPhase;
  steps: LoopStep[];
  iteration: number;
  maxIterations: number;
  success: boolean;
}

export class PlannerExecutorObserverLoop {
  private loops: Map<string, LoopState> = new Map();

  startLoop(goal: string, maxIterations = 5): LoopState {
    const loop: LoopState = {
      id: "loop_" + Date.now().toString(36), goal, phase: "planning",
      steps: [], iteration: 0, maxIterations, success: false,
    };
    this.loops.set(loop.id, loop);
    return loop;
  }

  planStep(loopId: string, action: string, expectedOutcome: string): LoopStep | null {
    const loop = this.loops.get(loopId);
    if (!loop) return null;
    loop.phase = "planning";
    const step: LoopStep = {
      id: "ps_" + Date.now().toString(36), phase: "planning",
      action, expectedOutcome, success: false, timestamp: new Date().toISOString(),
    };
    loop.steps.push(step);
    return step;
  }

  executeStep(loopId: string, stepId: string, actualOutcome: string, success: boolean): LoopStep | null {
    const loop = this.loops.get(loopId);
    if (!loop) return null;
    loop.phase = "executing";
    const step = loop.steps.find((s) => s.id === stepId);
    if (!step) return null;
    step.actualOutcome = actualOutcome;
    step.success = success;
    return step;
  }

  observeAndRevise(loopId: string): { shouldRevise: boolean; reason: string } | null {
    const loop = this.loops.get(loopId);
    if (!loop) return null;
    loop.phase = "observing";
    loop.iteration++;

    const lastStep = loop.steps[loop.steps.length - 1];
    if (lastStep && !lastStep.success && loop.iteration < loop.maxIterations) {
      loop.phase = "revising";
      lastStep.revision = "Retrying with alternate strategy after failure: " + (lastStep.actualOutcome ?? "unknown");
      return { shouldRevise: true, reason: lastStep.revision };
    }

    if (loop.iteration >= loop.maxIterations || loop.steps.every((s) => s.success)) {
      loop.phase = "complete";
      loop.success = loop.steps.every((s) => s.success);
    }

    return { shouldRevise: false, reason: loop.success ? "All steps completed" : "Max iterations reached" };
  }

  getLoop(loopId: string): LoopState | null {
    return this.loops.get(loopId) ?? null;
  }
}
