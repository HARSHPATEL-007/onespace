import { StudioService } from "@n0va/modules-workspace-studio/server";
import { Studio } from "@n0va/modules-workspace-studio/components";
import { requireWorkspace } from "@/lib/context";
import { createAutomationAction, toggleAutomationAction, removeAutomationAction, runAutomationAction } from "./actions";

export default async function StudioPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new StudioService(workspaceId, userId, role);
  const automations = await svc.list();

  return (
    <Studio
      automations={automations}
      actions={{
        create: createAutomationAction,
        toggle: toggleAutomationAction,
        remove: removeAutomationAction,
        run: runAutomationAction,
      }}
    />
  );
}
