import { prisma } from "@n0va/db";
import { type WorkspaceContext } from "./engine";
import { type Sensitivity, type MemoryTier } from "./types";

export interface MemoryEntry {
  id: string;
  workspaceId: string;
  sessionId: string;
  tier: MemoryTier;
  modality: string;
  content: unknown;
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
  workspaceId: string;
  sessionId?: string;
  limit?: number;
  tiers?: MemoryTier[];
}

export interface RetrievalResult {
  entry: MemoryEntry;
  score: number;
  tier: MemoryTier;
}

export class PersistentMemorySystem {
  private workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  async store(
    content: unknown,
    options: {
      sessionId: string;
      tier?: MemoryTier;
      modality?: string;
      sensitivity?: Sensitivity;
      replayable?: boolean;
      sourceRef?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<MemoryEntry> {
    const tier = options.tier ?? "working";

    const message = await prisma.aniMessage.create({
      data: {
        conversationId: options.sessionId,
        workspaceId: this.workspaceId,
        role: "memory",
        content: JSON.stringify({
          tier,
          modality: options.modality ?? "text",
          sensitivity: options.sensitivity ?? "internal",
          replayable: options.replayable ?? true,
          sourceRef: options.sourceRef,
          metadata: options.metadata ?? {},
          data: content,
        }),
      },
    });

    return {
      id: message.id,
      workspaceId: this.workspaceId,
      sessionId: options.sessionId,
      tier,
      modality: options.modality ?? "text",
      content,
      sensitivity: options.sensitivity ?? "internal",
      replayable: options.replayable ?? true,
      createdAt: message.createdAt.toISOString(),
      sourceRef: options.sourceRef,
      metadata: options.metadata ?? {},
    };
  }

  async retrieve(query: RetrievalQuery): Promise<RetrievalResult[]> {
    const results: RetrievalResult[] = [];

    const messages = await prisma.aniMessage.findMany({
      where: {
        workspaceId: query.workspaceId,
        role: "memory",
        ...(query.sessionId ? { conversationId: query.sessionId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 10,
    });

    for (const msg of messages) {
      try {
        const parsed = JSON.parse(msg.content);
        const tier = parsed.tier ?? "working";
        if (query.tiers && !query.tiers.includes(tier)) continue;

        results.push({
          entry: {
            id: msg.id,
            workspaceId: msg.workspaceId,
            sessionId: msg.conversationId,
            tier,
            modality: parsed.modality ?? "text",
            content: parsed.data,
            sensitivity: parsed.sensitivity ?? "internal",
            replayable: parsed.replayable ?? true,
            createdAt: msg.createdAt.toISOString(),
            sourceRef: parsed.sourceRef,
            metadata: parsed.metadata ?? {},
          },
          score: 0.8,
          tier,
        });
      } catch { /* skip malformed entries */ }
    }

    return results;
  }

  async getStats(): Promise<MemoryStats> {
    const all = await prisma.aniMessage.findMany({
      where: { workspaceId: this.workspaceId, role: "memory" },
      select: { content: true },
    });

    const stats: MemoryStats = { working: 0, episodic: 0, semantic: 0, procedural: 0, total: all.length };

    for (const msg of all) {
      try {
        const parsed = JSON.parse(msg.content);
        const tier = parsed.tier ?? "working";
        if (tier === "working") stats.working++;
        else if (tier === "episodic") stats.episodic++;
        else if (tier === "semantic") stats.semantic++;
        else if (tier === "procedural") stats.procedural++;
      } catch { /* */ }
    }

    return stats;
  }

  async consolidate(): Promise<ConsolidationResult> {
    const working = await prisma.aniMessage.findMany({
      where: { workspaceId: this.workspaceId, role: "memory", content: { contains: "\"working\"" } },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    let workingToEpisodic = 0;
    for (const msg of working.slice(0, 5)) {
      try {
        const parsed = JSON.parse(msg.content);
        parsed.tier = "episodic";
        await prisma.aniMessage.update({
          where: { id: msg.id },
          data: { content: JSON.stringify(parsed) },
        });
        workingToEpisodic++;
      } catch { /* */ }
    }

    return {
      entriesConsolidated: workingToEpisodic,
      workingToEpisodic,
      episodicToSemantic: 0,
      pruned: 0,
    };
  }

  async forget(entryId: string): Promise<boolean> {
    try {
      await prisma.aniMessage.delete({ where: { id: entryId } });
      return true;
    } catch {
      return false;
    }
  }
}

export function createMemorySystem(workspaceId: string): PersistentMemorySystem {
  return new PersistentMemorySystem(workspaceId);
}
