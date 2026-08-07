"use server";

import { VaultService, vaultEntrySchema } from "@n0va/modules-vault/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new VaultService(workspaceId, userId, role);
};

export async function createVaultEntryAction(formData: FormData) {
  const parsed = vaultEntrySchema.parse({
    name: String(formData.get("name") ?? ""),
    hint: String(formData.get("hint") ?? ""),
    value: String(formData.get("value") ?? ""),
    category: String(formData.get("category") ?? "general"),
    expiresAt: String(formData.get("expiresAt") ?? ""),
  });
  await (await svc()).create(parsed);
}

export async function revealVaultEntryAction(id: string) {
  return (await svc()).reveal(id);
}

export async function removeVaultEntryAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
