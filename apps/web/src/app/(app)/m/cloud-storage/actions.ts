"use server";

import { StorageService } from "@n0va/modules-storage/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new StorageService(ctx.workspaceId, ctx.userId, ctx.role);
}

export async function createFolderAction(formData: FormData) {
  const service = await svc();
  const name = String(formData.get("name") ?? "").trim();
  const parent = String(formData.get("parentId") ?? "");
  await service.createFolder(name, parent ? parent : null);
}

export async function renameItemAction(formData: FormData) {
  const service = await svc();
  await service.rename(
    String(formData.get("id")),
    String(formData.get("name") ?? "").trim(),
  );
}

export async function moveItemAction(formData: FormData) {
  const service = await svc();
  const parent = String(formData.get("parentId") ?? "");
  await service.move(String(formData.get("id")), parent ? parent : null);
}

export async function trashItemAction(formData: FormData) {
  const service = await svc();
  await service.trash(String(formData.get("id")));
}

export async function restoreItemAction(formData: FormData) {
  const service = await svc();
  await service.restore(String(formData.get("id")));
}

export async function purgeItemAction(formData: FormData) {
  const service = await svc();
  await service.purge(String(formData.get("id")));
}