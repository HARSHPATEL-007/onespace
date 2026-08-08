export interface PolicyRule {
  id: string;
  name: string;
  condition: string;
  action: "allow" | "deny" | "require_approval";
  scope: string[];
}

export class PolicyCompiler {
  private rules: PolicyRule[] = [];

  addRule(name: string, condition: string, action: PolicyRule["action"], scope: string[]): void {
    this.rules.push({ id: "pol_" + Date.now().toString(36), name, condition, action, scope });
  }

  evaluate(context: { module: string; action: string; riskLevel: string }): { allowed: boolean; reason: string; requiresApproval: boolean } {
    for (const rule of this.rules) {
      if (rule.scope.includes(context.module) || rule.scope.includes("*")) {
        if (context.action.includes(rule.condition) || rule.condition === "*") {
          return { allowed: rule.action !== "deny", reason: rule.name, requiresApproval: rule.action === "require_approval" };
        }
      }
    }
    return { allowed: true, reason: "No matching policy - default allow", requiresApproval: false };
  }
}
