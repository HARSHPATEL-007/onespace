export type Sensitivity = "public" | "internal" | "confidential" | "restricted";

export type MemoryTier = "working" | "episodic" | "semantic" | "procedural";

export interface MemoryEntry {
  id: string;
  workspaceId: string;
  sessionId: string;
  tier: MemoryTier;
  modality: string;
  content: unknown;
  embedding?: number[];
  sensitivity: Sensitivity;
  replayable: boolean;
  createdAt: string;
  sourceRef?: string;
  metadata: Record<string, unknown>;
}

export interface AniSettings {
  modelPreset: "standard" | "enterprise" | "government" | "transcendent";
  consciousnessMode: boolean;
  quantumAssist: boolean;
  neuralInterface: boolean;
  safetyLevel: "standard" | "enterprise" | "maximum";
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  preferredProvider: string;
  proactiveSuggestions: boolean;
  adaptiveUI: boolean;
}

export interface ToolCallRecord {
  id: string;
  conversationId: string;
  messageId: string;
  tool: string;
  provider: string;
  status: "pending" | "loading" | "done" | "error";
  input: Record<string, unknown>;
  output?: string;
  statusCode?: number;
  durationMs: number;
  createdAt: string;
}

export const DEFAULT_ANI_SETTINGS: AniSettings = {
  modelPreset: "standard",
  consciousnessMode: true,
  quantumAssist: false,
  neuralInterface: false,
  safetyLevel: "enterprise",
  maxTokens: 4096,
  temperature: 0.7,
  contextWindow: 128000,
  preferredProvider: "auto",
  proactiveSuggestions: true,
  adaptiveUI: true,
};
