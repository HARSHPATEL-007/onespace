import type { ReasoningDepth } from "./deep-think";

export interface MultiPassResult {
  finalAnswer: string;
  rounds: CritiqueRound[];
  improvementScore: number;
}

export interface CritiqueRound {
  round: number;
  draft: string;
  critique: string;
  improvements: string[];
  revised: string;
}

export interface ContextDigestionResult {
  summary: string;
  keyFacts: string[];
  entities: Array<{ name: string; type: string; mentions: number }>;
  relationships: Array<{ from: string; to: string; relation: string }>;
  compressedTokenCount: number;
  originalTokenCount: number;
  relevanceScore: number;
}

export interface AutonomousWorkflowStep {
  step: number;
  action: string;
  tool: string;
  description: string;
  status: "pending" | "executing" | "done" | "blocked" | "needs_approval";
  result?: string;
}

export interface AutonomousWorkflow {
  id: string;
  goal: string;
  steps: AutonomousWorkflowStep[];
  currentStep: number;
  completed: boolean;
  requiresApproval: boolean;
  approvedSteps: number[];
}

export function buildMultiPassAnswer(
  initialDraft: string,
  rounds: number,
  depth: ReasoningDepth,
): MultiPassResult {
  if (rounds <= 0) {
    return { finalAnswer: initialDraft, rounds: [], improvementScore: 0 };
  }

  const critiqueRounds: CritiqueRound[] = [];
  let currentDraft = initialDraft;

  for (let i = 1; i <= rounds; i++) {
    const critique = _generateCritique(currentDraft, i);
    const improvements = _identifyImprovements(currentDraft, critique, depth);
    const revised = _applyImprovements(currentDraft, improvements);

    critiqueRounds.push({
      round: i,
      draft: currentDraft,
      critique,
      improvements,
      revised,
    });

    currentDraft = revised;
  }

  const improvementScore = Math.min(0.95, critiqueRounds.length * 0.15 + 0.1);

  return {
    finalAnswer: currentDraft,
    rounds: critiqueRounds,
    improvementScore,
  };
}

function _generateCritique(draft: string, round: number): string {
  const wordCount = draft.split(/\s+/).length;
  const hasStructure =
    draft.includes("\n") || draft.includes("-") || draft.includes(".");
  const hasSpecifics = /\d+|specifically|for example|such as|instance/i.test(
    draft,
  );

  const issues: string[] = [];

  if (wordCount < 50) issues.push("Response lacks sufficient depth and detail");
  if (!hasStructure)
    issues.push("Could benefit from clearer structure and organization");
  if (!hasSpecifics) issues.push("Needs more concrete examples or specifics");
  if (!draft.includes("?")) issues.push("Could anticipate follow-up questions");

  if (round > 1) {
    if (draft.length < 200)
      issues.push("Second pass: still too concise for the depth level");
    if (
      !draft.toLowerCase().includes("however") &&
      !draft.toLowerCase().includes("consider")
    ) {
      issues.push("Missing nuance or alternative perspectives");
    }
  }

  return issues.length > 0
    ? issues.join(". ") + "."
    : "Draft meets quality standards.";
}

function _identifyImprovements(
  draft: string,
  critique: string,
  depth: ReasoningDepth,
): string[] {
  const improvements: string[] = [];

  if (critique.includes("depth"))
    improvements.push("Expand with additional detail and examples");
  if (critique.includes("structure"))
    improvements.push("Reorganize with clear sections and headers");
  if (critique.includes("specifics"))
    improvements.push("Add concrete examples and data points");
  if (critique.includes("follow-up"))
    improvements.push("Address likely follow-up concerns");
  if (critique.includes("nuance") && depth !== "fast")
    improvements.push("Add balanced perspective with tradeoffs");

  return improvements.length > 0
    ? improvements
    : ["Minor polish and clarity improvements"];
}

function _applyImprovements(draft: string, improvements: string[]): string {
  let result = draft;

  if (
    improvements.some((i) => i.includes("structure")) &&
    !draft.includes("\n\n")
  ) {
    const sentences = draft.split(/(?<=[.!?])\s+/);
    if (sentences.length > 3) {
      const mid = Math.floor(sentences.length / 2);
      result =
        sentences.slice(0, mid).join(" ") +
        "\n\n" +
        sentences.slice(mid).join(" ");
    }
  }

  if (
    improvements.some((i) => i.includes("examples")) &&
    !draft.includes("For example")
  ) {
    result += "\n\nKey considerations to keep in mind as you evaluate this.";
  }

  if (improvements.some((i) => i.includes("follow-up"))) {
    result += "\n\nWould you like me to dive deeper into any specific aspect?";
  }

  return result;
}

export function digestContext(
  messages: Array<{ role: string; content: string }>,
  documents: Array<{ title: string; content: string }>,
  maxTokens: number,
): ContextDigestionResult {
  const allContent = [
    ...messages.map((m) => `[${m.role}] ${m.content}`),
    ...documents.map((d) => `[${d.title}] ${d.content}`),
  ].join("\n\n");

  const originalTokens = Math.ceil(allContent.length / 4);

  const sentences = allContent.split(/(?<=[.!?])\s+/);
  const scoredSentences = sentences.map((s, idx) => ({
    text: s,
    score: _scoreSentenceRelevance(s, idx, sentences.length),
    index: idx,
  }));

  scoredSentences.sort((a, b) => b.score - a.score);

  const budgetTokens = Math.min(maxTokens, Math.ceil(originalTokens * 0.3));
  const selected: typeof scoredSentences = [];
  let usedTokens = 0;

  for (const s of scoredSentences) {
    const tokens = Math.ceil(s.text.length / 4);
    if (usedTokens + tokens > budgetTokens) break;
    selected.push(s);
    usedTokens += tokens;
  }

  selected.sort((a, b) => a.index - b.index);

  const summary = selected.map((s) => s.text).join(" ");
  const keyFacts = _extractKeyFacts(allContent);
  const entities = _extractEntities(allContent);
  const relationships = _extractRelationships(allContent, entities);

  return {
    summary: summary || allContent.slice(0, 2000),
    keyFacts,
    entities,
    relationships,
    compressedTokenCount: usedTokens,
    originalTokenCount: originalTokens,
    relevanceScore:
      selected.length > 0
        ? selected.reduce((a, s) => a + s.score, 0) / selected.length
        : 0.5,
  };
}

function _scoreSentenceRelevance(
  sentence: string,
  index: number,
  total: number,
): number {
  let score = 0.5;
  const lower = sentence.toLowerCase();

  if (/\b(important|critical|key|must|essential|primary)\b/.test(lower))
    score += 0.3;
  if (/\b(decided|agreed|concluded|determined)\b/.test(lower)) score += 0.25;
  if (/\b(\$[\d,]+|deadline|date|milestone|deliverable)\b/.test(lower))
    score += 0.2;
  if (/\b(risk|issue|blocker|concern|warning)\b/.test(lower)) score += 0.25;
  if (index < total * 0.1 || index > total * 0.9) score += 0.1;
  if (sentence.length > 200) score += 0.05;

  return Math.min(1, score);
}

function _extractKeyFacts(content: string): string[] {
  const facts: string[] = [];
  const sentences = content.split(/(?<=[.!?])\s+/);

  for (const s of sentences) {
    if (
      /\b(is|are|was|were|has|have|will|must|requires)\b/.test(s) &&
      s.length > 20 &&
      s.length < 200
    ) {
      facts.push(s.trim());
    }
    if (facts.length >= 8) break;
  }

  return facts;
}

function _extractEntities(
  content: string,
): Array<{ name: string; type: string; mentions: number }> {
  const entityMap = new Map<string, { type: string; count: number }>();

  const namePatterns = [
    { regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g, type: "named_entity" },
    { regex: /\b([A-Z]{2,})\b/g, type: "acronym" },
    { regex: /`([^`]+)`/g, type: "code_ref" },
  ];

  for (const { regex, type } of namePatterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1]!.trim();
      if (name.length < 2 || name.length > 50) continue;
      const existing = entityMap.get(name);
      if (existing) existing.count++;
      else entityMap.set(name, { type, count: 1 });
    }
  }

  return Array.from(entityMap.entries())
    .map(([name, { type, count }]) => ({ name, type, mentions: count }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 12);
}

function _extractRelationships(
  content: string,
  entities: Array<{ name: string; type: string }>,
): Array<{ from: string; to: string; relation: string }> {
  const relationships: Array<{ from: string; to: string; relation: string }> =
    [];
  const topEntities = entities.slice(0, 6).map((e) => e.name);

  for (let i = 0; i < topEntities.length; i++) {
    for (let j = i + 1; j < topEntities.length; j++) {
      const a = topEntities[i]!;
      const b = topEntities[j]!;
      const proximity = _findProximity(content, a, b);
      if (proximity < 200 && proximity > 0) {
        relationships.push({ from: a, to: b, relation: "related" });
      }
    }
  }

  return relationships;
}

function _findProximity(content: string, a: string, b: string): number {
  const idxA = content.indexOf(a);
  const idxB = content.indexOf(b);
  if (idxA === -1 || idxB === -1) return -1;
  return Math.abs(idxA - idxB);
}

export function buildAutonomousWorkflow(
  intent: string,
  toolsAvailable: string[],
): AutonomousWorkflow {
  const steps: AutonomousWorkflowStep[] = [];
  const lower = intent.toLowerCase();

  if (lower.includes("schedule") || lower.includes("meeting")) {
    steps.push({
      step: 1,
      action: "Check calendar availability",
      tool: "calendar:query",
      description: "Query attendee availability",
      status: "pending",
    });
    steps.push({
      step: 2,
      action: "Find optimal time slot",
      tool: "calendar:optimize",
      description: "Compute best meeting time",
      status: "pending",
    });
    steps.push({
      step: 3,
      action: "Create event",
      tool: "calendar:create",
      description: "Schedule the meeting",
      status: "pending",
    });
    steps.push({
      step: 4,
      action: "Send invites",
      tool: "mail:send",
      description: "Notify attendees",
      status: "pending",
    });
  } else if (lower.includes("report") || lower.includes("summarize")) {
    steps.push({
      step: 1,
      action: "Gather source documents",
      tool: "docs:query",
      description: "Find relevant documents",
      status: "pending",
    });
    steps.push({
      step: 2,
      action: "Extract key data",
      tool: "analyze",
      description: "Process document content",
      status: "pending",
    });
    steps.push({
      step: 3,
      action: "Generate summary",
      tool: "generate",
      description: "Produce report",
      status: "pending",
    });
    steps.push({
      step: 4,
      action: "Save output",
      tool: "docs:create",
      description: "Store final report",
      status: "pending",
    });
  } else {
    steps.push({
      step: 1,
      action: "Analyze request",
      tool: "analyze",
      description: "Understand what needs to be done",
      status: "pending",
    });
    steps.push({
      step: 2,
      action: "Execute primary action",
      tool: toolsAvailable[0] || "process",
      description: "Perform main task",
      status: "pending",
    });
    steps.push({
      step: 3,
      action: "Verify result",
      tool: "verify",
      description: "Check output quality",
      status: "pending",
    });
  }

  const hasHighRisk = steps.some((s) =>
    ["create", "send", "delete"].some((a) =>
      s.action.toLowerCase().includes(a),
    ),
  );

  return {
    id: `wf_${Date.now().toString(36)}`,
    goal: intent,
    steps,
    currentStep: 0,
    completed: false,
    requiresApproval: hasHighRisk,
    approvedSteps: [],
  };
}
