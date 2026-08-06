import { VideosService } from "@n0va/modules-videos/server";
import { VideoLibrary } from "@n0va/modules-videos/components";
import { requireWorkspace } from "@/lib/context";
import { addVideoAction, deleteVideoAction } from "./actions";

export default async function VideosPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new VideosService(workspaceId, userId, role);
  const videos = await svc.list();

  return (
    <VideoLibrary
      videos={videos}
      actions={{
        create: addVideoAction,
        remove: deleteVideoAction,
      }}
    />
  );
}
