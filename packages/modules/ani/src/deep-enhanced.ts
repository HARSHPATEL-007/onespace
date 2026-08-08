import type { ANIResponse, IntentClass } from "./engine";
import type { ConsciousnessMetrics } from "./consciousness";
import type { ReasoningChain, ReflectionResult } from "./deep-intelligence";

export interface StreamEvent {
  type:
    | "thinking"
    | "step"
    | "chunk"
    | "tool"
    | "citation"
    | "reflection"
    | "consciousness"
    | "complete"
    | "error";
  data: Record<string, unknown>;
  timestamp: string;
  seq: number;
}

export interface EnhancedStreamState {
  events: StreamEvent[];
  isStreaming: boolean;
  currentPhase: string;
  partialContent: string;
  reasoningProgress: number;
  consciousnessSnapshot: ConsciousnessMetrics | null;
}

export interface InteractiveGraphState {
  rotationX: number;
  rotationY: number;
  zoom: number;
  panX: number;
  panY: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  showLabels: boolean;
  showEdges: boolean;
  filterTypes: string[];
  isDragging: boolean;
  lastMouseX: number;
  lastMouseY: number;
}

export interface RealTimeMeetingUpdate {
  type:
    | "transcript"
    | "sentiment"
    | "engagement"
    | "decision"
    | "action"
    | "participant";
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface AdaptiveLearningPath {
  id: string;
  title: string;
  description: string;
  modules: AdaptiveModule[];
  currentModuleIndex: number;
  overallProgress: number;
  estimatedMinutesRemaining: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface AdaptiveModule {
  id: string;
  title: string;
  concepts: AdaptiveConcept[];
  status: "locked" | "available" | "in_progress" | "completed" | "mastered";
  score: number;
  attempts: number;
  lastAttemptAt?: string;
}

export interface AdaptiveConcept {
  id: string;
  name: string;
  mastery: number;
  exercises: AdaptiveExercise[];
  prerequisites: string[];
}

export interface AdaptiveExercise {
  id: string;
  type: "question" | "scenario" | "application" | "reflection";
  prompt: string;
  options?: string[];
  correctAnswer?: string;
  explanation: string;
  difficulty: number;
  completed: boolean;
  correct?: boolean;
  userAnswer?: string;
}

export class EnhancedStreamController {
  private seq = 0;
  private listeners: Array<(event: StreamEvent) => void> = [];

  subscribe(listener: (event: StreamEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(type: StreamEvent["type"], data: Record<string, unknown>): void {
    const event: StreamEvent = {
      type,
      data,
      timestamp: new Date().toISOString(),
      seq: this.seq++,
    };
    for (const listener of this.listeners) listener(event);
  }

  emitThinking(phase: string): void {
    this.emit("thinking", { phase, message: this._getPhaseDescription(phase) });
  }

  emitStep(step: number, total: number, phase: string, detail: string): void {
    this.emit("step", { step, total, phase, detail, progress: step / total });
  }

  emitChunk(content: string, delta: string): void {
    this.emit("chunk", { content, delta, length: content.length });
  }

  emitTool(
    toolName: string,
    status: string,
    args?: Record<string, unknown>,
  ): void {
    this.emit("tool", { tool: toolName, status, arguments: args ?? {} });
  }

  emitCitation(source: string, confidence: number, snippet?: string): void {
    this.emit("citation", { source, confidence, snippet });
  }

  emitReflection(reflection: ReflectionResult): void {
    this.emit("reflection", {
      issuesFound: reflection.issuesIdentified.length,
      revisedConfidence: reflection.revisedConfidence,
      shouldReprocess: reflection.shouldReprocess,
      reasoning: reflection.reasoning,
    });
  }

  emitConsciousness(metrics: ConsciousnessMetrics): void {
    this.emit("consciousness", {
      coherence: metrics.coherence,
      cognitiveLoad: metrics.cognitiveLoad,
      flowState: metrics.attentionFocus,
      engagement: metrics.emotionalResonance,
    });
  }

  emitComplete(response: Partial<ANIResponse>): void {
    this.emit("complete", { response });
  }

  emitError(error: string, recoverable: boolean): void {
    this.emit("error", { error, recoverable });
  }

  private _getPhaseDescription(phase: string): string {
    const descriptions: Record<string, string> = {
      decompose: "Breaking down the problem into manageable parts",
      retrieve: "Searching knowledge bases and context",
      analyze: "Examining relationships and patterns",
      reason: "Applying logical inference chains",
      synthesize: "Combining insights into a coherent answer",
      verify: "Cross-checking against known facts",
      reflect: "Evaluating my own reasoning quality",
      counterfactual: "Exploring alternative scenarios",
      risk_assessment: "Evaluating potential risks and mitigations",
    };
    return descriptions[phase] ?? `Processing: ${phase}`;
  }
}

export class InteractiveGraphController {
  state: InteractiveGraphState = {
    rotationX: 0.2,
    rotationY: 0.4,
    zoom: 1,
    panX: 0,
    panY: 0,
    selectedNodeId: null,
    hoveredNodeId: null,
    showLabels: true,
    showEdges: true,
    filterTypes: [],
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,
  };

  rotate(deltaX: number, deltaY: number): void {
    this.state.rotationY += deltaX * 0.01;
    this.state.rotationX += deltaY * 0.01;
    this.state.rotationX = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, this.state.rotationX),
    );
  }

  zoom(delta: number): void {
    this.state.zoom = Math.max(
      0.3,
      Math.min(3, this.state.zoom + delta * 0.001),
    );
  }

  pan(deltaX: number, deltaY: number): void {
    this.state.panX += deltaX;
    this.state.panY += deltaY;
  }

  selectNode(nodeId: string | null): void {
    this.state.selectedNodeId = nodeId;
  }

  hoverNode(nodeId: string | null): void {
    this.state.hoveredNodeId = nodeId;
  }

  toggleFilter(nodeType: string): void {
    if (this.state.filterTypes.includes(nodeType)) {
      this.state.filterTypes = this.state.filterTypes.filter(
        (t) => t !== nodeType,
      );
    } else {
      this.state.filterTypes.push(nodeType);
    }
  }

  reset(): void {
    this.state.rotationX = 0.2;
    this.state.rotationY = 0.4;
    this.state.zoom = 1;
    this.state.panX = 0;
    this.state.panY = 0;
    this.state.selectedNodeId = null;
  }

  getState(): InteractiveGraphState {
    return { ...this.state };
  }
}

export class RealTimeMeetingProcessor {
  private transcripts: Array<{
    speaker: string;
    text: string;
    timestamp: string;
  }> = [];
  private sentimentWindow: number[] = [];
  private engagementWindow: number[] = [];

  processTranscript(speaker: string, text: string): RealTimeMeetingUpdate[] {
    const updates: RealTimeMeetingUpdate[] = [];
    const timestamp = new Date().toISOString();

    this.transcripts.push({ speaker, text, timestamp });
    updates.push({
      type: "transcript",
      payload: { speaker, text, wordCount: text.split(/\s+/).length },
      timestamp,
    });

    const sentiment = this._analyzeSentiment(text);
    this.sentimentWindow.push(sentiment);
    if (this.sentimentWindow.length > 20) this.sentimentWindow.shift();
    updates.push({
      type: "sentiment",
      payload: {
        score: sentiment,
        windowAvg:
          this.sentimentWindow.reduce((a, b) => a + b, 0) /
          this.sentimentWindow.length,
      },
      timestamp,
    });

    const engagement = this._detectEngagement(text);
    this.engagementWindow.push(engagement);
    if (this.engagementWindow.length > 20) this.engagementWindow.shift();
    updates.push({
      type: "engagement",
      payload: {
        score: engagement,
        level: engagement > 0.6 ? "high" : engagement > 0.3 ? "medium" : "low",
      },
      timestamp,
    });

    const decision = this._extractDecision(text);
    if (decision) {
      updates.push({
        type: "decision",
        payload: { decision, speaker },
        timestamp,
      });
    }

    const action = this._extractAction(text);
    if (action) {
      updates.push({ type: "action", payload: { action, speaker }, timestamp });
    }

    return updates;
  }

  private _analyzeSentiment(text: string): number {
    const positive =
      /\b(great|excellent|agree|good|love|perfect|excellent|thanks|appreciate)\b/gi;
    const negative =
      /\b(bad|disagree|problem|issue|concern|wrong|fail|risk|worried)\b/gi;
    const posCount = (text.match(positive) ?? []).length;
    const negCount = (text.match(negative) ?? []).length;
    const total = posCount + negCount;
    return total === 0 ? 0.5 : posCount / total;
  }

  private _detectEngagement(text: string): number {
    let score = 0.5;
    if (text.includes("?")) score += 0.1;
    if (text.length > 100) score += 0.1;
    if (/\b(I think|my view|I suggest|we should|let's)\b/i.test(text))
      score += 0.15;
    if (/\b(agree|makes sense|good point|exactly)\b/i.test(text)) score += 0.1;
    return Math.min(1, score);
  }

  private _extractDecision(text: string): string | null {
    const patterns = [
      /(?:we(?:'ve|\s+have)\s+decided|agreed\s+to|let['']s\s+go\s+with|final\s+call)\s+([^.!?]+)/i,
      /(?:conclusion|resolution|verdict)\s*:\s*([^.!?]+)/i,
    ];
    for (const p of patterns) {
      const match = text.match(p);
      if (match) return match[1]!.trim();
    }
    return null;
  }

  private _extractAction(text: string): string | null {
    const patterns = [
      /(?:@(\w+)\s+(?:will|should|to\s+do))\s*([^.!?]+)/i,
      /(?:action|todo|follow\s+up)\s*:\s*([^.!?]+)/i,
    ];
    for (const p of patterns) {
      const match = text.match(p);
      if (match) return (match[2] ?? match[1])!.trim();
    }
    return null;
  }

  getSummary(): {
    totalTranscripts: number;
    avgSentiment: number;
    avgEngagement: number;
    durationMinutes: number;
  } {
    const avgSent =
      this.sentimentWindow.length > 0
        ? this.sentimentWindow.reduce((a, b) => a + b, 0) /
          this.sentimentWindow.length
        : 0.5;
    const avgEng =
      this.engagementWindow.length > 0
        ? this.engagementWindow.reduce((a, b) => a + b, 0) /
          this.engagementWindow.length
        : 0.5;
    const duration =
      this.transcripts.length > 1
        ? (new Date(
            this.transcripts[this.transcripts.length - 1]!.timestamp,
          ).getTime() -
            new Date(this.transcripts[0]!.timestamp).getTime()) /
          60000
        : 0;
    return {
      totalTranscripts: this.transcripts.length,
      avgSentiment: avgSent,
      avgEngagement: avgEng,
      durationMinutes: Math.round(duration),
    };
  }
}

export class AdaptiveLearningEngine {
  private paths: Map<string, AdaptiveLearningPath> = new Map();

  createPath(
    title: string,
    description: string,
    concepts: string[],
  ): AdaptiveLearningPath {
    const path: AdaptiveLearningPath = {
      id: `path_${Date.now().toString(36)}`,
      title,
      description,
      modules: concepts.map((concept, i) => ({
        id: `mod_${i}`,
        title: `Module ${i + 1}: ${concept}`,
        concepts: [
          {
            id: `concept_${i}`,
            name: concept,
            mastery: 0,
            exercises: this._generateExercises(concept, 3),
            prerequisites: i > 0 ? [`concept_${i - 1}`] : [],
          },
        ],
        status: i === 0 ? "available" : "locked",
        score: 0,
        attempts: 0,
      })),
      currentModuleIndex: 0,
      overallProgress: 0,
      estimatedMinutesRemaining: concepts.length * 8,
      strengths: [],
      weaknesses: [],
      recommendations: [],
    };
    this.paths.set(path.id, path);
    return path;
  }

  private _generateExercises(
    concept: string,
    count: number,
  ): AdaptiveExercise[] {
    const types: AdaptiveExercise["type"][] = [
      "question",
      "scenario",
      "application",
      "reflection",
    ];
    return Array.from({ length: count }, (_, i) => ({
      id: `ex_${concept}_${i}`,
      type: types[i % types.length]!,
      prompt: `Test your understanding of ${concept}: ${this._getPromptForType(types[i % types.length]!, concept)}`,
      options:
        types[i % types.length] === "question"
          ? ["Option A", "Option B", "Option C", "Option D"]
          : undefined,
      correctAnswer:
        types[i % types.length] === "question" ? "Option A" : undefined,
      explanation: `This exercise tests key aspects of ${concept}.`,
      difficulty: 0.3 + i * 0.2,
      completed: false,
    }));
  }

  private _getPromptForType(
    type: AdaptiveExercise["type"],
    concept: string,
  ): string {
    switch (type) {
      case "question":
        return `Which statement best describes ${concept}?`;
      case "scenario":
        return `You encounter a situation involving ${concept}. What's your approach?`;
      case "application":
        return `Apply ${concept} to solve a real problem in your workspace.`;
      case "reflection":
        return `How does ${concept} relate to what you already know?`;
    }
  }

  submitAnswer(
    pathId: string,
    moduleId: string,
    conceptId: string,
    exerciseId: string,
    answer: string,
  ): { correct: boolean; feedback: string; mastered: boolean } {
    const path = this.paths.get(pathId);
    if (!path)
      return { correct: false, feedback: "Path not found", mastered: false };

    const module = path.modules.find((m) => m.id === moduleId);
    if (!module)
      return { correct: false, feedback: "Module not found", mastered: false };

    const concept = module.concepts.find((c) => c.id === conceptId);
    if (!concept)
      return { correct: false, feedback: "Concept not found", mastered: false };

    const exercise = concept.exercises.find((e) => e.id === exerciseId);
    if (!exercise)
      return {
        correct: false,
        feedback: "Exercise not found",
        mastered: false,
      };

    const correct = exercise.correctAnswer
      ? answer === exercise.correctAnswer
      : answer.length > 10;
    exercise.completed = true;
    exercise.correct = correct;
    exercise.userAnswer = answer;

    const completedExercises = concept.exercises.filter(
      (e) => e.completed,
    ).length;
    const correctExercises = concept.exercises.filter((e) => e.correct).length;
    concept.mastery =
      completedExercises > 0 ? correctExercises / concept.exercises.length : 0;

    if (concept.mastery >= 0.8) {
      const moduleConcepts = module.concepts.filter(
        (c) => c.mastery >= 0.8,
      ).length;
      if (moduleConcepts === module.concepts.length) {
        module.status = "completed";
        module.score = concept.mastery;
        const nextModule = path.modules[path.currentModuleIndex + 1];
        if (nextModule) {
          nextModule.status = "available";
          path.currentModuleIndex++;
        }
      }
    }

    this._updatePathStats(path);
    return {
      correct,
      feedback: correct
        ? "Correct! Well done."
        : `Not quite. ${exercise.explanation}`,
      mastered: concept.mastery >= 0.8,
    };
  }

  private _updatePathStats(path: AdaptiveLearningPath): void {
    const completedModules = path.modules.filter(
      (m) => m.status === "completed" || m.status === "mastered",
    ).length;
    path.overallProgress = completedModules / path.modules.length;

    const allConcepts = path.modules.flatMap((m) => m.concepts);
    path.strengths = allConcepts
      .filter((c) => c.mastery >= 0.7)
      .map((c) => c.name);
    path.weaknesses = allConcepts
      .filter((c) => c.mastery < 0.4 && c.exercises.some((e) => e.completed))
      .map((c) => c.name);

    path.recommendations = [];
    if (path.weaknesses.length > 0)
      path.recommendations.push(
        `Review: ${path.weaknesses.slice(0, 2).join(", ")}`,
      );
    if (path.strengths.length > 0)
      path.recommendations.push(
        `Advance to next module — you've mastered ${path.strengths[0]}`,
      );
    path.estimatedMinutesRemaining = Math.round(
      (path.modules.length - completedModules) * 8,
    );
  }

  getPath(id: string): AdaptiveLearningPath | null {
    return this.paths.get(id) ?? null;
  }

  getAllPaths(): AdaptiveLearningPath[] {
    return [...this.paths.values()];
  }
}
