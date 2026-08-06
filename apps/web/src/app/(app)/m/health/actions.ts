"use server";

import { HealthService, checkinSchema } from "@n0va/modules-health/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new HealthService(workspaceId, userId, role);
};

export async function createCheckinAction(formData: FormData) {
  const parsed = checkinSchema.parse({
    mood: String(formData.get("mood") ?? "OK"),
    energy: String(formData.get("energy") ?? "OK"),
    sleepHours: String(formData.get("sleepHours") ?? "7"),
    note: String(formData.get("note") ?? ""),
  });
  await (await svc()).create(parsed);
}

export async function removeCheckinAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
