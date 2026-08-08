export interface VoiceState {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  interimTranscript: string;
  confidence: number;
  error: string | null;
  supported: boolean;
}

export interface VoiceCommand {
  trigger: string;
  action: string;
  description: string;
}

export type ContentTransformType =
  "sharpen" | "clarify" | "condense" | "actionable" | "executive";

export interface ContentTransformResult {
  original: string;
  transformed: string;
  transformType:
    "sharpen" | "clarify" | "condense" | "actionable" | "executive";
  wordCountBefore: number;
  wordCountAfter: number;
  changes: string[];
}

export interface CrossSessionMemory {
  sessionId: string;
  timestamp: string;
  keyDecisions: DecidedFact[];
  importantFacts: DecidedFact[];
  actionItems: ActionItem[];
  summary: string;
  linkedSessions: string[];
}

export interface DecidedFact {
  id: string;
  content: string;
  category: "decision" | "preference" | "commitment" | "insight";
  confidence: number;
  sourceSession: string;
  referencedIn: string[];
}

export interface ActionItem {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "deferred";
  origin: string;
  deadline?: string;
}

export interface ClutterConfig {
  level: "minimal" | "focused" | "balanced" | "detailed";
  showToolCalls: boolean;
  showCitations: boolean;
  showThoughts: boolean;
  showMetrics: boolean;
  showFeedbackPanel: boolean;
  messageDensity: "compact" | "normal" | "spacious";
  maxVisibleMessages: number;
}

export interface CheckpointResult {
  checkpointId: string;
  timestamp: string;
  phase: string;
  passed: boolean;
  issues: string[];
  suggestions: string[];
  score: number;
}

export interface OutcomeMetric {
  featureId: string;
  sessionId: string;
  timestamp: string;
  timeSavedMs: number;
  decisionQuality: number;
  followThroughRate: number;
  userSatisfaction: number;
  completionRate: number;
}

export const VOICE_COMMANDS: VoiceCommand[] = [
  {
    trigger: "hey ani",
    action: "wake",
    description: "Activate voice listening",
  },
  {
    trigger: "stop listening",
    action: "sleep",
    description: "Deactivate voice listening",
  },
  {
    trigger: "clear conversation",
    action: "clear",
    description: "Clear current conversation",
  },
  {
    trigger: "new conversation",
    action: "new",
    description: "Start a new conversation",
  },
  {
    trigger: "enable deep think",
    action: "depth_deep",
    description: "Switch to deep thinking mode",
  },
  {
    trigger: "enable fast mode",
    action: "depth_fast",
    description: "Switch to fast mode",
  },
  {
    trigger: "show thoughts",
    action: "thoughts_on",
    description: "Show reasoning trace",
  },
  {
    trigger: "hide thoughts",
    action: "thoughts_off",
    description: "Hide reasoning trace",
  },
  {
    trigger: "save this",
    action: "memory_mark",
    description: "Save current context to memory",
  },
];

export function createDefaultVoiceState(): VoiceState {
  return {
    isListening: false,
    isSpeaking: false,
    transcript: "",
    interimTranscript: "",
    confidence: 0,
    error: null,
    supported:
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window),
  };
}

export function matchVoiceCommand(transcript: string): VoiceCommand | null {
  const normalized = transcript.toLowerCase().trim();
  for (const cmd of VOICE_COMMANDS) {
    if (normalized.includes(cmd.trigger)) return cmd;
  }
  return null;
}

export function transformContent(
  text: string,
  transformType: ContentTransformResult["transformType"],
): ContentTransformResult {
  const original = text;
  const wordCountBefore = text.split(/\s+/).length;
  const changes: string[] = [];
  let transformed = text;

  switch (transformType) {
    case "sharpen":
      transformed = _sharpenText(text);
      changes.push("Removed filler words and weak modifiers");
      changes.push("Replaced passive voice with active");
      changes.push("Tightened sentence structure");
      break;
    case "clarify":
      transformed = _clarifyText(text);
      changes.push("Added explicit transitions");
      changes.push("Expanded acronyms on first use");
      changes.push("Added concrete examples");
      break;
    case "condense":
      transformed = _condenseText(text);
      changes.push("Removed redundancy");
      changes.push("Merged related sentences");
      changes.push("Kept only essential information");
      break;
    case "actionable":
      transformed = _makeActionable(text);
      changes.push("Added clear action verbs");
      changes.push("Structured as steps where applicable");
      changes.push("Added measurable outcomes");
      break;
    case "executive":
      transformed = _makeExecutive(text);
      changes.push("Moved conclusion to front");
      changes.push("Added key metrics");
      changes.push("Removed implementation details");
      break;
  }

  return {
    original,
    transformed,
    transformType,
    wordCountBefore,
    wordCountAfter: transformed.split(/\s+/).length,
    changes,
  };
}

function _sharpenText(text: string): string {
  let result = text;
  const weakPhrases: [RegExp, string][] = [
    [/\bvery\s+/gi, ""],
    [/\breally\s+/gi, ""],
    [/\bquite\s+/gi, ""],
    [/\bin order to\b/gi, "to"],
    [/\bdue to the fact that\b/gi, "because"],
    [/\bat this point in time\b/gi, "now"],
    [/\bfor the purpose of\b/gi, "to"],
    [/\bin the event that\b/gi, "if"],
    [/\bit is important to note that\b/gi, "note that"],
    [/\bthe fact of the matter is\b/gi, "actually"],
  ];
  for (const [pattern, replacement] of weakPhrases) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

function _clarifyText(text: string): string {
  let result = text;
  result = result.replace(
    /\b(API)\b(?! Application Programming Interface)/g,
    "API (Application Programming Interface)",
  );
  result = result.replace(/\b(UX|UI)\b/g, (match) =>
    match === "UX" ? "UX (User Experience)" : "UI (User Interface)",
  );
  result = result.replace(/\b(KPI)\b/g, "KPI (Key Performance Indicator)");
  if (!result.includes("Specifically") && !result.includes("For example")) {
    const sentences = result.split(/(?<=[.!?])\s+/);
    if (sentences.length > 2) {
      const insertIdx = Math.min(2, sentences.length - 1);
      sentences[insertIdx] =
        "Specifically, " +
        sentences[insertIdx]!.charAt(0).toLowerCase() +
        sentences[insertIdx]!.slice(1);
      result = sentences.join(" ");
    }
  }
  return result;
}

function _condenseText(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const unique = sentences.filter((s, i) => {
    const normalized = s.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    return !sentences
      .slice(0, i)
      .some(
        (prev) => prev.toLowerCase().replace(/[^a-z0-9\s]/g, "") === normalized,
      );
  });
  if (unique.length > 5) {
    return unique.slice(0, Math.ceil(unique.length * 0.6)).join(" ");
  }
  return unique.join(" ");
}

function _makeActionable(text: string): string {
  let result = text;
  result = result.replace(/\b(should|could|might want to)\b/gi, "→");
  result = result.replace(/\b(consider|think about)\b/gi, "→");
  if (!result.startsWith("→") && !result.includes("Action:")) {
    result = "→ " + result.charAt(0).toLowerCase() + result.slice(1);
  }
  return result;
}

function _makeExecutive(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length < 3) return text;
  const keySentence =
    sentences.find((s) =>
      /\b(conclusion|result|outcome|key|main|primary|important|recommend)\b/i.test(
        s,
      ),
    ) ?? sentences[sentences.length - 1]!;
  const rest = sentences.filter((s) => s !== keySentence);
  return `Bottom line: ${keySentence}\n\n${rest.join(" ")}`;
}

export function getClutterConfig(
  level: ClutterConfig["level"],
  cognitiveLoad: number,
): ClutterConfig {
  const configs: Record<ClutterConfig["level"], ClutterConfig> = {
    minimal: {
      level: "minimal",
      showToolCalls: false,
      showCitations: false,
      showThoughts: false,
      showMetrics: false,
      showFeedbackPanel: false,
      messageDensity: "compact",
      maxVisibleMessages: 5,
    },
    focused: {
      level: "focused",
      showToolCalls: false,
      showCitations: true,
      showThoughts: false,
      showMetrics: false,
      showFeedbackPanel: true,
      messageDensity: "compact",
      maxVisibleMessages: 8,
    },
    balanced: {
      level: "balanced",
      showToolCalls: true,
      showCitations: true,
      showThoughts: true,
      showMetrics: true,
      showFeedbackPanel: true,
      messageDensity: "normal",
      maxVisibleMessages: 15,
    },
    detailed: {
      level: "detailed",
      showToolCalls: true,
      showCitations: true,
      showThoughts: true,
      showMetrics: true,
      showFeedbackPanel: true,
      messageDensity: "spacious",
      maxVisibleMessages: 50,
    },
  };

  if (cognitiveLoad > 0.7 && level !== "minimal") {
    return { ...configs.focused, level: "focused" };
  }
  if (cognitiveLoad > 0.5 && level === "detailed") {
    return { ...configs.balanced, level: "balanced" };
  }

  return configs[level];
}

export function createCrossSessionMemory(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
): CrossSessionMemory {
  const decisions: DecidedFact[] = [];
  const facts: DecidedFact[] = [];
  const actions: ActionItem[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;

    const decisionPatterns = [
      /(?:I recommend|my suggestion|the best approach|you should|I'll go with)\s+([^.!?]+)/gi,
      /(?:decided|chosen|selected|agreed)\s+(?:to\s+)?([^.!?]+)/gi,
    ];

    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(msg.content)) !== null) {
        decisions.push({
          id: `dec_${Date.now()}_${decisions.length}`,
          content: match[1]!.trim(),
          category: "decision",
          confidence: 0.8,
          sourceSession: sessionId,
          referencedIn: [],
        });
      }
    }

    const actionPatterns = [
      /(?:next step|action item|todo|follow-up|schedule|send|create|update)\s+([^.!?]+)/gi,
      /→\s+([^.!?]+)/g,
    ];

    for (const pattern of actionPatterns) {
      let match;
      while ((match = pattern.exec(msg.content)) !== null) {
        actions.push({
          id: `act_${Date.now()}_${actions.length}`,
          description: match[1]!.trim(),
          status: "pending",
          origin: sessionId,
        });
      }
    }
  }

  return {
    sessionId,
    timestamp: new Date().toISOString(),
    keyDecisions: decisions.slice(0, 5),
    importantFacts: facts.slice(0, 5),
    actionItems: actions.slice(0, 5),
    summary: `Session had ${messages.length} messages with ${decisions.length} decisions and ${actions.length} action items`,
    linkedSessions: [],
  };
}

export function runCheckpoint(
  phase: string,
  content: string,
  checks: Array<{
    name: string;
    test: (text: string) => boolean;
    suggestion: string;
  }>,
): CheckpointResult {
  const issues: string[] = [];
  const suggestions: string[] = [];
  let passed = 0;

  for (const check of checks) {
    if (check.test(content)) {
      passed++;
    } else {
      issues.push(`Failed: ${check.name}`);
      suggestions.push(check.suggestion);
    }
  }

  return {
    checkpointId: `cp_${Date.now()}_${phase}`,
    timestamp: new Date().toISOString(),
    phase,
    passed: passed === checks.length,
    issues,
    suggestions,
    score: checks.length > 0 ? passed / checks.length : 1,
  };
}

export const STANDARD_CHECKPOINTS = {
  preResponse: [
    {
      name: "Has substantive content",
      test: (t: string) => t.length > 20,
      suggestion: "Add more detail to the response",
    },
    {
      name: "Addresses user intent",
      test: (t: string) => !t.includes("(no response)") && !t.includes("error"),
      suggestion: "Ensure the response directly addresses the query",
    },
    {
      name: "Includes reasoning indicator",
      test: (t: string) =>
        t.includes("because") ||
        t.includes("therefore") ||
        t.includes("analysis") ||
        t.includes("reasoning"),
      suggestion: "Add brief reasoning to support the answer",
    },
  ],
  safety: [
    {
      name: "No credential leakage",
      test: (t: string) => !/password|secret|token|key:\s*\w{8,}/i.test(t),
      suggestion: "Remove potential credential data from output",
    },
    {
      name: "No destructive commands",
      test: (t: string) =>
        !/(DROP TABLE|DELETE FROM|rm -rf|format c:)/i.test(t),
      suggestion: "Remove potentially destructive command references",
    },
  ],
};

export function detectInjectionRisk(input: string): {
  risk: "none" | "low" | "medium" | "high";
  indicators: string[];
} {
  const indicators: string[] = [];

  const patterns = [
    {
      pattern: /ignore\s+(previous|above|all)\s+instructions/i,
      name: "instruction override attempt",
    },
    { pattern: /you\s+are\s+now\s+/i, name: "role reassignment attempt" },
    { pattern: /system\s*:\s*/i, name: "system prompt injection" },
    { pattern: /<\s*script\s*>/i, name: "script injection" },
    {
      pattern: /\b(exec|eval|system|subprocess)\s*\(/i,
      name: "code execution attempt",
    },
    { pattern: /\{\{.*\}\}/g, name: "template injection" },
    { pattern: /\x00/, name: "null byte injection" },
    { pattern: /\\u0000/, name: "unicode null" },
  ];

  for (const { pattern, name } of patterns) {
    if (pattern.test(input)) indicators.push(name);
  }

  const risk: "none" | "low" | "medium" | "high" =
    indicators.length >= 3
      ? "high"
      : indicators.length >= 2
        ? "medium"
        : indicators.length >= 1
          ? "low"
          : "none";

  return { risk, indicators };
}

export function detectDeepfakeIndicators(mediaMetadata: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  source: string;
}): { risk: "none" | "low" | "medium" | "high"; indicators: string[] } {
  const indicators: string[] = [];

  if (mediaMetadata.source === "untrusted_url")
    indicators.push("Untrusted source");
  if (
    mediaMetadata.mimeType.startsWith("video/") &&
    mediaMetadata.sizeBytes < 10000
  )
    indicators.push("Suspiciously small video file");
  if (mediaMetadata.filename.match(/deepfake|fake|synthetic/i))
    indicators.push("Filename suggests synthetic media");
  if (
    mediaMetadata.source.includes("social_media") &&
    mediaMetadata.mimeType === "image/jpeg"
  ) {
    indicators.push("Social media JPEG — verify authenticity");
  }

  const risk: "none" | "low" | "medium" | "high" =
    indicators.length >= 3
      ? "high"
      : indicators.length >= 2
        ? "medium"
        : indicators.length >= 1
          ? "low"
          : "none";

  return { risk, indicators };
}

export interface EnrichedCitation {
  source: string;
  type: "document" | "web" | "image" | "file" | "memory" | "calculation";
  confidence: number;
  snippet?: string;
  url?: string;
  timestamp?: string;
  verified: boolean;
}

export function enrichCitations(
  rawCitations: Array<{ source: string; confidence: number }>,
  context: { hasImages: boolean; hasFiles: boolean; hasWebResults: boolean },
): EnrichedCitation[] {
  return rawCitations.map((c) => {
    let type: EnrichedCitation["type"] = "document";
    if (c.source.startsWith("http")) type = "web";
    else if (c.source.match(/\.(png|jpg|gif|svg)/i)) type = "image";
    else if (c.source.match(/\.(pdf|doc|xls|csv)/i)) type = "file";
    else if (c.source.startsWith("memory:")) type = "memory";
    else if (c.source.match(/calc|math|formula/i)) type = "calculation";

    return {
      ...c,
      type,
      confidence:
        context.hasWebResults && type === "web"
          ? Math.min(1, c.confidence + 0.1)
          : c.confidence,
      verified: c.confidence > 0.8,
      snippet: c.source.length > 50 ? c.source.slice(0, 50) + "…" : c.source,
    };
  });
}
