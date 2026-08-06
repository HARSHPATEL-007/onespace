import { OpsService } from "@n0va/modules-operations-teams/server";
import { OpsCenter } from "@n0va/modules-operations-teams/components";
import { requireWorkspace } from "@/lib/context";
import { createRunbookAction, setRunbookStatusAction, removeRunbookAction, createIncidentAction, advanceIncidentAction, removeIncidentAction } from "./actions";

export default async function OperationsPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new OpsService(workspaceId, userId, role);
  const [runbooks, incidents] = await Promise.all([svc.runbooks(), svc.incidents()]);

  return (
    <OpsCenter
      runbooks={runbooks}
      incidents={incidents}
      actions={{
        createRunbook: createRunbookAction,
        setRunbookStatus: setRunbookStatusAction,
        removeRunbook: removeRunbookAction,
        createIncident: createIncidentAction,
        advanceIncident: advanceIncidentAction,
        removeIncident: removeIncidentAction,
      }}
    />
  );
}
