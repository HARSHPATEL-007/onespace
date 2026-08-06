"use server";

import { CalendarService, eventInputSchema } from "@n0va/modules-calendar/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new CalendarService(ctx.workspaceId, ctx.userId, ctx.role);
}

function parseEvent(formData: FormData) {
  const attendees = String(formData.get("attendees") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let endAt = String(formData.get("endAt") ?? "");
  const startAt = String(formData.get("startAt") ?? "");
  if (!endAt) endAt = startAt;

  return eventInputSchema.parse({
    title: formData.get("title"),
    description: String(formData.get("description") ?? "") || null,
    location: String(formData.get("location") ?? "") || null,
    startAt,
    endAt,
    allDay: false,
    attendees,
  });
}

export async function createEventAction(formData: FormData) {
  await (await svc()).create(parseEvent(formData));
}

export async function updateEventAction(formData: FormData) {
  const service = await svc();
  await service.update(String(formData.get("id")), parseEvent(formData));
}

export async function deleteEventAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id")));
}