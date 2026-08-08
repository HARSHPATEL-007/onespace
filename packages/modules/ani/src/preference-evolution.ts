export interface TaskCategoryPreference {
  category: string;
  tone: "formal" | "neutral" | "casual";
  verbosity: "concise" | "balanced" | "detailed";
  formatPreference: "bullets" | "paragraphs" | "structured";
  successCount: number;
  totalUses: number;
}

export class PreferenceEvolutionEngine {
  private preferences: Map<string, TaskCategoryPreference> = new Map();

  getPreference(category: string): TaskCategoryPreference {
    return (
      this.preferences.get(category) ?? {
        category,
        tone: "neutral",
        verbosity: "balanced",
        formatPreference: "bullets",
        successCount: 0,
        totalUses: 0,
      }
    );
  }

  recordUsage(category: string, success: boolean): void {
    const pref = this.getPreference(category);
    pref.totalUses++;
    if (success) pref.successCount++;
    this.preferences.set(category, pref);
  }

  evolve(
    category: string,
    feedback: { tone?: string; verbosity?: string; format?: string },
  ): void {
    const pref = this.getPreference(category);
    if (feedback.tone) pref.tone = feedback.tone as typeof pref.tone;
    if (feedback.verbosity)
      pref.verbosity = feedback.verbosity as typeof pref.verbosity;
    if (feedback.format)
      pref.formatPreference = feedback.format as typeof pref.formatPreference;
    this.preferences.set(category, pref);
  }

  getSuccessRate(category: string): number {
    const pref = this.getPreference(category);
    return pref.totalUses > 0 ? pref.successCount / pref.totalUses : 0;
  }
}
