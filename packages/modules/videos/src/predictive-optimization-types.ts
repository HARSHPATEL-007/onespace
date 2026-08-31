/**
 * N0VA VIDEOS — Predictive Optimization Types
 * Every AI suggestion reversible, every optimization explainable.
 */
export type OptimizationSignal = "retention" | "ctr" | "completion" | "brand_lift" | "conversion";
export type OptimizationAction = "reorder_shots" | "trim_silence" | "reframe" | "caption_style" | "thumbnail" | "color_grade" | "music_swap";

export interface Prediction {
  prediction_id: string;
  tenant_id: string;
  asset_id: string;
  signal: OptimizationSignal;
  baseline_score: number; // 0..1
  predicted_score: number;
  delta: number;
  confidence: number; // 0..1
  explainable: { top_factors: { factor: string; weight: number }[]; model_version: string };
  reversible: boolean;
  requires_consent: boolean;
  created_at: string;
}

export interface OptimizationProposal {
  proposal_id: string;
  prediction_id: string;
  action: OptimizationAction;
  preview_url?: string;
  cost_estimate_cents?: number;
  policy_decision: string;
  status: "proposed"|"approved"|"rejected"|"applied"|"rolled_back";
}

export interface OptimizationMetrics {
  predictions: number; applied: number; rolled_back: number;
  avg_delta: number; avg_confidence: number; reversible_rate: number;
}
