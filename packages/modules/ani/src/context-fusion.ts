export interface FusedContextItem {
  source: string;
  module: string;
  content: string;
  relevanceScore: number;
  recencyScore: number;
  authorityScore: number;
  fusedScore: number;
  timestamp: string;
}

export interface FusedWorkspaceModel {
  items: FusedContextItem[];
  topEntities: string[];
  dominantTheme: string;
  contextSummary: string;
  assembledAt: string;
}

export class ContextFusionLayer {
  fuse(
    sources: Array<{
      source: string;
      module: string;
      content: string;
      timestamp?: string;
    }>,
  ): FusedWorkspaceModel {
    const items: FusedContextItem[] = sources.map((s) => {
      const recency = this._calcRecency(
        s.timestamp ?? new Date().toISOString(),
      );
      const authority = this._calcAuthority(s.module);
      const relevance = this._calcRelevance(s.content);
      const fused = recency * 0.3 + authority * 0.3 + relevance * 0.4;
      return {
        ...s,
        relevanceScore: relevance,
        recencyScore: recency,
        authorityScore: authority,
        fusedScore: fused,
        timestamp: s.timestamp ?? new Date().toISOString(),
      };
    });

    items.sort((a, b) => b.fusedScore - a.fusedScore);

    return {
      items: items.slice(0, 10),
      topEntities: this._extractTopEntities(items),
      dominantTheme: items[0]?.module ?? "general",
      contextSummary: items
        .slice(0, 3)
        .map((i) => i.content.slice(0, 80))
        .join(" | "),
      assembledAt: new Date().toISOString(),
    };
  }

  private _calcRecency(timestamp: string): number {
    const ageMs = Date.now() - Date.parse(timestamp);
    const hours = ageMs / (1000 * 60 * 60);
    return Math.max(0, 1 - hours / 168);
  }

  private _calcAuthority(module: string): number {
    const authorityMap: Record<string, number> = {
      docs: 0.95,
      mail: 0.9,
      calendar: 0.85,
      tasks: 0.8,
      sheets: 0.75,
      crm: 0.88,
      meeting: 0.85,
    };
    return authorityMap[module] ?? 0.5;
  }

  private _calcRelevance(content: string): number {
    return Math.min(1, content.length / 500);
  }

  private _extractTopEntities(items: FusedContextItem[]): string[] {
    const entities = new Set<string>();
    for (const item of items) {
      const words = item.content
        .split(/\s+/)
        .filter((w) => w.length > 4)
        .slice(0, 3);
      words.forEach((w) => entities.add(w));
    }
    return [...entities].slice(0, 5);
  }
}
