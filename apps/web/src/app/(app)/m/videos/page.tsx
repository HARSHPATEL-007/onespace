import { VideosService } from "@n0va/modules-videos/server";
import { VideoLibrary } from "@n0va/modules-videos/components";
import { requireWorkspace } from "@/lib/context";
import {
  addVideoAction,
  createPlaylistAction,
  deleteVideoAction,
  removePlaylistAction,
  renamePlaylistAction,
  setVideoPlaylistAction,
} from "./actions";

export default async function VideosPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VideosService(workspaceId, userId, role);
  const [videos, playlists] = await Promise.all([svc.list(), svc.playlists()]);

  return (
    <VideoLibrary
      videos={videos}
      playlists={playlists}
      actions={{
        create: addVideoAction,
        remove: deleteVideoAction,
        createPlaylist: createPlaylistAction,
        renamePlaylist: renamePlaylistAction,
        removePlaylist: removePlaylistAction,
        setVideoPlaylist: setVideoPlaylistAction,
      }}
    />
  );
}
