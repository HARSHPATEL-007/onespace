"use server";

import { TasksService, taskInputSchema } from "@n0va/modules-tasks/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new TasksService(ctx.workspaceId, ctx.userId, ctx.role);
}

export async function createListAction(formData: FormData) {
  await (await svc()).createList({ name: String(formData.get("name") ?? ""), color: "default" });
}

export async function renameListAction(formData: FormData) {
  await (await svc()).renameList(String(formData.get("id")), String(formData.get("name") ?? ""));
}

export async function deleteListAction(formData: FormData) {
  await (await svc()).deleteList(String(formData.get("id")));
}

function parseTask(formData: FormData) {
  const dueDate = String(formData.get("dueDate") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  return taskInputSchema.parse({
    title: formData.get("title"),
    notes: String(formData.get("notes") ?? ""),
    dueDate: dueDate || null,
    priority: formData.get("priority") ?? "MEDIUM",
    assigneeId: assigneeId || null,
  });
}

export async function createTaskAction(formData: FormData) {
  await (await svc()).createTask(String(formData.get("listId")), parseTask(formData));
}

export async function updateTaskAction(formData: FormData) {
  await (await svc()).updateTask(String(formData.get("id")), parseTask(formData));
}

export async function toggleTaskAction(formData: FormData) {
  await (await svc()).toggleComplete(String(formData.get("id")));
}

export async function moveTaskAction(formData: FormData) {
  const direction = String(formData.get("direction") ?? "");
  if (direction === "up" || direction === "down") {
    await (await svc()).moveTask(String(formData.get("id")), direction);
  }
}

export async function deleteTaskAction(formData: FormData) {
  await (await svc()).deleteTask(String(formData.get("id")));
}