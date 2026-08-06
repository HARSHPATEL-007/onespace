"use server";

import { CampaignService, campaignSchema } from "@n0va/modules-ads-marketing/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new CampaignService(workspaceId, userId, role);
};

export async function createCampaignAction(formData: FormData) {
  const parsed = campaignSchema.parse({
    name: String(formData.get("name") ?? ""),
    channel: String(formData.get("channel") ?? "SOCIAL"),
    budgetCents: String(formData.get("budgetCents") ?? "0"),
  });
  await (await svc()).create(parsed);
}

export async function setCampaignStatusAction(formData: FormData) {
  await (await svc()).setStatus(String(formData.get("id") ?? ""), String(formData.get("status") ?? ""));
}

export async function simulateCampaignAction(formData: FormData) {
  await (await svc()).simulate(String(formData.get("id") ?? ""));
}

export async function removeCampaignAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
