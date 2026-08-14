import { StorageService } from "@n0va/modules-storage/server";
import { StorageApp, TrashApp } from "@n0va/modules-storage/components";
import { requireWorkspace } from "@/lib/context";
import {
  acknowledgeHoldAction,
  approveVersionAction,
  checkInAction,
  checkOutAction,
  createFolderAction,
  evidencePackAction,
  exportLogsCsvAction,
  issueHoldNoticeAction,
  listHoldsAction,
  metricsAction,
  moveItemAction,
  placeHoldAction,
  purgeItemAction,
  releaseHoldAction,
  renameItemAction,
  restoreItemAction,
  restoreVersionAction,
  setRestrictedDownloadAction,
  trashItemAction,
  versionsItemAction,
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

  const storageActions = {
    createFolder: createFolderAction,
    rename: renameItemAction,
    move: moveItemAction,
    trash: trashItemAction,
    restore: restoreItemAction,
    purge: purgeItemAction,
    versions: versionsItemAction,
    restoreVersion: restoreVersionAction,
    approve: approveVersionAction,
    placeHold: placeHoldAction,
    releaseHold: releaseHoldAction,
    listHolds: listHoldsAction,
    evidencePack: evidencePackAction,
    checkOut: checkOutAction,
    checkIn: checkInAction,
    setRestrictedDownload: setRestrictedDownloadAction,
    issueHoldNotice: issueHoldNoticeAction,
    acknowledgeHold: acknowledgeHoldAction,
    exportLogs: exportLogsCsvAction,
    metrics: metricsAction,
  };

  if (view === "trash") {
    const items = await svc.listTrash();
    return (
      <TrashApp
        items={items}
        actions={storageActions}
      />
    );
  }

  const parentId = folder ?? null;
  const [items, crumbs, folderTargets, metrics] = await Promise.all([
    svc.list(parentId),
    svc.breadcrumbs(parentId),
    svc.list(null),
    svc.storageMetrics(),
  ]);

  return (
    <StorageApp
      items={items}
      crumbs={crumbs}
      parentId={parentId}
      folderTargets={folderTargets.filter((f) => f.isFolder)}
      actions={storageActions}
      metrics={metrics}
    />
  );
}