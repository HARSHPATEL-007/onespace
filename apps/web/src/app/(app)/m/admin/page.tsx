import { redirect } from "next/navigation";
import { AdminService } from "@n0va/modules-admin/server";
import { GovernancePanel } from "@n0va/modules-admin/components";
import { requireWorkspace } from "@/lib/context";
import { rankOf } from "@n0va/authz";
import { setPolicyAction, resetModuleAction, setModuleStatusAction } from "./actions";

export default async function AdminPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  if (rankOf(role) < 3) redirect("/launcher");

  const svc = new AdminService(workspaceId, userId, role);
  const [policies, settings] = await Promise.all([svc.policies(), svc.moduleSettings()]);

  return (
    <GovernancePanel
      policies={policies}
      settings={settings}
      actions={{ setPolicy: setPolicyAction, resetModule: resetModuleAction, setModuleStatus: setModuleStatusAction }}
    />
  );
}
