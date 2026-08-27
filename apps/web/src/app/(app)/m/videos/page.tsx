import { VideosService } from "@n0va/modules-videos/server";
import { VideoStudioTranscendent } from "@n0va/modules-videos/components";
import { requireWorkspace } from "@/lib/context";
import {
  addVideoAction,
  createPlaylistAction,
  deleteVideoAction,
  removePlaylistAction,
  renamePlaylistAction,
  setVideoPlaylistAction,
  createProjectAction,
  deleteProjectAction,
  createExportAction,
  generateAIAction,
} from "./actions";

export default async function VideosPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VideosService(workspaceId, userId, role);
  const [videos, playlists, projects, assets] = await Promise.all([
    svc.list(),
    svc.playlists(),
    svc.listProjects({ limit: 20 }) as Promise<never[]>,
    svc.listAssets() as Promise<never[]>,
  ]);

  // Normalize projects to component shape
  const normalizedProjects = (projects as unknown as { id: string; title: string; description: string; status: string; priority: string; category: string; tags: string[]; resolution: string; timeline: unknown; updatedAt: Date; createdAt: Date; metadata: unknown }[]).map(p => ({
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    priority: p.priority,
    category: p.category,
    tags: p.tags ?? [],
    resolution: p.resolution ?? "1080p",
    timeline: p.timeline as never,
    updatedAt: p.updatedAt,
    createdAt: p.createdAt,
    metadata: p.metadata as Record<string, unknown>,
  }));

  const normalizedAssets = (assets as unknown as { id: string; filename: string; mimeType: string; sizeBytes: number; width: number|null; height: number|null; storageKey: string; createdAt: Date }[]).map(a => ({
    id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes, width: a.width, height: a.height, storageKey: a.storageKey, createdAt: a.createdAt,
  }));

  return (
    <VideoStudioTranscendent
      videos={videos}
      playlists={playlists}
      projects={normalizedProjects as never}
      assets={normalizedAssets as never}
      actions={{
        create: addVideoAction,
        remove: deleteVideoAction,
        createPlaylist: createPlaylistAction,
        renamePlaylist: renamePlaylistAction,
        removePlaylist: removePlaylistAction,
        setVideoPlaylist: setVideoPlaylistAction,
        createProject: createProjectAction,
        deleteProject: deleteProjectAction,
        createExport: createExportAction,
        generateAI: generateAIAction,
      }}
    />
  );
}
