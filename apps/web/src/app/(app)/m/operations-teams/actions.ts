"use server";

import { OpsService, runbookSchema, incidentSchema } from "@n0va/modules-operations-teams/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new OpsService(workspaceId, userId, role);
};

export async function createRunbookAction(formData: FormData) {
  const parsed = runbookSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    steps: String(formData.get("steps") ?? ""),
  });
  await (await svc()).createRunbook(parsed);
}

export async function setRunbookStatusAction(formData: FormData) {
  await (await svc()).setRunbookStatus(String(formData.get("id") ?? ""), String(formData.get("status") ?? ""));
}

export async function removeRunbookAction(formData: FormData) {
  await (await svc()).removeRunbook(String(formData.get("id") ?? ""));
}

export async function createIncidentAction(formData: FormData) {
  const parsed = incidentSchema.parse({
    title: String(formData.get("title") ?? ""),
    severity: String(formData.get("severity") ?? "SEV3"),
  });
  await (await svc()).createIncident(parsed);
}

export async function advanceIncidentAction(formData: FormData) {
  await (await svc()).advanceIncident(String(formData.get("id") ?? ""));
}

export async function removeIncidentAction(formData: FormData) {
  await (await svc()).removeIncident(String(formData.get("id") ?? ""));
}
