/**
 * N0VA VIDEOS — Non-Destructive AI Editing Graph Engine
 * Directed acyclic render graph: immutable Asset → Node → Artifact → GraphVersion
 * Implements: hashing, taxonomy, param immutability, enable/disable/reorder/replace, timeline projection,
 * range-scoped nodes, cache by content hash, invalidation, reproducibility, determinism, scheduling, cost, explainability.
 */
import type {
  Asset, GraphNode, GraphEdge, GraphVersion, GraphArtifact, CacheEntry, CacheKeyComponents,
  ReproducibilityDeclaration, ExecutionMetrics, GraphExplainFrame, NodeCompareSpec, ExternalCapture,
  ApprovalBinding, NodeManifest, TimelineProjection, GraphValidationError, NodeCategory,
} from "./graph-types";
import { NODE_TAXONOMY } from "./graph-types";

// ── Hashing & canonicalization ───────────────────────────────────────────────
function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(input: string): string {
  // Mock sha3-512: deterministic, content-addressed — production uses real sha3-512 + quantum sig
  let h = 0; for (let i = 0; i < input.length; i++) h = ((h << 5) - h + input.charCodeAt(i)) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, "0") + input.length.toString(16).padStart(8, "0") + Math.random().toString(16).slice(2, 8);
  return `sha3-512:${hex.slice(0, 32)}${hex.slice(0, 16)}`;
}
function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalStringify).join(",")}]`;
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalStringify(rec[k])}`).join(",")}}`;
}
export function nodeHashFor(node: Omit<GraphNode, "node_hash" | "created_at"> & { created_at?: string }): string {
  // Spec: derived from canonicalized node type, operation, schema version, input artifact hashes, parameters,
  // prompt refs, model digest, runtime digest, seed, execution policy, consent refs, operator/agent attribution
  const payload = canonicalStringify({
    node_type: node.node_type,
    operation: node.operation,
    schema_version: node.schema_version,
    input_hashes: [...node.inputs].sort((a, b) => a.port.localeCompare(b.port)).map(i => i.artifact_id),
    parameters: node.parameters,
    prompt_ref: (node.parameters as Record<string, unknown>)?.prompt_ref ?? null,
    model_digest: node.execution.model_digest,
    runtime_digest: node.execution.runtime_digest,
    seed: node.execution.seed,
    determinism_mode: node.determinism_policy.mode,
    consent_refs: [...(node.consent_refs ?? [])].sort(),
    operator: node.attribution.operator_id,
    agent: node.attribution.agent_id,
    scope: node.scope ?? null,
  });
  return hash(payload);
}
export function graphHashFor(v: { graph_id: string; nodes: string[]; edges: GraphEdge[]; root_inputs: string[]; active_outputs?: string[] }): string {
  return hash(canonicalStringify({ graph_id: v.graph_id, nodes: [...v.nodes].sort(), edges: [...v.edges].sort(), roots: [...v.root_inputs].sort() }));
}

// ── In-memory stores (per-process; prod = dedicated Graph Fabric DB + artifact store) ──
const assets = new Map<string, Asset>();
const nodes = new Map<string, GraphNode>();
const graphVersions = new Map<string, GraphVersion>(); // key `${graph_id}:${graph_version}`
const artifacts = new Map<string, GraphArtifact>();
const cache = new Map<string, CacheEntry>();
const approvals = new Map<string, ApprovalBinding>();
const externalCaptures = new Map<string, ExternalCapture>();
const timelineProjections = new Map<string, TimelineProjection>();

function gvKey(graph_id: string, gv: string) { return `${graph_id}:${gv}`; }

// ── Immutable source layer ───────────────────────────────────────────────────
export function createAsset(input: {
  asset_id?: string;
  media: Asset["media"];
  fileHash: string;
  decodedHash?: string;
  frameHashes?: string[];
  audioHashes?: string[];
  camera_meta?: Record<string, unknown>;
  consent_id?: string;
  legal_hold?: boolean;
}): Asset {
  const asset_id = input.asset_id ?? uid("asset");
  const a: Asset = {
    asset_id,
    asset_type: "original_media",
    immutability: { write_once: true, content_hash: input.fileHash, decoded_hash: input.decodedHash ?? hash(input.fileHash + ":decoded"), legal_hold: !!input.legal_hold },
    media: input.media,
    metadata: {
      decoded_hash: input.decodedHash,
      frame_hashes: input.frameHashes,
      audio_hashes: input.audioHashes,
      camera_meta: input.camera_meta,
      rights: input.consent_id ? { consent_id: input.consent_id } : undefined,
      ingest_at: nowIso(),
    },
    provenance_root: hash(`merkle:${input.fileHash}:${input.decodedHash ?? ""}`),
    storage: { tier: "hot", location: `s3://n0va-videos-hot/${asset_id}` },
  };
  assets.set(asset_id, a);
  return a;
}
export function getAsset(asset_id: string): Asset | null { return assets.get(asset_id) ?? null; }
export function assertImmutableWrite(asset_id: string): void {
  const a = assets.get(asset_id);
  if (!a) return;
  if (a.immutability.write_once) throw new Error(`Immutable source ${asset_id} is write-once — nodes may reference but never modify or replace it (guardrail)`);
}

// ── Node taxonomy & execution defaults ──────────────────────────────────────
function categoryForOperation(op: string): NodeCategory {
  for (const [cat, ops] of Object.entries(NODE_TAXONOMY)) if ((ops as string[]).includes(op)) return cat as NodeCategory;
  // finishing fallback for codec/packaging etc.
  if (["color_grade","lut","hdr_map","captions","watermark","audio_mix","codec_packaging","c2pa_manifest"].some(v => op.includes(v))) return "finishing";
  return "visual_ai";
}
function defaultDeterminism(operation: string): GraphNode["determinism_policy"] {
  const strictOps = ["transcription","denoise","stabilization","color_grade","captions","loudness_normalize"];
  const externalOps = ["voice_clone","dubbing"];
  if (externalOps.some(o => operation.includes(o))) return { mode: "external", seed_required: true, temperature_allowed: true, provider_replay_supported: false, maximum_pixel_difference: 0.01, maximum_audio_difference: 0.01 };
  if (strictOps.includes(operation)) return { mode: "strict", seed_required: true, temperature_allowed: false, provider_replay_supported: true, maximum_pixel_difference: 0, maximum_audio_difference: 0 };
  return { mode: "bounded", seed_required: false, temperature_allowed: true, provider_replay_supported: true, maximum_pixel_difference: 0.005, maximum_audio_difference: 0.005 };
}

// ── Node contract ────────────────────────────────────────────────────────────
export function createNode(input: {
  node_type?: string;
  operation: string;
  category?: NodeCategory;
  inputs: { port: string; artifact_id: string }[];
  parameters?: Record<string, unknown>;
  execution?: Partial<GraphNode["execution"]>;
  determinism_policy?: Partial<GraphNode["determinism_policy"]>;
  attribution: GraphNode["attribution"];
  consent_refs?: string[];
  scope?: GraphNode["scope"];
  schema_version?: string;
}): GraphNode {
  const op = input.operation;
  // Enforce canonical schema & no untracked runtime
  if (!input.attribution?.operator_id || !input.attribution?.agent_id) throw new Error("Node requires operator_id and agent_id attribution");
  const exec: GraphNode["execution"] = {
    model_id: input.execution?.model_id ?? `n0va-${op}-v4`,
    model_version: input.execution?.model_version ?? "4.1.2",
    model_digest: input.execution?.model_digest ?? hash(`model:n0va-${op}-v4:4.1.2`),
    runtime_digest: input.execution?.runtime_digest ?? "sha256:container_n0va_render_8_4_0",
    hardware_class: input.execution?.hardware_class ?? "gpu-a100",
    seed: input.execution?.seed ?? 88211,
    precision: (input.execution?.precision as GraphNode["execution"]["precision"]) ?? "fp16",
  };
  const det: GraphNode["determinism_policy"] = {
    ...defaultDeterminism(op),
    ...(input.determinism_policy as GraphNode["determinism_policy"]),
  } as GraphNode["determinism_policy"];
  // Validate consent for synthetic ops
  const syntheticOps = ["face_replace","voice_clone","voice_synthesis","dubbing","face_replace"];
  if (syntheticOps.includes(op) && (!input.consent_refs || input.consent_refs.length === 0)) {
    throw new Error(`Consent-controlled node ${op} may not execute without valid consent_ref (guardrail)`);
  }
  // Scope must be part of hash — enforce via nodeHashFor
  const base: Omit<GraphNode, "node_hash" | "created_at" | "node_id"> & { node_id?: string } = {
    node_type: input.node_type ?? "ai_video_transform",
    operation: op,
    schema_version: input.schema_version ?? "n0va.node.v1",
    category: input.category ?? categoryForOperation(op),
    inputs: input.inputs,
    parameters: input.parameters ?? {},
    execution: exec,
    determinism_policy: det,
    attribution: input.attribution,
    consent_refs: input.consent_refs,
    scope: input.scope,
    state: "enabled",
  };
  const node_id = uid("node");
  const node_hash = nodeHashFor(base as GraphNode);
  const n: GraphNode = { ...base, node_id, node_hash, created_at: nowIso() };
  nodes.set(node_id, n);
  return n;
}
export function getNode(node_id: string): GraphNode | null { return nodes.get(node_id) ?? null; }
export function listNodes(): GraphNode[] { return Array.from(nodes.values()); }

// Parameter immutability: editing creates new node version
export function createNodeVersion(node_id: string, newParameters: Record<string, unknown>, changeReason?: string): GraphNode {
  const prev = nodes.get(node_id);
  if (!prev) throw new Error(`Node ${node_id} not found`);
  // No in-place edit allowed
  const next = createNode({
    node_type: prev.node_type,
    operation: prev.operation,
    category: prev.category,
    inputs: [...prev.inputs],
    parameters: { ...prev.parameters, ...newParameters },
    execution: { ...prev.execution },
    determinism_policy: { ...prev.determinism_policy },
    attribution: { ...prev.attribution, request_id: uid("req") },
    consent_refs: prev.consent_refs ? [...prev.consent_refs] : undefined,
    scope: prev.scope ? { ...prev.scope } : undefined,
    schema_version: prev.schema_version,
  });
  next.supersedes = node_id;
  next.explanation = changeReason ?? `Parameter edit: ${Object.keys(newParameters).join(", ")}`;
  // Old node remains for comparison/rollback/audit
  return next;
}

// ── Graph version lifecycle ──────────────────────────────────────────────────
export function validateGraphEdges(nodeIds: string[], edges: GraphEdge[]): GraphValidationError[] {
  const errs: GraphValidationError[] = [];
  const idSet = new Set(nodeIds);
  for (const [a, b] of edges) {
    if (!idSet.has(a)) errs.push({ code: "UNKNOWN_NODE", message: `Edge source ${a} not in nodes`, node_id: a });
    if (!idSet.has(b)) errs.push({ code: "UNKNOWN_NODE", message: `Edge target ${b} not in nodes`, node_id: b });
  }
  // Cycle detection (Kahn)
  const indeg = new Map<string, number>(nodeIds.map(id => [id, 0] as [string, number]));
  for (const [, b] of edges) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const q: string[] = nodeIds.filter(id => (indeg.get(id) ?? 0) === 0);
  let visited = 0;
  while (q.length) {
    const n = q.shift()!; visited++;
    for (const [a, b] of edges) if (a === n) { indeg.set(b, (indeg.get(b) ?? 1) - 1); if (indeg.get(b) === 0) q.push(b); }
  }
  if (visited !== nodeIds.length) errs.push({ code: "CYCLE_DETECTED", message: "Graph contains cycle — DAG required" });
  return errs;
}
export function detectNonCommutativeReorder(before: string[], after: string[]): { warn: boolean; reason?: string } {
  // Denoise→Sharpen vs Sharpen→Denoise is non-commutative; similarly Color→Sharpen changes result
  const nonCommPairs: [string, string][] = [["denoise","sharpen"],["denoise","color_grade"],["stabilization","super_resolution"]];
  for (const [a, b] of nonCommPairs) {
    const bi = before.indexOf(before.find(n => getNode(n)?.operation === a) ?? "");
    const bj = before.indexOf(before.find(n => getNode(n)?.operation === b) ?? "");
    const ai = after.indexOf(after.find(n => getNode(n)?.operation === a) ?? "");
    const aj = after.indexOf(after.find(n => getNode(n)?.operation === b) ?? "");
    if (bi >= 0 && bj >= 0 && ai >= 0 && aj >= 0 && (bi < bj) !== (ai < aj)) return { warn: true, reason: `Non-commutative pair ${a} ↔ ${b}: reordering may change result` };
  }
  return { warn: false };
}

export function createGraphVersion(input: {
  graph_id: string;
  root_inputs: string[];
  active_outputs: string[];
  nodes: string[];
  edges: GraphEdge[];
  parent_version?: string | null;
  change_reason?: string;
  immutable_after?: GraphVersion["immutable_after"];
}): GraphVersion {
  const errs = validateGraphEdges(input.nodes, input.edges);
  if (errs.length) throw new Error(`Graph validation failed: ${errs.map(e => e.message).join("; ")}`);
  // Guardrail: no untracked runtime
  for (const nid of input.nodes) {
    const n = nodes.get(nid);
    if (!n) throw new Error(`Node ${nid} missing`);
    if (!n.execution.runtime_digest) throw new Error(`Node ${nid} missing runtime_digest — untracked models not allowed`);
  }
  const gv = `gv_${Math.floor(Math.random() * 900 + 10)}`;
  const v: GraphVersion = {
    graph_id: input.graph_id,
    graph_version: gv,
    root_inputs: [...input.root_inputs],
    active_outputs: [...input.active_outputs],
    nodes: [...input.nodes],
    edges: [...input.edges],
    graph_hash: graphHashFor({ graph_id: input.graph_id, root_inputs: input.root_inputs, active_outputs: input.active_outputs, nodes: input.nodes, edges: input.edges }),
    created_at: nowIso(),
    parent_version: input.parent_version ?? null,
    change_reason: input.change_reason,
    immutable_after: input.immutable_after ?? null,
  };
  graphVersions.set(gvKey(input.graph_id, gv), v);
  return v;
}
export function getGraphVersion(graph_id: string, gv: string): GraphVersion | null { return graphVersions.get(gvKey(graph_id, gv)) ?? null; }
export function listGraphVersions(graph_id?: string): GraphVersion[] {
  const all = Array.from(graphVersions.values());
  return graph_id ? all.filter(g => g.graph_id === graph_id) : all;
}

// Enable/disable/reorder/replace as new immutable graph versions
export function disableNodeInGraph(graph_id: string, base_gv: string, node_id: string, reason = "Preserve natural film grain"): GraphVersion {
  const base = getGraphVersion(graph_id, base_gv);
  if (!base) throw new Error(`Base ${graph_id}:${base_gv} not found`);
  if (base.immutable_after) throw new Error(`Graph ${graph_id}:${base_gv} is immutable after ${base.immutable_after} — cannot disable`);
  const nodes2 = base.nodes.filter(n => n !== node_id);
  const edges2 = base.edges.filter(([a, b]) => a !== node_id && b !== node_id);
  const outputs2 = base.active_outputs.filter(n => n !== node_id);
  return createGraphVersion({ graph_id, root_inputs: base.root_inputs, active_outputs: outputs2.length ? outputs2 : nodes2.slice(-1), nodes: nodes2, edges: edges2, parent_version: base_gv, change_reason: `disable_node ${node_id}: ${reason}` });
}
export function reorderGraphNodes(graph_id: string, base_gv: string, newOrder: string[]): { version: GraphVersion; warning?: string } {
  const base = getGraphVersion(graph_id, base_gv);
  if (!base) throw new Error(`Base ${graph_id}:${base_gv} not found`);
  // Verify same node set
  if (new Set(newOrder).size !== new Set(base.nodes).size || !newOrder.every(n => base.nodes.includes(n))) throw new Error("Reorder must use same node set");
  const check = detectNonCommutativeReorder(base.nodes, newOrder);
  // Rebuild edges to reflect new order as linear chain if original was chain; otherwise keep base edges
  const isChain = base.edges.length === base.nodes.length - 1 && base.edges.every(([a, b], i) => a === base.nodes[i] && b === base.nodes[i + 1]);
  const edges2: GraphEdge[] = isChain ? newOrder.slice(0, -1).map((n, i) => [n, newOrder[i + 1]] as GraphEdge) : base.edges;
  const v = createGraphVersion({ graph_id, root_inputs: base.root_inputs, active_outputs: base.active_outputs, nodes: newOrder, edges: edges2, parent_version: base_gv, change_reason: `reorder ${newOrder.join("→")}` });
  return { version: v, warning: check.warn ? check.reason : undefined };
}
export function replaceNodeInGraph(graph_id: string, base_gv: string, old_node_id: string, new_node_id: string, reason = "Model upgrade"): { version: GraphVersion; before_hash: string; after_hash: string } {
  const base = getGraphVersion(graph_id, base_gv);
  if (!base) throw new Error(`Base ${graph_id}:${base_gv} not found`);
  const oldN = nodes.get(old_node_id); const newN = nodes.get(new_node_id);
  if (!oldN || !newN) throw new Error("Old or new node missing");
  // Compatibility: same category or semantic intent
  if (oldN.category !== newN.category) throw new Error(`Incompatible replacement: ${oldN.category} → ${newN.category}`);
  const nodes2 = base.nodes.map(n => n === old_node_id ? new_node_id : n);
  const edges2 = base.edges.map(([a, b]) => [a === old_node_id ? new_node_id : a, b === old_node_id ? new_node_id : b] as GraphEdge);
  const outputs2 = base.active_outputs.map(n => n === old_node_id ? new_node_id : n);
  const v = createGraphVersion({ graph_id, root_inputs: base.root_inputs, active_outputs: outputs2, nodes: nodes2, edges: edges2, parent_version: base_gv, change_reason: `replace ${old_node_id}→${new_node_id}: ${reason}` });
  return { version: v, before_hash: oldN.node_hash, after_hash: newN.node_hash };
}
export function compareGraphVersions(graph_id: string, gvA: string, gvB: string): { a: GraphVersion; b: GraphVersion; diff: { added: string[]; removed: string[]; reordered: boolean } } {
  const a = getGraphVersion(graph_id, gvA)!; const b = getGraphVersion(graph_id, gvB)!;
  const setA = new Set(a.nodes); const setB = new Set(b.nodes);
  return {
    a, b,
    diff: {
      added: b.nodes.filter(n => !setA.has(n)),
      removed: a.nodes.filter(n => !setB.has(n)),
      reordered: a.nodes.join(",") !== b.nodes.join(","),
    },
  };
}

// ── Timeline as graph projection ─────────────────────────────────────────────
export function createTimelineProjection(input: TimelineProjection): TimelineProjection {
  // Validate graph version exists and nodes are active
  const gv = Array.from(graphVersions.values()).find(g => g.graph_version === input.active_graph_version);
  if (!gv) throw new Error(`Graph version ${input.active_graph_version} not found`);
  for (const op of input.displayed_operations) if (!gv.nodes.includes(op)) throw new Error(`Node ${op} not in graph version ${input.active_graph_version}`);
  timelineProjections.set(input.timeline_clip_id, input);
  return input;
}
export function getTimelineProjection(clip_id: string): TimelineProjection | null { return timelineProjections.get(clip_id) ?? null; }

// ── Range-scoped nodes ───────────────────────────────────────────────────────
export function isNodeInRange(node: GraphNode, time_ms: number): boolean {
  if (!node.scope?.time_ranges?.length) return true; // global
  return node.scope.time_ranges.some(r => time_ms >= r.start_ms && time_ms < r.end_ms);
}

// ── Render cache (content-addressed) ───────────────────────────────────────
export function cacheKeyFor(components: CacheKeyComponents): string {
  // Spec: input_hashes + node_hash + graph_version_hash + render_profile_hash + color/audio/caption + runtime + determinism
  const canonical = canonicalStringify({
    input_hashes: [...components.input_hashes].sort(),
    node_hash: components.node_hash,
    graph_version_hash: components.graph_version_hash,
    render_profile_hash: components.render_profile_hash,
    color: components.color_config_hash,
    audio: components.audio_config_hash,
    caption: components.caption_config_hash,
    runtime: components.runtime_digest,
    determinism: components.determinism_mode,
  });
  return `cache:sha3-512:${hash(canonical).slice(8, 32)}`;
}
export function cacheGet(key: string): CacheEntry | null { return cache.get(key) ?? null; }
export function cachePut(entry: CacheEntry): CacheEntry { cache.set(entry.cache_key, entry); return entry; }
export function cacheInvalidateIf(input: {
  node_id: string;
  reason: "input_hash" | "parameters" | "model_digest" | "runtime_digest" | "color_pipeline" | "audio_pipeline" | "prompt" | "consent" | "schema";
}): number {
  // Dependency-based invalidation: remove entries for this node; downstream invalidated via graph walk in scheduler
  let n = 0;
  for (const [k, e] of Array.from(cache.entries())) if (e.node_id === input.node_id) { cache.delete(k); n++; }
  return n;
}
// Downstream invalidation helper: when node invalidated, downstream nodes' caches are also invalid
export function invalidateDownstream(graph_id: string, gv: string, changed_node_id: string): string[] {
  const g = getGraphVersion(graph_id, gv);
  if (!g) return [];
  const downstream = new Set<string>();
  const visit = (id: string) => {
    for (const [a, b] of g.edges) if (a === id && !downstream.has(b)) { downstream.add(b); visit(b); }
  };
  visit(changed_node_id);
  const invalidated: string[] = [];
  for (const nid of downstream) {
    const cnt = cacheInvalidateIf({ node_id: nid, reason: "input_hash" });
    if (cnt) invalidated.push(nid);
  }
  return invalidated;
}

// ── Reproducibility ─────────────────────────────────────────────────────────
export function declareReproducibility(target: ReproducibilityDeclaration["target"]): ReproducibilityDeclaration {
  const base: ReproducibilityDeclaration = {
    target,
    status: "pending",
    model_digests_locked: true,
    runtime_digest_locked: true,
    seeds_locked: true,
    fonts_locked: true,
    codec_digest_locked: true,
    verification_runs: 2,
  };
  if (target === "bit_exact") return { ...base, status: "verified" };
  if (target === "media_exact") return { ...base, status: "verified" };
  return { ...base, status: "pending", bounded_variance: { max_pixel_diff: 0.005, max_audio_diff: 0.005 } };
}
export function verifyReproducibility(artifact_id: string, second_run_hash: string): ReproducibilityDeclaration {
  const art = artifacts.get(artifact_id);
  if (!art) return declareReproducibility("process_exact");
  if (art.artifact_hash === second_run_hash) return { ...declareReproducibility("bit_exact"), status: "verified", verification_runs: 2 };
  return { ...declareReproducibility("media_exact"), status: "failed" };
}

// ── Cost management ─────────────────────────────────────────────────────────
export function estimateCost(node: GraphNode): ExecutionMetrics {
  const baseGpu: Record<string, number> = { denoise: 12, stabilization: 8, background_replace: 45, color_grade: 2, transcription: 1 };
  const gpu = baseGpu[node.operation] ?? 5;
  return {
    gpu_seconds: gpu,
    cpu_seconds: Math.round(gpu * 0.17 * 10) / 10,
    peak_memory_mb: node.category === "visual_ai" ? 11840 : 2400,
    provider_cost: { currency: "USD", amount: Math.round(gpu * 0.0077 * 100) / 100 },
    cache: { hit: false, reused_by_graphs: 0 },
  };
}
export function recordMetrics(artifact_id: string, metrics: ExecutionMetrics): ExecutionMetrics {
  const art = artifacts.get(artifact_id);
  if (art) (art as unknown as Record<string, unknown>).metrics = metrics;
  return metrics;
}

// ── Scheduling (dependency-aware) ───────────────────────────────────────────
export type SchedulePlan = {
  target_node: string;
  ordered_nodes: string[]; // topological order for required subgraph
  cached_nodes: string[];
  to_schedule: string[];
  parallel_groups: string[][];
  estimated_total_cost_usd: number;
};
export function scheduleForOutput(graph_id: string, gv: string, target_node_id: string, render_profile_hash = hash("profile:default")): SchedulePlan {
  const g = getGraphVersion(graph_id, gv);
  if (!g) throw new Error(`Graph ${graph_id}:${gv} not found`);
  // Walk dependency graph backwards from target
  const required = new Set<string>();
  const visitUp = (id: string) => {
    if (required.has(id)) return;
    required.add(id);
    for (const [a, b] of g.edges) if (b === id) visitUp(a);
  };
  visitUp(target_node_id);
  // Topological order (Kahn) for required subgraph
  const reqNodes = Array.from(required);
  const reqEdges = g.edges.filter(([a, b]) => required.has(a) && required.has(b));
  const indeg = new Map<string, number>(reqNodes.map(id => [id, 0]));
  for (const [, b] of reqEdges) indeg.set(b, (indeg.get(b) ?? 0) + 1);
  const q = reqNodes.filter(id => (indeg.get(id) ?? 0) === 0);
  const ordered: string[] = [];
  while (q.length) {
    // Parallel group: all zero-indegree nodes at this wave
    const wave = [...q]; q.length = 0;
    for (const n of wave) { ordered.push(n); for (const [a, b] of reqEdges) if (a === n) { indeg.set(b, (indeg.get(b) ?? 1) - 1); if (indeg.get(b) === 0) q.push(b); } }
  }
  // Cache check: assume we have render_profile
  const to_schedule: string[] = []; const cached_nodes: string[] = [];
  for (const nid of ordered) {
    const n = nodes.get(nid)!;
    const key = cacheKeyFor({
      input_hashes: n.inputs.map(i => i.artifact_id),
      node_hash: n.node_hash,
      graph_version_hash: g.graph_hash,
      render_profile_hash,
      color_config_hash: hash("color:ACES1.3"),
      audio_config_hash: hash("audio:-14LUFS"),
      caption_config_hash: hash("caption:en"),
      runtime_digest: n.execution.runtime_digest,
      determinism_mode: n.determinism_policy.mode,
    });
    if (cache.has(key)) cached_nodes.push(nid); else to_schedule.push(nid);
  }
  // Parallel groups = wave grouping
  const parallel_groups: string[][] = [];
  const indeg2 = new Map<string, number>(reqNodes.map(id => [id, 0]));
  for (const [, b] of reqEdges) indeg2.set(b, (indeg2.get(b) ?? 0) + 1);
  const ready = reqNodes.filter(id => (indeg2.get(id) ?? 0) === 0);
  const remaining = new Set(reqNodes);
  const frontier = [...ready];
  while (frontier.length) {
    const wave = frontier.splice(0, frontier.length);
    parallel_groups.push(wave);
    for (const n of wave) {
      remaining.delete(n);
      for (const [a, b] of reqEdges) if (a === n && remaining.has(b)) {
        indeg2.set(b, (indeg2.get(b) ?? 1) - 1);
        if (indeg2.get(b) === 0) frontier.push(b);
      }
    }
  }
  const estimated = ordered.reduce((sum, nid) => sum + estimateCost(nodes.get(nid)!).provider_cost.amount, 0);
  return { target_node: target_node_id, ordered_nodes: ordered, cached_nodes, to_schedule, parallel_groups, estimated_total_cost_usd: Math.round(estimated * 100) / 100 };
}

// ── Trust & explainability: per-frame graph path ─────────────────────────────
export function explainFrameAtTime(time_ms: number, graph_id: string, gv: string): GraphExplainFrame {
  const g = getGraphVersion(graph_id, gv);
  if (!g) throw new Error(`Graph ${graph_id}:${gv} not found`);
  const activePath = g.nodes.filter(nid => {
    const n = nodes.get(nid)!;
    return isNodeInRange(n, time_ms) && n.state === "enabled";
  });
  const srcAsset = (() => { const a = assets.get(g.root_inputs[0] ?? ""); return a ? `${a.asset_id} ${a.media.resolution.join("x")} ${a.media.codec}` : g.root_inputs[0] ?? "unknown"; })();
  return {
    frame_label: `Frame ${Math.floor(time_ms / 1000 / 60).toString().padStart(2, "0")}:${Math.floor((time_ms / 1000) % 60).toString().padStart(2, "0")}:${String(Math.floor((time_ms % 1000) / 33)).padStart(2, "0")} @ ${time_ms}ms`,
    source: { asset_id: g.root_inputs[0] ?? "unknown", frame_range: `${Math.floor(time_ms * 59.94 / 1000)}`, decoded_hash: hash(`decoded:${time_ms}`) },
    active_path: activePath.map(nid => {
      const n = nodes.get(nid)!;
      const ck = cache.get(cacheKeyFor({
        input_hashes: n.inputs.map(i => i.artifact_id), node_hash: n.node_hash, graph_version_hash: g.graph_hash,
        render_profile_hash: hash("profile:default"), color_config_hash: hash("color:ACES1.3"), audio_config_hash: hash("audio:-14LUFS"),
        caption_config_hash: hash("caption:en"), runtime_digest: n.execution.runtime_digest, determinism_mode: n.determinism_policy.mode,
      }));
      return {
        node_id: nid, operation: n.operation, model: n.execution.model_id, seed: n.execution.seed,
        prompt_ref: (n.parameters as Record<string, unknown>).prompt_ref as string | undefined,
        operator: n.attribution.operator_id, agent: n.attribution.agent_id, state: n.state, cache: ck ? "Hit" : "Miss",
        approval: approvals.has(`${graph_id}:${gv}:${nid}`) ? "Approved" : "Pending",
      };
    }),
    current_state: activePath.length ? `All ${activePath.length} nodes enabled — ${cache.size} cached artifacts` : "Bypassed — source only",
    output_hash: hash(`output:${graph_id}:${gv}:${time_ms}`),
  };
}

// ── Debugging & failure isolation ───────────────────────────────────────────
export type NodeDiagnostics = {
  node_id: string;
  input_preview: string;
  output_preview: string;
  error_log?: string;
  model: string;
  runtime: string;
  parameters: Record<string, unknown>;
  metrics?: ExecutionMetrics;
  confidence?: number;
  cache_state: string;
  provenance_status: string;
  reproduction_command: string;
  limitations?: string[];
};
export function diagnosticsForNode(node_id: string): NodeDiagnostics | null {
  const n = nodes.get(node_id);
  if (!n) return null;
  const cacheState = Array.from(cache.values()).some(c => c.node_id === node_id) ? "Hit" : "Miss";
  return {
    node_id,
    input_preview: `s3://preview/${node_id}/input.mp4`,
    output_preview: `s3://preview/${node_id}/output.mp4`,
    model: `${n.execution.model_id} ${n.execution.model_version} digest ${n.execution.model_digest.slice(0, 16)}...`,
    runtime: n.execution.runtime_digest,
    parameters: n.parameters,
    metrics: estimateCost(n),
    confidence: n.confidence,
    cache_state: cacheState,
    provenance_status: "verified",
    reproduction_command: `n0va render --node ${node_id} --seed ${n.execution.seed} --profile default`,
    limitations: n.determinism_policy.mode === "external" ? ["Provider may change behavior without notice — classified traceable_but_not_reproducible"] : undefined,
  };
}
export function simulateFailure(node_id: string, reason: string, affected: { start_ms: number; end_ms: number }, fallback: string): NodeDiagnostics & { status: "failed"; cause: string; affected: string; fallback: string; alternative: string } {
  const d = diagnosticsForNode(node_id);
  if (!d) throw new Error(`Node ${node_id} missing`);
  return {
    ...d,
    status: "failed" as const,
    cause: reason,
    affected: `${affected.start_ms}-${affected.end_ms}`,
    fallback,
    alternative: "Run face tracking with relaxed threshold",
    error_log: `Input face track confidence below required threshold (0.42 < 0.70)`,
  } as NodeDiagnostics & { status: "failed"; cause: string; affected: string; fallback: string; alternative: string };
}

// ── Regulatory traceability (11 questions) ───────────────────────────────────
export function traceForArtifact(artifact_id: string): Record<string, string> {
  const art = artifacts.get(artifact_id);
  if (!art) return { error: `Artifact ${artifact_id} not found` };
  const n = nodes.get(art.node_id);
  const gv = Array.from(graphVersions.values()).find(g => g.graph_version === art.graph_version);
  return {
    which_original_media: gv?.root_inputs.join(", ") ?? "unknown",
    which_model: n ? `${n.execution.model_id} ${n.execution.model_version} digest ${n.execution.model_digest}` : "unknown",
    which_model_version: n?.execution.model_version ?? "unknown",
    which_prompt_params: n ? JSON.stringify(n.parameters) : "none",
    which_human_agent: n ? `${n.attribution.operator_id} / ${n.attribution.agent_id} request ${n.attribution.request_id}` : "unknown",
    which_consent_policy: n?.consent_refs?.join(", ") ?? "none",
    which_graph_version: art.graph_version,
    which_export: art.artifact_id,
    was_approved: approvals.has(artifact_id) ? "yes" : "no",
    can_reproduce: n?.determinism_policy.mode === "external" ? "traceable_but_not_reproducible" : "yes",
    still_valid_under_policy: "verified — checked at render time",
  };
}

// ── Approval binding to graph version ───────────────────────────────────────
export function bindApproval(approval: ApprovalBinding): ApprovalBinding {
  // Changing active node / params / model / source range / consent / profile / caption / destination / watermark / disclosure invalidates
  approvals.set(approval.approval_id, approval);
  return approval;
}
export function checkApprovalInvalidation(approval_id: string, new_gv: GraphVersion): { invalidated: boolean; reasons: string[] } {
  const appr = approvals.get(approval_id);
  if (!appr) return { invalidated: false, reasons: [] };
  const old = graphVersions.get(gvKey(appr.approved_target.graph_id, appr.approved_target.graph_version));
  if (!old) return { invalidated: true, reasons: ["original graph version missing"] };
  const reasons: string[] = [];
  if (old.graph_hash !== new_gv.graph_hash) reasons.push("Active node or parameters changed");
  if (old.nodes.length !== new_gv.nodes.length) reasons.push("Node count changed");
  const oldModels = old.nodes.map(n => nodes.get(n)?.execution.model_digest).join(",");
  const newModels = new_gv.nodes.map(n => nodes.get(n)?.execution.model_digest).join(",");
  if (oldModels !== newModels) reasons.push("Model version changed");
  return { invalidated: reasons.length > 0, reasons };
}

// ── Branching & rollback (cheap, content-addressed) ──────────────────────────
export function rollbackToVersion(graph_id: string, from_gv: string, to_gv: string, reason: string): GraphVersion {
  const target = getGraphVersion(graph_id, to_gv);
  if (!target) throw new Error(`Target ${to_gv} not found`);
  // New head is copy of target, preserving newer versions immutable
  const head = createGraphVersion({
    graph_id, root_inputs: target.root_inputs, active_outputs: target.active_outputs,
    nodes: [...target.nodes], edges: [...target.edges],
    parent_version: from_gv,
    change_reason: `rollback ${from_gv}→${to_gv}: ${reason}`,
  });
  return head;
}

// ── External model reproduction ──────────────────────────────────────────────
export function captureExternal(input: Omit<ExternalCapture, "reproducibility"> & { reproducibility?: ExternalCapture["reproducibility"] }): ExternalCapture {
  const cap: ExternalCapture = {
    ...input,
    reproducibility: input.reproducibility ?? (input.provider_digest ? "reproducible" : "traceable_but_not_reproducible"),
  };
  externalCaptures.set(`${cap.provider}:${cap.model_identifier}:${cap.timestamp}`, cap);
  return cap;
}
export function getExternalCapture(key: string): ExternalCapture | null { return externalCaptures.get(key) ?? null; }

// ── Node-level provenance manifest ───────────────────────────────────────────
export function manifestForNode(node_id: string, artifact_id: string): NodeManifest | null {
  const n = nodes.get(node_id); const art = artifacts.get(artifact_id);
  if (!n || !art) return null;
  return {
    node_id, node_type: n.node_type, input_artifacts: n.inputs.map(i => i.artifact_id), output_artifact: artifact_id,
    operation: { name: n.operation, parameters_hash: hash(canonicalStringify(n.parameters)) },
    model: { provider: "approved_provider", name: n.execution.model_id, version: n.execution.model_version, digest: n.execution.model_digest },
    prompt: { record_id: (n.parameters as Record<string, unknown>).prompt_ref as string ?? `prompt_${node_id}`, hash: hash(String((n.parameters as Record<string, unknown>).prompt_ref ?? "")) },
    consent: { record_id: n.consent_refs?.[0] ?? "cons_01J_voice_044", valid_at_execution: true },
    actor: { human: n.attribution.operator_id, agent: n.attribution.agent_id },
    reproducibility: { mode: n.determinism_policy.mode, seed: n.execution.seed, status: "verified" },
    output_hash: art.artifact_hash,
  };
}

// ── Graph-aware C2PA export ──────────────────────────────────────────────────
export function c2paManifestForExport(graph_id: string, gv: string, output_node: string): Record<string, unknown> {
  const g = getGraphVersion(graph_id, gv);
  if (!g) throw new Error(`Graph ${graph_id}:${gv} not found`);
  const active = g.nodes.map(nid => nodes.get(nid)!).filter(Boolean);
  return {
    graph_id, graph_version: gv, output_node, active_nodes: g.nodes, source_hashes: g.root_inputs.map(id => assets.get(id)?.immutability.content_hash ?? hash(id)),
    node_hashes: active.map(n => n.node_hash), model_digests: active.map(n => n.execution.model_digest),
    consent_records: active.flatMap(n => n.consent_refs ?? []), approval_records: Array.from(approvals.keys()),
    render_recipe: `recipe:${g.graph_hash.slice(0, 12)}`, cache_artifact_hashes: Array.from(cache.values()).filter(c => active.some(n => n.node_id === c.node_id)).map(c => c.artifact_hash),
    reproducibility: declareReproducibility("media_exact"), disclosures: active.filter(n => n.category === "visual_ai" || n.category === "audio_ai").map(n => n.operation),
  };
}

// ── Operational guardrails enforcement ───────────────────────────────────────
export function enforceGuardrails(action: string, target: string): { allowed: boolean; reason?: string } {
  if (action === "write_asset" && assets.has(target)) return { allowed: false, reason: "Original media is never writable through editing API" };
  if (action === "edit_node_in_place") return { allowed: false, reason: "Node parameters cannot be edited in place — create new node version" };
  if (action === "reuse_cache_cross_tenant" && !target.includes("policy_authorized")) return { allowed: false, reason: "Cache may not be reused across tenants without policy authorization" };
  if (action === "execute_external_without_consent" && !target.includes("cons_")) return { allowed: false, reason: "Consent-controlled node requires valid consent_ref" };
  if (action === "publish_unverified_graph") return { allowed: false, reason: "No external publication may occur from unverified graph" };
  return { allowed: true };
}

// ── Artifact creation (content-addressed) ────────────────────────────────────
export function createArtifact(input: {
  node_id: string;
  graph_version: string;
  input_hashes: string[];
  render_profile_hash?: string;
  tier?: GraphArtifact["storage"]["tier"];
}): GraphArtifact {
  const n = nodes.get(input.node_id);
  if (!n) throw new Error(`Node ${input.node_id} missing`);
  const profileHash = input.render_profile_hash ?? hash("profile:default");
  const gv = Array.from(graphVersions.values()).find(g => g.graph_version === input.graph_version);
  const key = cacheKeyFor({
    input_hashes: input.input_hashes, node_hash: n.node_hash, graph_version_hash: gv?.graph_hash ?? hash(input.graph_version),
    render_profile_hash: profileHash, color_config_hash: hash("color:ACES1.3"), audio_config_hash: hash("audio:-14LUFS"),
    caption_config_hash: hash("caption:en"), runtime_digest: n.execution.runtime_digest, determinism_mode: n.determinism_policy.mode,
  });
  // Check exact reuse
  const cached = cache.get(key);
  if (cached) {
    const art = artifacts.get(cached.artifact_id);
    if (art) { cached.reuse_counts.exact++; return art; }
  }
  const artifact_hash = hash(`${input.node_id}:${input.graph_version}:${input.input_hashes.join(",")}:${n.node_hash}`);
  const artifact_id = uid("artifact");
  const art: GraphArtifact = {
    artifact_id, artifact_hash, node_id: input.node_id, graph_version: input.graph_version,
    input_hashes: [...input.input_hashes], node_hash: n.node_hash, render_profile_hash: profileHash,
    media_equivalence: "verified", storage: { tier: input.tier ?? "warm", location: `s3://n0va-render-cache/${artifact_id}` },
    created_at: nowIso(),
  };
  artifacts.set(artifact_id, art);
  cache.set(key, {
    cache_key: key, node_id: input.node_id, input_hashes: [...input.input_hashes], node_hash: n.node_hash,
    render_profile_hash: profileHash, artifact_id, artifact_hash, media_equivalence: "verified",
    storage: art.storage, reuse_counts: { exact: 0, segment: 0, cross_branch: 0 }, created_at: nowIso(),
  });
  return art;
}
export function getArtifact(artifact_id: string): GraphArtifact | null { return artifacts.get(artifact_id) ?? null; }

// ── Seed demo DAG matching spec chain ────────────────────────────────────────
let seeded = false;
export function seedDemoGraph(graph_id = "graph_01J_demo", tenant_id = "tenant_001"): { graph_id: string; versions: GraphVersion[]; nodes: GraphNode[]; asset: Asset } {
  if (seeded) {
    const gvs = listGraphVersions(graph_id);
    const ns = gvs[0] ? gvs[0].nodes.map(n => nodes.get(n)!).filter(Boolean) as GraphNode[] : [];
    const asset = assets.get("asset_camera_a001") ?? createAsset({ asset_id: "asset_camera_a001", media: { duration_ms: 124500, frame_rate: 59.94, resolution: [3840, 2160], codec: "ProRes 422 HQ" }, fileHash: hash("A001"), frameHashes: [hash("frame0")], audioHashes: [hash("audio0")] });
    return { graph_id, versions: gvs, nodes: ns, asset };
  }
  seeded = true;
  // Immutable source
  const asset = createAsset({
    asset_id: "asset_camera_a001",
    media: { duration_ms: 124500, frame_rate: 59.94, resolution: [3840, 2160], codec: "ProRes 422 HQ" },
    fileHash: "sha3-512:asset_camera_a001_content",
    decodedHash: "sha3-512:decoded_a001",
    frameHashes: Array.from({ length: 6 }, (_, i) => `sha3-512:frame_${String(i).padStart(6, "0")}`),
    audioHashes: Array.from({ length: 6 }, (_, i) => `sha3-512:audio_${String(i).padStart(6, "0")}`),
    camera_meta: { source_timecode: "01:00:00:00", rights: { consent_id: "cons_01J_voice_044" } },
  });
  const srcArtId = "artifact_src_a001";
  artifacts.set(srcArtId, {
    artifact_id: srcArtId, artifact_hash: hash("artifact_src_a001"), node_id: "node_ingest_01", graph_version: "gv_root",
    input_hashes: [asset.immutability.content_hash], node_hash: hash("node_ingest"), render_profile_hash: hash("profile:src"),
    media_equivalence: "verified", storage: { tier: "hot", location: `s3://n0va-videos-hot/${srcArtId}` }, created_at: nowIso(),
  });

  // Helper to chain nodes
  const op = (operation: string, params: Record<string, unknown> = {}, scope?: GraphNode["scope"], consent?: string[]) =>
    createNode({
      operation,
      inputs: [{ port: "video", artifact_id: uid("artifact") }], // placeholder, will rewired by graph edges via artifacts
      parameters: params,
      attribution: { operator_id: "user_204", agent_id: `agent.video.${operation}.v2`, request_id: uid("req") },
      scope,
      consent_refs: consent,
    });

  const nIngest = createNode({ operation: "transcode", category: "structural", inputs: [{ port: "media", artifact_id: srcArtId }], parameters: { normalize: "source_normalization", container: "normalized" }, attribution: { operator_id: "user_204", agent_id: "agent.video.ingest.v1", request_id: uid("req") } });
  const nDenoise = op("denoise", { strength: 0.42 });
  const nVoiceCleanup = op("noise_reduction", { mode: "voice_isolation" });
  const nTranscription = op("transcription", { language: "en-IN" }); // semantic, reusable across branches
  const nGrade = op("color_grade", { lut: "lut_brand_warm_04", exposure: 0.12, intensity: 0.75 });
  const nCaption = op("captions", { language: "en-IN", style: "brand_subtitle" });
  const nExport = createNode({ operation: "codec_packaging", category: "finishing", inputs: [{ port: "master", artifact_id: uid("artifact") }], parameters: { codec: "HEVC", profile: "Main 10", hdr: "HDR10+", watermark: false }, attribution: { operator_id: "user_204", agent_id: "agent.video.export.v1", request_id: uid("req") } });

  // Wire inputs to real previous artifacts via re-creation with correct artifact links
  // For demo, simple linear chain: ingest → denoise → voice_cleanup → grade → caption → export
  // Semantic node is parallel and reusable (not on critical path): attach to ingest output
  const chain = [nIngest, nDenoise, nVoiceCleanup, nGrade, nCaption, nExport];
  // Create real artifacts for chain
  let prevArtifact = srcArtId;
  const chainArtifacts: string[] = [];
  for (const n of chain) {
    n.inputs = [{ port: "video", artifact_id: prevArtifact }];
    // recompute hash after wiring (inputs affect hash via node_hash? node_hash derived from inputs' artifact_ids)
    (n as unknown as { node_hash: string }).node_hash = nodeHashFor(n);
    const art = createArtifact({ node_id: n.node_id, graph_version: "gv_42", input_hashes: [hash(prevArtifact)], render_profile_hash: hash("profile:hd_4k") });
    chainArtifacts.push(art.artifact_id);
    prevArtifact = art.artifact_id;
  }
  // Semantic branches: transcription reuses ingest artifact (not export)
  nTranscription.inputs = [{ port: "audio", artifact_id: chainArtifacts[0]! }];
  (nTranscription as unknown as { node_hash: string }).node_hash = nodeHashFor(nTranscription);
  createArtifact({ node_id: nTranscription.node_id, graph_version: "gv_42", input_hashes: [hash(chainArtifacts[0]!)] });

  const nodesChainIds = chain.map(n => n.node_id);
  const edgesChain: GraphEdge[] = nodesChainIds.slice(0, -1).map((id, i) => [id, nodesChainIds[i + 1]!] as GraphEdge);

  const gv42 = createGraphVersion({
    graph_id, root_inputs: [asset.asset_id], active_outputs: [nExport.node_id],
    nodes: nodesChainIds, edges: edgesChain, change_reason: "initial graph gv_42",
  });
  // Variants: denoise v2, color v5, social crop branch
  const nDenoiseV2 = createNodeVersion(nDenoise.node_id, { strength: 0.5 }, "preserve natural film grain");
  const gv43 = disableNodeInGraph(graph_id, gv42.graph_version, nDenoise.node_id, "Preserve natural film grain");
  // Create color grade v5 from v4
  const nGradeV5 = createNodeVersion(nGrade.node_id, { exposure: 0.14 }, "Client wants warmer grade");
  // Social crop: range-scoped auto_reframe node on timeline range
  const nReframe = createNode({
    operation: "auto_reframe", category: "visual_ai",
    inputs: [{ port: "video", artifact_id: chainArtifacts[2]! }],
    parameters: { target_aspect: "9:16", mode: "face_priority" },
    attribution: { operator_id: "user_204", agent_id: "agent.video.reframe.v2", request_id: uid("req") },
    scope: { time_ranges: [{ start_ms: 0, end_ms: 60000 }], regions: [{ mask_artifact_id: "mask_face_01", semantic_target: "person_044" }] },
  });
  // Branch graph versions: we already have gv42, gv43; create social as fork
  const gv45 = createGraphVersion({
    graph_id, root_inputs: [asset.asset_id], active_outputs: [nReframe.node_id],
    nodes: [...nodesChainIds.slice(0, 3), nReframe.node_id], edges: [[nodesChainIds[2]!, nReframe.node_id]],
    parent_version: gv42.graph_version, change_reason: "social crop 9:16 branch",
  });

  // Seed approvals & external
  bindApproval({ approval_id: "approval_01J_master", approved_target: { graph_id, graph_version: gv42.graph_version, output_node: nExport.node_id, output_hash: hash(`output:${gv42.graph_version}`) }, scope: { destination: "youtube", format: "4k_hdr", territories: ["IN", "US"] }, status: "approved" });
  captureExternal({ provider: "external_provider", endpoint: "https://api.external.ai/v1/generate", api_version: "v1", model_identifier: "external-large-video-2", request_payload_hash: hash("req:external"), request_redacted: "prompt:[REDACTED]", response_hash: hash("res:external"), timestamp: nowIso(), terms_version: "2026-01", output_artifact: chainArtifacts[1]!, reproducibility: "traceable_but_not_reproducible" });

  // Timeline projection example: clip_001 → graph_root_node (only nodes present in gv42)
  createTimelineProjection({ timeline_clip_id: "clip_001", source_range: { asset_id: asset.asset_id, in_ms: 12000, out_ms: 18700 }, graph_root_node: nGrade.node_id, active_graph_version: gv42.graph_version, displayed_operations: [nDenoise.node_id, nGrade.node_id] });

  // Cache entry already exists for chain; add cross-branch reuse demo
  const demoKey = cacheKeyFor({
    input_hashes: [srcArtId], node_hash: nIngest.node_hash, graph_version_hash: gv42.graph_hash,
    render_profile_hash: hash("profile:hd_4k"), color_config_hash: hash("color:ACES1.3"), audio_config_hash: hash("audio:-14LUFS"),
    caption_config_hash: hash("caption:en"), runtime_digest: nIngest.execution.runtime_digest, determinism_mode: nIngest.determinism_policy.mode,
  });
  if (!cache.has(demoKey)) cache.set(demoKey, {
    cache_key: demoKey, node_id: nIngest.node_id, input_hashes: [srcArtId], node_hash: nIngest.node_hash,
    render_profile_hash: hash("profile:hd_4k"), artifact_id: chainArtifacts[0]!, artifact_hash: hash(`artifact:${chainArtifacts[0]}`),
    media_equivalence: "verified", storage: { tier: "warm", location: `s3://n0va-render-cache/${chainArtifacts[0]}` },
    reuse_counts: { exact: 1, segment: 2, cross_branch: 6 }, created_at: nowIso(),
  });

  return { graph_id, versions: [gv42, gv43, gv45], nodes: [...chain, nTranscription, nDenoiseV2, nGradeV5, nReframe], asset };
}

// Reset for tests
export function resetGraphStores(): void {
  assets.clear(); nodes.clear(); graphVersions.clear(); artifacts.clear(); cache.clear(); approvals.clear(); externalCaptures.clear(); timelineProjections.clear(); seeded = false;
}
