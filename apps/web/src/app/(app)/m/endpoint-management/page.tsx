import { EndpointService } from "@n0va/modules-endpoint-management/server";
import { Endpoints } from "@n0va/modules-endpoint-management/components";
import { requireWorkspace } from "@/lib/context";
import { enrollDeviceAction, revokeDeviceAction, reinstateDeviceAction, removeDeviceAction } from "./actions";

export default async function EndpointManagementPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new EndpointService(workspaceId, userId, role);
  const devices = await svc.list();

  return (
    <Endpoints
      devices={devices}
      actions={{ enroll: enrollDeviceAction, revoke: revokeDeviceAction, reinstate: reinstateDeviceAction, remove: removeDeviceAction }}
    />
  );
}
