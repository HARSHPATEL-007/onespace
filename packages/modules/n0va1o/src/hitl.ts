/**
 * N0VA1O Human-in-the-Loop (HITL) Interrogation Rooms.
 *
 * When a high-risk action is detected, the state machine pauses, preserves the
 * agent's full reasoning chain, and presents a review interface to authorized
 * humans. Digital signatures required for approval.
 *
 * Spec §4.4: Interrogation Room Protocol
 */
import { createHash, createSign } from "node:crypto";
import { prisma, logAudit } from "@n0va/db";

export interface InterrogationRoom {
  id: string;
  workspaceId: string;
  integrationId: string;
  agentId: string;
  agentLabel: string;
  status: "pending" | "approved" | "rejected" | "modified" | "escalated" | "timed_out";
  /** The proposed action that triggered the review */
  proposedAction: {
    provider: string;
    tool: string;
    input: Record<string, unknown>;
  };
  /** Full chain-of-thought reasoning from the agent */
  reasoningChain: string[];
  /** All data the agent accessed during the session */
  dataAccessed: Array<{ type: string; id: string; summary: string }>;
  /** Risk assessment */
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  disposition: string;
  /** Review outcome */
  decidedById?: string;
  decidedAt?: Date;
  decisionSignature?: string;
  /** Timeout tracking */
  createdAt: Date;
  expiresAt: Date;
}

/** In-memory store (production: persist to DB with InterrogationRoom table) */
const rooms = new Map<string, InterrogationRoom>();

/** Risk thresholds per spec §4.3 */
const RISK_THRESHOLDS = {
  CRITICAL: 0.8,
  HIGH: 0.5,
  MEDIUM: 0.2,
  LOW: 0,
};

/**
 * Create an interrogation room for a high-risk action.
 * Returns the room ID for tracking.
 */
export async function createInterrogationRoom(input: {
  workspaceId: string;
  integrationId: string;
  agentId: string;
  agentLabel: string;
  provider: string;
  tool: string;
  actionInput: Record<string, unknown>;
  reasoningChain: string[];
  dataAccessed: Array<{ type: string; id: string; summary: string }>;
  riskScore: number;
}): Promise<string> {
  const roomId = `ir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hour timeout

  const riskLevel = scoreToRiskLevel(input.riskScore);

  const room: InterrogationRoom = {
    id: roomId,
    workspaceId: input.workspaceId,
    integrationId: input.integrationId,
    agentId: input.agentId,
    agentLabel: input.agentLabel,
    status: "pending",
    proposedAction: { provider: input.provider, tool: input.tool, input: input.actionInput },
    reasoningChain: input.reasoningChain,
    dataAccessed: input.dataAccessed,
    riskScore: input.riskScore,
    riskLevel,
    disposition: `Risk level ${riskLevel} — requires human review`,
    createdAt: now,
    expiresAt,
  };

  rooms.set(roomId, room);

  // Audit the creation
  try {
    await logAudit({
      workspaceId: input.workspaceId,
      module: "n0va1o",
      action: "hitl.created",
      targetType: "InterrogationRoom",
      targetId: roomId,
      metadata: { riskScore: input.riskScore, riskLevel, tool: input.tool },
    });
  } catch {
    // Audit must not block
  }

  return roomId;
}

/**
 * Get an interrogation room by ID.
 */
export function getInterrogationRoom(roomId: string): InterrogationRoom | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  // Check timeout
  if (room.status === "pending" && new Date() > room.expiresAt) {
    room.status = "timed_out";
    room.disposition = "Timed out after 4 hours — auto-rejected";
  }

  return room;
}

/**
 * List pending interrogation rooms for a workspace.
 */
export function listPendingRooms(workspaceId: string): InterrogationRoom[] {
  return [...rooms.values()].filter((r) => r.workspaceId === workspaceId && r.status === "pending");
}

/**
 * Approve or reject an interrogation room.
 * Requires a digital signature for audit trail.
 */
export async function decideInterrogationRoom(input: {
  roomId: string;
  approve: boolean;
  decidedById: string;
  signature: string;
  modifications?: Record<string, unknown>;
}): Promise<{ success: boolean; message: string }> {
  const room = rooms.get(input.roomId);
  if (!room) return { success: false, message: "Room not found" };
  if (room.status !== "pending") return { success: false, message: `Room already ${room.status}` };
  if (new Date() > room.expiresAt) {
    room.status = "timed_out";
    return { success: false, message: "Room timed out" };
  }

  // Verify signature integrity
  const expectedSig = signDecision(input.roomId, input.approve, input.decidedById);
  if (input.signature !== expectedSig) {
    return { success: false, message: "Invalid decision signature" };
  }

  room.status = input.approve ? "approved" : "rejected";
  room.decidedById = input.decidedById;
  room.decidedAt = new Date();
  room.decisionSignature = input.signature;
  room.disposition = input.approve
    ? `Approved by ${input.decidedById}${input.modifications ? " with modifications" : ""}`
    : `Rejected by ${input.decidedById}`;

  if (input.modifications) {
    room.proposedAction.input = { ...room.proposedAction.input, ...input.modifications };
  }

  try {
    await logAudit({
      workspaceId: room.workspaceId,
      actorId: input.decidedById,
      module: "n0va1o",
      action: input.approve ? "hitl.approved" : "hitl.rejected",
      targetType: "InterrogationRoom",
      targetId: input.roomId,
      metadata: { riskScore: room.riskScore, riskLevel: room.riskLevel },
    });
  } catch {
    // Audit must not block
  }

  return { success: true, message: room.disposition };
}

/** Generate a digital signature for a decision */
export function signDecision(roomId: string, approve: boolean, deciderId: string): string {
  const payload = `${roomId}|${approve}|${deciderId}|${Date.now()}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** Evaluate risk level from a score */
function scoreToRiskLevel(score: number): InterrogationRoom["riskLevel"] {
  if (score >= RISK_THRESHOLDS.CRITICAL) return "critical";
  if (score >= RISK_THRESHOLDS.HIGH) return "high";
  if (score >= RISK_THRESHOLDS.MEDIUM) return "medium";
  return "low";
}

/** Check if an action requires HITL review */
export function requiresHitlReview(riskScore: number, isDestructive: boolean): boolean {
  return riskScore >= RISK_THRESHOLDS.HIGH || isDestructive;
}
