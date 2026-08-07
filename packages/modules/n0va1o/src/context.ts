/**
 * N0VA1O Context Minimization Guarantees — routing layer (spec §6.1).
 *
 * The routing layer injects only the minimum relevant tools and context required
 * for a task. Tool selection rationale is visible to administrators so
 * overexposure can be diagnosed and tuned.
 */

import { DiscoveredTool } from "./catalog";

export interface ContextBudget {
  /** Maximum number of tools to inject. */
  maxTools: number;
  /** Maximum context tokens the tools may consume. */
  maxTokens: number;
  /** Minimum relevance score to include a tool. */
  minRelevance: number;
}

export interface MinimizationResult {
  selected: DiscoveredTool[];
  excluded: DiscoveredTool[];
  /** Rationale for each selection/exclusion (admin-visible). */
  rationale: { tool: string; decision: "included" | "excluded"; reason: string }[];
  totalEstimatedTokens: number;
}

export const DEFAULT_BUDGET: ContextBudget = {
  maxTools: 5,
  maxTokens: 4000,
  minRelevance: 0.3,
};

const TOKENS_PER_TOOL = 120;

/**
 * Select the minimum relevant tools within a context budget. Applies the
 * relevance threshold first, then caps by max tools and token budget.
 */
export function minimizeContext(
  candidates: DiscoveredTool[],
  budget: ContextBudget = DEFAULT_BUDGET,
): MinimizationResult {
  const rationale: MinimizationResult["rationale"] = [];
  const selected: DiscoveredTool[] = [];
  const excluded: DiscoveredTool[] = [];

  // Sort by relevance descending.
  const sorted = [...candidates].sort((a, b) => b.relevance - a.relevance);
  let tokens = 0;

  for (const tool of sorted) {
    if (tool.relevance < budget.minRelevance) {
      excluded.push(tool);
      rationale.push({ tool: tool.name, decision: "excluded", reason: `Relevance ${tool.relevance.toFixed(2)} below threshold ${budget.minRelevance}` });
      continue;
    }
    if (selected.length >= budget.maxTools) {
      excluded.push(tool);
      rationale.push({ tool: tool.name, decision: "excluded", reason: `Tool cap ${budget.maxTools} reached` });
      continue;
    }
    const projected = tokens + TOKENS_PER_TOOL;
    if (projected > budget.maxTokens) {
      excluded.push(tool);
      rationale.push({ tool: tool.name, decision: "excluded", reason: `Token budget ${budget.maxTokens} would be exceeded` });
      continue;
    }
    selected.push(tool);
    tokens = projected;
    rationale.push({ tool: tool.name, decision: "included", reason: `Relevance ${tool.relevance.toFixed(2)}, uses ~${TOKENS_PER_TOOL} tokens` });
  }

  return { selected, excluded, rationale, totalEstimatedTokens: tokens };
}

/** Diagnose overexposure: returns tools that could be trimmed. */
export function diagnoseOverexposure(result: MinimizationResult): string[] {
  const warnings: string[] = [];
  if (result.selected.length > 3) warnings.push(`High tool count (${result.selected.length}) — consider raising minRelevance`);
  if (result.totalEstimatedTokens > 3000) warnings.push(`High token usage (${result.totalEstimatedTokens}) — context may be diluted`);
  return warnings;
}
