/**
 * N0VA1O Enhancement Scoping Model — deeper enhancements (spec §3).
 *
 * Splits enhancements into categories for prioritization, staffing, and roadmap.
 */

export type EnhancementCategory = "minor" | "major" | "integration_expansion" | "ux_refinement";

export interface ScopedEnhancement {
  id: string;
  title: string;
  category: EnhancementCategory;
  description: string;
  estimatedEffort: number;
  priority: number;
}

export const CATEGORY_WEIGHTS: Record<EnhancementCategory, { effortMultiplier: number; minPriority: number }> = {
  minor: { effortMultiplier: 1, minPriority: 1 },
  ux_refinement: { effortMultiplier: 1.5, minPriority: 2 },
  major: { effortMultiplier: 3, minPriority: 3 },
  integration_expansion: { effortMultiplier: 2.5, minPriority: 2 },
};

/**
 * Scope an enhancement into a category based on description keywords and
 * effort estimate. Pure classification function.
 */
export function scopeEnhancement(opts: { title: string; description: string; estimatedEffort: number; integrationCount?: number }): EnhancementCategory {
  const text = `${opts.title} ${opts.description}`.toLowerCase();
  if (opts.integrationCount && opts.integrationCount > 2) return "integration_expansion";
  if (/\b(integration|connector|adapter|provider)\b/.test(text) && opts.estimatedEffort > 5) return "integration_expansion";
  if (/\b(ui|ux|dashboard|workflow|template|refactor)\b/.test(text) && opts.estimatedEffort <= 5) return "ux_refinement";
  if (opts.estimatedEffort > 10 || /\b(engine|architecture|platform|security)\b/.test(text)) return "major";
  return "minor";
}
