export type WorkflowStatus =
  "running" | "retrying" | "failed" | "escalated" | "completed";

export interface WorkflowStep {
  id: string;
  action: string;
  status: WorkflowStatus;
  attempts: number;
  maxAttempts: number;
  fallbackStrategy?: string;
  error?: string;
}

export class SelfHealingWorkflow {
  private steps: WorkflowStep[] = [];
  private currentStep = 0;

  addStep(
    action: string,
    maxAttempts = 3,
    fallbackStrategy?: string,
  ): WorkflowStep {
    const step: WorkflowStep = {
      id: "ws_" + Date.now().toString(36),
      action,
      status: "running",
      attempts: 0,
      maxAttempts,
      fallbackStrategy,
    };
    this.steps.push(step);
    return step;
  }

  async execute(): Promise<{
    success: boolean;
    escalated: boolean;
    results: string[];
  }> {
    const results: string[] = [];
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      if (!step) continue;
      this.currentStep = i;
      let succeeded = false;

      for (let attempt = 1; attempt <= step.maxAttempts; attempt++) {
        step.attempts = attempt;
        try {
          step.status = attempt > 1 ? "retrying" : "running";
          results.push(
            "[" + step.action + "] attempt " + attempt + " succeeded",
          );
          step.status = "completed";
          succeeded = true;
          break;
        } catch {
          if (attempt === step.maxAttempts) {
            if (step.fallbackStrategy) {
              results.push(
                "[" +
                  step.action +
                  "] failed, using fallback: " +
                  step.fallbackStrategy,
              );
              succeeded = true;
              break;
            }
            step.status = "failed";
            step.error = "All attempts exhausted";
          }
        }
      }

      if (!succeeded) {
        if (i < this.steps.length - 1) {
          step.status = "escalated";
          results.push("[" + step.action + "] escalated to human review");
          return { success: false, escalated: true, results };
        }
        return { success: false, escalated: false, results };
      }
    }

    return { success: true, escalated: false, results };
  }
}
