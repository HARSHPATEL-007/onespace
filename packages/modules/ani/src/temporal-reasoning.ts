export interface SnapshotComparison {
  additions: string[];
  removals: string[];
  modifications: Array<{ field: string; before: string; after: string }>;
  driftScore: number;
}

export class TemporalReasoningEngine {
  compareSnapshots(before: Record<string, unknown>, after: Record<string, unknown>): SnapshotComparison {
    const additions: string[] = [];
    const removals: string[] = [];
    const modifications: SnapshotComparison["modifications"] = [];

    for (const [key, val] of Object.entries(after)) {
      if (!(key in before)) additions.push(key);
      else if (JSON.stringify(before[key]) !== JSON.stringify(val)) modifications.push({ field: key, before: JSON.stringify(before[key])?.slice(0, 30) ?? "", after: JSON.stringify(val)?.slice(0, 30) ?? "" });
    }
    for (const key of Object.keys(before)) {
      if (!(key in after)) removals.push(key);
    }

    const totalChanges = additions.length + removals.length + modifications.length;
    const driftScore = Math.min(1, totalChanges / Math.max(1, Object.keys(before).length + Object.keys(after).length));

    return { additions, removals, modifications, driftScore };
  }

  predictNearFuture(historicalTrend: string[]): string {
    const recent = historicalTrend.slice(-5);
    const frequencies: Record<string, number> = {};
    for (const item of recent) frequencies[item] = (frequencies[item] ?? 0) + 1;
    const sorted = Object.entries(frequencies).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] ?? "stable";
  }
}
