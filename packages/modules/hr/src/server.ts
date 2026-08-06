import { z } from "zod";
import { prisma, logAudit, type Employee, type LeaveRequest } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "hr";

export const employeeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  department: z.string().max(80).default("Engineering"),
  title: z.string().max(120).default("Individual Contributor"),
});

export const leaveSchema = z.object({
  employeeId: z.string().min(1),
  kind: z.enum(["VACATION", "SICK", "PERSONAL"]).default("VACATION"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export class HrService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for hr`);
    }
  }

  async employees(): Promise<Array<Employee & { leaveRequests: LeaveRequest[] }>> {
    await this.assert("READ");
    return prisma.employee.findMany({
      where: { workspaceId: this.workspaceId },
      include: { leaveRequests: { orderBy: { createdAt: "desc" }, take: 3 } },
      orderBy: { joinedAt: "desc" },
    });
  }

  async addEmployee(input: z.infer<typeof employeeSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.employee.create({
      data: { workspaceId: this.workspaceId, name: input.name, email: input.email, department: input.department, title: input.title },
    });
    await this.audit("hr.employee.added", input.name);
  }

  async setEmployeeStatus(id: string, status: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.employee.update({ where: { id }, data: { status: status as never } });
  }

  async removeEmployee(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.employee.delete({ where: { id } });
    await this.audit("hr.employee.removed", id);
  }

  async requestLeave(input: z.infer<typeof leaveSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.leaveRequest.create({
      data: {
        workspaceId: this.workspaceId,
        employeeId: input.employeeId,
        kind: input.kind,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      },
    });
  }

  async decideLeave(id: string, approved: boolean): Promise<void> {
    await this.assert("UPDATE");
    await prisma.leaveRequest.update({ where: { id }, data: { status: approved ? "APPROVED" : "REJECTED" } });
  }

  async removeLeave(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.leaveRequest.delete({ where: { id } });
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Employee",
      targetId,
    });
  }
}
