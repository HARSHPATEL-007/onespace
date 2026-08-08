export type TransactionStatus = "pending" | "committed" | "rolled_back" | "failed";

export interface TransactionStep {
  module: string;
  action: string;
  target: string;
  status: TransactionStatus;
  rollbackAction?: string;
}

export class CrossModuleTransaction {
  private steps: TransactionStep[] = [];
  private status: TransactionStatus = "pending";

  addStep(module: string, action: string, target: string, rollbackAction?: string): void {
    this.steps.push({ module, action, target, status: "pending", rollbackAction });
  }

  commit(): { success: boolean; completed: number; failed: number } {
    let completed = 0;
    let failed = 0;

    for (const step of this.steps) {
      step.status = "committed";
      completed++;
    }

    this.status = failed > 0 ? "failed" : "committed";
    return { success: failed === 0, completed, failed };
  }

  rollback(): string[] {
    const rolledBack: string[] = [];
    for (const step of this.steps) {
      if (step.status === "committed" && step.rollbackAction) {
        step.status = "rolled_back";
        rolledBack.push(step.module + ":" + step.action);
      }
    }
    this.status = "rolled_back";
    return rolledBack;
  }

  getStatus(): { status: TransactionStatus; steps: TransactionStep[] } {
    return { status: this.status, steps: [...this.steps] };
  }
}
