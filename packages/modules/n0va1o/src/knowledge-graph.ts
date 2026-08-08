/**
 * N0VA1O Knowledge Graph Engine — entity extraction, relationship inference, query (spec §37).
 *
 * Maintains a multi-layer knowledge graph with entity extraction, relationship
 * inference, temporal reasoning, and probabilistic facts. Supports path-finding,
 * community detection, anomaly detection, and reasoning queries.
 */

export type EntityType = "user" | "workspace" | "integration" | "document" | "task" | "deal" | "contact" | "invoice" | "meeting" | "project" | "organization" | "custom";

export type EdgeType = "AUTHORED" | "MEMBERS_OF" | "CONNECTED_TO" | "REFERENCES" | "DEPENDS_ON" | "OWNS" | "ASSIGNED_TO" | "PART_OF" | "SIMILAR_TO" | "CUSTOM";

export interface GraphEntity {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown>;
  embedding?: number[];
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number;
  confidence: number;
  properties: Record<string, unknown>;
  createdAt: string;
  validFrom?: string;
  validTo?: string;
}

export interface GraphSnapshot {
  nodeCount: number;
  edgeCount: number;
  entityTypes: Record<string, number>;
  edgeTypes: Record<string, number>;
  density: number;
  timestamp: string;
}

export interface PathResult {
  path: string[];
  length: number;
  confidence: number;
  edges: GraphEdge[];
}

export interface QueryResult {
  query: string;
  results: Array<Record<string, unknown>>;
  latencyMs: number;
  confidence: number;
}

export interface AnomalyReport {
  entityId: string;
  entityName: string;
  anomalyType: "unusual_connection" | "confidence_drop" | "structural_change" | "embedding_drift";
  score: number;
  details: string;
  detectedAt: string;
}

export interface ReasoningResult {
  query: string;
  answer: boolean | string | number | null;
  confidence: number;
  evidence: Array<{ entityId: string; edgeId?: string; explanation: string }>;
  caveats: string[];
}

const DEFAULT_ENTITY_CONFIDENCE = 0.9;
const DEFAULT_EDGE_WEIGHT = 1.0;
const DEFAULT_EDGE_CONFIDENCE = 0.85;

/**
 * Ingest a text document and extract entities + relationships.
 */
export function ingestDocument(doc: { id: string; title: string; content: string; type: EntityType; workspaceId: string }): { entities: GraphEntity[]; edges: GraphEdge[] } {
  const entities: GraphEntity[] = [];
  const edges: GraphEdge[] = [];
  const now = new Date().toISOString();

  // Extract entity (the document itself)
  entities.push({
    id: `ent_${doc.id}`,
    type: doc.type,
    name: doc.title,
    properties: { docId: doc.id, contentLength: doc.content.length },
    confidence: DEFAULT_ENTITY_CONFIDENCE,
    createdAt: now,
    updatedAt: now,
  });

  // Extract referenced entities from content (emails, @mentions, URLs)
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  const urlRegex = /https?:\/\/[^\s]+/g;

  const foundEmails = new Set<string>();
  const foundMentions = new Set<string>();
  const foundUrls = new Set<string>();

  let match;
  while ((match = emailRegex.exec(doc.content)) !== null) {
    const email = match[1]!;
    if (!foundEmails.has(email)) {
      foundEmails.add(email);
      const contactId = `ent_email_${hashString(email)}`;
      entities.push({
        id: contactId,
        type: "contact",
        name: email,
        properties: { email },
        confidence: 0.95,
        createdAt: now,
        updatedAt: now,
      });
      edges.push({
        id: `edge_${hashString(doc.id + email)}`,
        source: `ent_${doc.id}`,
        target: contactId,
        type: "REFERENCES",
        weight: 0.5,
        confidence: 0.95,
        properties: {},
        createdAt: now,
      });
    }
  }

  while ((match = mentionRegex.exec(doc.content)) !== null) {
    const mention = match[1]!;
    if (!foundMentions.has(mention)) {
      foundMentions.add(mention);
      const userId = `ent_user_${hashString(mention)}`;
      entities.push({
        id: userId,
        type: "user",
        name: mention,
        properties: { username: mention },
        confidence: 0.9,
        createdAt: now,
        updatedAt: now,
      });
      edges.push({
        id: `edge_${hashString(doc.id + mention)}`,
        source: `ent_${doc.id}`,
        target: userId,
        type: "REFERENCES",
        weight: 0.7,
        confidence: 0.9,
        properties: {},
        createdAt: now,
      });
    }
  }

  while ((match = urlRegex.exec(doc.content)) !== null) {
    const url = match[0]!;
    if (!foundUrls.has(url)) {
      foundUrls.add(url);
      const urlId = `ent_url_${hashString(url)}`;
      entities.push({
        id: urlId,
        type: "custom",
        name: url,
        properties: { url, hostname: new URL(url).hostname },
        confidence: 0.98,
        createdAt: now,
        updatedAt: now,
      });
      edges.push({
        id: `edge_${hashString(doc.id + url)}`,
        source: `ent_${doc.id}`,
        target: urlId,
        type: "REFERENCES",
        weight: 0.3,
        confidence: 0.98,
        properties: {},
        createdAt: now,
      });
    }
  }

  // Register in the graph
  for (const entity of entities) {
    ENTITY_STORE.set(entity.id, entity);
  }
  for (const edge of edges) {
    EDGE_STORE.set(edge.id, edge);
    EDGE_INDEX.add(edge.source, edge.target, edge.type, edge.id);
  }

  return { entities, edges };
}

/**
 * Add a relationship between two entities.
 */
export function addEdge(edge: Omit<GraphEdge, "id" | "createdAt">): GraphEdge {
  const now = new Date().toISOString();
  const fullEdge: GraphEdge = {
    ...edge,
    id: `edge_${hashString(edge.source + edge.target + edge.type + Date.now())}`,
    createdAt: now,
  };
  EDGE_STORE.set(fullEdge.id, fullEdge);
  EDGE_INDEX.add(edge.source, edge.target, edge.type, fullEdge.id);
  return fullEdge;
}

/**
 * Find the shortest path between two entities.
 */
export function findPath(sourceId: string, targetId: string, maxLength = 5): PathResult | null {
  const queue: Array<{ node: string; path: string[]; edges: GraphEdge[]; confidence: number }> = [{
    node: sourceId,
    path: [sourceId],
    edges: [],
    confidence: 1,
  }];
  const visited = new Set<string>();
  visited.add(sourceId);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.node === targetId) {
      return {
        path: current.path,
        length: current.edges.length,
        confidence: current.confidence,
        edges: current.edges,
      };
    }

    if (current.edges.length >= maxLength) continue;

    const neighbors = EDGE_INDEX.neighbors(current.node);
    for (const { target, edgeId } of neighbors) {
      if (visited.has(target)) continue;
      const edge = EDGE_STORE.get(edgeId);
      if (!edge) continue;

      visited.add(target);
      queue.push({
        node: target,
        path: [...current.path, target],
        edges: [...current.edges, edge],
        confidence: current.confidence * edge.confidence,
      });
    }
  }

  return null;
}

/**
 * Detect communities in the graph using label propagation.
 */
export function detectCommunities(iterations = 5): Map<string, number> {
  const communities = new Map<string, number>();
  let nextId = 0;

  // Initialize each node with its own community
  for (const entityId of ENTITY_STORE.keys()) {
    communities.set(entityId, nextId++);
  }

  // Label propagation
  for (let iter = 0; iter < iterations; iter++) {
    for (const entityId of ENTITY_STORE.keys()) {
      const neighbors = EDGE_INDEX.neighbors(entityId);
      if (neighbors.length === 0) continue;

      const neighborLabels = new Map<number, number>();
      for (const { target } of neighbors) {
        const label = communities.get(target);
        if (label !== undefined) {
          neighborLabels.set(label, (neighborLabels.get(label) ?? 0) + 1);
        }
      }

      let bestLabel = -1;
      let bestCount = 0;
      for (const [label, count] of neighborLabels) {
        if (count > bestCount) {
          bestCount = count;
          bestLabel = label;
        }
      }

      if (bestLabel !== -1) {
        communities.set(entityId, bestLabel);
      }
    }
  }

  return communities;
}

/**
 * Detect anomalies in the graph.
 */
export function detectAnomalies(): AnomalyReport[] {
  const anomalies: AnomalyReport[] = [];
  const communitySizes = new Map<number, number>();

  const communities = detectCommunities();
  for (const label of communities.values()) {
    communitySizes.set(label, (communitySizes.get(label) ?? 0) + 1);
  }

  // Detect unusual connections (edges between communities)
  for (const edge of EDGE_STORE.values()) {
    const sourceCommunity = communities.get(edge.source);
    const targetCommunity = communities.get(edge.target);

    if (sourceCommunity !== undefined && targetCommunity !== undefined && sourceCommunity !== targetCommunity) {
      const sourceSize = communitySizes.get(sourceCommunity) ?? 0;
      const targetSize = communitySizes.get(targetCommunity) ?? 0;

      if (sourceSize > 10 && targetSize > 10) {
        anomalies.push({
          entityId: edge.source,
          entityName: ENTITY_STORE.get(edge.source)?.name ?? "unknown",
          anomalyType: "unusual_connection",
          score: 0.7,
          details: `Edge crosses community boundary (${edge.type})`,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Detect confidence drops
  for (const entity of ENTITY_STORE.values()) {
    if (entity.confidence < 0.5) {
      anomalies.push({
        entityId: entity.id,
        entityName: entity.name,
        anomalyType: "confidence_drop",
        score: 1 - entity.confidence,
        details: `Entity confidence dropped to ${entity.confidence}`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Detect embedding drift (simplified)
  for (const entity of ENTITY_STORE.values()) {
    if (entity.type === "document" && entity.embedding) {
      const magnitude = Math.sqrt(entity.embedding.reduce((sum, v) => sum + v * v, 0));
      if (magnitude < 0.1) {
        anomalies.push({
          entityId: entity.id,
          entityName: entity.name,
          anomalyType: "embedding_drift",
          score: 0.8,
          details: "Embedding near-zero — possible data corruption",
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  return anomalies;
}

/**
 * Run a knowledge graph query.
 */
export function queryGraph(query: string): QueryResult {
  const start = Date.now();
  const results: Array<Record<string, unknown>> = [];

  if (query.toLowerCase().includes("entities of type")) {
    const typeMatch = query.match(/type\s+(\w+)/i);
    if (typeMatch) {
      const type = typeMatch[1] as EntityType;
      for (const entity of ENTITY_STORE.values()) {
        if (entity.type === type) {
          results.push({ id: entity.id, name: entity.name, properties: entity.properties });
        }
      }
    }
  } else if (query.toLowerCase().includes("related to")) {
    const idMatch = query.match(/related to\s+(\S+)/i);
    if (idMatch) {
      const entityId = idMatch[1];
      const neighbors = EDGE_INDEX.neighbors(entityId);
      for (const { target, edgeId } of neighbors) {
        const targetEntity = ENTITY_STORE.get(target);
        const edge = EDGE_STORE.get(edgeId);
        if (targetEntity && edge) {
          results.push({
            target: targetEntity.name,
            edgeType: edge.type,
            weight: edge.weight,
            confidence: edge.confidence,
          });
        }
      }
    }
  } else {
    // Generic: return entities matching keywords
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    for (const entity of ENTITY_STORE.values()) {
      if (terms.some((t) => entity.name.toLowerCase().includes(t))) {
        results.push({ id: entity.id, name: entity.name, type: entity.type, properties: entity.properties });
      }
    }
  }

  return {
    query,
    results,
    latencyMs: Date.now() - start,
    confidence: results.length > 0 ? 0.9 : 0.5,
  };
}

/**
 * Run reasoning on the knowledge graph.
 */
export function reasonAbout(query: string, context: Record<string, unknown> = {}): ReasoningResult {
  const reasoningQuery = query.toLowerCase();
  const evidence: ReasoningResult["evidence"] = [];
  const caveats: string[] = [];
  let answer: boolean | string | number | null = null;
  let confidence = 0.5;

  if (reasoningQuery.includes("connected") || reasoningQuery.includes("related")) {
    const fromMatch = query.match(/from\s+(\S+)/i);
    const toMatch = query.match(/to\s+(\S+)/i);
    if (fromMatch && toMatch) {
      const path = findPath(fromMatch[1], toMatch[1], 5);
      if (path) {
        answer = true;
        confidence = path.confidence;
        evidence.push({ entityId: fromMatch[1], explanation: `Path found via ${path.edges.length} hops` });
      } else {
        answer = false;
        confidence = 0.8;
        evidence.push({ entityId: fromMatch[1], explanation: "No path found within max length" });
      }
    }
  } else if (reasoningQuery.includes("depends on")) {
    const idMatch = query.match(/dependencies of\s+(\S+)/i);
    if (idMatch) {
      const neighbors = EDGE_INDEX.neighbors(idMatch[1]);
      const deps = neighbors.filter((n) => {
        const edge = EDGE_STORE.get(n.edgeId);
        return edge?.type === "DEPENDS_ON";
      });
      answer = deps.length > 0;
      confidence = 0.9;
      evidence.push({ entityId: idMatch[1], explanation: `${deps.length} dependencies found` });
    }
  }

  if (confidence < 0.7) {
    caveats.push("Low confidence — reasoning based on limited evidence");
  }

  return { query, answer, confidence, evidence, caveats };
}

/**
 * Get graph statistics snapshot.
 */
export function getGraphSnapshot(): GraphSnapshot {
  const entityTypes: Record<string, number> = {};
  const edgeTypes: Record<string, number> = {};
  let edgeCount = 0;

  for (const entity of ENTITY_STORE.values()) {
    entityTypes[entity.type] = (entityTypes[entity.type] ?? 0) + 1;
  }

  for (const edge of EDGE_STORE.values()) {
    edgeTypes[edge.type] = (edgeTypes[edge.type] ?? 0) + 1;
    edgeCount++;
  }

  const nodeCount = ENTITY_STORE.size;
  const possibleEdges = nodeCount * (nodeCount - 1);
  const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

  return {
    nodeCount,
    edgeCount,
    entityTypes,
    edgeTypes,
    density,
    timestamp: new Date().toISOString(),
  };
}

class EdgeIndex {
  private outgoing = new Map<string, Map<string, Set<string>>>();
  private incoming = new Map<string, Map<string, Set<string>>>();

  add(source: string, target: string, edgeType: string, edgeId: string): void {
    if (!this.outgoing.has(source)) this.outgoing.set(source, new Map());
    const outMap = this.outgoing.get(source)!;
    if (!outMap.has(target)) outMap.set(target, new Set());
    outMap.get(target)!.add(edgeId);

    if (!this.incoming.has(target)) this.incoming.set(target, new Map());
    const inMap = this.incoming.get(target)!;
    if (!inMap.has(source)) inMap.set(source, new Set());
    inMap.get(source)!.add(edgeId);
  }

  neighbors(node: string): Array<{ target: string; edgeId: string }> {
    const result: Array<{ target: string; edgeId: string }> = [];
    const outMap = this.outgoing.get(node);
    if (!outMap) return result;

    for (const [target, edgeIds] of outMap) {
      for (const edgeId of edgeIds) {
        result.push({ target, edgeId });
      }
    }
    return result;
  }
}

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

const ENTITY_STORE = new Map<string, GraphEntity>();
const EDGE_STORE = new Map<string, GraphEdge>();
const EDGE_INDEX = new EdgeIndex();

export { ENTITY_STORE, EDGE_STORE };
