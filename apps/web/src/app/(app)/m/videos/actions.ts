"use server";

import { VideosService, videoSchema } from "@n0va/modules-videos/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new VideosService(workspaceId, userId, role);
};

export async function addVideoAction(formData: FormData) {
  const parsed = videoSchema.parse({
    title: String(formData.get("title") ?? ""),
    url: String(formData.get("url") ?? ""),
    description: String(formData.get("description") ?? ""),
    provider: String(formData.get("provider") ?? "other"),
  });
  await (await svc()).create(parsed);
}

export async function deleteVideoAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
