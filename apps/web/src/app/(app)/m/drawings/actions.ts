"use server";

import { DrawingsService, drawingSchema, canvasSchema } from "@n0va/modules-drawings/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new DrawingsService(workspaceId, userId, role);
};

export async function createDrawingAction(formData: FormData) {
  const { name } = drawingSchema.parse({ name: String(formData.get("name") ?? "") });
  await (await svc()).create(name);
}

export async function renameDrawingAction(formData: FormData) {
  const { name } = drawingSchema.parse({ name: String(formData.get("name") ?? "") });
  await (await svc()).rename(String(formData.get("id") ?? ""), name);
}

export async function deleteDrawingAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function saveCanvasAction(formData: FormData) {
  const canvas = canvasSchema.parse(JSON.parse(String(formData.get("canvas") ?? "[]")));
  await (await svc()).saveCanvas(String(formData.get("id") ?? ""), canvas);
}
