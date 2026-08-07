import { PicsService } from "@n0va/modules-pics/server";
import { PicsApp } from "@n0va/modules-pics/components";
import { requireWorkspace } from "@/lib/context";
import { createAlbumAction, deleteAlbumAction, deletePhotoAction, movePhotoAction, toggleFavoriteAction } from "./actions";

export default async function PicsPage({ searchParams }: { searchParams: Promise<{ a?: string; fav?: string }> }) {
  const { a, fav } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new PicsService(workspaceId, userId, role);

  const favoritesOnly = fav === "1";
  const [albums, photos] = await Promise.all([
    svc.albums(),
    svc.photos(favoritesOnly ? null : a && a !== "all" ? a : null, favoritesOnly),
  ]);
  const activeAlbumId = a && a !== "all" ? a : null;

  return (
    <PicsApp
      albums={albums}
      photos={photos}
      activeAlbumId={activeAlbumId}
      favoritesOnly={favoritesOnly}
      actions={{
        createAlbum: createAlbumAction,
        removeAlbum: deleteAlbumAction,
        removePhoto: deletePhotoAction,
        movePhoto: movePhotoAction,
        toggleFavorite: toggleFavoriteAction,
      }}
    />
  );
}
