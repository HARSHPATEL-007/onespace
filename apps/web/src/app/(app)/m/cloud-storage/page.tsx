import { StorageService } from "@n0va/modules-storage/server";
import { StorageApp, TrashApp } from "@n0va/modules-storage/components";
import { requireWorkspace } from "@/lib/context";
import {
  createFolderAction,
  moveItemAction,
  purgeItemAction,
  renameItemAction,
  restoreItemAction,
  trashItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; view?: string }>;
}) {
  const { folder, view } = await searchParams;
  const ctx = await requireWorkspace();
  const svc = new StorageService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  if (view === "trash") {
    const items = await svc.listTrash();
    return (
      <TrashApp
        items={items}
        actions={{ createFolder: createFolderAction, rename: renameItemAction, move: moveItemAction, trash: trashItemAction, restore: restoreItemAction, purge: purgeItemAction }}
      />
    );
  }

  const parentId = folder ?? null;
  const [items, crumbs, folderTargets] = await Promise.all([
    svc.list(parentId),
    svc.breadcrumbs(parentId),
    svc.list(null),
  ]);

  return (
    <StorageApp
      items={items}
      crumbs={crumbs}
      parentId={parentId}
      folderTargets={folderTargets.filter((f) => f.isFolder)}
      actions={{ createFolder: createFolderAction, rename: renameItemAction, move: moveItemAction, trash: trashItemAction, restore: restoreItemAction, purge: purgeItemAction }}
    />
  );
}