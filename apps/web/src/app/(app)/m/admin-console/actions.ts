"use server";

import { AdminConsoleService, inviteSchema } from "@n0va/modules-admin-console/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AdminConsoleService(workspaceId, userId, role);
};

export async function setMemberRoleAction(formData: FormData) {
  await (
    await svc()
  ).setRole(String(formData.get("memberId") ?? ""), String(formData.get("role") ?? "") as never);
}

export async function inviteMemberAction(formData: FormData) {
  const parsed = inviteSchema.parse({
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? "MEMBER"),
  });
  const { email, temporaryPassword } = await (await svc()).invite(parsed);
  return `${email} / ${temporaryPassword}`;
}

export async function removeMemberAction(formData: FormData) {
  await (await svc()).removeMember(String(formData.get("memberId") ?? ""));
}

export async function setSecurityAction(formData: FormData) {
  await (
    await svc()
  ).setSecurity(formData.get("mfa") === "true", Number(formData.get("timeout") ?? 60));
}
