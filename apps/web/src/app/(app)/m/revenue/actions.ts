"use server";

import { RevenueService, subscriptionSchema, paymentSchema } from "@n0va/modules-revenue/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new RevenueService(workspaceId, userId, role);
};

export async function createSubscriptionAction(formData: FormData) {
  const parsed = subscriptionSchema.parse({
    plan: String(formData.get("plan") ?? ""),
    mrrCents: String(formData.get("mrrCents") ?? "0"),
    status: String(formData.get("status") ?? "TRIAL"),
  });
  await (await svc()).createSubscription(parsed);
}

export async function setSubscriptionStatusAction(formData: FormData) {
  await (await svc()).setSubscriptionStatus(String(formData.get("id") ?? ""), String(formData.get("status") ?? ""));
}

export async function removeSubscriptionAction(formData: FormData) {
  await (await svc()).removeSubscription(String(formData.get("id") ?? ""));
}

export async function recordPaymentAction(formData: FormData) {
  const parsed = paymentSchema.parse({
    subscriptionId: String(formData.get("subscriptionId") ?? "") || undefined,
    amountCents: String(formData.get("amountCents") ?? "0"),
    method: String(formData.get("method") ?? "card"),
    status: String(formData.get("status") ?? "SUCCEEDED"),
  });
  await (await svc()).recordPayment(parsed);
}

export async function removePaymentAction(formData: FormData) {
  await (await svc()).removePayment(String(formData.get("id") ?? ""));
}
