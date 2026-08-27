"use server";

import { VideosService, playlistSchema, videoSchema, projectSchema, exportPresetSchema } from "@n0va/modules-videos/server";
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

export async function createProjectAction(formData: FormData) {
  const parsed = projectSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    status: (String(formData.get("status") ?? "DRAFT") as "DRAFT"),
    priority: (String(formData.get("priority") ?? "medium") as "medium"),
    category: String(formData.get("category") ?? "general"),
    tags: [],
    resolution: (String(formData.get("resolution") ?? "1080p") as "1080p"),
  });
  await (await svc()).createProject(parsed);
}

export async function deleteProjectAction(formData: FormData) {
  await (await svc()).deleteProject(String(formData.get("id") ?? ""));
}

export async function createExportAction(formData: FormData) {
  const preset = String(formData.get("preset") ?? "youtube_1080");
  const parsed = exportPresetSchema.parse({ preset: preset as "youtube_1080", hdr: String(formData.get("hdr") ?? "sdr") as "sdr" });
  await (await svc()).createExport({ ...parsed, projectId: String(formData.get("projectId") ?? "") || undefined });
}

export async function generateAIAction(formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "");
  if (!prompt) throw new Error("Prompt required");
  await (await svc()).generateVideoAI({ prompt, style: "cinematic", durationSec: 30, resolution: "1080p", cameraMovement: "static" });
}
