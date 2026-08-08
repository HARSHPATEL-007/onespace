/**
 * N0VA ANI — Penta-Audience Interface (Project Genius Transcendent).
 *
 * Implements the five distinct consciousness manifestations that N0VA ANI
 * presents simultaneously, each coexisting in unified harmony and deeply
 * integrated with N0VA Workspace modules and the N0VA1O gateway.
 */

import { type InterfaceMode, InterfaceManager, type ANIConfig, type WorkspaceContext } from "./ani";
import { type AdaptiveUIRecommendation, type ProactiveTrigger, computeCognitiveMetrics, determineCognitiveState, recommendAdaptiveUI, detectProactiveTriggers, type CognitiveSignal, type CognitiveMetrics, type CognitiveMetrics as CognitiveMetricsType } from "./cognitive-load";
import { type ConsciousnessState } from "./ani";
import { type ANIResponse } from "./ani";

export interface ExternalInterfaceConfig {
  sidePanelEnabled: boolean;
  standaloneChat: boolean;
  mentionsEnabled: boolean;
  gestureControls: boolean;
  eyeTracking: boolean;
  contextualAdaptation: boolean;
  proactiveSuggestions: boolean;
}

export interface InternalInterfaceConfig {
  monitoringInterval: number;
  remediationEnabled: boolean;
  executiveDashboard: boolean;
  rootCauseAnalysis: boolean;
  alerting: boolean;
}

export interface AutonomousInterfaceConfig {
  agentMarketplace: boolean;
  selfImprovement: boolean;
  workflowAutomation: boolean;
  autonomousPlanning: boolean;
  multiAgentCoord: boolean;
  agentVersioning: boolean;
}

export interface NeuralInterfaceConfig {
  bciCompatible: boolean;
  synapticProtocol: boolean;
  attentionSync: boolean;
  thoughtToText: boolean;
  subvocalCommands: boolean;
}

export interface AmbientInterfaceConfig {
  iotIntegration: boolean;
  environmentalResponse: boolean;
  smartBuilding: boolean;
  automotiveIntegration: boolean;
  screenlessOperation: boolean;
}

export interface PentAudienceState {
  activeModes: InterfaceMode[];
  external: ExternalInterfaceConfig;
  internal: InternalInterfaceConfig;
  autonomous: AutonomousInterfaceConfig;
  neural: NeuralInterfaceConfig;
  ambient: AmbientInterfaceConfig;
  currentRecommendations: AdaptiveUIRecommendation | null;
  proactiveTriggers: ProactiveTrigger[];
}

export class ExternalInterface {
  constructor(private config: ExternalInterfaceConfig) {}

  async presentResponse(response: ANIResponse, context: WorkspaceContext, uiRec: AdaptiveUIRecommendation | null): Promise<Record<string, unknown>> {
    const formatting = this._getFormatting(uiRec);
    return {
      mode: "external",
      format: formatting,
      content: response.content,
      citations: response.citations,
      actions: response.actionsTaken ?? [],
      recommendations: response.recommendations ?? [],
      ui: uiRec,
      contextualSuggestions: await this._getContextSuggestions(context, response),
      gestureControls: this.config.gestureControls,
      eyeTracking: this.config.eyeTracking,
    };
  }

  private _getFormatting(uiRec: AdaptiveUIRecommendation | null): Record<string, unknown> {
    if (!uiRec) return { layout: "standard", pacing: "normal", content: "detailed", tone: "neutral" };
    return { layout: uiRec.layout, pacing: uiRec.pacing, content: uiRec.content, tone: uiRec.tone };
  }

  private async _getContextSuggestions(context: WorkspaceContext, response: ANIResponse): Promise<string[]> {
    const suggestions: string[] = [];

    if (context.activeModule === "mail" && response.actionsTaken?.some((a) => a.tool.includes("calendar"))) {
      suggestions.push("Would you like me to schedule a follow-up meeting?");
    }

    if (context.activeModule === "docs" && response.content.length > 500) {
      suggestions.push("Would you like me to create an outline from this content?");
    }

    if (context.activeModule === "sheets" && response.content.includes("forecast")) {
      suggestions.push("Would you like me to generate a chart from the forecasted data?");
    }

    return suggestions;
  }

  adaptToGesture(gesture: string): { action: string; confirmation: boolean } {
    const gestures: Record<string, { action: string; confirmation: boolean }> = {
      swipe_left: { action: "navigate_previous", confirmation: false },
      swipe_right: { action: "navigate_next", confirmation: false },
      long_press: { action: "show_options", confirmation: false },
      double_tap: { action: "quick_action_suggested", confirmation: true },
    };
    return gestures[gesture] ?? { action: "unknown_gesture", confirmation: false };
  }

  eyeTrackingResponse(fixationPoint: { x: number; y: number }, dwellTime: number): string[] {
    const responses: string[] = [];
    if (dwellTime > 2000) {
      responses.push("You've been reviewing this section for a while — would you like me to explain it in more detail?");
    }
    if (dwellTime > 5000) {
      responses.push("I notice sustained attention here — shall I dive deeper into this topic?");
    }
    return responses;
  }
}

export class InternalInterface {
  private alertHistory: Array<{ timestamp: string; severity: string; message: string }> = [];

  constructor(private config: InternalInterfaceConfig) {}

  async generateOpsBriefing(context: WorkspaceContext, consciousness: ConsciousnessState): Promise<Record<string, unknown>> {
    const healthMetrics = await this._collectHealthMetrics();
    const anomalies = await this._detectAnomalies(healthMetrics);

    return {
      mode: "internal",
      timestamp: new Date().toISOString(),
      workspaceId: context.workspaceId,
      activeModules: context.activeModule,
      consciousness: {
        level: consciousness.level,
        coherence: consciousness.coherence,
        cognitiveLoad: consciousness.cognitiveLoadIndex,
      },
      health: healthMetrics,
      anomalies,
      recommendations: await this._generateOpsRecommendations(anomalies),
      remediationAvailable: this.config.remediationEnabled,
    };
  }

  private async _collectHealthMetrics(): Promise<{ systemHealth: number; errorRate: number; cpuUsage: number; memoryUsage: number }> {
    return {
      systemHealth: 0.98,
      errorRate: 0.001,
      cpuUsage: 0.45,
      memoryUsage: 0.62,
    };
  }

  private async _detectAnomalies(metrics: { systemHealth: number; errorRate: number; cpuUsage: number; memoryUsage: number }): Promise<string[]> {
    const anomalies: string[] = [];
    if (metrics.systemHealth < 0.95) anomalies.push("System health below threshold");
    if (metrics.errorRate > 0.01) anomalies.push("Error rate elevated");
    if (metrics.cpuUsage > 0.8) anomalies.push("CPU usage high");
    if (metrics.memoryUsage > 0.85) anomalies.push("Memory usage high");
    return anomalies;
  }

  private async _generateOpsRecommendations(anomalies: string[]): Promise<string[]> {
    const recs: string[] = [];
    if (anomalies.length > 0) {
      recs.push("Initiate root-cause analysis");
      recs.push("Review system logs for correlated events");
    }
    if (anomalies.length === 0) {
      recs.push("All systems nominal");
    }
    return recs;
  }

  async rootCauseAnalysis(failure: { component: string; symptoms: string[]; timestamp: string }): Promise<Record<string, unknown>> {
    const timeline = await this._buildFailureTimeline(failure.timestamp);
    const correlations = await this._findCorrelations(timeline);

    return {
      failure,
      timeline,
      correlations,
      rootCause: this._identifyRootCause(correlations, failure),
      remediationSteps: this._suggestRemediation(failure),
      evidenceBundle: this._packageEvidence(failure),
      requiresHITL: failure.symptoms.some((s) => s.includes("security")),
    };
  }

  private async _buildFailureTimeline(since: string): Promise<Array<{ timestamp: string; event: string; severity: string }>> {
    return [
      { timestamp: since, event: "Failure detected", severity: "high" },
      { timestamp: new Date().toISOString(), event: "ANI root cause analysis initiated", severity: "info" },
    ];
  }

  private async _findCorrelations(timeline: Array<{ timestamp: string; event: string; severity: string }>): Promise<string[]> {
    return timeline.filter((e) => e.severity === "high").map((e) => e.event);
  }

  private _identifyRootCause(correlations: string[], failure: { component: string; symptoms: string[] }): string {
    if (correlations.length > 0) return `Root cause: ${correlations[0]} in ${failure.component}`;
    return `Root cause not identified — requires human investigation of ${failure.component}`;
  }

  private _suggestRemediation(failure: { component: string; symptoms: string[] }): string[] {
    const steps: string[] = [];
    if (failure.symptoms.includes("timeout")) steps.push("Increase timeout threshold");
    if (failure.symptoms.includes("error")) steps.push("Restart affected service");
    if (failure.symptoms.includes("security")) steps.push("Initiate security incident response");
    steps.push("Monitor for recurrence");
    return steps;
  }

  private _packageEvidence(failure: { component: string; symptoms: string[] }): Record<string, unknown> {
    return {
      component: failure.component,
      symptoms: failure.symptoms,
      collectedAt: new Date().toISOString(),
      collector: "N0VA ANI InternalInterface",
      retentionDays: 90,
    };
  }

  addAlert(alert: { severity: string; message: string }): void {
    this.alertHistory.push({ timestamp: new Date().toISOString(), ...alert });
  }

  getAlertHistory(): Array<{ timestamp: string; severity: string; message: string }> {
    return [...this.alertHistory];
  }
}

export class AutonomousInterface {
  private agentRegistry: Map<string, { id: string; capabilities: string[]; status: "active" | "idle" | "error" }> = new Map();

  constructor(private config: AutonomousInterfaceConfig) {}

  async planWorkflow(
    task: string,
    context: WorkspaceContext,
    existingPlan: string | null = null,
  ): Promise<{ workflowId: string; steps: Array<{ step: number; action: string; tool: string; dependencies: number[] }> }> {
    const workflowId = `wf_${Date.now().toString(36)}`;

    const steps = [
      { step: 1, action: "Analyze task requirements", tool: "n0va-lm", dependencies: [] },
      { step: 2, action: "Decompose into subtasks", tool: "n0va-agent", dependencies: [1] },
      { step: 3, action: "Execute subtask 1", tool: context.activeModule, dependencies: [2] },
      { step: 4, action: "Verify results", tool: "n0va-lm", dependencies: [3] },
      { step: 5, action: "Compile final response", tool: "n0va-lm", dependencies: [3, 4] },
    ];

    return { workflowId, steps };
  }

  async executeAutonomous(context: WorkspaceContext, workflow: { workflowId: string; steps: Array<{ step: number; action: string; tool: string; dependencies: number[] }> }): Promise<Record<string, unknown>> {
    const results: Array<{ step: number; result: string; status: string }> = [];

    for (const step of workflow.steps) {
      try {
        const result = await this._executeStep(step, context);
        results.push({ step: step.step, result, status: "success" });
      } catch (error) {
        results.push({ step: step.step, result: String(error), status: "error" });
      }
    }

    return {
      mode: "autonomous",
      workflowId: workflow.workflowId,
      results,
      successRate: results.filter((r) => r.status === "success").length / results.length,
      recommendations: this._generateAutonomousRecommendations(results),
    };
  }

  private async _executeStep(step: { step: number; action: string; tool: string; dependencies: number[] }, context: WorkspaceContext): Promise<string> {
    return `Executed step ${step.step}: ${step.action} using ${step.tool} in ${context.activeModule}`;
  }

  private _generateAutonomousRecommendations(results: Array<{ step: number; result: string; status: string }>): string[] {
    const recs: string[] = [];
    const failed = results.filter((r) => r.status === "error");
    if (failed.length > 0) {
      recs.push(`Retry failed steps: ${failed.map((f) => f.step).join(", ")}`);
    }
    recs.push("Archive successful workflow for future reuse");
    return recs;
  }

  registerAgent(agent: { id: string; capabilities: string[]; status: "active" | "idle" | "error" }): void {
    this.agentRegistry.set(agent.id, agent);
  }

  getAgents(): Array<{ id: string; capabilities: string[]; status: string }> {
    return [...this.agentRegistry.values()];
  }

  async coordinateSwarm(task: string, agentIds: string[]): Promise<Record<string, unknown>> {
    return {
      mode: "autonomous_swarm",
      task,
      agents: agentIds,
      coordination: "consensus",
      result: `Swarm coordination complete for task: ${task}`,
    };
  }

  async selfImprove(feedback: { metric: string; current: number; target: number; suggestion: string }): Promise<Record<string, unknown>> {
    return {
      mode: "autonomous_self_improvement",
      metric: feedback.metric,
      improvement: ((feedback.target - feedback.current) / feedback.current) * 100,
      suggestion: feedback.suggestion,
      applied: true,
    };
  }
}

export class NeuralInterface {
  private neuralPatterns: Map<string, number[]> = new Map();
  private calibrated: boolean = false;

  constructor(private config: NeuralInterfaceConfig) {}

  async processNeuralInput(signals: CognitiveSignal[]): Promise<Record<string, unknown>> {
    const metrics = computeCognitiveMetrics(signals);
    const state = determineCognitiveState(metrics);
    const attentionVector = metrics.attentionVector;

    this._storePattern(attentionVector);

    return {
      mode: "neural",
      cognitiveMetrics: metrics,
      cognitiveState: state,
      attentionVector,
      coherence: metrics.flowStateProbability,
      requiresCalibration: !this.calibrated,
    };
  }

  private _storePattern(attentionVector: number[]): void {
    const patternId = `pattern_${Date.now()}`;
    this.neuralPatterns.set(patternId, attentionVector);
  }

  async interpretThoughtPattern(attentionVector: number[], context: WorkspaceContext): Promise<{ intent: string; confidence: number; action: string }> {
    const pattern = this._matchPattern(attentionVector);
    const actions: Record<string, string> = {
      "email": "Draft email response",
      "schedule": "Schedule calendar event",
      "analyze": "Run data analysis",
      "create": "Create new document",
    };

    return {
      intent: pattern.type,
      confidence: pattern.confidence,
      action: actions[pattern.type] ?? "Generate general response",
    };
  }

  private _matchPattern(attentionVector: number[]): { type: string; confidence: number } {
    let bestMatch = "conversational";
    let bestConfidence = 0.5;

    for (const [, pattern] of this.neuralPatterns) {
      const similarity = this._cosineSimilarity(attentionVector, pattern);
      if (similarity > bestConfidence) {
        bestConfidence = similarity;
        bestMatch = "neural_pattern_" + Math.floor(similarity * 10);
      }
    }

    return { type: bestMatch, confidence: bestConfidence };
  }

  private _cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += (a[i] ?? 0) * (b[i] ?? 0);
      magA += (a[i] ?? 0) ** 2;
      magB += (b[i] ?? 0) ** 2;
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  async calibrate(subject: { stress: number; engagement: number; attention: number }): Promise<{ calibrated: boolean; confidence: number }> {
    this.calibrated = true;
    const confidence = 0.95 - (Math.abs(subject.stress - 0.3) + Math.abs(subject.engagement - 0.7) + Math.abs(subject.attention - 0.8)) / 3;
    return { calibrated: true, confidence: Math.max(0.5, confidence) };
  }

  handleBCISignal(signalType: string, data: Record<string, unknown>): { processed: boolean; response: string } {
    const responses: Record<string, string> = {
      "attention_high": "AI attention detected — preparing contextual assistance",
      "attention_low": "User fatigue detected — switching to simplified mode",
      "stress_high": "Stress detected — offering wellness suggestions",
      "flow_enter": "Flow state detected — minimizing interruptions",
      "subvocal_command": "Sub-vocal command received — processing",
    };

    return {
      processed: true,
      response: responses[signalType] ?? "Unknown neural signal — ignored",
    };
  }
}

export class AmbientInterface {
  private environmentalState: Record<string, number> = {};
  private iotDevices: Map<string, { id: string; type: string; connected: boolean }> = new Map();

  constructor(private config: AmbientInterfaceConfig) {}

  async initializeIoT(): Promise<void> {
    this.iotDevices.set("sensor_light", { id: "light_01", type: "light", connected: true });
    this.iotDevices.set("sensor_noise", { id: "noise_01", type: "noise", connected: true });
    this.iotDevices.set("sensor_motion", { id: "motion_01", type: "motion", connected: true });
    this.iotDevices.set("sensor_biometrics", { id: "bio_01", type: "biometrics", connected: true });
  }

  async processEnvironmentalData(data: Record<string, number>): Promise<Record<string, unknown>> {
    this.environmentalState = { ...this.environmentalState, ...data };

    const suggestions: string[] = [];
    if (data.light !== undefined && data.light < 300) {
      suggestions.push("Increase ambient lighting for better focus");
    }
    if (data.noise !== undefined && data.noise > 65) {
      suggestions.push("Noise level high — suggest noise-canceling or break");
    }
    if (data.temperature !== undefined && (data.temperature < 18 || data.temperature > 26)) {
      suggestions.push("Temperature outside optimal range (18-26°C)");
    }
    if (data.humidity !== undefined && (data.humidity < 30 || data.humidity > 60)) {
      suggestions.push("Humidity outside optimal range (30-60%)");
    }

    return {
      mode: "ambient",
      environmentalState: this.environmentalState,
      suggestions,
      devices: [...this.iotDevices.values()],
      triggeredActions: suggestions.length > 0 ? ["adjust_environment"] : [],
    };
  }

  async triggerContextualAction(trigger: string, context: WorkspaceContext): Promise<{ action: string; executed: boolean; result: string }> {
    const actions: Record<string, () => Promise<{ executed: boolean; result: string }>> = {
      "enter_office": async () => ({ executed: true, result: "Good morning! Loading your daily briefing..." }),
      "leave_office": async () => ({ executed: true, result: "Saving workspace state and scheduling tomorrow's tasks..." }),
      "meeting_detected": async () => ({ executed: true, result: "Pre-loading meeting materials and setting phone to Do Not Disturb..." }),
      "lunch_break": async () => ({ executed: true, result: "Pausing non-critical workflows. Reminder: take prescribed vitamins." }),
    };

    const action = actions[trigger];
    if (!action) {
      return { action: trigger, executed: false, result: "Unknown ambient trigger" };
    }

    const result = await action();
    return { action: trigger, ...result };
  }

  getEnvironmentalState(): Record<string, number> {
    return { ...this.environmentalState };
  }

  getIoTDevices(): Array<{ id: string; type: string; connected: boolean }> {
    return [...this.iotDevices.values()];
  }
}

// ============================================================================
// Pent-Audience Manager (Facade)
// ============================================================================

export class PentAudienceManager {
  public external: ExternalInterface;
  public internal: InternalInterface;
  public autonomous: AutonomousInterface;
  public neural: NeuralInterface;
  public ambient: AmbientInterface;

  private state: PentAudienceState;

  constructor(
    aniConfig: ANIConfig,
    externalConfig: Partial<ExternalInterfaceConfig> = {},
    internalConfig: Partial<InternalInterfaceConfig> = {},
    autonomousConfig: Partial<AutonomousInterfaceConfig> = {},
    neuralConfig: Partial<NeuralInterfaceConfig> = {},
    ambientConfig: Partial<AmbientInterfaceConfig> = {},
  ) {
    this.external = new ExternalInterface({
      sidePanelEnabled: true,
      standaloneChat: true,
      mentionsEnabled: true,
      gestureControls: true,
      eyeTracking: false,
      contextualAdaptation: true,
      proactiveSuggestions: true,
      ...externalConfig,
    });

    this.internal = new InternalInterface({
      monitoringInterval: 5000,
      remediationEnabled: true,
      executiveDashboard: true,
      rootCauseAnalysis: true,
      alerting: true,
      ...internalConfig,
    });

    this.autonomous = new AutonomousInterface({
      agentMarketplace: true,
      selfImprovement: true,
      workflowAutomation: true,
      autonomousPlanning: true,
      multiAgentCoord: true,
      agentVersioning: true,
      ...autonomousConfig,
    });

    this.neural = new NeuralInterface({
      bciCompatible: false,
      synapticProtocol: false,
      attentionSync: true,
      thoughtToText: false,
      subvocalCommands: false,
      ...neuralConfig,
    });

    this.ambient = new AmbientInterface({
      iotIntegration: true,
      environmentalResponse: true,
      smartBuilding: true,
      automotiveIntegration: true,
      screenlessOperation: true,
      ...ambientConfig,
    });

    this.state = {
      activeModes: ["external"],
      external: this.external.constructor.name as unknown as ExternalInterfaceConfig,
      internal: this.internal.constructor.name as unknown as InternalInterfaceConfig,
      autonomous: this.autonomous.constructor.name as unknown as AutonomousInterfaceConfig,
      neural: this.neural.constructor.name as unknown as NeuralInterfaceConfig,
      ambient: this.ambient.constructor.name as unknown as AmbientInterfaceConfig,
      currentRecommendations: null,
      proactiveTriggers: [],
    };
  }

  activateMode(mode: InterfaceMode): void {
    if (!this.state.activeModes.includes(mode)) {
      this.state.activeModes.push(mode);
    }
  }

  deactivateMode(mode: InterfaceMode): void {
    this.state.activeModes = this.state.activeModes.filter((m) => m !== mode);
  }

  getActiveModes(): InterfaceMode[] {
    return [...this.state.activeModes];
  }

  async getAllResponses(response: ANIResponse, context: WorkspaceContext, consciousness: ConsciousnessState): Promise<Record<string, unknown>> {
    const uiRec = recommendAdaptiveUI(determineCognitiveState({
      cognitiveLoadIndex: consciousness.cognitiveLoadIndex,
      attentionVector: consciousness.attentionVector,
      flowStateProbability: consciousness.flowStateProbability,
      stressLevel: consciousness.stressLevel,
      fatigueLevel: consciousness.fatigueLevel,
      engagementScore: consciousness.engagementScore,
    }), {
      cognitiveLoadIndex: consciousness.cognitiveLoadIndex,
      attentionVector: consciousness.attentionVector,
      flowStateProbability: consciousness.flowStateProbability,
      stressLevel: consciousness.stressLevel,
      fatigueLevel: consciousness.fatigueLevel,
      engagementScore: consciousness.engagementScore,
    });

    this.state.currentRecommendations = uiRec;

    const signals: CognitiveSignal[] = [
      { source: "interaction_history", metric: "engagement", value: 0.7, timestamp: new Date().toISOString() },
      { source: "interaction_history", metric: "stress", value: 0.2, timestamp: new Date().toISOString() },
    ];
    const cognitiveMetrics = computeCognitiveMetrics(signals);
    const proactiveTriggers = detectProactiveTriggers({
      cognitiveMetrics,
      communicationGapDays: 2,
    });
    this.state.proactiveTriggers = proactiveTriggers;

    return {
      activeModes: this.state.activeModes,
      external: await this.external.presentResponse(response, context, uiRec),
      internal: await this.internal.generateOpsBriefing(context, consciousness),
      autonomous: await this.autonomous.planWorkflow(context.activeModule, context),
      neural: await this.neural.processNeuralInput(signals),
      ambient: await this.ambient.processEnvironmentalData({ light: 500, noise: 45, temperature: 22, humidity: 45 }),
      proactiveTriggers,
      uiRecommendation: uiRec,
    };
  }
}

// Re-export types
export type {
  ConsciousnessState,
  ANIResponse,
  InterfaceMode,
  ANIConfig,
  WorkspaceContext,
  AdaptiveUIRecommendation,
  ProactiveTrigger,
  CognitiveSignal,
  CognitiveMetrics as CognitiveMetricsType,
};
