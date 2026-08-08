import { type WorkspaceContext, type IntentClass } from "./engine";

export interface ProactiveTrigger {
  id: string;
  type: string;
  confidence: number;
  message: string;
  suggestedAction?: string;
  module?: string;
  timestamp: string;
}

export interface BehavioralPrediction {
  userId: string;
  predictedAction: string;
  confidence: number;
  horizon: string;
  context: Record<string, unknown>;
}

export interface AnomalyPrediction {
  metric: string;
  predictedValue: number;
  threshold: number;
  direction: "above" | "below";
  confidence: number;
  horizonHours: number;
}

const PROACTIVE_TRIGGERS: Array<{
  type: string;
  detect: (ctx: WorkspaceContext, signals: number[]) => boolean;
  message: string;
  action?: string;
  module?: string;
}> = [
  {
    type: "meeting_conflict",
    detect: (ctx) => ctx.activeModule === "calendar",
    message: "You have a scheduling conflict in the next hour",
    action: "Resolve conflict",
    module: "calendar",
  },
  {
    type: "deadline_risk",
    detect: (ctx) => ctx.activeModule === "tasks",
    message: "A task deadline is approaching and may be at risk",
    action: "Reassign or extend deadline",
    module: "tasks",
  },
  {
    type: "communication_gap",
    detect: (ctx) => ctx.activeModule === "mail",
    message: "A client email has been unanswered for 48+ hours",
    action: "Draft follow-up",
    module: "mail",
  },
  {
    type: "knowledge_gap",
    detect: (ctx) => ctx.activeModule === "docs",
    message: "Relevant documents were recently updated in your project area",
    action: "Review updates",
    module: "docs",
  },
];

export class PredictiveIntelligenceEngine {
  private userPatterns: Map<string, number[]> = new Map();

  constructor(private readonly workspaceId: string) {}

  detectProactiveTriggers(
    context: WorkspaceContext,
    signals: number[] = [],
  ): ProactiveTrigger[] {
    const triggers: ProactiveTrigger[] = [];

    for (const trigger of PROACTIVE_TRIGGERS) {
      if (trigger.detect(context, signals)) {
        triggers.push({
          id: `trigger_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
          type: trigger.type,
          confidence: 0.75 + Math.random() * 0.2,
          message: trigger.message,
          suggestedAction: trigger.action,
          module: trigger.module,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return triggers.sort((a, b) => b.confidence - a.confidence);
  }

  predictBehavior(
    userId: string,
    context: WorkspaceContext,
  ): BehavioralPrediction {
    const pattern = this.userPatterns.get(userId) ?? [];
    const hour = new Date().getUTCHours();

    let predictedAction = "general_assistance";
    let confidence = 0.5;

    if (hour >= 9 && hour <= 11) {
      predictedAction = "email_management";
      confidence = 0.82;
    } else if (hour >= 14 && hour <= 16) {
      predictedAction = "meeting_preparation";
      confidence = 0.75;
    } else if (context.activeModule === "docs") {
      predictedAction = "document_editing";
      confidence = 0.88;
    } else if (context.activeModule === "crm") {
      predictedAction = "deal_management";
      confidence = 0.79;
    }

    return {
      userId,
      predictedAction,
      confidence:
        pattern.length > 5 ? Math.min(0.95, confidence + 0.1) : confidence,
      horizon: "1h",
      context: { activeModule: context.activeModule, hour },
    };
  }

  predictAnomalies(metrics: Record<string, number>): AnomalyPrediction[] {
    const predictions: AnomalyPrediction[] = [];

    for (const [metric, value] of Object.entries(metrics)) {
      if (value > 0.8) {
        predictions.push({
          metric,
          predictedValue: value * 1.15,
          threshold: 0.85,
          direction: "above",
          confidence: 0.78,
          horizonHours: 24,
        });
      } else if (value < 0.2) {
        predictions.push({
          metric,
          predictedValue: value * 0.8,
          threshold: 0.2,
          direction: "below",
          confidence: 0.72,
          horizonHours: 48,
        });
      }
    }

    return predictions;
  }

  recordBehaviorPattern(userId: string, action: string): void {
    const existing = this.userPatterns.get(userId) ?? [];
    const actionHash =
      (action.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 100) / 100;
    existing.push(actionHash);
    if (existing.length > 100) existing.shift();
    this.userPatterns.set(userId, existing);
  }

  getBurnoutRisk(
    userId: string,
    signals: {
      hoursWorked: number;
      stressLevel: number;
      taskCount: number;
      breakFrequency: number;
    },
  ): number {
    const weights = {
      hoursWorked: 0.3,
      stressLevel: 0.3,
      taskCount: 0.2,
      breakFrequency: -0.2,
    };
    const normalized = {
      hoursWorked: Math.min(1, signals.hoursWorked / 12),
      stressLevel: signals.stressLevel,
      taskCount: Math.min(1, signals.taskCount / 20),
      breakFrequency: signals.breakFrequency,
    };

    let risk = 0;
    for (const [key, weight] of Object.entries(weights)) {
      risk += normalized[key as keyof typeof normalized] * weight;
    }

    return Math.max(0, Math.min(1, risk));
  }
}

export function createPredictiveEngine(
  workspaceId: string,
): PredictiveIntelligenceEngine {
  return new PredictiveIntelligenceEngine(workspaceId);
}
