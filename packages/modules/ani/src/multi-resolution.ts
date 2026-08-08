export type ResolutionLevel = "concise" | "detailed" | "autonomous_plan" | "spatial_cue";

export interface RenderedResponse {
  level: ResolutionLevel;
  content: string;
  actions?: string[];
  metadata: { source: string; confidence: number };
}

export class MultiResolutionRenderer {
  render(answer: string, level: ResolutionLevel, context: { confidence: number; sources: string[] }): RenderedResponse {
    if (level === "concise") {
      return { level, content: answer.split(".")[0] + ".", metadata: { source: "synthesis", confidence: context.confidence } };
    }
    if (level === "detailed") {
      return { level, content: answer + "\n\nSources: " + context.sources.join(", "), metadata: { source: "synthesis", confidence: context.confidence } };
    }
    if (level === "autonomous_plan") {
      return { level, content: "Plan:\n1. " + answer, actions: ["execute", "verify"], metadata: { source: "planner", confidence: context.confidence } };
    }
    return { level, content: "[Spatial] " + answer, metadata: { source: "xr_engine", confidence: context.confidence } };
  }
}

export interface EthicsReview {
  id: string;
  action: string;
  category: "consciousness" | "quantum" | "high_risk" | "ambiguous";
  status: "pending" | "approved" | "rejected" | "escalated";
  reviewer: string;
  timestamp: string;
}

export class NeuralEthicsBoard {
  private reviews: EthicsReview[] = [];

  submit(action: string, category: EthicsReview["category"]): EthicsReview {
    const review: EthicsReview = {
      id: "ethics_" + Date.now().toString(36),
      action, category, status: "pending",
      reviewer: "ethics_board", timestamp: new Date().toISOString(),
    };
    this.reviews.push(review);
    return review;
  }

  review(reviewId: string, approved: boolean, reviewer: string): EthicsReview | null {
    const review = this.reviews.find((r) => r.id === reviewId);
    if (!review) return null;
    review.status = approved ? "approved" : "rejected";
    review.reviewer = reviewer;
    return review;
  }

  getPending(): EthicsReview[] {
    return this.reviews.filter((r) => r.status === "pending");
  }
}
