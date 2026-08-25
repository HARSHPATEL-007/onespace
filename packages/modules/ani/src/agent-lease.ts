/**
 * Agent & Tool Boundaries — Context Leases (Spec §15)
 * Agents receive only a task-specific, expiring, non-transferable lease.
 */

export interface AgentLease {
  lease_id: string;
  agent_id: string;
  purpose: string;
  allowed_context: string[]; // memory_ids / project ids
  allowed_tools: string[];
  forbidden_tools: string[];
  expires_at: string; // ISO
  max_actions: number;
  actions_used: number;
  requires_approval_for: string[];
  principal: string; // user who granted
  tenant: string;
  revoked: boolean;
  created_at: string;
}

export class AgentLeaseManager {
  private leases = new Map<string, AgentLease>();

  create(params: {
    agent_id: string;
    purpose: string;
    allowed_context: string[];
    allowed_tools: string[];
    forbidden_tools?: string[];
    max_actions?: number;
    requires_approval_for?: string[];
    principal: string;
    tenant: string;
    ttlMs?: number;
  }): AgentLease {
    const now = Date.now();
    const lease: AgentLease = {
      lease_id: `lease_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      agent_id: params.agent_id,
      purpose: params.purpose,
      allowed_context: params.allowed_context,
      allowed_tools: params.allowed_tools,
      forbidden_tools: params.forbidden_tools ?? [],
      expires_at: new Date(now + (params.ttlMs ?? 30 * 60 * 1000)).toISOString(),
      max_actions: params.max_actions ?? 5,
      actions_used: 0,
      requires_approval_for: params.requires_approval_for ?? ["external_send"],
      principal: params.principal,
      tenant: params.tenant,
      revoked: false,
      created_at: new Date(now).toISOString(),
    };
    this.leases.set(lease.lease_id, lease);
    return lease;
  }

  validate(leaseId: string, tool: string, contextId?: string): { allowed: boolean; reason: string } {
    const lease = this.leases.get(leaseId);
    if (!lease) return { allowed: false, reason: "lease_not_found" };
    if (lease.revoked) return { allowed: false, reason: "lease_revoked" };
    if (Date.now() > new Date(lease.expires_at).getTime()) return { allowed: false, reason: "lease_expired" };
    if (lease.actions_used >= lease.max_actions) return { allowed: false, reason: "max_actions_exceeded" };
    if (lease.forbidden_tools.includes(tool)) return { allowed: false, reason: "tool_forbidden" };
    if (!lease.allowed_tools.includes(tool) && !lease.allowed_tools.includes("*")) return { allowed: false, reason: "tool_not_allowed" };
    if (contextId && !lease.allowed_context.includes(contextId) && !lease.allowed_context.includes("*")) {
      return { allowed: false, reason: "context_not_allowed" };
    }
    if (lease.requires_approval_for.includes(tool) || lease.requires_approval_for.includes("external_send") && tool.includes("send")) {
      return { allowed: false, reason: "requires_approval" };
    }
    return { allowed: true, reason: "allowed" };
  }

  consume(leaseId: string): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;
    if (lease.actions_used >= lease.max_actions) return false;
    lease.actions_used += 1;
    return true;
  }

  revoke(leaseId: string, reason = "user_access_changed"): boolean {
    const lease = this.leases.get(leaseId);
    if (!lease) return false;
    lease.revoked = true;
    void reason;
    return true;
  }

  revokeByPrincipal(principal: string): number {
    let count = 0;
    for (const lease of this.leases.values()) {
      if (lease.principal === principal && !lease.revoked) {
        lease.revoked = true;
        count++;
      }
    }
    return count;
  }

  get(leaseId: string): AgentLease | null {
    return this.leases.get(leaseId) ?? null;
  }

  listActive(tenant?: string): AgentLease[] {
    const now = Date.now();
    return [...this.leases.values()].filter(
      (l) => !l.revoked && new Date(l.expires_at).getTime() > now && (!tenant || l.tenant === tenant),
    );
  }
}

export function createAgentLeaseManager(): AgentLeaseManager {
  return new AgentLeaseManager();
}
