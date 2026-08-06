"use server";

import { LearningService, learningSetSchema, learningItemSchema } from "@n0va/modules-booklm/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new LearningService(workspaceId, userId, role);
};

export async function createLearningSetAction(formData: FormData) {
  const { title, description } = learningSetSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  return (await svc()).create(title, description);
}

export async function updateLearningSetAction(formData: FormData) {
  const setId = String(formData.get("setId") ?? "");
  const { title, description } = learningSetSchema.parse({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  await (await svc()).updateMeta(setId, title, description);
}

export async function removeLearningSetAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("setId") ?? ""));
}

export async function addLearningItemAction(formData: FormData) {
  const setId = String(formData.get("setId") ?? "");
  const parsed = learningItemSchema.parse({
    kind: String(formData.get("kind") ?? "LINK"),
    title: String(formData.get("title") ?? ""),
    source: String(formData.get("source") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    refId: String(formData.get("refId") ?? "") || undefined,
  });
  await (await svc()).addItem(setId, parsed);
}

export async function removeLearningItemAction(formData: FormData) {
  await (await svc()).removeItem(String(formData.get("setId") ?? ""), String(formData.get("itemId") ?? ""));
}

export async function moveLearningItemAction(formData: FormData) {
  await (await svc()).moveItem(
    String(formData.get("setId") ?? ""),
    String(formData.get("itemId") ?? ""),
    formData.get("dir") === "up" ? "up" : "down",
  );
}
