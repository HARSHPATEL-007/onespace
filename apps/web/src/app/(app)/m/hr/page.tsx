import { HrService } from "@n0va/modules-hr/server";
import { PeopleDirectory } from "@n0va/modules-hr/components";
import { requireWorkspace } from "@/lib/context";
import { addEmployeeAction, setEmployeeStatusAction, removeEmployeeAction, requestLeaveAction, decideLeaveAction, removeLeaveAction } from "./actions";

export default async function HrPage() {
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new HrService(workspaceId, userId, role);
  const employees = await svc.employees();

  return (
    <PeopleDirectory
      employees={employees}
      actions={{
        addEmployee: addEmployeeAction,
        setEmployeeStatus: setEmployeeStatusAction,
        removeEmployee: removeEmployeeAction,
        requestLeave: requestLeaveAction,
        decideLeave: decideLeaveAction,
        removeLeave: removeLeaveAction,
      }}
    />
  );
}
