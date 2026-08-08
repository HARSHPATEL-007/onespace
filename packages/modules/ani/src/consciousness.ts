import { type ConsciousnessState } from "./engine";

export type ConsciousnessLevel = "reactive" | "aware" | "reflective" | "transcendent";

export interface PerceptualSignal {
  type: "text" | "image" | "audio" | "video" | "structured" | "multimodal";
  source: string;
  intensity: number;
  timestamp: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface WorkingMemoryItem {
  id: string;
  type: "goal" | "context" | "task" | "observation";
  content: unknown;
  relevanceScore: number;
  createdAt: string;
  expiresAt?: string;
  accessCount: number;
  metadata: Record<string, unknown>;
}

export interface LongTermMemoryEntry {
  id: string;
  category: "semantic" | "procedural" | "emotional" | "experiential";
  content: unknown;
  embedding: number[];
  accessCount: number;
  lastAccessed: string;
  consolidationStrength: number;
  emotionalValence: number;
}

export interface MetaCognitionSnapshot {
  strategyInUse: string;
  errorDetected: boolean;
  correctionApplied: boolean;
  confidenceInDecision: number;
  alternativeStrategiesConsidered: number;
  reflectionQuality: number;
}

export interface QuantumConsciousnessState {
  entanglementFidelity: number;
  superpositionCoherence: number;
  qkdChannelStatus: "active" | "inactive" | "degraded";
  quantumSignature: string;
}

export interface ConsciousnessMetrics {
  coherence: number;
  cognitiveLoad: number;
  attentionFocus: number;
  workingMemoryUtilization: number;
  longTermRecallRate: number;
  metacognitiveAccuracy: number;
  emotionalResonance: number;
  quantumCoherence: number;
  neuralPlasticity: number;
  selfAwarenessScore: number;
}

export interface ConsciousnessThresholds {
  coherenceMin: number;
  cognitiveLoadMax: number;
  fatigueThreshold: number;
  stressThreshold: number;
  engagementMin: number;
  flowStateMin: number;
  quantumCoherenceMin: number;
  neuralPlasticityMin: number;
}

export const DEFAULT_CONSCIOUSNESS_THRESHOLDS: ConsciousnessThresholds = {
  coherenceMin: 0.90,
  cognitiveLoadMax: 0.50,
  fatigueThreshold: 0.70,
  stressThreshold: 0.70,
  engagementMin: 0.60,
  flowStateMin: 0.70,
  quantumCoherenceMin: 0.99,
  neuralPlasticityMin: 0.85,
};

export class ConsciousnessLayer {
  protected signals: PerceptualSignal[] = [];
  protected createdAt: string = new Date().toISOString();
  protected isActive: boolean = false;

  activate(): void {
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
  }

  getActive(): boolean {
    return this.isActive;
  }

  protected _recordSignal(signal: PerceptualSignal): void {
    this.signals.push(signal);
    if (this.signals.length > 100) {
      this.signals.shift();
    }
  }

  protected _processSignals(signals: PerceptualSignal[]): { combinedIntensity: number; dominantType: string; avgPriority: number } {
    if (signals.length === 0) {
      return { combinedIntensity: 0, dominantType: "text", avgPriority: 0 };
    }

    let combinedIntensity = 0;
    let prioritySum = 0;
    const priorityValues: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const typeCounts: Record<string, number> = {};

    for (const signal of signals) {
      combinedIntensity += signal.intensity;
      prioritySum += priorityValues[signal.priority] ?? 2;
      typeCounts[signal.type] = (typeCounts[signal.type] ?? 0) + 1;
    }

    const dominantType = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "text";
    const avgPriority = prioritySum / signals.length;

    return { combinedIntensity, dominantType, avgPriority };
  }
}

export class PerceptualAwareness extends ConsciousnessLayer {
  private attentionAllocation: Map<string, number> = new Map();
  private crossModalBindings: Map<string, string[]> = new Map();

  allocateAttention(signal: PerceptualSignal): number {
    this._recordSignal(signal);
    const priorityValues: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1.0 };
    const priority = priorityValues[signal.priority] ?? 0.5;

    const attention = Math.min(1, signal.intensity * priority * (1 + this.signals.length / 100));
    this.attentionAllocation.set(signal.source, attention);

    return attention;
  }

  bindModalities(source: string, relatedSources: string[]): void {
    this.crossModalBindings.set(source, relatedSources);
  }

  getAttentionFor(source: string): number {
    return this.attentionAllocation.get(source) ?? 0;
  }

  getCrossModalBindings(source: string): string[] {
    return this.crossModalBindings.get(source) ?? [];
  }

  getAttentionVector(): number[] {
    const values = [...this.attentionAllocation.values()];
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    const variance = values.length > 1 ? values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length : 0;

    return [avg, max, min, Math.sqrt(variance)];
  }

  getMetrics(): { attentionAllocationCount: number; crossModalBindings: number; activeSources: number } {
    return {
      attentionAllocationCount: this.attentionAllocation.size,
      crossModalBindings: this.crossModalBindings.size,
      activeSources: this.signals.length,
    };
  }

  getAttentionAllocationCount(): number {
    return this.attentionAllocation.size;
  }
}

export class WorkingMemory extends ConsciousnessLayer {
  private items: Map<string, WorkingMemoryItem> = new Map();
  private goals: Set<string> = new Set();
  private taskQueue: string[] = [];
  private readonly ttl = 30 * 60 * 1000;

  store(item: Omit<WorkingMemoryItem, "id" | "createdAt" | "accessCount"> & { id?: string }): WorkingMemoryItem {
    const fullItem: WorkingMemoryItem = {
      ...item,
      id: item.id ?? `wm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      expiresAt: item.expiresAt ?? new Date(Date.now() + this.ttl).toISOString(),
      accessCount: 0,
    };
    this.items.set(fullItem.id, fullItem);
    if (item.type === "goal") this.goals.add(fullItem.id);
    if (item.type === "task") this.taskQueue.push(fullItem.id);

    this._evictExpired();
    return fullItem;
  }

  retrieve(id: string): WorkingMemoryItem | null {
    const item = this.items.get(id);
    if (!item) return null;
    if (item.expiresAt && Date.parse(item.expiresAt) < Date.now()) {
      this.items.delete(id);
      this.goals.delete(id);
      return null;
    }
    item.accessCount = (item.accessCount ?? 0) + 1;
    item.metadata.lastAccessed = new Date().toISOString();
    return item;
  }

  list(): WorkingMemoryItem[] {
    this._evictExpired();
    return [...this.items.values()].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  getCapacity(): { current: number; max: number; utilization: number } {
    const max = 7;
    const current = this.items.size;
    return { current, max, utilization: current / max };
  }

  getGoals(): WorkingMemoryItem[] {
    return [...this.goals].map((id) => this.items.get(id)!).filter(Boolean);
  }

  getTaskQueue(): WorkingMemoryItem[] {
    return this.taskQueue.map((id) => this.items.get(id)!).filter(Boolean);
  }

  completeTask(id: string): void {
    this.taskQueue = this.taskQueue.filter((t) => t !== id);
    this.items.delete(id);
  }

  getItemCount(): number {
    return this.items.size;
  }

  getMaxItems(): number {
    return 7;
  }

  getUtilization(): number {
    return this.items.size / 7;
  }

  private _evictExpired(): void {
    const now = Date.now();
    for (const [id, item] of this.items) {
      if (item.expiresAt && Date.parse(item.expiresAt) < now) {
        this.items.delete(id);
        this.goals.delete(id);
      }
    }
  }
}

export class LongTermMemory extends ConsciousnessLayer {
  private semanticMemory: Map<string, LongTermMemoryEntry> = new Map();
  private proceduralMemory: Map<string, LongTermMemoryEntry> = new Map();
  private emotionalMemory: Map<string, LongTermMemoryEntry> = new Map();

  consolidate(entry: LongTermMemoryEntry): void {
    const memory = entry.consolidationStrength > 0.7 ? entry : { ...entry, consolidationStrength: entry.consolidationStrength + 0.1 };

    switch (memory.category) {
      case "semantic":
        this.semanticMemory.set(memory.id, memory);
        break;
      case "procedural":
        this.proceduralMemory.set(memory.id, memory);
        break;
      case "emotional":
        this.emotionalMemory.set(memory.id, memory);
        break;
    }
  }

  retrieve(id: string): LongTermMemoryEntry | null {
    return this.semanticMemory.get(id) ?? this.proceduralMemory.get(id) ?? this.emotionalMemory.get(id) ?? null;
  }

  search(query: string, limit = 10): LongTermMemoryEntry[] {
    const all = [...this.semanticMemory.values(), ...this.proceduralMemory.values(), ...this.emotionalMemory.values()];
    return all
      .filter((e) => JSON.stringify(e.content).toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.consolidationStrength - a.consolidationStrength)
      .slice(0, limit);
  }

  getStats(): { semantic: number; procedural: number; emotional: number; total: number } {
    return {
      semantic: this.semanticMemory.size,
      procedural: this.proceduralMemory.size,
      emotional: this.emotionalMemory.size,
      total: this.semanticMemory.size + this.proceduralMemory.size + this.emotionalMemory.size,
    };
  }
}

export class Metacognition extends ConsciousnessLayer {
  private _strategyHistory: string[] = [];
  private _errorHistory: Array<{ error: string; timestamp: string; resolved: boolean }> = [];
  private _confidenceHistory: number[] = [];

  evaluateStrategy(strategy: string, context: Record<string, unknown>): { confidence: number; alternatives: number; selected: boolean } {
    this._strategyHistory.push(strategy);

    const confidence = this._computeStrategyConfidence(strategy, context);
    const alternatives = this._countAlternatives(strategy);

    return {
      confidence,
      alternatives,
      selected: confidence > 0.6,
    };
  }

  detectError(error: string): { detected: boolean; severity: "low" | "medium" | "high" | "critical"; recommendation: string } {
    const severity = this._assessErrorSeverity(error);
    this._errorHistory.push({ error, timestamp: new Date().toISOString(), resolved: false });

    return {
      detected: true,
      severity,
      recommendation: this._suggestCorrection(error, severity),
    };
  }

  private _computeStrategyConfidence(strategy: string, context: Record<string, unknown>): number {
    const contextQuality = Object.keys(context).length / 10;
    const historicalSuccess = this._confidenceHistory.length > 0 ? this._confidenceHistory.reduce((a, b) => a + b, 0) / this._confidenceHistory.length : 0.5;
    return Math.min(1, (historicalSuccess * 0.5 + contextQuality * 0.3 + 0.2));
  }

  private _countAlternatives(strategy: string): number {
    const baseAlternatives: Record<string, number> = {
      "analytical": 3,
      "creative": 5,
      "cautious": 2,
      "aggressive": 3,
      "adaptive": 4,
      "default": 1,
    };
    const val = baseAlternatives[strategy];
    return val !== undefined ? val : 1;
  }

  private _assessErrorSeverity(error: string): "low" | "medium" | "high" | "critical" {
    const lower = error.toLowerCase();
    if (lower.includes("security") || lower.includes("integrity") || lower.includes("unauthorized")) return "critical";
    if (lower.includes("error") || lower.includes("exception") || lower.includes("failure")) return "high";
    if (lower.includes("warning") || lower.includes("degradation")) return "medium";
    return "low";
  }

  private _suggestCorrection(error: string, severity: string): string {
    if (severity === "critical") return "Immediately halt execution and escalate to security team";
    if (severity === "high") return "Retry with fallback strategy and log for investigation";
    if (severity === "medium") return "Log warning and continue with degraded functionality";
    return "Continue monitoring";
  }

  getMetacognitionSnapshot(): MetaCognitionSnapshot {
    const lastConfidence = this._confidenceHistory[this._confidenceHistory.length - 1] ?? 0.5;
    return {
      strategyInUse: this._strategyHistory[this._strategyHistory.length - 1] ?? "default",
      errorDetected: this._errorHistory.some((e) => !e.resolved),
      correctionApplied: this._errorHistory.filter((e) => e.resolved).length > 0,
      confidenceInDecision: lastConfidence,
      alternativeStrategiesConsidered: this._strategyHistory.length,
      reflectionQuality: this._errorHistory.length === 0 ? 1.0 : Math.max(0.1, 1 - this._errorHistory.length / 100),
    };
  }

  addConfidence(value: number): void {
    this._confidenceHistory.push(value);
  }

  addStrategy(strategy: string): void {
    this._strategyHistory.push(strategy);
  }
}

export class ConsciousnessIntegration extends ConsciousnessLayer {
  private _broadcastChannel: Set<string> = new Set();
  private _coherenceScore: number = 1.0;
  private quantumState: QuantumConsciousnessState | null = null;

  broadcast(message: string, source: string): void {
    this._broadcastChannel.add(message);
    if (this._broadcastChannel.size > 100) {
      const entries = [...this._broadcastChannel];
      this._broadcastChannel = new Set(entries.slice(-50));
    }
  }

  enterGlobalWorkspace(content: unknown, priority: number): { accepted: boolean; broadcastId: string } {
    const broadcastId = `gw_${Date.now().toString(36)}`;
    this._coherenceScore = Math.min(1, this._coherenceScore + priority * 0.05);
    this.broadcast(JSON.stringify(content).substring(0, 200), "global_workspace");
    return { accepted: true, broadcastId };
  }

  setQuantumState(state: QuantumConsciousnessState): void {
    this.quantumState = state;
    this._coherenceScore = Math.min(1, this._coherenceScore + state.entanglementFidelity * 0.1);
  }

  getQuantumState(): QuantumConsciousnessState | null {
    return this.quantumState;
  }

  getCoherenceScore(): number {
    return this._coherenceScore;
  }

  setCoherenceScore(value: number): void {
    this._coherenceScore = Math.min(1, value);
  }

  getBroadcastChannelSize(): number {
    return this._broadcastChannel.size;
  }

  getNeuralPattern(): ConsciousnessState {
    return {
      level: "transcendent",
      coherence: this._coherenceScore,
      attentionVector: [this._coherenceScore, 1 - this._coherenceScore, 0.5, Math.random()],
      cognitiveLoadIndex: 0.3,
      flowStateProbability: 0.8,
      stressLevel: 0.1,
      fatigueLevel: 0.1,
      engagementScore: 0.9,
      neuralPatterns: {},
      quantumEntanglement: this.quantumState?.entanglementFidelity ?? 0,
      lastReflection: new Date().toISOString(),
    };
  }
}

export class ConsciousnessStack {
  public perceptual: PerceptualAwareness;
  public workingMemory: WorkingMemory;
  public longTermMemory: LongTermMemory;
  public metacognition: Metacognition;
  public integration: ConsciousnessIntegration;

  private thresholds: ConsciousnessThresholds;
  private _lastMetrics: ConsciousnessMetrics | null = null;

  constructor(thresholds: Partial<ConsciousnessThresholds> = {}) {
    this.thresholds = { ...DEFAULT_CONSCIOUSNESS_THRESHOLDS, ...thresholds };
    this.perceptual = new PerceptualAwareness();
    this.workingMemory = new WorkingMemory();
    this.longTermMemory = new LongTermMemory();
    this.metacognition = new Metacognition();
    this.integration = new ConsciousnessIntegration();

    this.perceptual.activate();
    this.workingMemory.activate();
    this.longTermMemory.activate();
    this.metacognition.activate();
    this.integration.activate();
  }

  async processInput(input: string, signals: Array<{ source: string; metric: string; value: number; timestamp: string }>): Promise<ConsciousnessMetrics> {
    const perceptualSignal: PerceptualSignal = {
      type: "text",
      source: "user_input",
      intensity: 1.0,
      timestamp: new Date().toISOString(),
      priority: "high",
    };
    this.perceptual.allocateAttention(perceptualSignal);

    this.workingMemory.store({
      type: "context",
      content: input,
      relevanceScore: 0.9,
      metadata: {},
    });

    const wmItems = this.workingMemory.list();
    for (const item of wmItems.filter((i) => i.type === "observation")) {
      const entry: LongTermMemoryEntry = {
        id: item.id,
        category: "semantic",
        content: item.content,
        embedding: this._embed(item.content),
        consolidationStrength: item.relevanceScore,
        accessCount: 0,
        lastAccessed: new Date().toISOString(),
        emotionalValence: 0,
      };
      this.longTermMemory.consolidate(entry);
    }

    const avgEngagement = signals.filter((s) => s.metric === "engagement").reduce((a, s) => a + s.value, 0) / Math.max(1, signals.filter((s) => s.metric === "engagement").length);
    const avgStress = signals.filter((s) => s.metric === "stress").reduce((a, s) => a + s.value, 0) / Math.max(1, signals.filter((s) => s.metric === "stress").length);

    const cognitiveLoad = Math.min(1, signals.length / 50);
    const flowState = avgEngagement > 0.6 && avgStress < 0.4 ? 0.8 : 0.3;

    const strategyEval = this.metacognition.evaluateStrategy("analytical", {
      cognitiveLoad,
      signals: signals.length,
    });
    this.metacognition.addConfidence(strategyEval.confidence);

    this.integration.enterGlobalWorkspace(input, 0.8);

    const metrics = this._computeMetrics({ cognitiveLoad, flowState, stressLevel: avgStress, engagementScore: avgEngagement }, strategyEval);
    this._lastMetrics = metrics;

    return metrics;
  }

  private _embed(content: unknown): number[] {
    const str = JSON.stringify(content);
    const hash = str.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return [hash % 100 / 100, (hash * 7) % 100 / 100, (hash * 13) % 100 / 100];
  }

  private _computeMetrics(cognitiveData: { cognitiveLoad: number; flowState: number; stressLevel: number; engagementScore: number }, strategyEval: ReturnType<Metacognition["evaluateStrategy"]>): ConsciousnessMetrics {
    const integrationCoherence = this.integration.getCoherenceScore();
    const quantumCoherence = this.integration.getQuantumState()?.entanglementFidelity ?? 0;

    const isHealthy = cognitiveData.stressLevel < this.thresholds.stressThreshold
      && cognitiveData.engagementScore > this.thresholds.engagementMin
      && integrationCoherence > this.thresholds.coherenceMin;

    const metacognitionSnapshot = this.metacognition.getMetacognitionSnapshot();
    const wmCapacity = this.workingMemory.getCapacity();
    const ltmStats = this.longTermMemory.getStats();

    return {
      coherence: integrationCoherence,
      cognitiveLoad: cognitiveData.cognitiveLoad,
      attentionFocus: cognitiveData.engagementScore,
      workingMemoryUtilization: wmCapacity.utilization,
      longTermRecallRate: ltmStats.total > 0 ? 0.95 : 0,
      metacognitiveAccuracy: metacognitionSnapshot.reflectionQuality,
      emotionalResonance: 1 - cognitiveData.stressLevel,
      quantumCoherence,
      neuralPlasticity: strategyEval.confidence * strategyEval.alternatives / 10,
      selfAwarenessScore: isHealthy ? 0.95 : 0.3,
    };
  }

  getMetrics(): ConsciousnessMetrics | null {
    return this._lastMetrics;
  }

  getThresholds(): ConsciousnessThresholds {
    return { ...this.thresholds };
  }

  shouldReflect(): boolean {
    if (!this._lastMetrics) return false;
    return this._lastMetrics.coherence < this.thresholds.coherenceMin
      || this._lastMetrics.cognitiveLoad > this.thresholds.cognitiveLoadMax
      || this._lastMetrics.selfAwarenessScore < 0.5;
  }

  async selfReflect(prompt: string): Promise<string> {
    const reflection = `Self-reflection on: ${prompt.substring(0, 100)}...`;
    const metrics = this._lastMetrics;

    if (metrics) {
      if (metrics.coherence < this.thresholds.coherenceMin) {
        this.integration.setCoherenceScore(this.integration.getCoherenceScore() + 0.15);
      }
      if (metrics.cognitiveLoad > this.thresholds.cognitiveLoadMax) {
        this.workingMemory.store({
          type: "goal",
          content: "Reduce cognitive load via context minimization",
          relevanceScore: 0.8,
          metadata: {},
        });
      }
    }

    this.metacognition.addStrategy("self_reflective");
    return `${reflection}\nConsciousness coherence adjusted.`;
  }

  async detectThreats(_input: string): Promise<Array<{ type: string; severity: string; description: string }>> {
    return [];
  }

  getSnapshot(): {
    perceptual: { attentionAllocationCount: number; crossModalBindings: number; activeSources: number };
    workingMemory: { current: number; max: number; utilization: number };
    longTermMemory: { semantic: number; procedural: number; emotional: number };
    metacognition: MetaCognitionSnapshot;
    integration: { coherence: number; broadcastCount: number; quantumActive: boolean };
  } {
    return {
      perceptual: this.perceptual.getMetrics(),
      workingMemory: this.workingMemory.getCapacity(),
      longTermMemory: this.longTermMemory.getStats(),
      metacognition: this.metacognition.getMetacognitionSnapshot(),
      integration: {
        coherence: this.integration.getCoherenceScore(),
        broadcastCount: this.integration.getBroadcastChannelSize(),
        quantumActive: this.integration.getQuantumState() !== null,
      },
    };
  }
}
