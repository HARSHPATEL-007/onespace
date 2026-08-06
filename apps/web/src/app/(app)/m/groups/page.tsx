import { GroupsService } from "@n0va/modules-groups/server";
import { GroupsList } from "@n0va/modules-groups/components";
import { requireWorkspace } from "@/lib/context";
import { createGroupAction, deleteGroupAction, addGroupMemberAction, removeGroupMemberAction } from "./actions";

export default async function GroupsPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new GroupsService(workspaceId, userId, role);
  const groups = await svc.list();

  return (
    <GroupsList
      groups={groups}
      actions={{
        create: createGroupAction,
        remove: deleteGroupAction,
        addMember: addGroupMemberAction,
        removeMember: removeGroupMemberAction,
      }}
    />
  );
}
