import { notFound } from "next/navigation";
import { GroupsService } from "@n0va/modules-groups/server";
import { GroupDetail } from "@n0va/modules-groups/components";
import { requireWorkspace } from "@/lib/context";
import { updateGroupAction, addGroupMemberAction, removeGroupMemberAction } from "../actions";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new GroupsService(workspaceId, userId, role);

  let group;
  try {
    group = await svc.get(id);
  } catch {
    notFound();
  }
  const users = await svc.workspaceUsers();

  return (
    <GroupDetail
      group={group}
      members={group.members}
      users={users}
      actions={{
        update: updateGroupAction,
        addMember: addGroupMemberAction,
        removeMember: removeGroupMemberAction,
      }}
    />
  );
}
