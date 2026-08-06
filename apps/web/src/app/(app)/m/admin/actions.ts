"use server";

import { AdminService } from "@n0va/modules-admin/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AdminService(workspaceId, userId, role);
};

export async function setPolicyAction(formData: FormData) {
  await (
    await svc()
  ).setPolicy(
    String(formData.get("module") ?? ""),
    String(formData.get("role") ?? "") as never,
    String(formData.get("action") ?? ""),
    formData.get("allowed") === "true",
  );
}

export async function resetModuleAction(formData: FormData) {
  await (await svc()).resetModule(String(formData.get("module") ?? ""));
}

export async function logModuleStatusAction(formData: FormData) {
  await (await svc()).setModuleStatus(String(formData.get("module") ?? ""), "live");
}
