"use server";

import { LegalService, legalDocSchema } from "@n0va/modules-legal/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new LegalService(workspaceId, userId, role);
};

export async function createLegalDocAction(formData: FormData) {
  const parsed = legalDocSchema.parse({
    title: String(formData.get("title") ?? ""),
    kind: String(formData.get("kind") ?? "CONTRACT"),
    content: String(formData.get("content") ?? ""),
  });
  await (await svc()).create(parsed);
}

export async function advanceLegalStatusAction(formData: FormData) {
  await (await svc()).advanceStatus(String(formData.get("id") ?? ""));
}

export async function removeLegalDocAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
