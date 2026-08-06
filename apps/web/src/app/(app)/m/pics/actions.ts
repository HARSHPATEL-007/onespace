"use server";

import { PicsService, albumSchema } from "@n0va/modules-pics/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new PicsService(workspaceId, userId, role);
};

export async function createAlbumAction(formData: FormData) {
  const { name } = albumSchema.parse({ name: String(formData.get("name") ?? "") });
  await (await svc()).createAlbum(name);
}

export async function deleteAlbumAction(formData: FormData) {
  await (await svc()).removeAlbum(String(formData.get("id") ?? ""));
}

export async function deletePhotoAction(formData: FormData) {
  await (await svc()).removePhoto(String(formData.get("id") ?? ""));
}

export async function movePhotoAction(formData: FormData) {
  const albumId = String(formData.get("albumId") ?? "");
  await (await svc()).movePhoto(String(formData.get("id") ?? ""), albumId ? albumId : null);
}
