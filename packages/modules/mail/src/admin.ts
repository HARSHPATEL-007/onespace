/**
 * N0VA MAIL — Admin, Compliance & IAM Engine
 *
 * Audit logging, legal hold, eDiscovery, data retention,
 * RBAC controls, and export engine.
 */

// ── Types ──────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  actorType: "user" | "system" | "api_key";
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface LegalHold {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  query: string;
  createdById: string;
  isActive: boolean;
  createdAt: Date;
  releasedAt?: Date;
}

export interface RetentionPolicy {
  id: string;
  workspaceId: string;
  name: string;
  folder: string;
  action: "delete" | "archive" | "anonymize";
  retentionDays: number;
  isActive: boolean;
  createdAt: Date;
}

export interface ExportJob {
  id: string;
  workspaceId: string;
  userId: string;
  format: "eml" | "mbox" | "pst" | "json";
  status: "pending" | "processing" | "completed" | "failed";
  filters: Record<string, unknown>;
  fileUrl?: string;
  fileSizeBytes?: number;
  createdAt: Date;
  completedAt?: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

export interface UserRoleAssignment {
  userId: string;
  roleId: string;
  workspaceId: string;
  assignedById: string;
  assignedAt: Date;
  expiresAt?: Date;
}

// ── RBAC Definitions ──────────────────────────────────────

export const systemRoles: Role[] = [
  {
    id: "system_admin",
    name: "System Admin",
    description: "Full system access",
    permissions: ["*"],
    isSystem: true,
  },
  {
    id: "domain_admin",
    name: "Domain Admin",
    description: "Manage domains, users, and workspace settings",
    permissions: ["domain:*", "user:*", "mailbox:*", "settings:*"],
    isSystem: true,
  },
  {
    id: "support_desk",
    name: "Support Desk",
    description: "View and manage user mailboxes for support",
    permissions: ["mailbox:read", "mailbox:manage", "user:read"],
    isSystem: true,
  },
  {
    id: "auditor",
    name: "Auditor",
    description: "Read-only access to audit logs and compliance data",
    permissions: ["audit:read", "compliance:read", "export:read"],
    isSystem: true,
  },
  {
    id: "end_user",
    name: "End User",
    description: "Standard mailbox user",
    permissions: ["mailbox:own", "alias:own", "settings:own"],
    isSystem: true,
  },
];

// ── Audit Logger ──────────────────────────────────────────

export class AuditLogger {
  private logs: AuditLogEntry[] = [];

  async log(entry: Omit<AuditLogEntry, "id" | "timestamp">): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    this.logs.push(logEntry);
    return logEntry;
  }

  async query(workspaceId: string, filters?: {
    actorId?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    let results = this.logs.filter(l => l.workspaceId === workspaceId);

    if (filters?.actorId) results = results.filter(l => l.actorId === filters.actorId);
    if (filters?.action) results = results.filter(l => l.action === filters.action);
    if (filters?.resourceType) results = results.filter(l => l.resourceType === filters.resourceType);
    if (filters?.startDate) results = results.filter(l => l.timestamp >= filters.startDate!);
    if (filters?.endDate) results = results.filter(l => l.timestamp <= filters.endDate!);

    const limit = filters?.limit || 100;
    return results.slice(-limit).reverse();
  }

  async export(workspaceId: string, format: "json" | "csv"): Promise<string> {
    const logs = this.logs.filter(l => l.workspaceId === workspaceId);
    if (format === "json") return JSON.stringify(logs, null, 2);
    const header = "id,actorId,action,resourceType,resourceId,timestamp\n";
    const rows = logs.map(l => `${l.id},${l.actorId},${l.action},${l.resourceType},${l.resourceId},${l.timestamp.toISOString()}`).join("\n");
    return header + rows;
  }
}

// ── Legal Hold Manager ────────────────────────────────────

export class LegalHoldManager {
  private holds: Map<string, LegalHold> = new Map();

  createHold(hold: Omit<LegalHold, "id" | "createdAt" | "isActive">): LegalHold {
    const newHold: LegalHold = { ...hold, id: crypto.randomUUID(), isActive: true, createdAt: new Date() };
    this.holds.set(newHold.id, newHold);
    return newHold;
  }

  releaseHold(holdId: string): LegalHold | null {
    const hold = this.holds.get(holdId);
    if (!hold) return null;
    hold.isActive = false;
    hold.releasedAt = new Date();
    return hold;
  }

  getHolds(workspaceId: string): LegalHold[] {
    return [...this.holds.values()].filter(h => h.workspaceId === workspaceId);
  }

  isActive(holdId: string): boolean {
    return this.holds.get(holdId)?.isActive ?? false;
  }
}

// ── Retention Policy Engine ───────────────────────────────

export class RetentionPolicyEngine {
  private policies: Map<string, RetentionPolicy> = new Map();

  createPolicy(policy: Omit<RetentionPolicy, "id" | "createdAt" | "isActive">): RetentionPolicy {
    const newPolicy: RetentionPolicy = { ...policy, id: crypto.randomUUID(), isActive: true, createdAt: new Date() };
    this.policies.set(newPolicy.id, newPolicy);
    return newPolicy;
  }

  getPolicies(workspaceId: string): RetentionPolicy[] {
    return [...this.policies.values()].filter(p => p.workspaceId === workspaceId);
  }

  async applyPolicies(workspaceId: string): Promise<{ deleted: number; archived: number }> {
    let deleted = 0;
    let archived = 0;
    const policies = this.getPolicies(workspaceId).filter(p => p.isActive);

    for (const policy of policies) {
      const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
      // In production: query messages older than cutoff and apply action
      if (policy.action === "delete") deleted++;
      else if (policy.action === "archive") archived++;
    }

    return { deleted, archived };
  }

  deletePolicy(policyId: string): void {
    this.policies.delete(policyId);
  }
}

// ── Export Engine ─────────────────────────────────────────

export class ExportEngine {
  private jobs: Map<string, ExportJob> = new Map();

  createJob(job: Omit<ExportJob, "id" | "createdAt" | "status">): ExportJob {
    const newJob: ExportJob = { ...job, id: crypto.randomUUID(), status: "pending", createdAt: new Date() };
    this.jobs.set(newJob.id, newJob);
    return newJob;
  }

  async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = "processing";
    // In production: generate export file
    job.status = "completed";
    job.completedAt = new Date();
  }

  getJobs(workspaceId: string): ExportJob[] {
    return [...this.jobs.values()].filter(j => j.workspaceId === workspaceId);
  }

  getJob(jobId: string): ExportJob | undefined {
    return this.jobs.get(jobId);
  }
}

// ── RBAC Engine ───────────────────────────────────────────

export class RbacEngine {
  private roles: Map<string, Role> = new Map(systemRoles.map(r => [r.id, r]));
  private assignments: UserRoleAssignment[] = [];

  assignRole(userId: string, roleId: string, workspaceId: string, assignedById: string, expiresAt?: Date): UserRoleAssignment {
    const assignment: UserRoleAssignment = { userId, roleId, workspaceId, assignedById, assignedAt: new Date(), expiresAt };
    this.assignments.push(assignment);
    return assignment;
  }

  removeRole(userId: string, roleId: string, workspaceId: string): void {
    this.assignments = this.assignments.filter(a => !(a.userId === userId && a.roleId === roleId && a.workspaceId === workspaceId));
  }

  getUserRoles(userId: string, workspaceId: string): Role[] {
    return this.assignments
      .filter(a => a.userId === userId && a.workspaceId === workspaceId && (!a.expiresAt || a.expiresAt > new Date()))
      .map(a => this.roles.get(a.roleId))
      .filter((r): r is Role => r !== undefined);
  }

  hasPermission(userId: string, workspaceId: string, permission: string): boolean {
    const roles = this.getUserRoles(userId, workspaceId);
    for (const role of roles) {
      if (role.permissions.includes("*")) return true;
      if (role.permissions.includes(permission)) return true;
      // Check wildcard permissions
      for (const p of role.permissions) {
        if (p.endsWith(":*") && permission.startsWith(p.slice(0, -2))) return true;
      }
    }
    return false;
  }

  createCustomRole(name: string, description: string, permissions: string[]): Role {
    const role: Role = { id: crypto.randomUUID(), name, description, permissions, isSystem: false };
    this.roles.set(role.id, role);
    return role;
  }

  listRoles(): Role[] {
    return [...this.roles.values()];
  }
}

// ── Admin Facade ──────────────────────────────────────────

export class AdminEngine {
  readonly audit: AuditLogger;
  readonly legalHolds: LegalHoldManager;
  readonly retention: RetentionPolicyEngine;
  readonly exports: ExportEngine;
  readonly rbac: RbacEngine;

  constructor() {
    this.audit = new AuditLogger();
    this.legalHolds = new LegalHoldManager();
    this.retention = new RetentionPolicyEngine();
    this.exports = new ExportEngine();
    this.rbac = new RbacEngine();
  }
}
