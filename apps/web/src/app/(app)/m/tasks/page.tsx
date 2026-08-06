import { TasksService } from "@n0va/modules-tasks/server";
import { TasksApp } from "@n0va/modules-tasks/components";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import {
  createListAction,
  createTaskAction,
  deleteListAction,
  deleteTaskAction,
  renameListAction,
  toggleTaskAction,
  updateTaskAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ctx = await requireWorkspace();
  const svc = new TasksService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  const [lists, members] = await Promise.all([
    svc.lists(),
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspace.id, status: "ACTIVE" },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  return (
    <TasksApp
      lists={lists}
      members={members.map((m) => ({ id: m.userId, name: m.user.name, email: m.user.email }))}
      actions={{
        createList: createListAction,
        renameList: renameListAction,
        deleteList: deleteListAction,
        createTask: createTaskAction,
        updateTask: updateTaskAction,
        toggleComplete: toggleTaskAction,
        deleteTask: deleteTaskAction,
      }}
    />
  );
}