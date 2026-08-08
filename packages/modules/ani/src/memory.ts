import { type WorkspaceContext } from "./engine";
import { type Sensitivity, type MemoryTier } from "./types";

export interface MemoryEntry {
  id: string;
  workspaceId: string;
  sessionId: string;
  tier: MemoryTier;
  modality: "text" | "image" | "audio" | "video" | "structured" | "multimodal";
  content: unknown;
  embedding: number[];
  sensitivity: Sensitivity;
  replayable: boolean;
  createdAt: string;
  sourceRef?: string;
  metadata: Record<string, unknown>;
}

export interface MemoryStats {
  working: number;
  episodic: number;
  semantic: number;
  procedural: number;
  total: number;
}

export interface ConsolidationResult {
  entriesConsolidated: number;
  workingToEpisodic: number;
  episodicToSemantic: number;
  pruned: number;
}

export interface RetrievalQuery {
  embedding: number[];
  text?: string;
  sessionId?: string;
  limit?: number;
  minScore?: number;
  tiers?: MemoryTier[];
}

export interface RetrievalResult {
  entry: MemoryEntry;
  score: number;
  tier: MemoryTier;
}

const EMBEDDING_DIM = 3;

function _hashEmbedding(text: string): number[] {
  const hash = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return [hash % 100 / 100, (hash * 7) % 100 / 100, (hash * 13) % 100 / 100];
}

function _cosineSim(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < len; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export class MultiModalMemorySystem {
  private working: MemoryEntry[] = [];
  private episodic: MemoryEntry[] = [];
  private semantic: MemoryEntry[] = [];
  private procedural: MemoryEntry[] = [];
  private accessLog: Array<{ entryId: string; timestamp: string; tier: MemoryTier }> = [];

  constructor(private readonly workspaceId: string) {}

  store(
    content: unknown,
    options: {
      sessionId: string;
      tier?: MemoryTier;
      modality?: MemoryEntry["modality"];
      sensitivity?: Sensitivity;
      replayable?: boolean;
      sourceRef?: string;
      metadata?: Record<string, unknown>;
    },
  ): MemoryEntry {
    const tier = options.tier ?? "working";
    const entry: MemoryEntry = {
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      workspaceId: this.workspaceId,
      sessionId: options.sessionId,
      tier,
      modality: options.modality ?? "text",
      content,
      embedding: _hashEmbedding(JSON.stringify(content)),
      sensitivity: options.sensitivity ?? "internal",
      replayable: options.replayable ?? true,
      createdAt: new Date().toISOString(),
      sourceRef: options.sourceRef,
      metadata: options.metadata ?? {},
    };

    switch (tier) {
      case "working":
        this.working.push(entry);
        if (this.working.length > 50) this.working.shift();
        break;
      case "episodic":
        this.episodic.push(entry);
        break;
      case "semantic":
        this.semantic.push(entry);
        break;
      case "procedural":
        this.procedural.push(entry);
        break;
    }

    return entry;
  }

  retrieve(query: RetrievalQuery): RetrievalResult[] {
    const allTiers = query.tiers ?? ["working", "episodic", "semantic", "procedural"];
    const limit = query.limit ?? 10;
    const minScore = query.minScore ?? 0.3;

    const candidates: RetrievalResult[] = [];

    for (const tier of allTiers) {
      const entries = this._getTierEntries(tier);
      for (const entry of entries) {
        const score = _cosineSim(query.embedding, entry.embedding);
        if (score >= minScore) {
          candidates.push({ entry, score, tier });
          this.accessLog.push({ entryId: entry.id, timestamp: new Date().toISOString(), tier });
        }
      }
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  consolidate(): ConsolidationResult {
    let workingToEpisodic = 0;
    let episodicToSemantic = 0;
    let pruned = 0;

    const workingThreshold = Date.now() - 30 * 60 * 1000;
    const accessibleWorking = this.working.filter((e) => {
      const age = Date.parse(e.createdAt);
      if (age < workingThreshold) {
        this.episodic.push({ ...e, tier: "episodic" });
        workingToEpisodic++;
        return false;
      }
      return true;
    });
    this.working = accessibleWorking;

    const episodicThreshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const accessibleEpisodic = this.episodic.filter((e) => {
      const age = Date.parse(e.createdAt);
      if (age < episodicThreshold && (e.metadata["importance"] as number ?? 0) > 0.7) {
        this.semantic.push({ ...e, tier: "semantic" });
        episodicToSemantic++;
        return false;
      }
      if (age < episodicThreshold * 4) {
        pruned++;
        return false;
      }
      return true;
    });
    this.episodic = accessibleEpisodic;

    if (this.working.length > 50) {
      pruned += this.working.length - 50;
      this.working = this.working.slice(-50);
    }

    return {
      entriesConsolidated: workingToEpisodic + episodicToSemantic,
      workingToEpisodic,
      episodicToSemantic,
      pruned,
    };
  }

  getStats(): MemoryStats {
    return {
      working: this.working.length,
      episodic: this.episodic.length,
      semantic: this.semantic.length,
      procedural: this.procedural.length,
      total: this.working.length + this.episodic.length + this.semantic.length + this.procedural.length,
    };
  }

  getAccessLog(limit = 20): Array<{ entryId: string; timestamp: string; tier: MemoryTier }> {
    return this.accessLog.slice(-limit);
  }

  forget(entryId: string): boolean {
    for (const tier of ["working", "episodic", "semantic", "procedural"] as const) {
      const entries = this._getTierEntries(tier);
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx >= 0) {
        entries.splice(idx, 1);
        return true;
      }
    }
    return false;
  }

  associate(entryIdA: string, entryIdB: string, relationship: string): void {
    const entryA = this._findEntry(entryIdA);
    if (entryA) {
      entryA.metadata["associations"] = [...(entryA.metadata["associations"] as string[] ?? []), `${relationship}:${entryIdB}`];
    }
  }

  private _findEntry(id: string): MemoryEntry | null {
    for (const tier of ["working", "episodic", "semantic", "procedural"] as const) {
      const entry = this._getTierEntries(tier).find((e) => e.id === id);
      if (entry) return entry;
    }
    return null;
  }

  private _getTierEntries(tier: MemoryTier): MemoryEntry[] {
    switch (tier) {
      case "working": return this.working;
      case "episodic": return this.episodic;
      case "semantic": return this.semantic;
      case "procedural": return this.procedural;
    }
  }
}

export function createMemorySystem(workspaceId: string): MultiModalMemorySystem {
  return new MultiModalMemorySystem(workspaceId);
}
