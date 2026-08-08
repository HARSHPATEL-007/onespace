export type CognitiveAction = "answer" | "search" | "delegate" | "wait" | "ask";

export interface ControlPlaneDecision {
  action: CognitiveAction;
  confidence: number;
  reason: string;
  riskLevel: "low" | "medium" | "high";
  intentClass: string;
  shouldDelegate: boolean;
  delegateTo?: string;
  questionForUser?: string;
  metadata: {
    intentConfidence: number;
    taskRisk: number;
    userWorkload: number;
    userPreferenceMatch: number;
    contextSufficiency: number;
  };
}

export class CognitiveControlPlane {
  decide(
    intentClass: string,
    intentConfidence: number,
    taskRisk: "low" | "medium" | "high",
    userPreference: {
      verbosity: string;
      proactive: boolean;
      autoExecute: number;
    },
    contextSufficiency: number,
  ): ControlPlaneDecision {
    const riskScore =
      taskRisk === "high" ? 0.9 : taskRisk === "medium" ? 0.5 : 0.1;
    const workload = this._estimateWorkload(intentClass);
    const prefMatch = this._preferenceMatch(intentClass, userPreference);

    if (intentConfidence < 0.4 && contextSufficiency < 0.5) {
      return this._decision(
        "ask",
        0.3,
        "Low confidence and insufficient context - need clarification",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    if (taskRisk === "high" && userPreference.autoExecute < 0.95) {
      return this._decision(
        "ask",
        0.7,
        "High risk action - user confirmation needed",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    if (contextSufficiency < 0.3) {
      return this._decision(
        "search",
        0.6,
        "Insufficient context - need to search workspace",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    if (
      intentClass === "action" &&
      taskRisk === "medium" &&
      userPreference.autoExecute >= 0.8
    ) {
      return this._decision(
        "delegate",
        0.8,
        "Action task - delegating to specialist agent",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    if (intentClass === "analytical" && contextSufficiency < 0.6) {
      return this._decision(
        "search",
        0.75,
        "Analytical query needs more data",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    if (intentClass === "conversational" || intentClass === "factual") {
      return this._decision(
        "answer",
        0.9,
        "Sufficient confidence to answer directly",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    if (intentConfidence > 0.8 && contextSufficiency > 0.7) {
      return this._decision(
        "answer",
        0.9,
        "High confidence and sufficient context",
        taskRisk,
        intentClass,
        {
          intentConfidence,
          taskRisk: riskScore,
          userWorkload: workload,
          userPreferenceMatch: prefMatch,
          contextSufficiency,
        },
      );
    }

    return this._decision(
      "search",
      0.6,
      "Default: gather more context before answering",
      taskRisk,
      intentClass,
      {
        intentConfidence,
        taskRisk: riskScore,
        userWorkload: workload,
        userPreferenceMatch: prefMatch,
        contextSufficiency,
      },
    );
  }

  private _decision(
    action: CognitiveAction,
    confidence: number,
    reason: string,
    riskLevel: "low" | "medium" | "high",
    intentClass: string,
    metadata: ControlPlaneDecision["metadata"],
  ): ControlPlaneDecision {
    return {
      action,
      confidence,
      reason,
      riskLevel,
      intentClass,
      shouldDelegate: action === "delegate",
      delegateTo:
        action === "delegate" ? this._selectSpecialist(intentClass) : undefined,
      metadata,
    };
  }

  private _selectSpecialist(intentClass: string): string {
    const map: Record<string, string> = {
      analytical: "research_agent",
      creative: "drafting_agent",
      action: "execution_agent",
      factual: "research_agent",
    };
    return map[intentClass] ?? "general_agent";
  }

  private _estimateWorkload(intentClass: string): number {
    const map: Record<string, number> = {
      conversational: 0.2,
      factual: 0.3,
      analytical: 0.7,
      creative: 0.6,
      action: 0.8,
    };
    return map[intentClass] ?? 0.5;
  }

  private _preferenceMatch(
    intentClass: string,
    pref: { verbosity: string; proactive: boolean; autoExecute: number },
  ): number {
    if (intentClass === "action" && pref.autoExecute > 0.7) return 0.9;
    if (intentClass === "conversational" && pref.verbosity === "concise")
      return 0.85;
    if (pref.proactive) return 0.8;
    return 0.5;
  }
}
