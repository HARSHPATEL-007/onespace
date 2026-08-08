export type UserSegment = "new" | "casual" | "power" | "enterprise";

export interface Walkthrough {
  id: string;
  featureId: string;
  title: string;
  description: string;
  steps: WalkthroughStep[];
  trigger: WalkthroughTrigger;
  priority: number;
  dismissable: boolean;
  completed: boolean;
  shownCount: number;
  maxShows: number;
}

export interface WalkthroughStep {
  target: string;
  title: string;
  content: string;
  position: "top" | "bottom" | "left" | "right" | "center";
}

export interface WalkthroughTrigger {
  type: "first_visit" | "feature_available" | "action_count" | "time_based";
  value?: string | number;
  module?: string;
}

export interface ContextualGuide {
  id: string;
  feature: string;
  trigger: string;
  card: GuideCard;
  shown: boolean;
  snoozedUntil?: string;
}

export interface GuideCard {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  actionType?: "open_walkthrough" | "try_feature" | "dismiss";
  learnMoreUrl?: string;
}

export interface ProactiveRecommendation {
  id: string;
  type: "tip" | "workflow" | "insight" | "shortcut";
  title: string;
  body: string;
  relevanceScore: number;
  confidence: number;
  timing: "immediate" | "next_break" | "end_of_session";
  context: Record<string, unknown>;
  shown: boolean;
  dismissed: boolean;
  shownAt?: string;
}

export interface UserSegmentProfile {
  segment: UserSegment;
  featureUsage: Record<string, number>;
  sessionCount: number;
  avgSessionMinutes: number;
  lastActive: string;
  topFeatures: string[];
  requestedFeatures: string[];
  satisfactionSignal: number;
}

export interface FeatureRequestVote {
  featureId: string;
  featureName: string;
  segmentVotes: Record<UserSegment, number>;
  totalScore: number;
  trending: boolean;
}

const NEW_FEATURE_WALKTHROUGHS: Walkthrough[] = [
  {
    id: "wt_deep_think",
    featureId: "deep_think",
    title: "Introducing Deep Think Mode",
    description:
      "ANI can now spend extra time on complex queries with multi-step reasoning, tradeoff analysis, and self-critique.",
    steps: [
      {
        target: "ani-depth-toggle",
        title: "Depth Control",
        content:
          "Click the depth icon to choose between fast, balanced, deep, or research modes.",
        position: "bottom",
      },
      {
        target: "ani-thought-toggle",
        title: "See Reasoning",
        content:
          "Toggle the thought bubble to watch ANI think through your problem step by step.",
        position: "bottom",
      },
      {
        target: "ani-send-btn",
        title: "Try It",
        content:
          "Ask a complex question and see the difference deep reasoning makes.",
        position: "top",
      },
    ],
    trigger: { type: "first_visit", module: "ani" },
    priority: 1,
    dismissable: true,
    completed: false,
    shownCount: 0,
    maxShows: 3,
  },
  {
    id: "wt_memory_marks",
    featureId: "memory_marks",
    title: "Memory Marks",
    description:
      "ANI automatically saves important facts, decisions, and insights during your conversation for easy recall.",
    steps: [
      {
        target: "ani-panel-tab-memory",
        title: "Memory Panel",
        content:
          "Check the Memory tab to see everything ANI has marked from your conversation.",
        position: "left",
      },
    ],
    trigger: { type: "action_count", value: 5 },
    priority: 3,
    dismissable: true,
    completed: false,
    shownCount: 0,
    maxShows: 2,
  },
  {
    id: "wt_complexity_detection",
    featureId: "complexity_detection",
    title: "Smart Complexity Detection",
    description:
      "ANI automatically detects when your query needs deeper reasoning and adjusts its thinking depth.",
    steps: [
      {
        target: "ani-auto-toggle",
        title: "Auto Mode",
        content:
          "Keep auto-detect enabled and ANI will escalate to deep or research mode when needed.",
        position: "bottom",
      },
    ],
    trigger: { type: "action_count", value: 3 },
    priority: 2,
    dismissable: true,
    completed: false,
    shownCount: 0,
    maxShows: 2,
  },
];

export function getEligibleWalkthroughs(
  sessionCount: number,
  completedFeatures: string[],
  shownWalkthroughs: string[],
): Walkthrough[] {
  return NEW_FEATURE_WALKTHROUGHS.filter((wt) => {
    if (completedFeatures.includes(wt.featureId)) return false;
    if (shownWalkthroughs.includes(wt.id)) return false;
    if (wt.shownCount >= wt.maxShows) return false;

    switch (wt.trigger.type) {
      case "first_visit":
        return sessionCount <= 1;
      case "action_count":
        return sessionCount >= Number(wt.trigger.value ?? 1);
      case "feature_available":
        return true;
      default:
        return false;
    }
  }).sort((a, b) => a.priority - b.priority);
}

export function classifyUserSegment(profile: {
  sessionCount: number;
  avgSessionMinutes: number;
  featuresUsed: string[];
  lastActiveDaysAgo: number;
}): UserSegment {
  if (profile.sessionCount <= 2) return "new";
  if (profile.lastActiveDaysAgo > 14) return "casual";
  if (
    profile.sessionCount > 20 &&
    profile.avgSessionMinutes > 15 &&
    profile.featuresUsed.length > 8
  )
    return "enterprise";
  if (profile.sessionCount > 10 && profile.featuresUsed.length > 4)
    return "power";
  return "casual";
}

export function buildSegmentProfile(
  sessions: Array<{
    durationMinutes: number;
    featuresUsed: string[];
    timestamp: string;
  }>,
): UserSegmentProfile {
  const now = Date.now();
  const recentSessions = sessions.filter((s) => {
    const daysSince =
      (now - new Date(s.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 30;
  });

  const totalMinutes = recentSessions.reduce(
    (a, s) => a + s.durationMinutes,
    0,
  );
  const featureCounts: Record<string, number> = {};
  for (const s of recentSessions) {
    for (const f of s.featuresUsed) {
      featureCounts[f] = (featureCounts[f] ?? 0) + 1;
    }
  }

  const topFeatures = Object.entries(featureCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name]) => name);

  const allRequested: string[] = [];
  for (const s of recentSessions) {
    allRequested.push(...s.featuresUsed);
  }

  const daysSinceLast =
    recentSessions.length > 0
      ? (now -
          new Date(
            recentSessions[recentSessions.length - 1]!.timestamp,
          ).getTime()) /
        (1000 * 60 * 60 * 24)
      : 999;

  const profile: UserSegmentProfile = {
    segment: "casual",
    featureUsage: featureCounts,
    sessionCount: recentSessions.length,
    avgSessionMinutes:
      recentSessions.length > 0 ? totalMinutes / recentSessions.length : 0,
    lastActive:
      recentSessions.length > 0
        ? recentSessions[recentSessions.length - 1]!.timestamp
        : new Date().toISOString(),
    topFeatures,
    requestedFeatures: [...new Set(allRequested)],
    satisfactionSignal: Math.min(1, recentSessions.length / 10),
  };

  profile.segment = classifyUserProfile(profile);
  return profile;
}

function classifyUserProfile(profile: UserSegmentProfile): UserSegment {
  if (profile.sessionCount <= 2) return "new";
  if (
    profile.sessionCount > 20 &&
    profile.avgSessionMinutes > 15 &&
    Object.keys(profile.featureUsage).length > 8
  )
    return "enterprise";
  if (profile.sessionCount > 10 && Object.keys(profile.featureUsage).length > 4)
    return "power";
  return "casual";
}

const RECOMMENDATION_TEMPLATES: Array<
  Omit<ProactiveRecommendation, "id" | "context" | "shown" | "dismissed">
> = [
  {
    type: "tip",
    title: "Try Deep Think for complex questions",
    body: "Toggle to Deep or Research mode for multi-step problems that need careful analysis.",
    relevanceScore: 0.85,
    confidence: 0.9,
    timing: "next_break",
  },
  {
    type: "workflow",
    title: "Automate your meeting scheduling",
    body: "Tell ANI to schedule a meeting and it will check availability, find times, and send invites.",
    relevanceScore: 0.7,
    confidence: 0.85,
    timing: "end_of_session",
  },
  {
    type: "shortcut",
    title: "Use Shift+Enter for multi-line messages",
    body: "Write longer prompts with Shift+Enter, send with Enter.",
    relevanceScore: 0.4,
    confidence: 0.95,
    timing: "end_of_session",
  },
  {
    type: "insight",
    title: "ANI detected 3 decision points in this session",
    body: "Check your Memory tab to review key decisions made during this conversation.",
    relevanceScore: 0.9,
    confidence: 0.8,
    timing: "end_of_session",
  },
  {
    type: "tip",
    title: "See ANI's reasoning with Thought Mode",
    body: "Click the 💭 icon to see how ANI arrived at its answer, step by step.",
    relevanceScore: 0.75,
    confidence: 0.85,
    timing: "next_break",
  },
];

export function generateRecommendations(
  profile: UserSegmentProfile,
  dismissedRecommendations: string[],
  recentContext: {
    decisionsCount: number;
    hasComplexQuery: boolean;
    sessionMinutes: number;
  },
): ProactiveRecommendation[] {
  const candidates: ProactiveRecommendation[] = [];

  for (const template of RECOMMENDATION_TEMPLATES) {
    if (dismissedRecommendations.includes(template.title)) continue;

    let score = template.relevanceScore;

    if (profile.segment === "new" && template.type === "shortcut") score += 0.2;
    if (profile.segment === "power" && template.type === "workflow")
      score += 0.15;
    if (profile.segment === "enterprise" && template.type === "insight")
      score += 0.2;
    if (recentContext.hasComplexQuery && template.title.includes("Deep Think"))
      score += 0.25;
    if (recentContext.decisionsCount > 2 && template.title.includes("decision"))
      score += 0.3;

    if (
      recentContext.sessionMinutes < 2 &&
      template.timing === "end_of_session"
    )
      score -= 0.3;
    if (profile.sessionCount > 10 && template.title.includes("Shift+Enter"))
      score -= 0.4;

    if (score >= 0.6 && template.confidence >= 0.7) {
      candidates.push({
        ...template,
        id: `rec_${template.title.toLowerCase().replace(/\s+/g, "_").slice(0, 40)}`,
        relevanceScore: score,
        context: {
          segment: profile.segment,
          sessionMinutes: recentContext.sessionMinutes,
        },
        shown: false,
        dismissed: false,
      });
    }
  }

  return candidates
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 2);
}

export function getFeaturePriorityVotes(
  segmentProfiles: UserSegmentProfile[],
): FeatureRequestVote[] {
  const featureVotes: Record<string, Record<UserSegment, number>> = {};

  for (const profile of segmentProfiles) {
    const segmentWeight =
      profile.segment === "enterprise"
        ? 3
        : profile.segment === "power"
          ? 2
          : 1;
    for (const feature of profile.requestedFeatures) {
      if (!featureVotes[feature]) {
        featureVotes[feature] = { new: 0, casual: 0, power: 0, enterprise: 0 };
      }
      featureVotes[feature]![profile.segment]! += segmentWeight;
    }
  }

  return Object.entries(featureVotes)
    .map(([featureId, segmentVotes]) => {
      const totalScore = Object.values(segmentVotes).reduce((a, b) => a + b, 0);
      return {
        featureId,
        featureName: featureId
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        segmentVotes,
        totalScore,
        trending: totalScore > 5,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}
