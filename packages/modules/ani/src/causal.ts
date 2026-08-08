export type CausalLevel =
  "L1_association" | "L2_intervention" | "L3_counterfactual";

export interface CausalNode {
  id: string;
  name: string;
  value: number;
  confidence: number;
}

export interface CausalEdge {
  source: string;
  target: string;
  strength: number;
  mechanism: string;
}

export interface CounterfactualResult {
  intervention: string;
  baselineOutcome: string;
  counterfactualOutcome: string;
  causalEffect: number;
  confidence: number;
}

export class CausalReasoningEngine {
  private nodes: CausalNode[] = [];
  private edges: CausalEdge[] = [];

  addCausalLink(
    source: string,
    target: string,
    strength: number,
    mechanism: string,
  ): void {
    this.edges.push({ source, target, strength, mechanism });
    if (!this.nodes.find((n) => n.name === source))
      this.nodes.push({
        id: "node_" + source,
        name: source,
        value: 0,
        confidence: 0.9,
      });
    if (!this.nodes.find((n) => n.name === target))
      this.nodes.push({
        id: "node_" + target,
        name: target,
        value: 0,
        confidence: 0.9,
      });
  }

  predictIntervention(
    intervention: string,
    target: string,
  ): CounterfactualResult {
    const path = this._findPath(intervention, target);
    const effect = path.reduce((acc, edge) => acc * edge.strength, 1);
    return {
      intervention,
      baselineOutcome: "Baseline state of " + target,
      counterfactualOutcome:
        "After " +
        intervention +
        ", " +
        target +
        " changes by " +
        (effect * 100).toFixed(1) +
        "%",
      causalEffect: effect,
      confidence: path.length > 0 ? 0.9 / path.length : 0.5,
    };
  }

  private _findPath(source: string, target: string): CausalEdge[] {
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: CausalEdge[] }> = [
      { node: source, path: [] },
    ];
    visited.add(source);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.node === target) return current.path;
      for (const edge of this.edges) {
        if (edge.source === current.node && !visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push({ node: edge.target, path: [...current.path, edge] });
        }
      }
    }
    return [];
  }
}
