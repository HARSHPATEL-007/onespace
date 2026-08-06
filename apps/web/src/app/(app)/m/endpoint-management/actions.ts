"use server";

import { EndpointService, enrollSchema } from "@n0va/modules-endpoint-management/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new EndpointService(workspaceId, userId, role);
};

export async function enrollDeviceAction(formData: FormData) {
  const parsed = enrollSchema.parse({
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? "LAPTOP"),
    os: String(formData.get("os") ?? ""),
  });
  await (await svc()).enroll(parsed);
}

export async function revokeDeviceAction(formData: FormData) {
  await (await svc()).revoke(String(formData.get("id") ?? ""));
}

export async function reinstateDeviceAction(formData: FormData) {
  await (await svc()).reinstate(String(formData.get("id") ?? ""));
}

export async function removeDeviceAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
