export interface WorkspaceState {
  modules: Record<
    string,
    { lastUpdate: string; status: string; keyEntities: string[] }
  >;
  activeGoals: string[];
  recentActions: string[];
  timestamp: string;
}

export class HyperContextEngine {
  private state: WorkspaceState = {
    modules: {},
    activeGoals: [],
    recentActions: [],
    timestamp: new Date().toISOString(),
  };

  updateModule(
    moduleName: string,
    status: string,
    keyEntities: string[],
  ): void {
    this.state.modules[moduleName] = {
      lastUpdate: new Date().toISOString(),
      status,
      keyEntities,
    };
    this.state.timestamp = new Date().toISOString();
  }

  getUnifiedState(): WorkspaceState {
    return { ...this.state };
  }

  getCrossModuleInsights(): string[] {
    const insights: string[] = [];
    const modules = Object.keys(this.state.modules);
    if (modules.includes("calendar") && modules.includes("tasks")) {
      insights.push("Calendar and tasks synchronized");
    }
    if (modules.includes("crm") && modules.includes("mail")) {
      insights.push("CRM and mail data available for cross-reference");
    }
    return insights;
  }
}
