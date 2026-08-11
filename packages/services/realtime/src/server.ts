import { prisma } from "@n0va/db";

const MODULE = "realtime";

export interface RealtimeEvent {
  type: string;
  workspaceId: string;
  userId?: string;
  module: string;
  targetId?: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

type EventHandler = (event: RealtimeEvent) => void;

export class RealtimeService {
  private handlers = new Map<string, Set<EventHandler>>();
  private connections = new Map<string, Set<string>>();

  constructor(private readonly workspaceId: string) {}

  subscribe(connectionId: string, handler: EventHandler) {
    if (!this.handlers.has(this.workspaceId)) {
      this.handlers.set(this.workspaceId, new Set());
    }
    this.handlers.get(this.workspaceId)!.add(handler);

    if (!this.connections.has(this.workspaceId)) {
      this.connections.set(this.workspaceId, new Set());
    }
    this.connections.get(this.workspaceId)!.add(connectionId);
  }

  unsubscribe(connectionId: string, handler: EventHandler) {
    this.handlers.get(this.workspaceId)?.delete(handler);
    this.connections.get(this.workspaceId)?.delete(connectionId);
  }

  emit(event: Omit<RealtimeEvent, "workspaceId" | "timestamp">) {
    const fullEvent: RealtimeEvent = {
      ...event,
      workspaceId: this.workspaceId,
      timestamp: new Date(),
    };
    this.handlers.get(this.workspaceId)?.forEach((fn) => fn(fullEvent));
  }

  connectionCount(): number {
    return this.connections.get(this.workspaceId)?.size ?? 0;
  }

  async presence(userId: string, status: "online" | "away" | "offline") {
    return prisma.workspaceMember.updateMany({
      where: { workspaceId: this.workspaceId, userId },
      data: { lastSeenAt: new Date() },
    });
  }
}

export { MODULE };
