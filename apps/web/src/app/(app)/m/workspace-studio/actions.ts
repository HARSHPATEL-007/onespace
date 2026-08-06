"use server";

import { StudioService, automationSchema } from "@n0va/modules-workspace-studio/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new StudioService(workspaceId, userId, role);
};

export async function createAutomationAction(formData: FormData) {
  const parsed = automationSchema.parse({
    name: String(formData.get("name") ?? ""),
    trigger: String(formData.get("trigger") ?? "MANUAL"),
    action: String(formData.get("action") ?? "LOG"),
    config: String(formData.get("config") ?? "{}"),
  });
  await (await svc()).create(parsed);
}

export async function toggleAutomationAction(formData: FormData) {
  await (await svc()).toggle(String(formData.get("id") ?? ""), formData.get("enabled") === "true");
}

export async function removeAutomationAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function runAutomationAction(formData: FormData) {
  return (await svc()).run(String(formData.get("id") ?? ""));
}
