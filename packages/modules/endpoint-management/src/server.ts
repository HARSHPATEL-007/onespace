import { z } from "zod";
import { prisma, logAudit, type EndpointDevice } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "endpoint-management";

export const enrollSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["LAPTOP", "MOBILE", "OTHER"]).default("LAPTOP"),
  os: z.string().max(60).default("Windows"),
});

const OS_POOL = ["Windows 11 Pro", "macOS 15", "Ubuntu 24.04", "ChromeOS", "iOS 18", "Android 15"];

export class EndpointService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for endpoint-management`);
    }
  }

  async list(): Promise<Array<EndpointDevice & { owner: { id: string; name: string | null; email: string } | null }>> {
    await this.assert("READ");
    return prisma.endpointDevice.findMany({
      where: { workspaceId: this.workspaceId },
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: { enrolledAt: "desc" },
    });
  }

  async enroll(input: z.infer<typeof enrollSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.endpointDevice.create({
      data: {
        workspaceId: this.workspaceId,
        ownerId: this.userId,
        name: input.name,
        type: input.type,
        os: input.os || (OS_POOL[Math.floor(Math.random() * OS_POOL.length)] ?? "Windows 11 Pro"),
        status: "ACTIVE",
        compliant: true,
        lastSeenAt: new Date(),
      },
    });
    await this.audit("device.enrolled", input.name);
  }

  async revoke(id: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.endpointDevice.update({ where: { id }, data: { status: "REVOKED", compliant: false, lastSeenAt: new Date() } });
    await this.audit("device.revoked", id);
  }

  async reinstate(id: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.endpointDevice.update({ where: { id }, data: { status: "ACTIVE", compliant: true, lastSeenAt: new Date() } });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.endpointDevice.delete({ where: { id } });
    await this.audit("device.removed", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "EndpointDevice",
      targetId,
    });
  }
}
