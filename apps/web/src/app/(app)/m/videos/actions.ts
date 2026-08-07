"use server";

import { VideosService, playlistSchema, videoSchema } from "@n0va/modules-videos/server";
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

export async function createPlaylistAction(formData: FormData) {
  const parsed = playlistSchema.parse({ name: String(formData.get("name") ?? "") });
  await (await svc()).createPlaylist(parsed.name);
}

export async function renamePlaylistAction(formData: FormData) {
  const parsed = playlistSchema.parse({ name: String(formData.get("name") ?? "") });
  await (await svc()).renamePlaylist(String(formData.get("id") ?? ""), parsed.name);
}

export async function removePlaylistAction(formData: FormData) {
  await (await svc()).removePlaylist(String(formData.get("id") ?? ""));
}

export async function setVideoPlaylistAction(formData: FormData) {
  const raw = String(formData.get("playlistId") ?? "");
  await (await svc()).setVideoPlaylist(String(formData.get("videoId") ?? ""), raw === "" ? null : raw);
}
