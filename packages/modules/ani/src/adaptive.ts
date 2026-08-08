import { type WorkspaceContext, type IntentClass } from "./engine";

export interface UserProfile {
  userId: string;
  workspaceId: string;
  communicationStyle: CommunicationStyle;
  decisionPreferences: DecisionPreferences;
  cognitiveProfile: CognitiveProfile;
  domainExpertise: Record<string, number>;
  temporalPatterns: TemporalPatterns;
  feedbackHistory: FeedbackEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationStyle {
  verbosity: "concise" | "balanced" | "detailed";
  tone: "formal" | "neutral" | "casual";
  formatPreference: "bullets" | "paragraphs" | "structured";
  language: string;
  technicalLevel: "beginner" | "intermediate" | "expert";
}

export interface DecisionPreferences {
  riskTolerance: "conservative" | "moderate" | "aggressive";
  confirmationThreshold: number;
  prefersVisualizations: boolean;
  autoExecuteThreshold: number;
}

export interface CognitiveProfile {
  avgCognitiveLoad: number;
  peakHours: number[];
  attentionSpan: number;
  preferredChunkSize: number;
}

export interface TemporalPatterns {
  activeHoursStart: number;
  activeHoursEnd: number;
  peakProductivityHour: number;
  avgSessionDuration: number;
  timezone: string;
}

export interface FeedbackEntry {
  id: string;
  timestamp: string;
  type: "explicit" | "implicit" | "behavioral";
  rating?: number;
  category: string;
  context: Record<string, unknown>;
  weight: number;
}

export interface AdaptationResult {
  styleChanges: Partial<CommunicationStyle>;
  preferenceChanges: Partial<DecisionPreferences>;
  newExpertise: Record<string, number>;
  confidence: number;
}

const DEFAULT_PROFILE: Omit<UserProfile, "userId" | "workspaceId" | "createdAt" | "updatedAt"> = {
  communicationStyle: {
    verbosity: "balanced",
    tone: "neutral",
    formatPreference: "bullets",
    language: "en",
    technicalLevel: "intermediate",
  },
  decisionPreferences: {
    riskTolerance: "moderate",
    confirmationThreshold: 0.7,
    prefersVisualizations: true,
    autoExecuteThreshold: 0.9,
  },
  cognitiveProfile: {
    avgCognitiveLoad: 0.3,
    peakHours: [9, 10, 14, 15],
    attentionSpan: 20,
    preferredChunkSize: 5,
  },
  temporalPatterns: {
    activeHoursStart: 8,
    activeHoursEnd: 18,
    peakProductivityHour: 10,
    avgSessionDuration: 45,
    timezone: "UTC",
  },
  domainExpertise: {},
  feedbackHistory: [],
};

export class AdaptiveLearningEngine {
  private profiles: Map<string, UserProfile> = new Map();

  constructor(private readonly workspaceId: string) {}

  getProfile(userId: string): UserProfile {
    const existing = this.profiles.get(userId);
    if (existing) return existing;

    const profile: UserProfile = {
      userId,
      workspaceId: this.workspaceId,
      ...structuredClone(DEFAULT_PROFILE),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(userId, profile);
    return profile;
  }

  recordFeedback(userId: string, feedback: Omit<FeedbackEntry, "id">): void {
    const profile = this.getProfile(userId);
    profile.feedbackHistory.push({
      ...feedback,
      id: `fb_${Date.now().toString(36)}`,
    });

    if (profile.feedbackHistory.length > 100) {
      profile.feedbackHistory = profile.feedbackHistory.slice(-100);
    }

    profile.updatedAt = new Date().toISOString();
  }

  adapt(userId: string): AdaptationResult {
    const profile = this.getProfile(userId);
    const recentFeedback = profile.feedbackHistory.slice(-20);

    const styleChanges: Partial<CommunicationStyle> = {};
    const preferenceChanges: Partial<DecisionPreferences> = {};
    const newExpertise: Record<string, number> = {};

    const ratings = recentFeedback.filter((f) => f.rating !== undefined).map((f) => f.rating!);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0.5;

    if (avgRating < 0.4) {
      styleChanges.verbosity = "detailed";
      styleChanges.tone = "neutral";
    } else if (avgRating > 0.8) {
      styleChanges.verbosity = "concise";
    }

    const confirmRate = recentFeedback.filter((f) => f.category === "confirmation").length / Math.max(1, recentFeedback.length);
    if (confirmRate > 0.8) {
      preferenceChanges.autoExecuteThreshold = Math.min(0.95, profile.decisionPreferences.autoExecuteThreshold + 0.05);
    } else if (confirmRate < 0.3) {
      preferenceChanges.autoExecuteThreshold = Math.max(0.5, profile.decisionPreferences.autoExecuteThreshold - 0.05);
    }

    for (const fb of recentFeedback) {
      if (fb.category.startsWith("domain:")) {
        const domain = fb.category.slice(7);
        const current = profile.domainExpertise[domain] ?? 0.5;
        const delta = (fb.rating ?? 0.5) > 0.6 ? 0.02 : -0.01;
        newExpertise[domain] = Math.max(0, Math.min(1, current + delta));
      }
    }

    Object.assign(profile.communicationStyle, styleChanges);
    Object.assign(profile.decisionPreferences, preferenceChanges);
    Object.assign(profile.domainExpertise, newExpertise);
    profile.updatedAt = new Date().toISOString();

    return {
      styleChanges,
      preferenceChanges,
      newExpertise,
      confidence: Math.min(1, ratings.length / 10),
    };
  }

  getAdaptivePromptModifiers(userId: string): string[] {
    const profile = this.getProfile(userId);
    const mods: string[] = [];

    if (profile.communicationStyle.verbosity === "concise") {
      mods.push("Keep responses brief — use short sentences and bullet points.");
    } else if (profile.communicationStyle.verbosity === "detailed") {
      mods.push("Provide thorough explanations with examples and context.");
    }

    if (profile.communicationStyle.tone === "formal") {
      mods.push("Use formal, professional language.");
    } else if (profile.communicationStyle.tone === "casual") {
      mods.push("Use a conversational, friendly tone.");
    }

    if (profile.communicationStyle.technicalLevel === "expert") {
      mods.push("Use technical terminology freely — no need to explain basics.");
    } else if (profile.communicationStyle.technicalLevel === "beginner") {
      mods.push("Explain concepts in simple terms with analogies.");
    }

    const hour = new Date().getUTCHours();
    if (profile.cognitiveProfile.peakHours.includes(hour)) {
      mods.push("User is in peak productivity hours — full detail level appropriate.");
    } else {
      mods.push("User is outside peak hours — keep response minimal and actionable.");
    }

    return mods;
  }

  shouldProactiveAssist(userId: string, context: WorkspaceContext): boolean {
    const profile = this.getProfile(userId);
    const hour = new Date().getUTCHours();
    const isActive = hour >= profile.temporalPatterns.activeHoursStart && hour <= profile.temporalPatterns.activeHoursEnd;
    const hasEnoughData = profile.feedbackHistory.length >= 5;
    return isActive && hasEnoughData;
  }
}

export function createAdaptiveEngine(workspaceId: string): AdaptiveLearningEngine {
  return new AdaptiveLearningEngine(workspaceId);
}
