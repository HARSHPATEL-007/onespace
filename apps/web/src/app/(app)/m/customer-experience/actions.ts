"use server";

import { CxService, ticketSchema } from "@n0va/modules-customer-experience/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new CxService(workspaceId, userId, role);
};

export async function createTicketAction(formData: FormData) {
  const parsed = ticketSchema.parse({
    requesterName: String(formData.get("requesterName") ?? ""),
    requesterEmail: String(formData.get("requesterEmail") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    description: String(formData.get("description") ?? ""),
    priority: String(formData.get("priority") ?? "MEDIUM"),
  });
  await (await svc()).create(parsed);
}

export async function setTicketStatusAction(formData: FormData) {
  await (await svc()).setStatus(String(formData.get("id") ?? ""), String(formData.get("status") ?? ""));
}

export async function setTicketPriorityAction(formData: FormData) {
  await (await svc()).setPriority(String(formData.get("id") ?? ""), String(formData.get("priority") ?? ""));
}

export async function replyTicketAction(formData: FormData) {
  await (await svc()).reply(String(formData.get("id") ?? ""), String(formData.get("body") ?? ""));
}

export async function removeTicketAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
