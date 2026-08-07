/**
 * N0VA1O Release Phase Gates — deeper enhancements (spec §6).
 *
 * Staged release with discovery, feasibility, design, build, validation, and
 * rollout stages, each with clear exit criteria.
 */

export type ReleaseStage = "discovery" | "feasibility" | "design" | "build" | "validation" | "rollout";

export interface PhaseGate {
  stage: ReleaseStage;
  owner: string;
  artifacts: string[];
  exitCriteria: string[];
  approved: boolean;
  completedAt?: string;
}

export const RELEASE_STAGES: ReleaseStage[] = ["discovery", "feasibility", "design", "build", "validation", "rollout"];

/**
 * Check whether all exit criteria for a phase are satisfied. Pure function.
 */
export function phaseComplete(gate: PhaseGate): boolean {
  return gate.exitCriteria.length > 0 && gate.artifacts.length > 0 && gate.approved;
}

/**
 * Advance to the next release stage. Returns null if current phase incomplete.
 */
export function advancePhase(gate: PhaseGate): ReleaseStage | null {
  if (!phaseComplete(gate)) return null;
  const idx = RELEASE_STAGES.indexOf(gate.stage);
  return idx < RELEASE_STAGES.length - 1 ? RELEASE_STAGES[idx + 1] : null;
}
