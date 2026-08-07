"use server";

import { N0va1oService, integrationSchema } from "@n0va/modules-n0va1o/server";
import type { IntegrationLog } from "@n0va/db";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new N0va1oService(workspaceId, userId, role);
};

export async function connectIntegrationAction(formData: FormData) {
  const parsed = integrationSchema.parse({
    provider: String(formData.get("provider") ?? "custom"),
    name: String(formData.get("name") ?? ""),
    token: String(formData.get("token") ?? ""),
  });
  await (await svc()).connect(parsed);
}

export async function syncIntegrationAction(formData: FormData) {
  return (await svc()).sync(String(formData.get("id") ?? ""));
}

export async function toggleIntegrationAction(formData: FormData) {
  await (await svc()).toggle(String(formData.get("id") ?? ""), formData.get("enabled") === "true");
}

export async function removeIntegrationAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function integrationActivityAction(formData: FormData): Promise<IntegrationLog[]> {
  return (await svc()).activity(String(formData.get("id") ?? ""));
}
