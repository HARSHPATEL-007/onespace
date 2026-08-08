export type CollaborationState =
  "aligned" | "disagreement" | "stalled" | "needs_synthesis";

export interface ParticipantSignal {
  participantId: string;
  sentiment: "positive" | "neutral" | "negative" | "uncertain";
  engagement: number;
  lastContribution: string;
}

export class CollaborationIntelligence {
  analyze(participants: ParticipantSignal[]): {
    state: CollaborationState;
    confidence: number;
    recommendation: string;
  } {
    const avgEngagement =
      participants.reduce((sum, p) => sum + p.engagement, 0) /
      Math.max(1, participants.length);
    const sentiments = participants.map((p) => p.sentiment);
    const positiveCount = sentiments.filter((s) => s === "positive").length;
    const negativeCount = sentiments.filter((s) => s === "negative").length;

    if (negativeCount > participants.length / 2) {
      return {
        state: "disagreement",
        confidence: 0.8,
        recommendation: "Facilitate structured debate with evidence",
      };
    }
    if (avgEngagement < 0.3) {
      return {
        state: "stalled",
        confidence: 0.7,
        recommendation:
          "Introduce a concrete proposal or break into smaller tasks",
      };
    }
    if (positiveCount > participants.length * 0.7) {
      return {
        state: "aligned",
        confidence: 0.9,
        recommendation: "Document consensus and proceed",
      };
    }
    return {
      state: "needs_synthesis",
      confidence: 0.6,
      recommendation: "Summarize open threads and propose next steps",
    };
  }
}
