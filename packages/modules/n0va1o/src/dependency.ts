/**
 * N0VA1O Integration Dependency Mapping — integration layer (spec §3.4).
 *
 * Composite workflows identify upstream and downstream tool dependencies before
 * execution. The gateway verifies prerequisites, sequences dependent actions
 * correctly, and reports blocked steps when a prerequisite connector is
 * unavailable.
 */

export interface ToolDependency {
  /** Tool that must complete before the dependent tool runs. */
  upstream: string;
  /** Tool that depends on the upstream. */
  downstream: string;
  /** Whether the dependency is hard (blocking) or soft (advisory). */
  required?: boolean;
}

export interface DependencyNode {
  tool: string;
  provider: string;
  /** Tools this node depends on (must run first). */
  dependsOn: string[];
  /** Tools that depend on this node. */
  dependents: string[];
}

export interface DependencyGraph {
  nodes: DependencyNode[];
}

export interface ResolvedPlan {
  /** Topologically sorted execution order. */
  order: string[];
  /** Steps that are blocked due to unavailable prerequisites. */
  blocked: { tool: string; missingPrerequisite: string }[];
  /** Whether the plan is fully executable. */
  executable: boolean;
}

export class DependencyMapper {
  private readonly nodes = new Map<string, DependencyNode>();

  addTool(tool: string, provider: string): void {
    if (!this.nodes.has(tool)) {
      this.nodes.set(tool, { tool, provider, dependsOn: [], dependents: [] });
    }
  }

  addDependency(dep: ToolDependency): void {
    this.addTool(dep.upstream, "");
    this.addTool(dep.downstream, "");
    const down = this.nodes.get(dep.downstream)!;
    if (!down.dependsOn.includes(dep.upstream)) down.dependsOn.push(dep.upstream);
    const up = this.nodes.get(dep.upstream)!;
    if (!up.dependents.includes(dep.downstream)) up.dependents.push(dep.downstream);
  }

  graph(): DependencyGraph {
    return { nodes: [...this.nodes.values()] };
  }

  /**
   * Resolve a valid execution order via topological sort. Detects cycles and
   * reports blocked steps when a prerequisite is unavailable.
   */
  resolve(availableTools?: Set<string>): ResolvedPlan {
    const available = availableTools ?? new Set(this.nodes.keys());
    const inDegree = new Map<string, number>();
    for (const [tool, node] of this.nodes) {
      inDegree.set(tool, node.dependsOn.filter((d) => available.has(d)).length);
    }

    const queue: string[] = [];
    for (const [tool, deg] of inDegree) {
      if (available.has(tool) && deg === 0) queue.push(tool);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const tool = queue.shift()!;
      order.push(tool);
      const node = this.nodes.get(tool)!;
      for (const dep of node.dependents) {
        if (!available.has(dep)) continue;
        const deg = (inDegree.get(dep) ?? 0) - 1;
        inDegree.set(dep, deg);
        if (deg === 0) queue.push(dep);
      }
    }

    // Blocked steps: available tools whose prerequisites are not all available.
    const blocked: ResolvedPlan["blocked"] = [];
    for (const [tool, node] of this.nodes) {
      if (!available.has(tool)) continue;
      for (const prereq of node.dependsOn) {
        if (!available.has(prereq)) {
          blocked.push({ tool, missingPrerequisite: prereq });
        }
      }
    }

    return {
      order,
      blocked,
      executable: blocked.length === 0 && order.length === this.nodes.size,
    };
  }
}
