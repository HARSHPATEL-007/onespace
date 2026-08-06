"use server";

import { AppScriptService, scriptSchema } from "@n0va/modules-appscript/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AppScriptService(workspaceId, userId, role);
};

const parse = (formData: FormData) =>
  scriptSchema.parse({
    name: String(formData.get("name") ?? ""),
    language: String(formData.get("language") ?? "js"),
    code: String(formData.get("code") ?? ""),
  });

export async function createScriptAction(formData: FormData) {
  await (await svc()).create(parse(formData));
}

export async function updateScriptAction(id: string, formData: FormData) {
  await (await svc()).update(id, parse(formData));
}

export async function removeScriptAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}

export async function runScriptAction(formData: FormData) {
  return (await svc()).run(String(formData.get("id") ?? ""));
}
