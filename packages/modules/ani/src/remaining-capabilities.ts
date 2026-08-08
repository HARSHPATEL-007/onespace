export interface VoiceTtsState {
  isSpeaking: boolean;
  isPaused: boolean;
  utterance: SpeechSynthesisUtterance | null;
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume: number;
  supported: boolean;
  voices: SpeechSynthesisVoice[];
}

export interface VoiceProfile {
  id: string;
  name: string;
  language: string;
  voiceUri: string;
  pitch: number;
  rate: number;
}

export interface TtsQueueItem {
  id: string;
  text: string;
  priority: "high" | "normal" | "low";
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: (charIndex: number) => void;
}

export interface LearningModule {
  id: string;
  title: string;
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  steps: LearningStep[];
  estimatedMinutes: number;
  prerequisites: string[];
  objectives: string[];
}

export interface LearningStep {
  stepNumber: number;
  title: string;
  content: string;
  keyPoints: string[];
  checkQuestion?: string;
  checkAnswer?: string;
  completed: boolean;
}

export interface LearningProgress {
  moduleId: string;
  currentStep: number;
  totalSteps: number;
  correctAnswers: number;
  totalQuestions: number;
  startedAt: string;
  lastActiveAt: string;
  completed: boolean;
  masteredConcepts: string[];
}

export interface SourceConstraint {
  type: "include" | "exclude";
  domain?: string;
  url?: string;
  documentId?: string;
  module?: string;
  dateRange?: { start: string; end: string };
  confidenceThreshold?: number;
}

export interface ConstrainedResearchResult {
  query: string;
  constraints: SourceConstraint[];
  matchedSources: ResearchSource[];
  filteredOut: number;
  synthesis: string;
  gaps: string[];
}

export interface ResearchSource {
  id: string;
  title: string;
  url?: string;
  domain?: string;
  type: "web" | "document" | "memory" | "calculation";
  relevanceScore: number;
  snippet: string;
  lastUpdated?: string;
}

export interface TaskProgress {
  taskId: string;
  label: string;
  status: "queued" | "active" | "blocked" | "completed" | "failed";
  progress: number;
  steps: ProgressStep[];
  startedAt: string;
  estimatedCompletion?: string;
  elapsedMs: number;
}

export interface ProgressStep {
  label: string;
  status: "pending" | "active" | "completed" | "failed";
  detail?: string;
  durationMs?: number;
}

export interface OutcomeRecord {
  id: string;
  sessionId: string;
  timestamp: string;
  feature: string;
  action: string;
  timeSavedMs: number;
  decisionQuality: number;
  followThroughRate: number;
  userSatisfaction: number;
  completionRate: number;
  notes?: string;
}

export interface OutcomeSummary {
  totalActions: number;
  avgTimeSavedMs: number;
  avgDecisionQuality: number;
  avgFollowThrough: number;
  avgSatisfaction: number;
  topFeatures: Array<{ feature: string; count: number; avgSatisfaction: number }>;
  trend: "improving" | "stable" | "declining";
}

export interface PersistentMemoryEntry {
  id: string;
  workspaceId: string;
  userId: string;
  type: "decision" | "fact" | "preference" | "insight" | "commitment";
  content: string;
  context: string;
  importance: number;
  sourceSession: string;
  tags: string[];
  createdAt: string;
  lastAccessed: string;
  accessCount: number;
  linkedEntries: string[];
}

export interface MemoryRecallQuery {
  keywords?: string[];
  types?: PersistentMemoryEntry["type"][];
  minImportance?: number;
  maxResults?: number;
  sessionScope?: "current" | "recent" | "all";
}

export interface ContextNode3D {
  id: string;
  label: string;
  type: "project" | "document" | "person" | "decision" | "task" | "insight" | "thread";
  weight: number;
  x?: number;
  y?: number;
  z?: number;
  color?: string;
  metadata: Record<string, unknown>;
}

export interface ContextEdge3D {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface ContextGraph3D {
  nodes: ContextNode3D[];
  edges: ContextEdge3D[];
  clusters: Array<{ id: string; label: string; nodeIds: string[] }>;
  lastUpdated: string;
}

export function createDefaultTtsState(): VoiceTtsState {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return { isSpeaking: false, isPaused: false, utterance: null, voice: null, rate: 1, pitch: 1, volume: 1, supported: false, voices: [] };
  }
  const voices = window.speechSynthesis.getVoices();
  return { isSpeaking: false, isPaused: false, utterance: null, voice: voices[0] ?? null, rate: 1, pitch: 1, volume: 1, supported: true, voices };
}

export function speakText(text: string, state: VoiceTtsState): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!state.supported || !window.speechSynthesis) { reject(new Error("TTS not supported")); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (state.voice) utterance.voice = state.voice;
    utterance.rate = state.rate;
    utterance.pitch = state.pitch;
    utterance.volume = state.volume;
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(new Error(e.error));
    window.speechSynthesis.speak(utterance);
  });
}

export function pauseSpeech(): void { if (typeof window !== "undefined") window.speechSynthesis?.pause(); }
export function resumeSpeech(): void { if (typeof window !== "undefined") window.speechSynthesis?.resume(); }
export function stopSpeech(): void { if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }

export const VOICE_PROFILES: VoiceProfile[] = [
  { id: "clear", name: "Clear Narrator", language: "en-US", voiceUri: "", pitch: 1, rate: 1 },
  { id: "warm", name: "Warm Guide", language: "en-US", voiceUri: "", pitch: 0.9, rate: 0.9 },
  { id: "fast", name: "Quick Brief", language: "en-US", voiceUri: "", pitch: 1.1, rate: 1.3 },
  { id: "calm", name: "Calm Teacher", language: "en-GB", voiceUri: "", pitch: 0.8, rate: 0.8 },
];

export function createLearningModule(topic: string, difficulty: LearningModule["difficulty"]): LearningModule {
  const modules: Record<string, LearningModule> = {
    architecture: {
      id: "learn_architecture",
      title: "System Architecture Fundamentals",
      topic: "architecture",
      difficulty,
      estimatedMinutes: difficulty === "beginner" ? 15 : difficulty === "intermediate" ? 25 : 40,
      prerequisites: difficulty === "beginner" ? [] : ["Basic programming concepts"],
      objectives: ["Understand core patterns", "Identify tradeoffs", "Apply to real projects"],
      steps: [
        { stepNumber: 1, title: "What is Architecture?", content: "System architecture is the fundamental organization of a system embodied in its components, their relationships to each other, and to the environment.", keyPoints: ["Structure over implementation", "Guides decision-making", "Evolves over time"], completed: false },
        { stepNumber: 2, title: "Key Patterns", content: "Common patterns include layered architecture, microservices, event-driven, and modular monoliths. Each has distinct tradeoffs.", keyPoints: ["Layered: simple but rigid", "Microservices: scalable but complex", "Event-driven: decoupled but hard to debug"], completed: false },
        { stepNumber: 3, title: "Making Tradeoffs", content: "Every architectural decision involves tradeoffs between scalability, maintainability, complexity, and cost.", keyPoints: ["No perfect solution", "Context matters", "Start simple, evolve as needed"], checkQuestion: "Which pattern best suits a small team building an MVP?", checkAnswer: "Modular monolith — simpler ops, easier refactoring later.", completed: false },
      ],
    },
    default: {
      id: `learn_${topic.replace(/\s+/g, "_")}`,
      title: `Learning: ${topic}`,
      topic,
      difficulty,
      estimatedMinutes: 20,
      prerequisites: [],
      objectives: ["Understand the basics", "Apply knowledge", "Evaluate outcomes"],
      steps: [
        { stepNumber: 1, title: `Introduction to ${topic}`, content: `Let's explore ${topic} from the ground up.`, keyPoints: ["Core concept", "Why it matters", "Common use cases"], completed: false },
        { stepNumber: 2, title: "Deeper Dive", content: `Now that we understand the basics, let's look at how ${topic} applies in practice.`, keyPoints: ["Real-world application", "Best practices", "Pitfalls to avoid"], checkQuestion: `What is the primary benefit of understanding ${topic}?`, checkAnswer: "Better decision-making and fewer costly mistakes.", completed: false },
        { stepNumber: 3, title: "Putting It Together", content: `Let's synthesize what we've learned about ${topic} and how to apply it.`, keyPoints: ["Integration", "Next steps", "Resources"], completed: false },
      ],
    },
  };
  return modules[topic] ?? modules.default!;
}

export function evaluateLearningAnswer(step: LearningStep, userAnswer: string): { correct: boolean; feedback: string } {
  if (!step.checkAnswer) return { correct: true, feedback: "No check question for this step." };
  const normalized = userAnswer.toLowerCase().trim();
  const answer = step.checkAnswer.toLowerCase();
  const keyTerms = answer.split(/\s+/).filter((w) => w.length > 3);
  const matchedTerms = keyTerms.filter((term) => normalized.includes(term));
  const score = keyTerms.length > 0 ? matchedTerms.length / keyTerms.length : 1;
  return {
    correct: score >= 0.5,
    feedback: score >= 0.8 ? "Excellent! You nailed the key concepts." : score >= 0.5 ? "Good understanding. Consider: " + step.checkAnswer : "Not quite. Think about: " + step.checkAnswer,
  };
}

export function constrainResearch(
  query: string,
  sources: ResearchSource[],
  constraints: SourceConstraint[],
): ConstrainedResearchResult {
  let filtered = [...sources];
  let filteredOut = 0;

  for (const constraint of constraints) {
    const before = filtered.length;
    if (constraint.type === "include") {
      if (constraint.domain) filtered = filtered.filter((s) => s.domain === constraint.domain || s.url?.includes(constraint.domain!));
      if (constraint.module) filtered = filtered.filter((s) => s.type === "document");
      if (constraint.confidenceThreshold) filtered = filtered.filter((s) => s.relevanceScore >= constraint.confidenceThreshold!);
    } else {
      if (constraint.domain) filtered = filtered.filter((s) => s.domain !== constraint.domain && !s.url?.includes(constraint.domain!));
      if (constraint.documentId) filtered = filtered.filter((s) => s.id !== constraint.documentId);
    }
    filteredOut += before - filtered.length;
  }

  filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);

  const gaps: string[] = [];
  if (filtered.length === 0) gaps.push("No sources match the given constraints — try broadening your scope");
  if (!filtered.some((s) => s.type === "document")) gaps.push("No internal documents found — consider connecting relevant modules");
  if (!filtered.some((s) => s.type === "web")) gaps.push("No web results — enable web search for broader coverage");

  return {
    query,
    constraints,
    matchedSources: filtered.slice(0, 10),
    filteredOut,
    synthesis: filtered.length > 0 ? `Found ${filtered.length} relevant sources. Top source: "${filtered[0]!.title}" (${(filtered[0]!.relevanceScore * 100).toFixed(0)}% match)` : "No matching sources found.",
    gaps,
  };
}

export function createTaskProgress(taskId: string, label: string, stepLabels: string[]): TaskProgress {
  return {
    taskId,
    label,
    status: "queued",
    progress: 0,
    steps: stepLabels.map((l) => ({ label: l, status: "pending" })),
    startedAt: new Date().toISOString(),
    elapsedMs: 0,
  };
}

export function updateTaskStep(progress: TaskProgress, stepIndex: number, status: ProgressStep["status"], detail?: string): TaskProgress {
  const steps = [...progress.steps];
  if (steps[stepIndex]) {
    steps[stepIndex] = { ...steps[stepIndex]!, status, detail, durationMs: status === "completed" ? Date.now() - new Date(progress.startedAt).getTime() : undefined };
  }
  const completedSteps = steps.filter((s) => s.status === "completed").length;
  return {
    ...progress,
    steps,
    progress: steps.length > 0 ? completedSteps / steps.length : 0,
    status: completedSteps === steps.length ? "completed" : status === "active" ? "active" : progress.status,
  };
}

export function recordOutcome(record: Omit<OutcomeRecord, "id" | "timestamp">): OutcomeRecord {
  return { ...record, id: `out_${Date.now().toString(36)}`, timestamp: new Date().toISOString() };
}

export function summarizeOutcomes(records: OutcomeRecord[]): OutcomeSummary {
  if (records.length === 0) return { totalActions: 0, avgTimeSavedMs: 0, avgDecisionQuality: 0, avgFollowThrough: 0, avgSatisfaction: 0, topFeatures: [], trend: "stable" };
  const featureMap = new Map<string, { count: number; totalSatisfaction: number }>();
  for (const r of records) {
    const existing = featureMap.get(r.feature) ?? { count: 0, totalSatisfaction: 0 };
    existing.count++;
    existing.totalSatisfaction += r.userSatisfaction;
    featureMap.set(r.feature, existing);
  }
  const recent = records.slice(-5);
  const earlier = records.slice(0, 5);
  const recentAvg = recent.reduce((a, r) => a + r.userSatisfaction, 0) / recent.length;
  const earlierAvg = earlier.length > 0 ? earlier.reduce((a, r) => a + r.userSatisfaction, 0) / earlier.length : recentAvg;
  return {
    totalActions: records.length,
    avgTimeSavedMs: records.reduce((a, r) => a + r.timeSavedMs, 0) / records.length,
    avgDecisionQuality: records.reduce((a, r) => a + r.decisionQuality, 0) / records.length,
    avgFollowThrough: records.reduce((a, r) => a + r.followThroughRate, 0) / records.length,
    avgSatisfaction: records.reduce((a, r) => a + r.userSatisfaction, 0) / records.length,
    topFeatures: Array.from(featureMap.entries()).map(([feature, { count, totalSatisfaction }]) => ({ feature, count, avgSatisfaction: totalSatisfaction / count })).sort((a, b) => b.count - a.count).slice(0, 5),
    trend: recentAvg > earlierAvg + 0.1 ? "improving" : recentAvg < earlierAvg - 0.1 ? "declining" : "stable",
  };
}

export function recallMemories(memories: PersistentMemoryEntry[], query: MemoryRecallQuery): PersistentMemoryEntry[] {
  let results = [...memories];
  if (query.types && query.types.length > 0) results = results.filter((m) => query.types!.includes(m.type));
  if (query.minImportance) results = results.filter((m) => m.importance >= query.minImportance!);
  if (query.keywords && query.keywords.length > 0) {
    results = results.filter((m) => query.keywords!.some((kw) => m.content.toLowerCase().includes(kw.toLowerCase()) || m.tags.some((t) => t.toLowerCase().includes(kw.toLowerCase()))));
  }
  results.sort((a, b) => b.importance - a.importance);
  return results.slice(0, query.maxResults ?? 10);
}

export function buildContextGraph(
  conversations: Array<{ messages: Array<{ role: string; content: string }> }>,
  documents: Array<{ id: string; title: string; module: string }>,
): ContextGraph3D {
  const nodes: ContextNode3D[] = [];
  const edges: ContextEdge3D[] = [];
  const nodeMap = new Map<string, ContextNode3D>();

  for (const doc of documents.slice(0, 15)) {
    const node: ContextNode3D = { id: `doc_${doc.id}`, label: doc.title, type: "document", weight: 3, color: "#4f46e5", metadata: { module: doc.module } };
    nodes.push(node);
    nodeMap.set(node.id, node);
  }

  const decisionNodes: ContextNode3D[] = [];
  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (msg.role !== "assistant") continue;
      const decisions = msg.content.match(/(?:decided|chosen|recommended|suggest)\s+([^.!?]+)/gi);
      if (decisions) {
        for (const d of decisions) {
          const node: ContextNode3D = { id: `dec_${nodes.length}`, label: d.slice(0, 40), type: "decision", weight: 2, color: "#10b981", metadata: {} };
          nodes.push(node);
          decisionNodes.push(node);
        }
      }
    }
  }

  for (let i = 0; i < Math.min(decisionNodes.length, 5); i++) {
    const docNode = nodes[Math.floor(Math.random() * Math.min(documents.length, 15))];
    if (docNode && decisionNodes[i]) {
      edges.push({ source: docNode.id, target: decisionNodes[i]!.id, relation: "informed", weight: 1 });
    }
  }

  const clusters: ContextGraph3D["clusters"] = [];
  const modules = [...new Set(documents.map((d) => d.module))];
  for (const mod of modules.slice(0, 4)) {
    const modNodes = nodes.filter((n) => n.metadata.module === mod).map((n) => n.id);
    if (modNodes.length > 0) clusters.push({ id: `cluster_${mod}`, label: mod, nodeIds: modNodes });
  }

  return { nodes, edges, clusters, lastUpdated: new Date().toISOString() };
}
