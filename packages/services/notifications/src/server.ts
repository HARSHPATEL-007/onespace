import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";

const MODULE = "notifications";

export const notificationSchema = z.object({
  workspaceId: string;
  userId: string;
  type: z.enum(["info", "success", "warning", "error", "action_required"]);
  title: z.string().max(200);
  body: z.string().max(2000).optional();
  module: z.string().max(80);
  targetId: z.string().optional();
  actionUrl: z.string().max(500).optional();
  metadata: z.record(z.unknown()).optional();
});

export type CreateNotificationInput = z.infer<typeof notificationSchema>;

export class NotificationsService {
  constructor(private readonly workspaceId: string) {}

  async create(input: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        workspaceId: this.workspaceId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        module: input.module,
        targetId: input.targetId,
        actionUrl: input.actionUrl,
        metadata: input.metadata as never,
        read: false,
      },
    });
    return notification;
  }

  async list(userId: string, unreadOnly = false, take = 50) {
    return prisma.notification.findMany({
      where: {
        workspaceId: this.workspaceId,
        userId,
        ...(unreadOnly ? { read: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async markRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, workspaceId: this.workspaceId, userId },
      data: { read: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { workspaceId: this.workspaceId, userId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  async unreadCount(userId: string) {
    return prisma.notification.count({
      where: { workspaceId: this.workspaceId, userId, read: false },
    });
  }

  async broadcast(input: Omit<CreateNotificationInput, "userId">) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId, status: "ACTIVE" },
      select: { userId: true },
    });
    return prisma.notification.createMany({
      data: members.map((m) => ({
        workspaceId: this.workspaceId,
        userId: m.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        module: input.module,
        targetId: input.targetId,
        actionUrl: input.actionUrl,
        metadata: input.metadata as never,
        read: false,
      })),
    });
  }
}

export { logAudit, MODULE };
