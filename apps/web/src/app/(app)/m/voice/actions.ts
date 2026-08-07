"use server";

import { VoiceService, callLogSchema, callNoteSchema, callIdSchema } from "@n0va/modules-voice/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new VoiceService(workspaceId, userId, role);
};

export async function logCallAction(formData: FormData) {
  const parsed = callLogSchema.parse({
    direction: String(formData.get("direction") ?? "OUT"),
    number: String(formData.get("number") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    durationSec: Number(formData.get("durationSec") ?? 0),
    status: String(formData.get("status") ?? "completed"),
  });
  await (await svc()).log(parsed);
}

export async function clearCallsAction() {
  await (await svc()).clear();
}

export async function toggleFavoriteAction(formData: FormData) {
  const id = callIdSchema.parse(String(formData.get("id") ?? ""));
  await (await svc()).toggleFavorite(id);
}

export async function setCallNoteAction(formData: FormData) {
  const { id, note } = callNoteSchema.parse({
    id: String(formData.get("id") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  await (await svc()).setNote(id, note);
}
