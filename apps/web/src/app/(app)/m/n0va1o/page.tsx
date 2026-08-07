import { N0va1oService } from "@n0va/modules-n0va1o/server";
import { Integrations } from "@n0va/modules-n0va1o/components";
import { requireWorkspace } from "@/lib/context";
import {
  connectIntegrationAction,
  syncIntegrationAction,
  toggleIntegrationAction,
  removeIntegrationAction,
  integrationActivityAction,
  updateIntegrationAction,
  rotateWebhookAction,
  setRetentionAction,
  rotateMcpKeyAction,
  cleanupLogsAction,
  accessRequestsAction,
  decideAccessAction,
} from "./actions";

export default async function N0va1oPage() {
  const { workspaceId, userId, role, workspace } = await requireWorkspace();
  const svc = new N0va1oService(workspaceId, userId, role);
  const [integrations, settings, requests] = await Promise.all([
    svc.list(),
    svc.settings(),
    svc.accessRequests(),
  ]);

  return (
    <Integrations
      integrations={integrations}
      settings={settings}
      workspaceSlug={workspace.slug}
      requests={requests}
      role={role}
      actions={{
        connect: connectIntegrationAction,
        sync: syncIntegrationAction,
        toggle: toggleIntegrationAction,
        remove: removeIntegrationAction,
        activity: integrationActivityAction,
        update: updateIntegrationAction,
        rotateWebhook: rotateWebhookAction,
        setRetention: setRetentionAction,
        rotateMcpKey: rotateMcpKeyAction,
        cleanup: cleanupLogsAction,
        accessRequests: accessRequestsAction,
        decideAccess: decideAccessAction,
      }}
    />
  );
}