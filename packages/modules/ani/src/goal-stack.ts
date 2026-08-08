export type GoalStatus = "pending" | "active" | "blocked" | "completed" | "failed" | "rolled_back";

export interface Goal {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  subgoals: string[];
  dependencies: string[];
  blockers: string[];
  rollbackPath: string[];
  createdAt: string;
  updatedAt: string;
  sessionId: string;
  metadata: Record<string, unknown>;
}

export class GoalStack {
  private goals: Map<string, Goal> = new Map();

  create(title: string, description: string, sessionId: string, priority = 5, dependencies: string[] = []): Goal {
    const goal: Goal = {
      id: "goal_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      title, description, status: "pending", priority,
      subgoals: [], dependencies, blockers: [], rollbackPath: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      sessionId, metadata: {},
    };
    this.goals.set(goal.id, goal);
    return goal;
  }

  addSubgoal(parentId: string, title: string, description: string): Goal | null {
    const parent = this.goals.get(parentId);
    if (!parent) return null;
    const subgoal = this.create(title, description, parent.sessionId, parent.priority - 1, [parentId]);
    parent.subgoals.push(subgoal.id);
    parent.updatedAt = new Date().toISOString();
    return subgoal;
  }

  activate(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;
    if (goal.blockers.length > 0) return false;
    goal.status = "active";
    goal.updatedAt = new Date().toISOString();
    return true;
  }

  block(goalId: string, reason: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;
    goal.status = "blocked";
    goal.blockers.push(reason);
    goal.updatedAt = new Date().toISOString();
    return true;
  }

  complete(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;
    goal.status = "completed";
    goal.updatedAt = new Date().toISOString();
    return true;
  }

  fail(goalId: string, reason: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;
    goal.status = "failed";
    goal.blockers.push(reason);
    goal.updatedAt = new Date().toISOString();
    return true;
  }

  rollback(goalId: string): string[] {
    const goal = this.goals.get(goalId);
    if (!goal) return [];
    const rolledBack: string[] = [];
    for (const step of goal.rollbackPath.reverse()) {
      rolledBack.push(step);
    }
    goal.status = "rolled_back";
    goal.updatedAt = new Date().toISOString();
    return rolledBack;
  }

  getActiveGoals(sessionId: string): Goal[] {
    return [...this.goals.values()].filter((g) => g.sessionId === sessionId && (g.status === "active" || g.status === "pending")).sort((a, b) => b.priority - a.priority);
  }

  getDependencyGraph(goalId: string): { goal: Goal; dependencies: Goal[]; subgoals: Goal[] } | null {
    const goal = this.goals.get(goalId);
    if (!goal) return null;
    return {
      goal,
      dependencies: goal.dependencies.map((id) => this.goals.get(id)).filter(Boolean) as Goal[],
      subgoals: goal.subgoals.map((id) => this.goals.get(id)).filter(Boolean) as Goal[],
    };
  }
}
