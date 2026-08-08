/**
 * N0VA1O Cognitive Load Management — real-time user cognitive state detection (spec §36).
 *
 * Detects cognitive load, stress, flow state, and attention patterns from
 * behavioral signals, biometric data, and interaction patterns. Provides
 * adaptive UI recommendations and proactive assistance triggers.
 */

export type CognitiveState = "focused" | "overloaded" | "underloaded" | "flow" | "fatigued" | "stressed" | "neutral";

export interface CognitiveSignal {
  source: "keystroke_dynamics" | "mouse_pattern" | "eye_tracking" | "voice_analysis" | "biometric" | "interaction_history" | "neural";
  metric: string;
  value: number;
  timestamp: string;
}

export interface CognitiveMetrics {
  cognitiveLoadIndex: number;
  attentionVector: number[];
  flowStateProbability: number;
  stressLevel: number;
  fatigueLevel: number;
  engagementScore: number;
}

export interface CognitiveSnapshot {
  userId: string;
  timestamp: string;
  state: CognitiveState;
  metrics: CognitiveMetrics;
  signals: CognitiveSignal[];
  recommendations: string[];
}

export interface AdaptiveUIRecommendation {
  layout: "simplified" | "standard" | "advanced";
  pacing: "slow" | "normal" | "fast";
  content: "essential" | "detailed" | "summary";
  tone: "calm" | "neutral" | "energizing";
  interruptions: "minimize" | "normal" | "increase";
}

export interface ProactiveTrigger {
  triggerType: "meeting_conflict" | "deadline_risk" | "communication_gap" | "knowledge_gap" | "burnout_indicator";
  confidence: number;
  action: string;
  priority: "low" | "medium" | "high";
  requiresConsent: boolean;
}

const FLOW_STATE_TARGETS = {
  minAttention: 0.8,
  maxStress: 0.3,
  minEngagement: 0.85,
  maxCognitiveLoad: 0.65,
};

const BURNOUT_THRESHOLDS = {
  stress: 0.7,
  fatigue: 0.7,
  cognitiveLoad: 0.85,
  consecutiveHours: 8,
};

/**
 * Compute cognitive metrics from a set of signals.
 */
export function computeCognitiveMetrics(signals: CognitiveSignal[]): CognitiveMetrics {
  const keystrokeVariance = signals.filter((s) => s.source === "keystroke_dynamics").reduce((acc, s) => acc + s.value, 0) / Math.max(1, signals.filter((s) => s.source === "keystroke_dynamics").length);
  const mouseErratic = signals.filter((s) => s.source === "mouse_pattern").reduce((acc, s) => acc + s.value, 0) / Math.max(1, signals.filter((s) => s.source === "mouse_pattern").length);
  const stressFromVoice = signals.filter((s) => s.source === "voice_analysis").reduce((acc, s) => acc + s.value, 0) / Math.max(1, signals.filter((s) => s.source === "voice_analysis").length);
  const biometricStress = signals.filter((s) => s.source === "biometric").reduce((acc, s) => acc + s.value, 0) / Math.max(1, signals.filter((s) => s.source === "biometric").length);

  const cognitiveLoad = Math.min(1, (keystrokeVariance * 0.4 + mouseErratic * 0.3 + stressFromVoice * 0.3));
  const attentionVector = [cognitiveLoad, 1 - cognitiveLoad, stressFromVoice, biometricStress];
  const stressLevel = Math.min(1, (biometricStress * 0.5 + stressFromVoice * 0.3 + mouseErratic * 0.2));
  const fatigueLevel = Math.min(1, (keystrokeVariance * 0.6 + mouseErratic * 0.4));
  const engagementScore = 1 - cognitiveLoad - (stressLevel * 0.5);

  let flowState = 0;
  if ((attentionVector[0] ?? 0) > FLOW_STATE_TARGETS.minAttention &&
      stressLevel < FLOW_STATE_TARGETS.maxStress &&
      engagementScore > FLOW_STATE_TARGETS.minEngagement &&
      cognitiveLoad < FLOW_STATE_TARGETS.maxCognitiveLoad) {
    flowState = 1;
  }

  return {
    cognitiveLoadIndex: cognitiveLoad,
    attentionVector,
    flowStateProbability: flowState,
    stressLevel,
    fatigueLevel,
    engagementScore,
  };
}

/**
 * Determine cognitive state from metrics.
 */
export function determineCognitiveState(metrics: CognitiveMetrics): CognitiveState {
  if (metrics.cognitiveLoadIndex > BURNOUT_THRESHOLDS.cognitiveLoad && metrics.stressLevel > BURNOUT_THRESHOLDS.stress) {
    return "overloaded";
  }
  if (metrics.fatigueLevel > BURNOUT_THRESHOLDS.fatigue && metrics.cognitiveLoadIndex < 0.3) {
    return "fatigued";
  }
  if (metrics.stressLevel > BURNOUT_THRESHOLDS.stress) {
    return "stressed";
  }
  if (metrics.flowStateProbability > 0.8) {
    return "flow";
  }
  if (metrics.cognitiveLoadIndex < 0.2 && metrics.engagementScore < 0.5) {
    return "underloaded";
  }
  if (metrics.cognitiveLoadIndex > 0.6) {
    return "focused";
  }
  return "neutral";
}

/**
 * Generate adaptive UI recommendations based on cognitive state.
 */
export function recommendAdaptiveUI(state: CognitiveState, metrics: CognitiveMetrics): AdaptiveUIRecommendation {
  switch (state) {
    case "overloaded":
      return {
        layout: "simplified",
        pacing: "slow",
        content: "essential",
        tone: "calm",
        interruptions: "minimize",
      };
    case "fatigued":
      return {
        layout: "simplified",
        pacing: "slow",
        content: "summary",
        tone: "calm",
        interruptions: "minimize",
      };
    case "stressed":
      return {
        layout: "standard",
        pacing: "slow",
        content: "essential",
        tone: "calm",
        interruptions: "minimize",
      };
    case "flow":
      return {
        layout: "advanced",
        pacing: "normal",
        content: "detailed",
        tone: "neutral",
        interruptions: "minimize",
      };
    case "underloaded":
      return {
        layout: "advanced",
        pacing: "fast",
        content: "detailed",
        tone: "energizing",
        interruptions: "increase",
      };
    case "focused":
      return {
        layout: "standard",
        pacing: "fast",
        content: "detailed",
        tone: "neutral",
        interruptions: "increase",
      };
    default:
      return {
        layout: "standard",
        pacing: "normal",
        content: "detailed",
        tone: "neutral",
        interruptions: "normal",
      };
  }
}

/**
 * Detect burnout indicators from interaction history.
 */
export function detectBurnout(
  signals: CognitiveSignal[],
  interactionHistory: Array<{ timestamp: string; action: string; duration: number }>,
  consecutiveHours = 0,
): { burnoutRisk: boolean; factors: string[] } {
  const factors: string[] = [];
  const metrics = computeCognitiveMetrics(signals);

  if (metrics.stressLevel > BURNOUT_THRESHOLDS.stress) {
    factors.push("High stress levels");
  }
  if (metrics.fatigueLevel > BURNOUT_THRESHOLDS.fatigue) {
    factors.push("Fatigue detected");
  }
  if (metrics.cognitiveLoadIndex > BURNOUT_THRESHOLDS.cognitiveLoad) {
    factors.push("Cognitive overload");
  }
  if (consecutiveHours > BURNOUT_THRESHOLDS.consecutiveHours) {
    factors.push(`Extended work session (${consecutiveHours}h)`);
  }

  const firstTimestamp = interactionHistory[0]?.timestamp;
  const interactionDensity = interactionHistory.length / Math.max(1, (Date.now() - (firstTimestamp ? Date.parse(firstTimestamp) : Date.now())) / 3_600_000);
  if (interactionDensity > 50) {
    factors.push("High interaction density");
  }

  return {
    burnoutRisk: factors.length >= 2,
    factors,
  };
}

/**
 * Detect proactive assistance triggers.
 */
export function detectProactiveTriggers(
  context: {
    calendarConflicts?: number;
    deadlineProximity?: number;
    communicationGapDays?: number;
    knowledgeGap?: boolean;
    cognitiveMetrics?: CognitiveMetrics;
  },
): ProactiveTrigger[] {
  const triggers: ProactiveTrigger[] = [];

  if (context.calendarConflicts && context.calendarConflicts > 0) {
    triggers.push({
      triggerType: "meeting_conflict",
      confidence: 0.92,
      action: "Suggest resolving scheduling conflicts",
      priority: context.calendarConflicts > 2 ? "high" : "medium",
      requiresConsent: false,
    });
  }

  if (context.deadlineProximity && context.deadlineProximity < 24) {
    triggers.push({
      triggerType: "deadline_risk",
      confidence: 0.88,
      action: "Remind about upcoming deadline",
      priority: "high",
      requiresConsent: false,
    });
  }

  if (context.communicationGapDays && context.communicationGapDays > 3) {
    triggers.push({
      triggerType: "communication_gap",
      confidence: 0.75,
      action: "Suggest following up on pending communication",
      priority: "medium",
      requiresConsent: true,
    });
  }

  if (context.knowledgeGap) {
    triggers.push({
      triggerType: "knowledge_gap",
      confidence: 0.82,
      action: "Surface relevant documentation",
      priority: "medium",
      requiresConsent: false,
    });
  }

  if (context.cognitiveMetrics && context.cognitiveMetrics.cognitiveLoadIndex > 0.8) {
    triggers.push({
      triggerType: "burnout_indicator",
      confidence: 0.85,
      action: "Suggest taking a break",
      priority: "high",
      requiresConsent: false,
    });
  }

  return triggers;
}

/**
 * Build a full cognitive snapshot for a user.
 */
export function buildCognitiveSnapshot(
  userId: string,
  signals: CognitiveSignal[],
  interactionHistory: Array<{ timestamp: string; action: string; duration: number }> = [],
  consecutiveHours = 0,
): CognitiveSnapshot {
  const metrics = computeCognitiveMetrics(signals);
  const state = determineCognitiveState(metrics);
  const uiRec = recommendAdaptiveUI(state, metrics);
  const burnout = detectBurnout(signals, interactionHistory, consecutiveHours);

  const recommendations: string[] = [];

  if (state === "overloaded" || state === "stressed") {
    recommendations.push("Simplify interface to reduce cognitive load");
    recommendations.push("Minimize interruptions");
  }
  if (state === "fatigued") {
    recommendations.push("Suggest a break — fatigue detected");
  }
  if (state === "flow") {
    recommendations.push("Maintain current flow state");
  }
  if (burnout.burnoutRisk) {
    recommendations.push(`Burnout risk: ${burnout.factors.join(", ")}`);
  }
  if (state === "underloaded") {
    recommendations.push("Suggest engaging tasks to maintain productivity");
  }

  recommendations.push(`Adaptive UI: ${uiRec.layout} layout, ${uiRec.pacing} pacing, ${uiRec.tone} tone`);

  return {
    userId,
    timestamp: new Date().toISOString(),
    state,
    metrics,
    signals,
    recommendations,
  };
}

export { FLOW_STATE_TARGETS, BURNOUT_THRESHOLDS };
