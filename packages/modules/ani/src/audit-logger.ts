export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  sourcesUsed: string[];
  confirmationsRequired: string[];
  riskLevel: "low" | "medium" | "high";
  outcome: "success" | "failure" | "escalated";
  metadata: Record<string, unknown>;
}

export class AuditLogger {
  private entries: AuditEntry[] = [];

  log(entry: Omit<AuditEntry, "id" | "timestamp">): AuditEntry {
    const full: AuditEntry = {
      ...entry,
      id:
        "audit_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
    };
    this.entries.push(full);
    return full;
  }

  getEntries(filters?: {
    actorId?: string;
    action?: string;
    riskLevel?: string;
  }): AuditEntry[] {
    return this.entries.filter((e) => {
      if (filters?.actorId && e.actorId !== filters.actorId) return false;
      if (filters?.action && e.action !== filters.action) return false;
      if (filters?.riskLevel && e.riskLevel !== filters.riskLevel) return false;
      return true;
    });
  }

  getProvenance(targetId: string): AuditEntry[] {
    return this.entries.filter((e) => e.targetId === targetId);
  }
}
