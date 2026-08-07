/**
 * N0VA1O Incident Response Mode — core platform (spec §2.4).
 *
 * When a high-risk event is detected, the platform enters an incident response
 * state that suspends risky sessions, preserves evidence, and routes alerts to
 * authorized reviewers. The incident bundle includes timestamps, relevant tool
 * calls, policy decisions, and immutable audit references.
 */

import type { PolicyDecision } from "./policy";

export type IncidentSeverity = "medium" | "high" | "critical";

export interface ToolCallReference {
  tool: string;
  provider: string;
  actorLabel: string;
  timestamp: string;
  policyDecision: PolicyDecision;
  sessionId?: string;
}

export interface IncidentBundle {
  incidentId: string;
  severity: IncidentSeverity;
  detectedAt: string;
  description: string;
  affectedSessions: string[];
  toolCalls: ToolCallReference[];
  policyVersion: string;
  evidenceHash: string;
  status: "active" | "contained" | "resolved";
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface SessionState {
  sessionId: string;
  suspended: boolean;
  suspendedAt?: string;
  suspendedReason?: string;
}

/**
 * In-memory incident manager. In production this persists to an Incident table
 * and triggers webhooks/SIRENs. The interface is storage-agnostic.
 */
export class IncidentManager {
  private readonly incidents = new Map<string, IncidentBundle>();
  private readonly sessions = new Map<string, SessionState>();

  /**
   * Open an incident from a high-risk detection. Suspends the affected
   * sessions, captures the evidence bundle, and returns the incident for
   * reviewer routing.
   */
  openIncident(opts: {
    severity: IncidentSeverity;
    description: string;
    toolCalls: ToolCallReference[];
    affectedSessions: string[];
    policyVersion: string;
  }): IncidentBundle {
    const detectedAt = new Date().toISOString();
    const incidentId = deriveIncidentId(detectedAt, opts.severity);
    const evidenceHash = hashEvidence(opts.toolCalls, detectedAt);
    const bundle: IncidentBundle = {
      incidentId,
      severity: opts.severity,
      detectedAt,
      description: opts.description,
      affectedSessions: opts.affectedSessions,
      toolCalls: opts.toolCalls,
      policyVersion: opts.policyVersion,
      evidenceHash,
      status: "active",
    };
    this.incidents.set(incidentId, bundle);
    // Suspend all affected sessions to freeze risky state.
    for (const sessionId of opts.affectedSessions) {
      this.sessions.set(sessionId, {
        sessionId,
        suspended: true,
        suspendedAt: detectedAt,
        suspendedReason: `Incident ${incidentId}: ${opts.description}`,
      });
    }
    return bundle;
  }

  getIncident(incidentId: string): IncidentBundle | null {
    return this.incidents.get(incidentId) ?? null;
  }

  listActive(): IncidentBundle[] {
    return [...this.incidents.values()].filter((i) => i.status === "active");
  }

  /** Resolve an incident and restore suspended sessions. */
  resolve(incidentId: string, resolvedBy: string): IncidentBundle | null {
    const incident = this.incidents.get(incidentId);
    if (!incident) return null;
    incident.status = "resolved";
    incident.resolvedAt = new Date().toISOString();
    incident.resolvedBy = resolvedBy;
    for (const sessionId of incident.affectedSessions) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.suspended = false;
      }
    }
    return incident;
  }

  isSessionSuspended(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.suspended ?? false;
  }

  getSessionState(sessionId: string): SessionState {
    return this.sessions.get(sessionId) ?? { sessionId, suspended: false };
  }

  /** Build the immutable incident bundle for a reviewer. */
  buildBundle(incidentId: string): Readonly<IncidentBundle> | null {
    const incident = this.incidents.get(incidentId);
    return incident ? Object.freeze({ ...incident }) : null;
  }
}

function deriveIncidentId(detectedAt: string, severity: string): string {
  const h = hashEvidence([{ tool: severity, provider: "", actorLabel: "", timestamp: detectedAt, policyDecision: { outcome: "DENY", policyVersion: "", matchedRules: [], riskLevel: "critical", riskScore: 0, disposition: "" } }], detectedAt);
  return `INC-${severity.toUpperCase()}-${h.slice(0, 12)}`;
}

function hashEvidence(toolCalls: ToolCallReference[], salt: string): string {
  const content = JSON.stringify(toolCalls) + salt;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const chr = content.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(32).padStart(8, "0");
}
