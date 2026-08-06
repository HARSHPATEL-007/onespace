"use server";

import { KeepService, noteInputSchema } from "@n0va/modules-keep/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new KeepService(ctx.workspaceId, ctx.userId, ctx.role);
}

function parseNote(formData: FormData) {
  const labels = String(formData.get("labels") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return noteInputSchema.parse({
    title: formData.get("title") ?? "",
    body: formData.get("body") ?? "",
    color: formData.get("color") ?? "default",
    pinned: false,
    labels,
  });
}

export async function createNoteAction(formData: FormData) {
  await (await svc()).create(parseNote(formData));
}

export async function updateNoteAction(formData: FormData) {
  const service = await svc();
  await service.update(String(formData.get("id")), parseNote(formData));
}

export async function togglePinNoteAction(formData: FormData) {
  await (await svc()).togglePin(String(formData.get("id")));
}

export async function archiveNoteAction(formData: FormData) {
  const service = await svc();
  await service.archive(String(formData.get("id")), true);
}

export async function restoreNoteAction(formData: FormData) {
  const service = await svc();
  await service.archive(String(formData.get("id")), false);
}

export async function deleteNoteAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id")));
}