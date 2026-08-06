"use server";

import { SalesService, dealSchema } from "@n0va/modules-sales/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new SalesService(workspaceId, userId, role);
};

export async function createDealAction(formData: FormData) {
  const parsed = dealSchema.parse({
    title: String(formData.get("title") ?? ""),
    company: String(formData.get("company") ?? ""),
    valueCents: String(formData.get("valueCents") ?? "0"),
    stage: String(formData.get("stage") ?? "LEAD"),
  });
  await (await svc()).create(parsed);
}

export async function setDealStageAction(formData: FormData) {
  await (await svc()).setStage(String(formData.get("id") ?? ""), String(formData.get("stage") ?? ""));
}

export async function removeDealAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
