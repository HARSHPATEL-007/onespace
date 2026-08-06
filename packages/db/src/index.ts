import type { Role } from "@prisma/client";
import { prisma } from "./client";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: Role;
}

export async function getMembership(
  workspaceId: string,
  userId: string,
) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

export async function createTenantContext(
  workspaceId: string,
  userId: string,
): Promise<TenantContext | null> {
  const member = await getMembership(workspaceId, userId);
  if (!member || member.status !== "ACTIVE") return null;
  return { tenantId: workspaceId, userId, role: member.role };
}

export async function logAudit(input: {
  workspaceId: string;
  actorId?: string | null;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}) {
  return prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      module: input.module,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ? (input.metadata as never) : undefined,
      ip: input.ip ?? null,
    },
  });
}

export * from "./client";