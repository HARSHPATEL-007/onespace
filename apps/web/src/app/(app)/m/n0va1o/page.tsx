import { N0va1oService } from "@n0va/modules-n0va1o/server";
import { Integrations } from "@n0va/modules-n0va1o/components";
import { requireWorkspace } from "@/lib/context";
import { connectIntegrationAction, syncIntegrationAction, toggleIntegrationAction, removeIntegrationAction, integrationActivityAction } from "./actions";

export default async function N0va1oPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new N0va1oService(workspaceId, userId, role);
  const integrations = await svc.list();

  return (
    <Integrations
      integrations={integrations}
      actions={{
        connect: connectIntegrationAction,
        sync: syncIntegrationAction,
        toggle: toggleIntegrationAction,
        remove: removeIntegrationAction,
        activity: integrationActivityAction,
      }}
    />
  );
}
