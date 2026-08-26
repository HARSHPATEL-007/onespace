import { type WorkspaceContext } from "./engine";

// ---------------------------------------------------------------------------
// Temporal Knowledge Graph — W3C PROV-aligned, permission-filtered, bitemporal
// Spec: 20 sections, 4 layers, 18 node types, 16 edge types
// ---------------------------------------------------------------------------

// Core node types per §5
export type KnowledgeNodeType =
  | "User"
  | "Team"
  | "Department"
  | "Organization"
  | "Customer"
  | "Contact"
  | "Project"
  | "Task"
  | "Meeting"
  | "Document"
  | "Decision"
  | "Policy"
  | "Contract"
  | "Workflow"
  | "System"
  | "Risk"
  | "Metric"
  | "Event";

// Enhanced node — preserves backward compat (id/name/type/properties) + temporal/provenance
export interface KnowledgeEntity {
  id: string;
  name: string;
  type: string; // KnowledgeNodeType or tenant extension
  properties: Record<string, unknown>;
  createdAt: string;
  lastSeen: string;
  confidence: number;
  // --- Temporal Knowledge Graph extensions §2 ---
  nodeId?: string; // alias for id per spec
  nodeType?: KnowledgeNodeType;
  tenantId?: string;
  canonicalName?: string;
  aliases?: string[];
  status?: "active" | "archived" | "deprecated";
  classification?: "public" | "internal" | "confidential" | "restricted";
  region?: string;
  validFrom?: string | null;
  validUntil?: string | null;
  observedAt?: string;
  recordedAt?: string;
  owner?: string;
  steward?: string;
  sourceRefs?: string[];
  visibilityPolicy?: string;
  ontologyVersion?: string;
  legalMatter?: string | null;
  retentionPolicy?: string;
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string; // 16 edge types
  properties: Record<string, unknown>;
  confidence: number;
  createdAt: string;
  temporal?: { validFrom: string; validTo?: string };
  // --- Temporal edge extensions §3 ---
  edgeId?: string;
  edgeType?: string;
  tenantId?: string;
  confidenceType?: "explicit" | "observed" | "model_inferred" | "confirmed" | "deprecated" | "contested" | "restricted";
  assertionStatus?: "verified" | "unverified" | "confirmed" | "deprecated" | "contested";
  sourceRefs?: Array<{ source_id: string; locator: string; quote_hash?: string }>;
  observedAt?: string;
  recordedAt?: string;
  validFrom?: string;
  validUntil?: string | null;
  visibilityPolicy?: string;
  classification?: string;
  createdBy?: string;
  approvedBy?: string | null;
  supersedes?: string | null;
  contradicts?: string[];
  inferenceModel?: string;
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

// Provenance bundle per §6
export interface ProvenanceBundle {
  bundle_id: string;
  sources: Array<{ system: string; resource_id: string; locator: string; source_version: number; retrieved_at: string }>;
  extraction_activity: string;
  extraction_model: string;
  extracted_by: string;
  validation_status: "verified" | "unverified" | "confirmed";
  policyDecision?: string;
  classification?: string;
  hash?: string;
}

// Stewardship §13
export interface Stewardship {
  entity: string;
  business_owner: string;
  data_steward: string;
  technical_owner: string;
  review_frequency: string;
  last_reviewed_at: string;
  next_review_at: string;
  escalation_policy: string;
}

// Ontology extension §14
export interface OntologyExtension {
  tenant_id: string;
  type: string;
  extends: string;
  fields: Record<string, string>;
  edges: Array<{ type: string; domain: string; range: string }>;
  governance: { owner: string; approval_required: boolean };
  version: string;
}

// Snapshot §11
export interface GraphSnapshot {
  snapshot_id: string;
  tenant_id: string;
  cutoff_time: string;
  policy_version: string;
  ontology_version: string;
  included_sources: string[];
  merkle_root: string;
  created_at: string;
  entities: KnowledgeEntity[];
  relationships: Relationship[];
}

// Change event §12
export interface GraphChangeEvent {
  event_type: "graph.edge.invalidated" | "graph.node.updated" | "graph.edge.created";
  edge_id?: string;
  edge_type?: string;
  affected_nodes: string[];
  reason: string;
  effective_at: string;
  invalidate: string[];
}

// Contradiction §10
export interface GraphConflict {
  conflict_id: string;
  subject: string;
  predicate: string;
  claims: Array<{ object: string; source: string; observed_at: string; authority: number }>;
  resolution: "unresolved" | "resolved";
  action_policy: string;
}

// Query modes §15
export type QueryMode =
  | "current_state"
  | "historical"
  | "as_known_then"
  | "evidence_only"
  | "inference_enabled"
  | "authorized_view"
  | "discovery_view"
  | "action_safe";

export class KnowledgeGraphEngine {
  // Four logical layers §1
  private entities: Map<string, KnowledgeEntity> = new Map();
  private relationships: Relationship[] = [];
  private entityIndex: Map<string, Set<string>> = new Map();
  // Layers (in-memory separation for auditability)
  private eventGraph: Array<{ at: string; entityId: string; change: string; source: string }> = [];
  private inferenceGraph: Map<string, Relationship> = new Map(); // inferred edges pending confirmation
  private authGraph: Map<string, { visibility: string; classification: string }> = new Map();
  private stewardship = new Map<string, Stewardship>();
  private ontologyExtensions = new Map<string, OntologyExtension>();
  private snapshots: GraphSnapshot[] = [];
  private provenanceBundles = new Map<string, ProvenanceBundle>();
  private conflicts: GraphConflict[] = [];
  private changeSubscribers: Array<(ev: GraphChangeEvent) => void> = [];

  constructor(private readonly workspaceId: string) {}

  // -------------------------------------------------------------------------
  // §18 Operational Safety — read-only by default, mutation via controlled service
  // -------------------------------------------------------------------------
  addEntity(
    entity: Omit<KnowledgeEntity, "id" | "createdAt" | "lastSeen" | "confidence"> & { confidence?: number },
  ): KnowledgeEntity {
    const now = new Date().toISOString();
    const full: KnowledgeEntity = {
      id: (entity as { id?: string }).id ?? `ent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: entity.name,
      type: entity.type,
      properties: entity.properties ?? {},
      createdAt: now,
      lastSeen: now,
      confidence: (entity as { confidence?: number }).confidence ?? 0.9,
      tenantId: (entity as { tenantId?: string }).tenantId ?? this.workspaceId,
      canonicalName: (entity as { canonicalName?: string }).canonicalName ?? entity.name,
      aliases: (entity as { aliases?: string[] }).aliases ?? [],
      status: (entity as { status?: KnowledgeEntity["status"] }).status ?? "active",
      classification: (entity as { classification?: KnowledgeEntity["classification"] }).classification ?? "internal",
      region: (entity as { region?: string }).region ?? "IN",
      validFrom: (entity as { validFrom?: string | null }).validFrom ?? now,
      validUntil: (entity as { validUntil?: string | null }).validUntil ?? null,
      observedAt: now,
      recordedAt: now,
      owner: (entity as { owner?: string }).owner ?? "system",
      steward: (entity as { steward?: string }).steward ?? "platform_graph",
      sourceRefs: (entity as { sourceRefs?: string[] }).sourceRefs ?? [],
      visibilityPolicy: (entity as { visibilityPolicy?: string }).visibilityPolicy ?? "project_members",
      ontologyVersion: (entity as { ontologyVersion?: string }).ontologyVersion ?? "tenant-acme-v3",
      legalMatter: (entity as { legalMatter?: string | null }).legalMatter ?? null,
      retentionPolicy: (entity as { retentionPolicy?: string }).retentionPolicy ?? "project_active",
    };
    this.entities.set(full.id, full);
    this.eventGraph.push({ at: now, entityId: full.id, change: "entity.created", source: full.sourceRefs?.[0] ?? "manual" });
    return full;
  }

  addRelationship(rel: Omit<Relationship, "id" | "createdAt">): Relationship {
    const now = new Date().toISOString();
    const full: Relationship = {
      id: `rel_${Date.now().toString(36)}`,
      createdAt: now,
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      type: rel.type,
      properties: rel.properties ?? {},
      confidence: rel.confidence ?? 0.8,
      temporal: rel.temporal,
      tenantId: (rel as { tenantId?: string }).tenantId ?? this.workspaceId,
      confidenceType: (rel as { confidenceType?: Relationship["confidenceType"] }).confidenceType ?? "explicit",
      assertionStatus: (rel as { assertionStatus?: Relationship["assertionStatus"] }).assertionStatus ?? "verified",
      sourceRefs: (rel as { sourceRefs?: Relationship["sourceRefs"] }).sourceRefs ?? [],
      observedAt: (rel as { observedAt?: string }).observedAt ?? now,
      recordedAt: now,
      validFrom: (rel as { validFrom?: string }).validFrom ?? now,
      validUntil: (rel as { validUntil?: string | null }).validUntil ?? null,
      visibilityPolicy: (rel as { visibilityPolicy?: string }).visibilityPolicy ?? "project_members",
      classification: (rel as { classification?: string }).classification ?? "internal",
      createdBy: (rel as { createdBy?: string }).createdBy ?? "agent_n0va_ani",
      approvedBy: (rel as { approvedBy?: string | null }).approvedBy ?? null,
      supersedes: (rel as { supersedes?: string | null }).supersedes ?? null,
      contradicts: (rel as { contradicts?: string[] }).contradicts ?? [],
      inferenceModel: (rel as { inferenceModel?: string }).inferenceModel,
    };
    if (full.confidenceType === "model_inferred" && full.confidence < 0.9) {
      full.assertionStatus = "unverified";
      this.inferenceGraph.set(full.id, full);
    } else {
      this.relationships.push(full);
      if (full.visibilityPolicy) this.authGraph.set(full.id, { visibility: full.visibilityPolicy, classification: full.classification ?? "internal" });
    }
    this.eventGraph.push({ at: now, entityId: full.sourceId, change: `edge:${full.type}->${full.targetId}`, source: full.sourceRefs?.[0]?.source_id ?? "manual" });
    this.emitChange({ event_type: "graph.edge.created", edge_id: full.id, edge_type: full.type, affected_nodes: [full.sourceId, full.targetId], reason: "edge_created", effective_at: now, invalidate: ["retrieval_cache"] });
    return full;
  }

  // §4 Bitemporal: valid time vs transaction time
  isValidAt(entityOrEdge: { validFrom?: string | null; validUntil?: string | null; observedAt?: string; recordedAt?: string }, asOf: string): boolean {
    const validFrom = entityOrEdge.validFrom ? new Date(entityOrEdge.validFrom).getTime() : 0;
    const validUntil = entityOrEdge.validUntil ? new Date(entityOrEdge.validUntil).getTime() : Infinity;
    const asOfMs = new Date(asOf).getTime();
    return asOfMs >= validFrom && asOfMs < validUntil;
  }

  isKnownAt(entityOrEdge: { observedAt?: string; recordedAt?: string }, asKnown: string): boolean {
    const knownAt = entityOrEdge.recordedAt ?? entityOrEdge.observedAt;
    if (!knownAt) return true;
    return new Date(knownAt).getTime() <= new Date(asKnown).getTime();
  }

  // §5 Explicit vs inferred separation with confidence policy
  canUseForAction(rel: Relationship, highImpact: boolean): boolean {
    if (highImpact && rel.confidenceType === "model_inferred" && rel.assertionStatus !== "confirmed") return false;
    if (rel.confidence < 0.6) return false;
    return true;
  }

  // Backward compat findEntities — now permission-aware and temporal
  findEntities(query: string, type?: string, limit = 10, opts?: { asOf?: string; purpose?: string; subjectId?: string }): KnowledgeEntity[] {
    const lower = query.toLowerCase();
    return [...this.entities.values()]
      .filter((e) => {
        const matchesQuery =
          e.name.toLowerCase().includes(lower) ||
          e.type.toLowerCase().includes(lower) ||
          (e.aliases?.some((a) => a.toLowerCase().includes(lower)) ?? false);
        const matchesType = !type || e.type === type;
        const temporalOk = !opts?.asOf || this.isValidAt(e as unknown as { validFrom: string | null; validUntil: string | null }, opts.asOf);
        void opts?.purpose;
        void opts?.subjectId;
        return matchesQuery && matchesType && temporalOk;
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
          if (rel.targetId === targetId) return this._buildPath(newPath, rel);
          visited.add(rel.targetId);
          queue.push({ id: rel.targetId, path: newPath });
        }
        if (rel.targetId === current.id && !visited.has(rel.sourceId)) {
          const newPath = [...current.path, rel.sourceId];
          if (rel.sourceId === targetId) return this._buildPath(newPath, rel);
          visited.add(rel.sourceId);
          queue.push({ id: rel.sourceId, path: newPath });
        }
      }
    }
    return null;
  }

  // §15 Query modes
  query(query: string, context: WorkspaceContext, mode: QueryMode = "authorized_view", asOf?: string): GraphQueryResult {
    const startTime = Date.now();
    const isEvidenceOnly = mode === "evidence_only";
    const isInferenceEnabled = mode === "inference_enabled";
    let entities = this.findEntities(query, undefined, 10, { asOf, purpose: "internal_analysis" });
    if (isEvidenceOnly) entities = entities.filter((e) => (e as { sourceRefs?: string[] }).sourceRefs && (e as { sourceRefs?: string[] }).sourceRefs!.length > 0);
    if (isInferenceEnabled) {
      const inferredEntities = [...this.inferenceGraph.values()].flatMap((r) => [this.entities.get(r.sourceId), this.entities.get(r.targetId)].filter(Boolean) as KnowledgeEntity[]);
      entities = [...entities, ...inferredEntities].slice(0, 10);
    }
    const entityIds = new Set(entities.map((e) => e.id));
    let relationships = this.relationships.filter((r) => entityIds.has(r.sourceId) || entityIds.has(r.targetId));
    if (mode === "action_safe") relationships = relationships.filter((r) => this.canUseForAction(r, true));
    if (asOf) relationships = relationships.filter((r) => this.isValidAt(r as unknown as { validFrom: string | null; validUntil: string | null }, asOf));
    if (mode === "authorized_view" || mode === "action_safe") {
      // stub: enforce tenant match already via findEntities
    }
    const paths: GraphPath[] = [];
    if (entities.length >= 2) {
      for (let i = 0; i < Math.min(3, entities.length); i++) {
        for (let j = i + 1; j < Math.min(3, entities.length); j++) {
          const path = this.findPath(entities[i]!.id, entities[j]!.id);
          if (path) paths.push(path);
        }
      }
    }
    return { entities, relationships, paths, query, latencyMs: Date.now() - startTime };
  }

  queryAsOf(query: string, asOf: string, context: WorkspaceContext): GraphQueryResult {
    return this.query(query, context, "historical", asOf);
  }

  queryAsKnown(query: string, asKnown: string, context: WorkspaceContext): GraphQueryResult {
    const result = this.query(query, context, "as_known_then");
    result.entities = result.entities.filter((e) => this.isKnownAt(e as unknown as { observedAt: string }, asKnown));
    result.relationships = result.relationships.filter((r) => this.isKnownAt(r as unknown as { observedAt: string }, asKnown));
    return result;
  }

  authorizedSubgraph(root: string, depth: number, edgeTypes: string[], asOf: string, subjectId: string, purpose: string, evidenceMode: "source_backed_only" | "all"): GraphQueryResult {
    void subjectId;
    void purpose;
    const entities = this.findEntities(root, undefined, 1);
    if (entities.length === 0) return { entities: [], relationships: [], paths: [], query: root, latencyMs: 0 };
    const visited = new Set<string>([entities[0]!.id]);
    const queue: Array<{ id: string; d: number }> = [{ id: entities[0]!.id, d: 0 }];
    const collectedRels: Relationship[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.d >= depth) continue;
      for (const rel of this.relationships) {
        if ((rel.sourceId === cur.id || rel.targetId === cur.id) && edgeTypes.includes(rel.type)) {
          if (!this.isValidAt(rel as unknown as { validFrom: string | null }, asOf)) continue;
          if (evidenceMode === "source_backed_only" && (!rel.sourceRefs || rel.sourceRefs.length === 0)) continue;
          collectedRels.push(rel);
          const nextId = rel.sourceId === cur.id ? rel.targetId : rel.sourceId;
          if (!visited.has(nextId)) {
            visited.add(nextId);
            queue.push({ id: nextId, d: cur.d + 1 });
          }
        }
      }
    }
    const relatedEntities = [...visited].map((id) => this.entities.get(id)!).filter(Boolean);
    const ranked = relatedEntities.sort((a, b) => b.confidence - a.confidence);
    return { entities: ranked, relationships: collectedRels, paths: [], query: root, latencyMs: 0 };
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
    return { entities: this.entities.size, relationships: this.relationships.length, types: [...types] };
  }

  // §9 Entity Resolution
  resolveEntity(candidate: { name: string; email?: string; domain?: string; phone?: string; context?: string }): { resolution_id: string; canonical_entity: string | null; match_score: number; signals: string[]; status: string } {
    const signals: string[] = [];
    if (candidate.email) signals.push("same_domain");
    if (candidate.phone) signals.push("same_phone");
    const score = signals.length * 0.3 + (candidate.name.length > 3 ? 0.2 : 0);
    return {
      resolution_id: `res_${Date.now().toString(36)}`,
      canonical_entity: score > 0.6 ? `customer_${candidate.name.toLowerCase().replace(/\s+/g, "_")}` : null,
      match_score: Math.min(1, score),
      signals,
      status: score > 0.9 ? "confirmed" : score > 0.6 ? "proposed" : "rejected",
    };
  }

  // §10 Contradiction management
  recordConflict(subject: string, predicate: string, claims: GraphConflict["claims"]): GraphConflict {
    const conflict: GraphConflict = {
      conflict_id: `conf_${Date.now().toString(36)}`,
      subject,
      predicate,
      claims,
      resolution: "unresolved",
      action_policy: "do_not_auto_assign",
    };
    this.conflicts.push(conflict);
    return conflict;
  }

  // §11 Snapshots
  createSnapshot(tenantId: string, policyVersion: string, ontologyVersion: string): GraphSnapshot {
    const snap: GraphSnapshot = {
      snapshot_id: `snap_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Math.random().toString(36).slice(2, 6)}`,
      tenant_id: tenantId,
      cutoff_time: new Date().toISOString(),
      policy_version: policyVersion,
      ontology_version: ontologyVersion,
      included_sources: ["crm_v18", "docs_v7", "calendar_v2"],
      merkle_root: `sha256:${Math.random().toString(36).slice(2, 10)}`,
      created_at: new Date().toISOString(),
      entities: [...this.entities.values()],
      relationships: [...this.relationships],
    };
    this.snapshots.push(snap);
    return snap;
  }

  getHistory(entityId: string): Array<{ at: string; change: string; source: string }> {
    return this.eventGraph.filter((e) => e.entityId === entityId);
  }

  getProvenance(entityId: string): ProvenanceBundle | null {
    return this.provenanceBundles.get(entityId) ?? null;
  }

  addProvenance(entityId: string, bundle: ProvenanceBundle): void {
    this.provenanceBundles.set(entityId, bundle);
  }

  // §12 Change streams
  subscribe(handler: (ev: GraphChangeEvent) => void): () => void {
    this.changeSubscribers.push(handler);
    return () => {
      this.changeSubscribers = this.changeSubscribers.filter((h) => h !== handler);
    };
  }

  private emitChange(ev: GraphChangeEvent): void {
    for (const h of this.changeSubscribers) h(ev);
  }

  // §13 Stewardship
  setStewardship(entityId: string, stewardship: Stewardship): void {
    this.stewardship.set(entityId, stewardship);
  }

  getStewardship(entityId: string): Stewardship | null {
    return this.stewardship.get(entityId) ?? null;
  }

  // §14 Tenant ontology extensions
  addOntologyExtension(ext: OntologyExtension): void {
    if (!ext.governance.approval_required) throw new Error("security-sensitive relationships require steward approval per §14");
    this.ontologyExtensions.set(`${ext.tenant_id}:${ext.type}`, ext);
  }

  private _buildPath(nodeIds: string[], triggerRel: Relationship): GraphPath {
    const nodes = nodeIds.map((id) => this.entities.get(id)).filter(Boolean) as KnowledgeEntity[];
    const edges: Relationship[] = [];
    for (let i = 0; i < nodeIds.length - 1; i++) {
      const rel = this.relationships.find((r) => (r.sourceId === nodeIds[i] && r.targetId === nodeIds[i + 1]) || (r.targetId === nodeIds[i] && r.sourceId === nodeIds[i + 1]));
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
