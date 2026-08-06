"use server";

import { FormsService, formInputSchema } from "@n0va/modules-forms/server";
import { actionContext } from "@/lib/action-context";

async function svc() {
  const ctx = await actionContext();
  return new FormsService(ctx.workspaceId, ctx.userId, ctx.role);
}

function parseForm(formData: FormData) {
  const rawFields = String(formData.get("fields") ?? "[]");
  let fields: unknown;
  try {
    fields = JSON.parse(rawFields);
  } catch {
    return { error: "Invalid form structure" };
  }
  const parsed = formInputSchema.safeParse({
    name: formData.get("name"),
    description: String(formData.get("description") ?? ""),
    fields,
    published: formData.get("published") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid form" };
  return { input: parsed.data };
}

export async function createFormAction(formData: FormData): Promise<void> {
  const { input } = parseForm(formData);
  if (input) await (await svc()).create(input);
}

export async function updateFormAction(formData: FormData): Promise<void> {
  const { input } = parseForm(formData);
  if (input) await (await svc()).update(String(formData.get("id")), input);
}

export async function setPublishedAction(formData: FormData): Promise<void> {
  const service = await svc();
  const form = await service.get(String(formData.get("id")));
  await service.setPublished(form.id, !form.published);
}

export async function deleteFormAction(formData: FormData): Promise<void> {
  await (await svc()).remove(String(formData.get("id")));
}

export async function submitAnswerAction(formData: FormData): Promise<void> {
  const service = await svc();
  const answers: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("__")) continue;
    answers[key] = value;
  }
  await service.submitResponse(String(formData.get("__formId") ?? ""), answers);
}