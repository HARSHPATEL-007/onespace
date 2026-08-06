import { PicsService } from "@n0va/modules-pics/server";
import { PicsApp } from "@n0va/modules-pics/components";
import { requireWorkspace } from "@/lib/context";
import { createAlbumAction, deleteAlbumAction, deletePhotoAction, movePhotoAction } from "./actions";

export default async function PicsPage({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const { a } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new PicsService(workspaceId, userId, role);

  const [albums, photos] = await Promise.all([
    svc.albums(),
    svc.photos(a && a !== "all" ? a : null),
  ]);
  const activeAlbumId = a && a !== "all" ? a : null;

  return (
    <PicsApp
      albums={albums}
      photos={photos}
      activeAlbumId={activeAlbumId}
      actions={{
        createAlbum: createAlbumAction,
        removeAlbum: deleteAlbumAction,
        removePhoto: deletePhotoAction,
        movePhoto: movePhotoAction,
      }}
    />
  );
}
