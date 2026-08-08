export interface MarketplaceItem {
  id: string;
  name: string;
  kind: "agent" | "connector" | "prompt" | "skill_pack";
  taskFit: number;
  safety: number;
  reliability: number;
  popularity: number;
}

export class MarketplaceRanker {
  rank(items: MarketplaceItem[], weights = { taskFit: 0.3, safety: 0.3, reliability: 0.25, popularity: 0.15 }): Array<MarketplaceItem & { score: number }> {
    return items.map((item) => ({
      ...item,
      score: item.taskFit * weights.taskFit + item.safety * weights.safety + item.reliability * weights.reliability + item.popularity * weights.popularity,
    })).sort((a, b) => b.score - a.score);
  }

  recommend(items: MarketplaceItem[], taskType: string, minSafety = 0.7): MarketplaceItem[] {
    const filtered = items.filter((i) => i.safety >= minSafety);
    const typeBonus: Record<string, string> = { research: "agent", integration: "connector", writing: "prompt", automation: "skill_pack" };
    const preferredKind = typeBonus[taskType] ?? "agent";

    return filtered.sort((a, b) => {
      const aBonus = a.kind === preferredKind ? 0.2 : 0;
      const bBonus = b.kind === preferredKind ? 0.2 : 0;
      return (b.taskFit + bBonus) - (a.taskFit + aBonus);
    });
  }
}
