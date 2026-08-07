import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { publishRoom } from "./emitter";

const MODULE = "meet";

export const roomSchema = z.object({ name: z.string().min(1).max(200) });
export const meetMessageSchema = z.object({ body: z.string().min(1).max(4000) });

export class MeetService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for meet`);
    }
  }

  async listRooms() {
    await this.assert("READ");
    return prisma.meetRoom.findMany({
      where: { workspaceId: this.workspaceId, endedAt: null },
      include: {
        _count: { select: { participants: { where: { leftAt: null } } } },
        participants: { where: { leftAt: null }, include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { startedAt: "desc" },
    });
  }

  async listEndedRooms() {
    await this.assert("READ");
    return prisma.meetRoom.findMany({
      where: { workspaceId: this.workspaceId, endedAt: { not: null } },
      include: { _count: { select: { participants: true } } },
      orderBy: { endedAt: "desc" },
    });
  }

  async transcript(roomId: string) {
    await this.assert("READ");
    const room = await prisma.meetRoom.findFirst({
      where: { id: roomId, workspaceId: this.workspaceId, endedAt: { not: null } },
    });
    if (!room) throw new Error("Room not found in this workspace");
    const [messages, participants] = await Promise.all([
      prisma.meetMessage.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
      prisma.meetParticipant.findMany({ where: { roomId }, orderBy: { joinedAt: "asc" } }),
    ]);
    return { room, messages, participants };
  }

  async createRoom(name: string) {
    await this.assert("CREATE");
    const room = await prisma.meetRoom.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name,
        participants: { create: { workspaceId: this.workspaceId, userId: this.userId, name: "" } },
      },
    });
    await this.audit("room.created", room.id);
    return room;
  }

  async endRoom(roomId: string) {
    await this.assert("UPDATE");
    await this.ownedRoom(roomId);
    await prisma.meetRoom.update({
      where: { id: roomId },
      data: { endedAt: new Date() },
    });
    publishRoom(roomId, { type: "ended" });
  }

  async getRoom(roomId: string) {
    await this.assert("READ");
    const room = await prisma.meetRoom.findFirst({
      where: { id: roomId, workspaceId: this.workspaceId },
      include: {
        participants: {
          where: { leftAt: null },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { joinedAt: "asc" },
        },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!room) throw new Error("Room not found in this workspace");
    return room;
  }

  async join(roomId: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedRoom(roomId);
    const participant = await prisma.meetParticipant.upsert({
      where: { roomId_userId: { roomId, userId: this.userId } },
      create: {
        roomId,
        workspaceId: this.workspaceId,
        userId: this.userId,
        name: name || "Anonymous",
      },
      update: { name: name || undefined, leftAt: null },
    });
    publishRoom(roomId, {
      type: "presence",
      participant: {
        id: participant.id,
        userId: this.userId,
        name: name || "Anonymous",
        joinedAt: new Date().toISOString(),
      },
      joined: true,
    });
    return participant;
  }

  async leave(roomId: string) {
    await this.assert("UPDATE");
    await prisma.meetParticipant.updateMany({
      where: { roomId, userId: this.userId, leftAt: null },
      data: { leftAt: new Date() },
    });
    publishRoom(roomId, { type: "presence", userId: this.userId, joined: false });
  }

  async sendMessage(roomId: string, body: string, authorName: string) {
    await this.assert("CREATE");
    await this.ownedRoom(roomId);
    const message = await prisma.meetMessage.create({
      data: { roomId, workspaceId: this.workspaceId, authorName, body },
    });
    publishRoom(roomId, {
      type: "message",
      message: {
        id: message.id,
        authorName: message.authorName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    });
    return message;
  }

  private async ownedRoom(id: string) {
    const room = await prisma.meetRoom.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!room) throw new Error("Room not found in this workspace");
    return room;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "MeetRoom",
      targetId,
    });
  }
}
