import type { ConsciousnessMetrics } from "./consciousness";
import type { UserIntent, WorkspaceContext, ANIResponse, IntentClass } from "./engine";
import type { ComplexityAssessment, ReasoningDepth } from "./deep-think";

export interface ReasoningChain {
  id: string;
  steps: ReasoningStep[];
  currentStep: number;
  status: "active" | "completed" | "failed" | "awaiting_feedback";
  conclusion?: string;
  confidence: number;
  alternatives: Array<{ description: string; confidence: number; rejected: string }>;
}

export interface ReasoningStep {
  stepNumber: number;
  phase: string;
  input: string;
  output: string;
  confidence: number;
  evidence: string[];
  assumptions: string[];
  completed: boolean;
  durationMs: number;
}

export interface ReflectionResult {
  originalConfidence: number;
  revisedConfidence: number;
  issuesIdentified: string[];
  correctionsApplied: string[];
  shouldReprocess: boolean;
  reasoning: string;
}

export interface SemanticChunk {
  id: string;
  content: string;
  embedding: number[];
  importance: number;
  source: string;
  position: number;
}

export interface CompressedContext {
  chunks: SemanticChunk[];
  summary: string;
  keyEntities: string[];
  relationships: Array<{ subject: string; predicate: string; object: string }>;
  compressionRatio: number;
  fidelityScore: number;
}

export interface AdaptiveLearningState {
  userSkillLevel: Record<string, number>;
  conceptMastery: Record<string, number>;
  learningStyle: "visual" | "verbal" | "applied" | "conceptual";
  pacePreference: "accelerated" | "standard" | "reinforced";
  lastPerformance: number;
  streakCorrect: number;
  streakIncorrect: number;
}

export interface AutonomousDecision {
  action: string;
  confidence: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  reasoning: string;
  fallback?: string;
}

export interface SelfImprovementLog {
  timestamp: string;
  observation: string;
  change: string;
  expectedImpact: string;
  actualImpact?: string;
  validated: boolean;
}

export class DeepReasoningEngine {
  private chains: Map<string, ReasoningChain> = new Map();

  createChain(query: string, intent: UserIntent): ReasoningChain {
    const chain: ReasoningChain = {
      id: `chain_${Date.now().toString(36)}`,
      steps: this._generateSteps(query, intent),
      currentStep: 0,
      status: "active",
      confidence: 0,
      alternatives: [],
    };
    this.chains.set(chain.id, chain);
    return chain;
  }

  private _generateSteps(query: string, intent: UserIntent): ReasoningStep[] {
    const baseSteps = [
      { phase: "decompose", label: "Decomposing query into sub-problems" },
      { phase: "retrieve", label: "Retrieving relevant knowledge" },
      { phase: "analyze", label: "Analyzing relationships and patterns" },
      { phase: "reason", label: "Applying logical reasoning" },
      { phase: "synthesize", label: "Synthesizing findings" },
      { phase: "verify", label: "Verifying conclusions against evidence" },
      { phase: "reflect", label: "Self-reflection on reasoning quality" },
    ];

    if (intent.classification === "analytical") {
      baseSteps.splice(4, 0, { phase: "counterfactual", label: "Exploring counterfactual scenarios" });
    }
    if (intent.riskLevel === "high" || intent.riskLevel === "critical") {
      baseSteps.push({ phase: "risk_assessment", label: "Evaluating risk implications" });
    }

    return baseSteps.map((s, i) => ({
      stepNumber: i + 1,
      phase: s.phase,
      input: i === 0 ? query : `Output from step ${i}`,
      output: "",
      confidence: 0,
      evidence: [],
      assumptions: [],
      completed: false,
      durationMs: 0,
    }));
  }

  executeStep(chainId: string, stepResults: { output: string; evidence: string[]; assumptions: string[] }): ReasoningStep | null {
    const chain = this.chains.get(chainId);
    if (!chain || chain.currentStep >= chain.steps.length) return null;

    const step = chain.steps[chain.currentStep]!;
    step.output = stepResults.output;
    step.evidence = stepResults.evidence;
    step.assumptions = stepResults.assumptions;
    step.completed = true;
    step.confidence = stepResults.evidence.length > 0 ? Math.min(0.95, 0.5 + stepResults.evidence.length * 0.1) : 0.3;
    step.durationMs = Date.now();

    chain.confidence = (chain.confidence * chain.currentStep + step.confidence) / (chain.currentStep + 1);
    chain.currentStep++;

    if (chain.currentStep >= chain.steps.length) {
      chain.status = "completed";
      chain.conclusion = step.output;
    }

    return step;
  }

  generateAlternatives(chainId: string): ReasoningChain["alternatives"] {
    const chain = this.chains.get(chainId);
    if (!chain) return [];

    const alternatives: ReasoningChain["alternatives"] = [
      { description: "Alternative interpretation: query may have different intent", confidence: chain.confidence * 0.7, rejected: "Primary intent classification is stronger" },
      { description: "Opposite conclusion based on different assumptions", confidence: chain.confidence * 0.4, rejected: "Evidence better supports primary conclusion" },
      { description: "Simplified answer without nuance", confidence: chain.confidence * 0.8, rejected: "User context suggests depth is appropriate" },
    ];

    chain.alternatives = alternatives;
    return alternatives;
  }

  getChain(id: string): ReasoningChain | null {
    return this.chains.get(id) ?? null;
  }
}

export class DeepSelfReflection {
  private reflectionHistory: ReflectionResult[] = [];

  reflect(response: string, intent: UserIntent, complexity: ComplexityAssessment): ReflectionResult {
    const issues: string[] = [];
    const corrections: string[] = [];
    let revisedConfidence = 0.85;

    if (response.length < 50 && complexity.score > 0.4) {
      issues.push("Response too brief for complexity level");
      corrections.push("Expanded with additional detail");
      revisedConfidence -= 0.15;
    }

    if (intent.classification === "analytical" && !response.includes("because") && !response.includes("therefore")) {
      issues.push("Analytical response lacks reasoning connectors");
      corrections.push("Added explicit reasoning steps");
      revisedConfidence -= 0.1;
    }

    if (intent.riskLevel === "high" && !response.includes("risk") && !response.includes("consider")) {
      issues.push("High-risk topic without risk acknowledgment");
      corrections.push("Added risk considerations");
      revisedConfidence -= 0.2;
    }

    if (intent.classification === "factual" && !response.includes("according to") && !response.includes("source")) {
      issues.push("Factual claims without attribution");
      corrections.push("Added source references where applicable");
      revisedConfidence -= 0.05;
    }

    const result: ReflectionResult = {
      originalConfidence: revisedConfidence + issues.length * 0.1,
      revisedConfidence: Math.max(0.1, revisedConfidence),
      issuesIdentified: issues,
      correctionsApplied: corrections,
      shouldReprocess: issues.length > 2,
      reasoning: issues.length > 0 ? `Identified ${issues.length} quality issues: ${issues.join("; ")}` : "Response passes quality checks",
    };

    this.reflectionHistory.push(result);
    return result;
  }

  getReflectionTrend(): { improving: boolean; avgIssues: number; totalReflections: number } {
    if (this.reflectionHistory.length < 2) return { improving: true, avgIssues: 0, totalReflections: this.reflectionHistory.length };

    const recent = this.reflectionHistory.slice(-5);
    const earlier = this.reflectionHistory.slice(0, Math.min(5, this.reflectionHistory.length - 5));
    const recentAvg = recent.reduce((a, r) => a + r.issuesIdentified.length, 0) / recent.length;
    const earlierAvg = earlier.length > 0 ? earlier.reduce((a, r) => a + r.issuesIdentified.length, 0) / earlier.length : recentAvg;

    return {
      improving: recentAvg <= earlierAvg,
      avgIssues: recentAvg,
      totalReflections: this.reflectionHistory.length,
    };
  }
}

export class DeepContextCompressor {
  compress(text: string, maxChunks: number = 7): CompressedContext {
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 10);
    const chunks: SemanticChunk[] = sentences.map((s, i) => ({
      id: `chunk_${i}`,
      content: s,
      embedding: this._computeEmbedding(s),
      importance: this._scoreImportance(s, i, sentences.length),
      source: "input",
      position: i,
    }));

    chunks.sort((a, b) => b.importance - a.importance);
    const selected = chunks.slice(0, maxChunks).sort((a, b) => a.position - b.position);

    const entities = this._extractEntities(text);
    const relationships = this._extractRelationships(text, entities);

    return {
      chunks: selected,
      summary: selected.map((c) => c.content).join(" "),
      keyEntities: entities.slice(0, 10),
      relationships,
      compressionRatio: sentences.length > 0 ? selected.length / sentences.length : 1,
      fidelityScore: selected.reduce((a, c) => a + c.importance, 0) / Math.max(1, selected.length),
    };
  }

  private _computeEmbedding(text: string): number[] {
    const embedding: number[] = [0, 0, 0, 0, 0, 0, 0, 0];
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      for (let i = 0; i < 8; i++) {
        embedding[i] = (embedding[i] ?? 0) + (word.charCodeAt(0) * (i + 1) % 97);
      }
    }
    const norm = Math.sqrt(embedding.reduce((a, v) => a + v * v, 0)) || 1;
    return embedding.map((v) => v / norm / 1000);
  }

  private _scoreImportance(sentence: string, position: number, total: number): number {
    let score = 0.5;
    if (/\b(critical|important|key|must|essential|primary|significant)\b/i.test(sentence)) score += 0.3;
    if (/\b(therefore|consequently|because|thus|hence)\b/i.test(sentence)) score += 0.2;
    if (/\b(\$[\d,]+|deadline|date|milestone|deliverable)\b/i.test(sentence)) score += 0.25;
    if (position < total * 0.2 || position > total * 0.8) score += 0.1;
    if (sentence.length > 200) score += 0.05;
    return Math.min(1, score);
  }

  private _extractEntities(text: string): string[] {
    const entities: Set<string> = new Set();
    const patterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
      /\b([A-Z]{2,})\b/g,
      /`([^`]+)`/g,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]!.trim();
        if (name.length > 2 && name.length < 50) entities.add(name);
      }
    }
    return [...entities].slice(0, 15);
  }

  private _extractRelationships(text: string, entities: string[]): Array<{ subject: string; predicate: string; object: string }> {
    const relationships: Array<{ subject: string; predicate: string; object: string }> = [];
    const topEntities = entities.slice(0, 6);
    for (let i = 0; i < topEntities.length; i++) {
      for (let j = i + 1; j < topEntities.length; j++) {
        const proximity = this._findProximity(text, topEntities[i]!, topEntities[j]!);
        if (proximity > 0 && proximity < 300) {
          relationships.push({ subject: topEntities[i]!, predicate: "related_to", object: topEntities[j]! });
        }
      }
    }
    return relationships;
  }

  private _findProximity(text: string, a: string, b: string): number {
    const idxA = text.indexOf(a);
    const idxB = text.indexOf(b);
    if (idxA === -1 || idxB === -1) return -1;
    return Math.abs(idxA - idxB);
  }
}

export class DeepAdaptiveLearning {
  private state: AdaptiveLearningState = {
    userSkillLevel: {},
    conceptMastery: {},
    learningStyle: "conceptual",
    pacePreference: "standard",
    lastPerformance: 0.5,
    streakCorrect: 0,
    streakIncorrect: 0,
  };

  recordPerformance(correct: boolean, concept: string, difficulty: number): void {
    if (correct) {
      this.state.streakCorrect++;
      this.state.streakIncorrect = 0;
      this.state.conceptMastery[concept] = Math.min(1, (this.state.conceptMastery[concept] ?? 0.3) + 0.15 * difficulty);
    } else {
      this.state.streakIncorrect++;
      this.state.streakCorrect = 0;
      this.state.conceptMastery[concept] = Math.max(0, (this.state.conceptMastery[concept] ?? 0.3) - 0.1);
    }

    this.state.lastPerformance = correct ? 0.8 : 0.3;

    if (this.state.streakCorrect >= 3) {
      this.state.pacePreference = "accelerated";
    } else if (this.state.streakIncorrect >= 2) {
      this.state.pacePreference = "reinforced";
    } else {
      this.state.pacePreference = "standard";
    }

    const avgMastery = Object.values(this.state.conceptMastery).reduce((a, b) => a + b, 0) / Math.max(1, Object.keys(this.state.conceptMastery).length);
    if (avgMastery > 0.8) this.state.learningStyle = "applied";
    else if (avgMastery > 0.5) this.state.learningStyle = "conceptual";
    else this.state.learningStyle = "verbal";
  }

  getRecommendedDifficulty(concept: string): "beginner" | "intermediate" | "advanced" {
    const mastery = this.state.conceptMastery[concept] ?? 0;
    if (mastery > 0.75) return "advanced";
    if (mastery > 0.4) return "intermediate";
    return "beginner";
  }

  getPace(): string {
    return this.state.pacePreference;
  }

  getLearningStyle(): string {
    return this.state.learningStyle;
  }

  getMastery(concept: string): number {
    return this.state.conceptMastery[concept] ?? 0;
  }

  getOverallMastery(): number {
    const values = Object.values(this.state.conceptMastery);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  shouldAdvance(concept: string): boolean {
    return (this.state.conceptMastery[concept] ?? 0) > 0.7 && this.state.streakCorrect >= 2;
  }

  getState(): AdaptiveLearningState {
    return { ...this.state };
  }
}

export class DeepAutonomyEngine {
  private decisions: AutonomousDecision[] = [];

  decide<T>(
    action: string,
    context: { intent: UserIntent; riskLevel: string; hasFallback: boolean; userPrefersAutonomy: boolean; dataSensitivity: string },
  ): AutonomousDecision {
    const decision: AutonomousDecision = {
      action,
      confidence: 0,
      riskLevel: "low",
      requiresApproval: false,
      reasoning: "",
    };

    if (context.intent.riskLevel === "critical" || context.dataSensitivity === "restricted") {
      decision.requiresApproval = true;
      decision.riskLevel = "critical";
      decision.confidence = 0.3;
      decision.reasoning = "Critical risk or restricted data requires human approval";
    } else if (context.intent.riskLevel === "high") {
      decision.requiresApproval = !context.userPrefersAutonomy;
      decision.riskLevel = "high";
      decision.confidence = 0.6;
      decision.reasoning = context.userPrefersAutonomy ? "High risk but user prefers autonomy — proceeding with caution" : "High risk — requesting confirmation";
    } else if (context.intent.classification === "action") {
      decision.requiresApproval = false;
      decision.riskLevel = "medium";
      decision.confidence = 0.8;
      decision.reasoning = "Standard action — executing autonomously";
    } else {
      decision.requiresApproval = false;
      decision.riskLevel = "low";
      decision.confidence = 0.9;
      decision.reasoning = "Read-only operation — safe to execute autonomously";
    }

    if (context.hasFallback && decision.riskLevel !== "low") {
      decision.fallback = "Revert to previous state and notify user";
    }

    this.decisions.push(decision);
    return decision;
  }

  getDecisionHistory(): AutonomousDecision[] {
    return [...this.decisions];
  }

  getAutonomyScore(): number {
    if (this.decisions.length === 0) return 0;
    const autoDecisions = this.decisions.filter((d) => !d.requiresApproval).length;
    return autoDecisions / this.decisions.length;
  }
}

export class DeepSelfImprovement {
  private logs: SelfImprovementLog[] = [];
  private metrics: Array<{ timestamp: string; name: string; value: number }> = [];

  observe(observation: string, metrics: Record<string, number>): void {
    this.metrics.push(...Object.entries(metrics).map(([name, value]) => ({ timestamp: new Date().toISOString(), name, value })));

    if (this._shouldAct(observation)) {
      const change = this._generateChange(observation);
      this.logs.push({
        timestamp: new Date().toISOString(),
        observation,
        change: change.change,
        expectedImpact: change.impact,
        validated: false,
      });
    }
  }

  private _shouldAct(observation: string): boolean {
    const triggers = ["high latency", "low quality", "user frustration", "repeated errors", "context overflow"];
    return triggers.some((t) => observation.toLowerCase().includes(t));
  }

  private _generateChange(observation: string): { change: string; impact: string } {
    const lower = observation.toLowerCase();
    if (lower.includes("latency")) return { change: "Reduce max_tokens and enable caching", impact: "Expected 30% latency reduction" };
    if (lower.includes("quality")) return { change: "Increase reasoning depth and enable multi-pass", impact: "Expected 20% quality improvement" };
    if (lower.includes("context")) return { change: "Enable semantic compression and pruning", impact: "Expected 50% context size reduction" };
    if (lower.includes("error")) return { change: "Enable fallback provider and retry logic", impact: "Expected 80% error reduction" };
    return { change: "Monitor and collect more data", impact: "Awaiting signal before acting" };
  }

  validateChanges(): void {
    for (const log of this.logs.filter((l) => !l.validated)) {
      const relevantMetrics = this.metrics.filter((m) => m.timestamp > log.timestamp);
      if (relevantMetrics.length > 0) {
        const avgValue = relevantMetrics.reduce((a, m) => a + m.value, 0) / relevantMetrics.length;
        log.actualImpact = `Metric avg: ${avgValue.toFixed(3)}`;
        log.validated = true;
      }
    }
  }

  getImprovementLog(): SelfImprovementLog[] {
    return [...this.logs];
  }

  getImprovementScore(): number {
    if (this.logs.length === 0) return 0;
    const validated = this.logs.filter((l) => l.validated).length;
    return validated / this.logs.length;
  }
}
