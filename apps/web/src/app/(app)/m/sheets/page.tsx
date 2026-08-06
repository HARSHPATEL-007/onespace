import { SheetsService } from "@n0va/modules-sheets/server";
import { WorkbookList } from "@n0va/modules-sheets/components";
import { requireWorkspace } from "@/lib/context";
import { createWorkbookAction, renameWorkbookAction, deleteWorkbookAction } from "./actions";

export default async function SheetsPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new SheetsService(workspaceId, userId, role);
  const workbooks = await svc.list();

  return (
    <WorkbookList
      workbooks={workbooks}
      actions={{
        create: createWorkbookAction,
        rename: renameWorkbookAction,
        remove: deleteWorkbookAction,
      }}
    />
  );
}
