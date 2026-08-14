"use server";

import { StorageService } from "@n0va/modules-storage/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new StorageService(ctx.workspaceId, ctx.userId, ctx.role);
}

export async function createFolderAction(formData: FormData) {
  const service = await svc();
  const name = String(formData.get("name") ?? "").trim();
  const parent = String(formData.get("parentId") ?? "");
  await service.createFolder(name, parent ? parent : null);
}

export async function renameItemAction(formData: FormData) {
  const service = await svc();
  await service.rename(
    String(formData.get("id")),
    String(formData.get("name") ?? "").trim(),
  );
}

export async function moveItemAction(formData: FormData) {
  const service = await svc();
  const parent = String(formData.get("parentId") ?? "");
  await service.move(String(formData.get("id")), parent ? parent : null);
}

export async function trashItemAction(formData: FormData) {
  const service = await svc();
  await service.trash(String(formData.get("id")));
}

export async function restoreItemAction(formData: FormData) {
  const service = await svc();
  await service.restore(String(formData.get("id")));
}

export async function purgeItemAction(formData: FormData) {
  const service = await svc();
  await service.purge(String(formData.get("id")));
}

export async function versionsItemAction(formData: FormData) {
  const service = await svc();
  return service.versions(String(formData.get("id")));
}

export async function restoreVersionAction(formData: FormData) {
  const service = await svc();
  return service.restoreVersion(
    String(formData.get("id")),
    Number(formData.get("versionNumber")),
    String(formData.get("changeSummary") ?? "") || null,
  );
}

export async function approveVersionAction(formData: FormData) {
  const service = await svc();
  return service.setApproval({
    itemId: String(formData.get("id")),
    versionNumber: Number(formData.get("versionNumber")),
    approval: String(formData.get("approval")),
    note: String(formData.get("note") ?? "") || undefined,
  });
}

export async function placeHoldAction(formData: FormData) {
  const service = await svc();
  return service.placeLegalHold({
    scope: String(formData.get("scope") ?? "FILE"),
    objectId: String(formData.get("objectId") ?? "") || null,
    matterName: String(formData.get("matterName") ?? "") || null,
    reason: String(formData.get("reason") ?? ""),
  });
}

export async function releaseHoldAction(formData: FormData) {
  const service = await svc();
  return service.releaseLegalHold(String(formData.get("holdId")), String(formData.get("note") ?? "") || null);
}

export async function listHoldsAction() {
  const service = await svc();
  return service.listLegalHolds();
}

export async function reindexItemAction(formData: FormData) {
  const service = await svc();
  return service.reindex(String(formData.get("id")));
}

export async function evidencePackAction(formData: FormData) {
  const service = await svc();
  return service.evidencePack(String(formData.get("id")));
}

export async function relevanceAction(formData: FormData) {
  const service = await svc();
  return service.relevanceScore(String(formData.get("id")), String(formData.get("query") ?? "") || null);
}

export async function checkOutAction(formData: FormData) {
  const service = await svc();
  return service.checkOut(String(formData.get("id")));
}

export async function checkInAction(formData: FormData) {
  const service = await svc();
  return service.checkIn(String(formData.get("id")));
}

export async function setRestrictedDownloadAction(formData: FormData) {
  const service = await svc();
  return service.setRestrictedDownload(String(formData.get("id")), formData.get("restricted") === "1");
}

export async function issueHoldNoticeAction(formData: FormData) {
  const service = await svc();
  return service.issueHoldNotice(String(formData.get("holdId")));
}

export async function acknowledgeHoldAction(formData: FormData) {
  const service = await svc();
  return service.acknowledgeHold(String(formData.get("holdId")));
}

export async function metricsAction() {
  const service = await svc();
  return service.storageMetrics();
}

export async function exportLogsCsvAction(formData: FormData) {
  const service = await svc();
  return service.exportAccessLogsCsv({
    itemId: String(formData.get("itemId") ?? "") || undefined,
    action: String(formData.get("action") ?? "") || undefined,
    from: String(formData.get("from") ?? "") || undefined,
    to: String(formData.get("to") ?? "") || undefined,
  });
}