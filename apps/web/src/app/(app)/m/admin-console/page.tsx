import { redirect } from "next/navigation";
import { AdminConsoleService } from "@n0va/modules-admin-console/server";
import { AdminConsole } from "@n0va/modules-admin-console/components";
import { requireWorkspace } from "@/lib/context";
import { rankOf } from "@n0va/authz";
import { setMemberRoleAction, inviteMemberAction, removeMemberAction, setSecurityAction } from "./actions";

export default async function AdminConsolePage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  if (rankOf(role) < 3) redirect("/launcher");

  const svc = new AdminConsoleService(workspaceId, userId, role);
  const [members, auditLog, security] = await Promise.all([svc.members(), svc.auditLog(), svc.security()]);

  return (
    <AdminConsole
      members={members}
      auditLog={auditLog}
      security={security}
      actions={{ setRole: setMemberRoleAction, invite: inviteMemberAction, removeMember: removeMemberAction, setSecurity: setSecurityAction }}
    />
  );
}
