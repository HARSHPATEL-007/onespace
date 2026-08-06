"use server";

import { HrService, employeeSchema, leaveSchema } from "@n0va/modules-hr/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new HrService(workspaceId, userId, role);
};

export async function addEmployeeAction(formData: FormData) {
  const parsed = employeeSchema.parse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? "Engineering"),
    title: String(formData.get("title") ?? "Individual Contributor"),
  });
  await (await svc()).addEmployee(parsed);
}

export async function setEmployeeStatusAction(formData: FormData) {
  await (await svc()).setEmployeeStatus(String(formData.get("id") ?? ""), String(formData.get("status") ?? ""));
}

export async function removeEmployeeAction(formData: FormData) {
  await (await svc()).removeEmployee(String(formData.get("id") ?? ""));
}

export async function requestLeaveAction(formData: FormData) {
  const parsed = leaveSchema.parse({
    employeeId: String(formData.get("employeeId") ?? ""),
    kind: String(formData.get("kind") ?? "VACATION"),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
  });
  await (await svc()).requestLeave(parsed);
}

export async function decideLeaveAction(formData: FormData) {
  await (await svc()).decideLeave(String(formData.get("id") ?? ""), formData.get("approved") === "true");
}

export async function removeLeaveAction(formData: FormData) {
  await (await svc()).removeLeave(String(formData.get("id") ?? ""));
}
