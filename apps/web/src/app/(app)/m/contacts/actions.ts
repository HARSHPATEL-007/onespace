"use server";

import { ContactService, contactInputSchema } from "@n0va/modules-contacts/server";
import { actionContext } from "@/lib/action-context";

function parseContact(formData: FormData) {
  const labels = String(formData.get("labels") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return contactInputSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName") || null,
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    company: formData.get("company") || null,
    title: formData.get("title") || null,
    notes: formData.get("notes") || null,
    labels,
    isFavorite: formData.get("isFavorite") === "true",
  });
}

async function service() {
  const ctx = await actionContext();
  return { ctx, svc: new ContactService(ctx.workspaceId, ctx.userId, ctx.role) };
}

export async function createContact(formData: FormData) {
  const { svc } = await service();
  await svc.create(parseContact(formData));
}

export async function updateContact(formData: FormData) {
  const { svc } = await service();
  const id = String(formData.get("id"));
  await svc.update(id, parseContact(formData));
}

export async function removeContact(formData: FormData) {
  const { svc } = await service();
  await svc.remove(String(formData.get("id")));
}

export async function toggleFavoriteContact(formData: FormData) {
  const { svc } = await service();
  await svc.toggleFavorite(String(formData.get("id")));
}