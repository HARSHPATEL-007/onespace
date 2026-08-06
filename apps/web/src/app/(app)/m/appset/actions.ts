"use server";

import { AppSetService } from "@n0va/modules-appset/server";
import { actionContext } from "@/lib/action-context";

export async function logLaunchAction(formData: FormData) {
  const { workspaceId, userId, role } = await actionContext();
  await new AppSetService(workspaceId, userId, role).logLaunch(String(formData.get("id") ?? ""));
}
