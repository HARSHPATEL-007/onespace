import type { ANIResponse, IntentClass, UserIntent } from "./engine";

export type ReasoningDepth = "fast" | "balanced" | "deep" | "research";

export type ExplanationLevel = "quick" | "guided" | "executive";

export interface ComplexityAssessment {
  score: number;
  isAmbiguous: boolean;
  isTechnical: boolean;
  isHighStakes: boolean;
  isMultiPart: boolean;
  recommendedDepth: ReasoningDepth;
  detectedTopics: string[];
  missingContext: string[];
}

export interface ReasoningStep {
  phase: string;
  label: string;
  durationMs: number;
  detail: string;
  status: "pending" | "active" | "done";
}

export interface TraceableThought {
  summary: string;
  steps: ReasoningStep[];
  confidenceFactors: string[];
  assumptions: string[];
  sourcesUsed: string[];
  complexity: ComplexityAssessment;
  depth: ReasoningDepth;
  totalDurationMs: number;
  passedClarification: boolean;
  multiPassRounds: number;
}

export interface DeepThinkResult {
  response: ANIResponse;
  thought: TraceableThought;
  actions: AutonomousAction[];
  proactiveFollowups: string[];
  memoryMarks: MemoryMark[];
  feedbackPanel: FeedbackPanel;
}

export interface AutonomousAction {
  id: string;
  tool: string;
  label: string;
  description: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
  status: "pending" | "approved" | "executing" | "done" | "skipped";
  result?: string;
}

export interface MemoryMark {
  id: string;
  type: "fact" | "decision" | "wip" | "insight" | "action";
  label: string;
  content: string;
  timestamp: string;
  contextRef?: string;
}

export interface FeedbackPanel {
  confidence: number;
  assumptions: string[];
  nextBestActions: string[];
  evidenceQuality: "weak" | "moderate" | "strong";
  sources: Array<{ name: string; type: string; confidence: number }>;
}

const COMPLEXITY_INDICATORS = {
  ambiguous: ["might", "maybe", "possibly", "unclear", "not sure", "could be", "or", "versus", "vs", "tradeoff", "compare", "which is better"],
  technical: ["architecture", "design pattern", "algorithm", "performance", "optimization", "database", "api", "refactor", "migrate", "scale", "infrastructure", "security", "encryption", "latency"],
  highStakes: ["production", "revenue", "customer", "deadline", "launch", "deploy", "payment", "contract", "legal", "compliance", "migration", "outage"],
  multiPart: ["and then", "also", "additionally", "first", "second", "step", "after that", "finally", "meanwhile", "parallel", "workflow", "process"],
};

const MISSING_CONTEXT_PATTERNS = [
  { pattern: /^(what|how|why)\b/i, needs: "specific subject reference" },
  { pattern: /(it|that|this|they)\b/i, needs: "entity disambiguation" },
  { pattern: /\b(best|recommend|suggest)\b/i, needs: "criteria or constraints" },
  { pattern: /\b(compare|versus|vs)\b/i, needs: "comparison dimensions" },
  { pattern: /\b(fix|resolve|solve)\b/i, needs: "error details or symptoms" },
];

export function assessComplexity(input: string, intent: UserIntent, contextWindow: number): ComplexityAssessment {
  const lower = input.toLowerCase();
  const words = lower.split(/\s+/);

  const isAmbiguous = COMPLEXITY_INDICATORS.ambiguous.filter((w) => lower.includes(w)).length >= 2;
  const isTechnical = COMPLEXITY_INDICATORS.technical.filter((w) => lower.includes(w)).length >= 1;
  const isHighStakes = COMPLEXITY_INDICATORS.highStakes.filter((w) => lower.includes(w)).length >= 1 || intent.riskLevel === "high" || intent.riskLevel === "critical";
  const isMultiPart = COMPLEXITY_INDICATORS.multiPart.filter((w) => lower.includes(w)).length >= 2 || words.length > 30;

  let score = 0;
  if (isAmbiguous) score += 0.25;
  if (isTechnical) score += 0.2;
  if (isHighStakes) score += 0.25;
  if (isMultiPart) score += 0.15;
  if (words.length > 50) score += 0.1;
  if (intent.toolsNeeded.length > 3) score += 0.05;
  score = Math.min(1, score);

  let recommendedDepth: ReasoningDepth = "fast";
  if (score > 0.7) recommendedDepth = "research";
  else if (score > 0.45) recommendedDepth = "deep";
  else if (score > 0.2) recommendedDepth = "balanced";

  const detectedTopics: string[] = [];
  for (const topic of COMPLEXITY_INDICATORS.technical) {
    if (lower.includes(topic)) detectedTopics.push(topic);
  }

  const missingContext: string[] = [];
  for (const { pattern, needs } of MISSING_CONTEXT_PATTERNS) {
    if (pattern.test(lower) && words.length < 15) {
      missingContext.push(needs);
    }
  }

  return { score, isAmbiguous, isTechnical, isHighStakes, isMultiPart, recommendedDepth, detectedTopics, missingContext };
}

export function getDepthSettings(depth: ReasoningDepth): {
  maxTokens: number;
  temperature: number;
  multiPassRounds: number;
  useDeepThink: boolean;
  useSelfCritique: boolean;
  contextLookback: number;
  reasoningSteps: number;
  latencyBudgetMs: number;
} {
  const settings: Record<ReasoningDepth, ReturnType<typeof getDepthSettings>> = {
    fast: {
      maxTokens: 1024,
      temperature: 0.5,
      multiPassRounds: 0,
      useDeepThink: false,
      useSelfCritique: false,
      contextLookback: 5,
      reasoningSteps: 2,
      latencyBudgetMs: 1500,
    },
    balanced: {
      maxTokens: 2048,
      temperature: 0.7,
      multiPassRounds: 1,
      useDeepThink: false,
      useSelfCritique: true,
      contextLookback: 10,
      reasoningSteps: 3,
      latencyBudgetMs: 3000,
    },
    deep: {
      maxTokens: 4096,
      temperature: 0.8,
      multiPassRounds: 2,
      useDeepThink: true,
      useSelfCritique: true,
      contextLookback: 20,
      reasoningSteps: 5,
      latencyBudgetMs: 8000,
    },
    research: {
      maxTokens: 8192,
      temperature: 0.9,
      multiPassRounds: 3,
      useDeepThink: true,
      useSelfCritique: true,
      contextLookback: 50,
      reasoningSteps: 8,
      latencyBudgetMs: 20000,
    },
  };
  return settings[depth];
}

export function buildReasoningSteps(depth: ReasoningDepth, intent: UserIntent): ReasoningStep[] {
  const allSteps: ReasoningStep[] = [
    { phase: "understand", label: "Understanding query", durationMs: 200, detail: "Parsing intent and entities", status: "pending" },
    { phase: "context", label: "Gathering context", durationMs: 300, detail: "Retrieving relevant history and documents", status: "pending" },
    { phase: "analyze", label: "Analyzing", durationMs: 400, detail: `Processing ${intent.classification} intent`, status: "pending" },
    { phase: "reason", label: "Reasoning", durationMs: 500, detail: "Multi-step logical analysis", status: "pending" },
    { phase: "verify", label: "Verifying", durationMs: 300, detail: "Cross-checking facts and logic", status: "pending" },
    { phase: "synthesize", label: "Synthesizing", durationMs: 300, detail: "Assembling coherent response", status: "pending" },
    { phase: "critique", label: "Self-critique", durationMs: 400, detail: "Evaluating response quality", status: "pending" },
    { phase: "finalize", label: "Finalizing", durationMs: 200, detail: "Polishing output", status: "pending" },
  ];

  const countMap: Record<ReasoningDepth, number> = { fast: 2, balanced: 4, deep: 6, research: 8 };
  return allSteps.slice(0, countMap[depth]);
}

export function needsClarification(input: string, complexity: ComplexityAssessment): { needsTo: boolean; question?: string } {
  if (complexity.missingContext.length > 0 && complexity.score > 0.3) {
    const questionMap: Record<string, string> = {
      "specific subject reference": "Could you clarify what specific subject or item you're referring to?",
      "entity disambiguation": "Which specific entity or item should I focus on?",
      "criteria or constraints": "What criteria or constraints should I consider for this recommendation?",
      "comparison dimensions": "What aspects matter most for this comparison?",
      "error details or symptoms": "Can you share the specific error message or symptoms you're seeing?",
    };
    const topMissing = complexity.missingContext[0]!;
    return { needsTo: true, question: questionMap[topMissing] || "Could you provide more details so I can give you the best answer?" };
  }

  if (complexity.isAmbiguous && input.split(/\s+/).length < 8) {
    return { needsTo: true, question: "I want to make sure I understand — could you tell me more about what you're trying to achieve?" };
  }

  return { needsTo: false };
}

export function generateMemoryMarks(input: string, response: string, intent: UserIntent): MemoryMark[] {
  const marks: MemoryMark[] = [];
  const now = new Date().toISOString();

  if (intent.classification === "action") {
    marks.push({
      id: `mm_${Date.now()}_action`,
      type: "action",
      label: "Task identified",
      content: input.slice(0, 100),
      timestamp: now,
    });
  }

  if (intent.riskLevel === "high" || intent.riskLevel === "critical") {
    marks.push({
      id: `mm_${Date.now()}_risk`,
      type: "decision",
      label: "High-stakes decision point",
      content: `Risk level: ${intent.riskLevel}. Query: ${input.slice(0, 80)}...`,
      timestamp: now,
    });
  }

  if (response.includes("recommend") || response.includes("suggest")) {
    marks.push({
      id: `mm_${Date.now()}_rec`,
      type: "insight",
      label: "Recommendation made",
      content: response.slice(0, 120),
      timestamp: now,
    });
  }

  return marks;
}

export function buildFeedbackPanel(
  complexity: ComplexityAssessment,
  depth: ReasoningDepth,
  intent: UserIntent,
): FeedbackPanel {
  const evidenceQuality: FeedbackPanel["evidenceQuality"] =
    depth === "research" ? "strong" : depth === "deep" ? "moderate" : "weak";

  const nextBestActions: string[] = [];
  if (intent.classification === "action") nextBestActions.push("Review proposed actions and confirm execution");
  if (complexity.isTechnical) nextBestActions.push("Verify technical recommendations against current architecture");
  if (intent.toolsNeeded.length > 0) nextBestActions.push("Check connected integrations for relevant live data");
  if (complexity.isHighStakes) nextBestActions.push("Have a team member review before proceeding");
  if (nextBestActions.length === 0) nextBestActions.push("Continue the conversation for follow-up questions");

  return {
    confidence: Math.min(0.98, 0.5 + complexity.score * 0.3 + (depth === "fast" ? 0.1 : 0)),
    assumptions: [
      `Intent classified as "${intent.classification}"`,
      `Complexity score: ${(complexity.score * 100).toFixed(0)}%`,
      `Using ${depth} reasoning mode`,
    ],
    nextBestActions,
    evidenceQuality,
    sources: intent.toolsNeeded.map((t: string) => ({ name: t, type: "tool", confidence: 0.85 })),
  };
}
