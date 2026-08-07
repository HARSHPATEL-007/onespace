"use server";

import { GroupsService, groupSchema } from "@n0va/modules-groups/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new GroupsService(workspaceId, userId, role);
};

export async function createGroupAction(formData: FormData) {
  const parsed = groupSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await (await svc()).create(parsed);
}

export async function updateGroupAction(formData: FormData) {
  const parsed = groupSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await (await svc()).update(String(formData.get("id") ?? ""), parsed);
}

export async function deleteGroupAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function addGroupMemberAction(formData: FormData) {
  await (await svc()).addMember(String(formData.get("groupId") ?? ""), String(formData.get("userId") ?? ""));
}

export async function removeGroupMemberAction(formData: FormData) {
  await (await svc()).removeMember(String(formData.get("groupId") ?? ""), String(formData.get("userId") ?? ""));
}
