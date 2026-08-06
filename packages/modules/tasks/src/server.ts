import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "tasks";

export const taskInputSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(8000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  assigneeId: z.string().optional().nullable(),
});

export type TaskInput = z.infer<typeof taskInputSchema>;

export const listInputSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().max(40).default("default"),
});

export type ListInput = z.infer<typeof listInputSchema>;

export class TasksService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for tasks`);
    }
  }

  async lists() {
    await this.assert("READ");
    return prisma.taskList.findMany({
      where: { workspaceId: this.workspaceId },
      include: { tasks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
      orderBy: { createdAt: "asc" },
    });
  }

  async createList(input: ListInput) {
    await this.assert("CREATE");
    const list = await prisma.taskList.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        color: input.color,
      },
    });
    await this.audit("tasklist.created", list.id);
    return list;
  }

  async renameList(id: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedList(id);
    await prisma.taskList.update({ where: { id }, data: { name } });
    await this.audit("tasklist.renamed", id);
  }

  async deleteList(id: string) {
    await this.assert("DELETE");
    await this.ownedList(id);
    await prisma.taskList.delete({ where: { id } });
    await this.audit("tasklist.deleted", id);
  }

  async createTask(listId: string, input: TaskInput) {
    await this.assert("CREATE");
    await this.ownedList(listId);
    const count = await prisma.task.count({ where: { listId } });
    const task = await prisma.task.create({
      data: {
        listId,
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: input.title,
        notes: input.notes ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        position: count,
      },
    });
    await this.audit("task.created", task.id);
    return task;
  }

  async updateTask(id: string, input: Partial<TaskInput>) {
    await this.assert("UPDATE");
    await this.owned(id);
    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId ?? null } : {}),
      },
    });
    await this.audit("task.updated", id);
    return task;
  }

  async toggleComplete(id: string) {
    await this.assert("UPDATE");
    const task = await this.owned(id);
    const completedAt = task.completedAt ? null : new Date();
    await prisma.task.update({ where: { id }, data: { completedAt } });
    await this.audit(completedAt ? "task.completed" : "task.reopened", id);
  }

  async deleteTask(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.task.delete({ where: { id } });
    await this.audit("task.deleted", id);
  }

  private async owned(id: string) {
    const task = await prisma.task.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!task) throw new Error("Task not found in this workspace");
    return task;
  }

  private async ownedList(id: string) {
    const list = await prisma.taskList.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!list) throw new Error("Task list not found in this workspace");
    return list;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Task",
      targetId,
    });
  }
}