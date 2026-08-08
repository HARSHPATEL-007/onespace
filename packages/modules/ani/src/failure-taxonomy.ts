export type FailureType =
  | "hallucination_spike"
  | "tool_outage"
  | "stale_memory"
  | "permission_block"
  | "reasoning_failure"
  | "timeout";

export interface FailureEvent {
  id: string;
  type: FailureType;
  component: string;
  message: string;
  timestamp: string;
  recoveryAction: string;
}

export class FailureTaxonomy {
  private playbooks: Record<FailureType, string> = {
    hallucination_spike:
      "Switch to conservative mode, increase verification, cite sources",
    tool_outage: "Failover to cached responses, queue writes, alert admin",
    stale_memory: "Invalidate affected cache entries, re-query sources",
    permission_block: "Pause workflow, request elevated access, notify user",
    reasoning_failure:
      "Decompose into smaller sub-problems, retry with different model",
    timeout: "Reduce context window, simplify query, retry",
  };

  classify(component: string, message: string): FailureType {
    const lower = message.toLowerCase();
    if (lower.includes("hallucinat") || lower.includes("unverified"))
      return "hallucination_spike";
    if (
      lower.includes("unavailable") ||
      lower.includes("timeout") ||
      lower.includes("503")
    )
      return "tool_outage";
    if (lower.includes("stale") || lower.includes("expired"))
      return "stale_memory";
    if (
      lower.includes("permission") ||
      lower.includes("unauthorized") ||
      lower.includes("403")
    )
      return "permission_block";
    if (lower.includes("reasoning") || lower.includes("logic"))
      return "reasoning_failure";
    return "timeout";
  }

  getPlaybook(failureType: FailureType): string {
    return this.playbooks[failureType];
  }

  handle(component: string, message: string): FailureEvent {
    const type = this.classify(component, message);
    return {
      id: "fail_" + Date.now().toString(36),
      type,
      component,
      message,
      timestamp: new Date().toISOString(),
      recoveryAction: this.getPlaybook(type),
    };
  }
}
