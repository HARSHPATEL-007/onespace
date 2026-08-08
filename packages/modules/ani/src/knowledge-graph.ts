import { type WorkspaceContext } from "./engine";

export interface KnowledgeEntity {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: string;
  lastSeen: string;
  confidence: number;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties: Record<string, unknown>;
  confidence: number;
  createdAt: string;
  temporal?: { validFrom: string; validTo?: string };
}

export interface GraphPath {
  nodes: KnowledgeEntity[];
  edges: Relationship[];
  totalWeight: number;
}

export interface GraphQueryResult {
  entities: KnowledgeEntity[];
  relationships: Relationship[];
  paths: GraphPath[];
  query: string;
  latencyMs: number;
}

export class KnowledgeGraphEngine {
  private entities: Map<string, KnowledgeEntity> = new Map();
  private relationships: Relationship[] = [];
  private entityIndex: Map<string, Set<string>> = new Map();

  constructor(private readonly workspaceId: string) {}

  addEntity(entity: Omit<KnowledgeEntity, "id" | "createdAt" | "lastSeen" | "confidence"> & { confidence?: number }): KnowledgeEntity {
    const full: KnowledgeEntity = {
      ...entity,
      id: `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      confidence: entity.confidence ?? 0.9,
    };
    this.entities.set(full.id, full);
    return full;
  }

  addRelationship(rel: Omit<Relationship, "id" | "createdAt">): Relationship {
    const full: Relationship = {
      ...rel,
      id: `rel_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    this.relationships.push(full);
    return full;
  }

  findEntities(query: string, type?: string, limit = 10): KnowledgeEntity[] {
    const lower = query.toLowerCase();
    return [...this.entities.values()]
      .filter((e) => {
        const matchesQuery = e.name.toLowerCase().includes(lower) || e.type.toLowerCase().includes(lower);
        const matchesType = !type || e.type === type;
        return matchesQuery && matchesType;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  findPath(sourceId: string, targetId: string, maxDepth = 4): GraphPath | null {
    const visited = new Set<string>();
    const queue: Array<{ id: string; path: string[] }> = [{ id: sourceId, path: [sourceId] }];
    visited.add(sourceId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.path.length > maxDepth) continue;

      for (const rel of this.relationships) {
        if (rel.sourceId === current.id && !visited.has(rel.targetId)) {
          const newPath = [...current.path, rel.targetId];
          if (rel.targetId === targetId) {
            return this._buildPath(newPath, rel);
          }
          visited.add(rel.targetId);
          queue.push({ id: rel.targetId, path: newPath });
        }
        if (rel.targetId === current.id && !visited.has(rel.sourceId)) {
          const newPath = [...current.path, rel.sourceId];
          if (rel.sourceId === targetId) {
            return this._buildPath(newPath, rel);
          }
          visited.add(rel.sourceId);
          queue.push({ id: rel.sourceId, path: newPath });
        }
      }
    }

    return null;
  }

  query(query: string, context: WorkspaceContext): GraphQueryResult {
    const startTime = Date.now();
    const entities = this.findEntities(query);
    const entityIds = new Set(entities.map((e) => e.id));

    const relationships = this.relationships.filter(
      (r) => entityIds.has(r.sourceId) || entityIds.has(r.targetId),
    );

    const paths: GraphPath[] = [];
    if (entities.length >= 2) {
      for (let i = 0; i < Math.min(3, entities.length); i++) {
        for (let j = i + 1; j < Math.min(3, entities.length); j++) {
          const path = this.findPath(entities[i]!.id, entities[j]!.id);
          if (path) paths.push(path);
        }
      }
    }

    return {
      entities,
      relationships,
      paths,
      query,
      latencyMs: Date.now() - startTime,
    };
  }

  getRelated(entityId: string, limit = 10): Array<{ entity: KnowledgeEntity; relationship: Relationship }> {
    const results: Array<{ entity: KnowledgeEntity; relationship: Relationship }> = [];

    for (const rel of this.relationships) {
      if (rel.sourceId === entityId) {
        const target = this.entities.get(rel.targetId);
        if (target) results.push({ entity: target, relationship: rel });
      }
      if (rel.targetId === entityId) {
        const source = this.entities.get(rel.sourceId);
        if (source) results.push({ entity: source, relationship: rel });
      }
    }

    return results.sort((a, b) => b.relationship.confidence - a.relationship.confidence).slice(0, limit);
  }

  getStats(): { entities: number; relationships: number; types: string[] } {
    const types = new Set([...this.entities.values()].map((e) => e.type));
    return {
      entities: this.entities.size,
      relationships: this.relationships.length,
      types: [...types],
    };
  }

  private _buildPath(nodeIds: string[], triggerRel: Relationship): GraphPath {
    const nodes = nodeIds.map((id) => this.entities.get(id)).filter(Boolean) as KnowledgeEntity[];
    const edges: Relationship[] = [];

    for (let i = 0; i < nodeIds.length - 1; i++) {
      const rel = this.relationships.find(
        (r) => (r.sourceId === nodeIds[i] && r.targetId === nodeIds[i + 1]) ||
               (r.targetId === nodeIds[i] && r.sourceId === nodeIds[i + 1]),
      );
      if (rel) edges.push(rel);
    }

    if (edges.length === 0) edges.push(triggerRel);

    const totalWeight = edges.reduce((sum, e) => sum + e.confidence, 0) / Math.max(1, edges.length);

    return { nodes, edges, totalWeight };
  }
}

export function createKnowledgeGraph(workspaceId: string): KnowledgeGraphEngine {
  return new KnowledgeGraphEngine(workspaceId);
}
