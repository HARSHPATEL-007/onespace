/**
 * Provenance & Explainability — decomposable answer graph (Spec §16)
 * Every answer → user facts, retrieved facts, calculations, inferences, assumptions, uncertainty, actions, excluded, policy.
 */

export interface ProvenanceNode {
  id: string;
  type: "user_fact" | "source_fact" | "calculation" | "inference" | "assumption" | "uncertainty" | "action" | "excluded" | "policy_decision";
  label: string;
  source_ref?: string;
  confidence?: number;
  detail?: Record<string, unknown>;
}

export interface ProvenanceEdge {
  from: string; // parent claim id
  to: string; // child node id
  relation: "derived_from" | "supported_by" | "contradicts" | "supersedes" | "governed_by";
}

export interface AnswerProvenanceGraph {
  answer_id: string;
  claim: string;
  nodes: ProvenanceNode[];
  edges: ProvenanceEdge[];
  excluded: Array<{ id: string; reason: string }>;
  signature?: string;
}

export class ProvenanceGraphBuilder {
  build(params: {
    answer_id: string;
    claim: string;
    userFacts: Array<{ text: string; source?: string }>;
    sourceFacts: Array<{ text: string; source_ref: string; confidence: number }>;
    calculations?: Array<{ expr: string; result: string }>;
    inferences?: Array<{ text: string; confidence: number }>;
    assumptions?: string[];
    uncertainty?: string;
    actions?: Array<{ tool: string; status: string }>;
    excluded?: Array<{ id: string; reason: string }>;
    policyDecisions?: Array<{ object_id: string; decision: string; policy: string }>;
  }): AnswerProvenanceGraph {
    const nodes: ProvenanceNode[] = [];
    const edges: ProvenanceEdge[] = [];
    const rootId = `claim_${params.answer_id}`;

    nodes.push({ id: rootId, type: "inference", label: params.claim });

    for (const [i, f] of params.userFacts.entries()) {
      const id = `user_${i}_${Date.now().toString(36)}`;
      nodes.push({ id, type: "user_fact", label: f.text, source_ref: f.source });
      edges.push({ from: rootId, to: id, relation: "derived_from" });
    }

    for (const [i, s] of params.sourceFacts.entries()) {
      const id = `src_${i}_${Date.now().toString(36)}`;
      nodes.push({ id, type: "source_fact", label: s.text, source_ref: s.source_ref, confidence: s.confidence });
      edges.push({ from: rootId, to: id, relation: "supported_by" });
    }

    for (const [i, c] of (params.calculations ?? []).entries()) {
      const id = `calc_${i}`;
      nodes.push({ id, type: "calculation", label: `${c.expr} = ${c.result}` });
      edges.push({ from: rootId, to: id, relation: "derived_from" });
    }

    for (const a of params.assumptions ?? []) {
      const id = `assump_${Math.random().toString(36).slice(2, 6)}`;
      nodes.push({ id, type: "assumption", label: a });
      edges.push({ from: rootId, to: id, relation: "supported_by" });
    }

    if (params.uncertainty) {
      const id = `uncert_${Date.now().toString(36)}`;
      nodes.push({ id, type: "uncertainty", label: params.uncertainty });
      edges.push({ from: rootId, to: id, relation: "supported_by" });
    }

    for (const act of params.actions ?? []) {
      const id = `act_${Math.random().toString(36).slice(2, 6)}`;
      nodes.push({ id, type: "action", label: `${act.tool}: ${act.status}` });
      edges.push({ from: rootId, to: id, relation: "derived_from" });
    }

    for (const pd of params.policyDecisions ?? []) {
      const id = `pol_${Math.random().toString(36).slice(2, 6)}`;
      nodes.push({ id, type: "policy_decision", label: `${pd.object_id} → ${pd.decision} (${pd.policy})` });
      edges.push({ from: rootId, to: id, relation: "governed_by" });
    }

    return {
      answer_id: params.answer_id,
      claim: params.claim,
      nodes,
      edges,
      excluded: params.excluded ?? [],
    };
  }

  /** For drafts: allow removal of individual claims before sending (Spec §16) */
  prune(graph: AnswerProvenanceGraph, nodeIdsToRemove: string[]): AnswerProvenanceGraph {
    const removeSet = new Set(nodeIdsToRemove);
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => !removeSet.has(n.id)),
      edges: graph.edges.filter((e) => !removeSet.has(e.to) && !removeSet.has(e.from)),
    };
  }

  toDisplay(graph: AnswerProvenanceGraph): string {
    const lines = [`Claim: ${graph.claim}`];
    for (const n of graph.nodes) {
      if (n.id.startsWith("claim_")) continue;
      lines.push(`  ${n.type}: ${n.label}${n.source_ref ? ` [${n.source_ref}]` : ""}${n.confidence ? ` (${n.confidence})` : ""}`);
    }
    if (graph.excluded.length > 0) {
      lines.push(`Excluded: ${graph.excluded.map((e) => `${e.id} (${e.reason})`).join(", ")}`);
    }
    return lines.join("\n");
  }
}

export function createProvenanceBuilder(): ProvenanceGraphBuilder {
  return new ProvenanceGraphBuilder();
}
