"use server";

import { FinanceService, invoiceSchema } from "@n0va/modules-finance/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new FinanceService(workspaceId, userId, role);
};

export async function createInvoiceAction(formData: FormData) {
  const parsed = invoiceSchema.parse({
    number: String(formData.get("number") ?? ""),
    customer: String(formData.get("customer") ?? ""),
    amountCents: String(formData.get("amountCents") ?? "0"),
    currency: String(formData.get("currency") ?? "USD"),
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
  });
  await (await svc()).create(parsed);
}

export async function markSentAction(formData: FormData) {
  await (await svc()).markSent(String(formData.get("id") ?? ""));
}

export async function markPaidAction(formData: FormData) {
  await (await svc()).markPaid(String(formData.get("id") ?? ""));
}

export async function removeInvoiceAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
